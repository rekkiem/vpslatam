import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { auditLog } from '../services/audit'
import { boss } from '../queues/boss'
import { config } from '../config'

export async function deploymentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth)

  // ── List deployments for a project ───────────────────────
  fastify.get('/project/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const project = await prisma.project.findFirst({
      where: { slug, userId: req.user.sub },
    })
    if (!project) return reply.code(404).send({ error: 'Project not found' })

    const deployments = await prisma.deployment.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true, status: true, branch: true, commitSha: true,
        commitMsg: true, endpoint: true, buildDuration: true,
        createdAt: true, finishedAt: true, errorMessage: true,
      },
    })
    return deployments
  })

  // ── Trigger deploy ────────────────────────────────────────
  fastify.post('/project/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const body = z.object({
      branch: z.string().optional(),
    }).parse(req.body ?? {})

    const project = await prisma.project.findFirst({
      where: { slug, userId: req.user.sub, status: { not: 'DELETED' } },
    })
    if (!project) return reply.code(404).send({ error: 'Project not found' })
    if (!project.githubFullName) {
      return reply.code(400).send({ error: 'No GitHub repo linked' })
    }

    // Check for in-progress deployment
    const active = await prisma.deployment.findFirst({
      where: { projectId: project.id, status: { in: ['QUEUED', 'BUILDING', 'PUSHING', 'STARTING'] } },
    })
    if (active) {
      return reply.code(409).send({ error: 'A deploy is already in progress', deploymentId: active.id })
    }

    const deployment = await prisma.deployment.create({
      data: {
        projectId: project.id,
        userId: req.user.sub,
        branch: body.branch ?? project.defaultBranch,
        status: 'QUEUED',
      },
    })

    // Enqueue build job
    await boss.send('deploy', {
      deploymentId: deployment.id,
      projectId: project.id,
      userId: req.user.sub,
    })

    await auditLog(req.user.sub, 'deployment.triggered', { deploymentId: deployment.id, slug }, req)
    return reply.code(202).send(deployment)
  })

  // ── Get single deployment ─────────────────────────────────
  fastify.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const deployment = await prisma.deployment.findFirst({
      where: { id, userId: req.user.sub },
      include: { project: { select: { slug: true, name: true } } },
    })
    if (!deployment) return reply.code(404).send({ error: 'Deployment not found' })
    return deployment
  })

  // ── Cancel deployment ─────────────────────────────────────
  fastify.post('/:id/cancel', async (req, reply) => {
    const { id } = req.params as { id: string }
    const deployment = await prisma.deployment.findFirst({
      where: { id, userId: req.user.sub, status: { in: ['QUEUED', 'BUILDING'] } },
    })
    if (!deployment) return reply.code(404).send({ error: 'Deployment not found or cannot be cancelled' })

    await prisma.deployment.update({
      where: { id },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    })
    return { ok: true }
  })

  // ── Rollback ──────────────────────────────────────────────
  fastify.post('/:id/rollback', async (req, reply) => {
    const { id } = req.params as { id: string }
    const target = await prisma.deployment.findFirst({
      where: { id, userId: req.user.sub, status: 'RUNNING' },
      include: { project: true },
    })
    if (!target) return reply.code(404).send({ error: 'Target deployment not found or not running' })

    const newDeploy = await prisma.deployment.create({
      data: {
        projectId: target.projectId,
        userId: req.user.sub,
        branch: target.branch,
        commitSha: target.commitSha,
        commitMsg: `Rollback to ${target.commitSha?.slice(0, 7)}`,
        status: 'QUEUED',
      },
    })

    await prisma.deploymentRollback.create({
      data: { deploymentId: newDeploy.id, rolledBackFromId: id },
    })

    await boss.send('deploy', {
      deploymentId: newDeploy.id,
      projectId: target.projectId,
      userId: req.user.sub,
      rollbackFromImageTag: target.imageTag,
    })

    await auditLog(req.user.sub, 'deployment.rollback', { from: id, to: newDeploy.id }, req)
    return reply.code(202).send(newDeploy)
  })

  // ── Logs (HTTP polling) ───────────────────────────────────
  fastify.get('/:id/logs', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { lines = '200' } = req.query as { lines?: string }

    const deployment = await prisma.deployment.findFirst({
      where: { id, userId: req.user.sub },
      select: { logsPath: true, status: true },
    })
    if (!deployment) return reply.code(404).send({ error: 'Not found' })

    if (!deployment.logsPath || !fs.existsSync(deployment.logsPath)) {
      return { lines: [], status: deployment.status }
    }

    const content = fs.readFileSync(deployment.logsPath, 'utf8')
    const allLines = content.split('\n').filter(Boolean)
    const take = Math.min(parseInt(lines), 1000)

    return {
      lines: allLines.slice(-take),
      status: deployment.status,
      total: allLines.length,
    }
  })

  // ── Logs (WebSocket streaming) ────────────────────────────
  fastify.get('/:id/logs/stream', { websocket: true }, async (connection, req) => {
    const { id } = req.params as { id: string }

    const deployment = await prisma.deployment.findFirst({
      where: { id },
      select: { logsPath: true, status: true, userId: true },
    })

    // Basic auth check via query param (WS can't set headers easily from browser)
    const token = (req.query as any).token
    try {
      fastify.jwt.verify(token)
    } catch {
      connection.socket.close(4001, 'Unauthorized')
      return
    }

    if (!deployment) {
      connection.socket.send(JSON.stringify({ error: 'Not found' }))
      connection.socket.close()
      return
    }

    const logsPath = deployment.logsPath || path.join(config.LOGS_DIR, `${id}.log`)
    let lastSize = 0
    let closed = false

    const sendChunk = () => {
      if (closed || !fs.existsSync(logsPath)) return
      try {
        const stat = fs.statSync(logsPath)
        if (stat.size > lastSize) {
          const buf = Buffer.alloc(stat.size - lastSize)
          const fd = fs.openSync(logsPath, 'r')
          fs.readSync(fd, buf, 0, buf.length, lastSize)
          fs.closeSync(fd)
          lastSize = stat.size
          connection.socket.send(JSON.stringify({ data: buf.toString('utf8') }))
        }
      } catch { /* file not ready yet */ }
    }

    // Poll every 500ms
    const interval = setInterval(async () => {
      sendChunk()
      // Check if deployment finished
      const current = await prisma.deployment.findUnique({
        where: { id },
        select: { status: true },
      })
      if (current && ['RUNNING', 'FAILED', 'CANCELLED', 'STOPPED'].includes(current.status)) {
        sendChunk()
        connection.socket.send(JSON.stringify({ done: true, status: current.status }))
        clearInterval(interval)
        connection.socket.close()
      }
    }, 500)

    connection.socket.on('close', () => {
      closed = true
      clearInterval(interval)
    })
  })
}
