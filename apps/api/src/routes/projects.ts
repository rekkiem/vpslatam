import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { auditLog } from '../services/audit'
import { encrypt, decrypt } from '../lib/crypto'
import { detectFramework } from '../services/detect-framework'
import { slugify } from '../utils/slugify'
import { config } from '../config'
import got from 'got'

const PLAN_LIMITS = {
  FREE:     { maxProjects: 1,  memoryMb: 512,  cpuCores: 0.25 },
  STARTER:  { maxProjects: 3,  memoryMb: 512,  cpuCores: 0.5  },
  PRO:      { maxProjects: 10, memoryMb: 1024, cpuCores: 1.0  },
  BUSINESS: { maxProjects: 30, memoryMb: 2048, cpuCores: 2.0  },
}

export async function projectRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth)

  // ── List projects ─────────────────────────────────────────
  fastify.get('/', async (req) => {
    const projects = await prisma.project.findMany({
      where: { userId: req.user.sub, status: { not: 'DELETED' } },
      include: {
        deployments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { status: true, endpoint: true, createdAt: true, commitSha: true },
        },
        domains: { select: { domain: true, verified: true } },
        _count: { select: { deployments: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })
    return projects
  })

  // ── Get project ───────────────────────────────────────────
  fastify.get('/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const project = await prisma.project.findFirst({
      where: { slug, userId: req.user.sub },
      include: {
        deployments: { orderBy: { createdAt: 'desc' }, take: 10 },
        domains: true,
        metrics: {
          orderBy: { timestamp: 'desc' },
          take: 60,
          select: { cpuPercent: true, ramMb: true, timestamp: true },
        },
      },
    })
    if (!project) return reply.code(404).send({ error: 'Project not found' })
    return project
  })

  // ── Create project ────────────────────────────────────────
  fastify.post('/', async (req, reply) => {
    const body = z.object({
      name: z.string().min(2).max(60),
      githubFullName: z.string().regex(/^[\w-]+\/[\w.-]+$/),
      githubRepoId: z.number(),
      branch: z.string().default('main'),
      buildSettings: z.object({
        buildCmd: z.string().optional(),
        startCmd: z.string().optional(),
        port: z.number().int().min(1).max(65535).optional(),
        rootDir: z.string().default('/'),
      }).default({}),
    }).parse(req.body)

    // Enforce plan limits
    const plan = req.user.plan as keyof typeof PLAN_LIMITS
    const limits = PLAN_LIMITS[plan]
    const count = await prisma.project.count({
      where: { userId: req.user.sub, status: { not: 'DELETED' } },
    })
    if (count >= limits.maxProjects) {
      return reply.code(402).send({
        error: `Plan ${plan} allows max ${limits.maxProjects} project(s). Upgrade to add more.`,
      })
    }

    // Get GitHub account token
    const account = await prisma.account.findFirst({
      where: { userId: req.user.sub, provider: 'github' },
    })
    if (!account?.accessToken) {
      return reply.code(400).send({ error: 'GitHub account not connected' })
    }

    // Detect framework from repo
    const framework = await detectFramework(body.githubFullName, body.branch, account.accessToken)

    const slug = slugify(body.name)
    const existingSlug = await prisma.project.findUnique({ where: { slug } })
    const finalSlug = existingSlug ? `${slug}-${Date.now().toString(36)}` : slug

    const project = await prisma.project.create({
      data: {
        slug: finalSlug,
        name: body.name,
        userId: req.user.sub,
        githubFullName: body.githubFullName,
        githubRepoId: body.githubRepoId,
        defaultBranch: body.branch,
        buildSettings: body.buildSettings as any,
        framework,
        memoryLimit: limits.memoryMb,
        cpuLimit: limits.cpuCores,
        domains: {
          create: {
            domain: `${finalSlug}.${config.BASE_DOMAIN}`,
            isCustom: false,
            verified: true,
            sslIssued: false,
          },
        },
      },
      include: { domains: true },
    })

    // Register GitHub webhook
    try {
      await got.post(
        `https://api.github.com/repos/${body.githubFullName}/hooks`,
        {
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            Accept: 'application/vnd.github+json',
          },
          json: {
            name: 'web',
            active: true,
            events: ['push'],
            config: {
              url: `${config.API_URL}/api/webhooks/github`,
              content_type: 'json',
              secret: config.GITHUB_WEBHOOK_SECRET,
            },
          },
        }
      )
    } catch {
      fastify.log.warn('Failed to register GitHub webhook — user can do it manually')
    }

    await auditLog(req.user.sub, 'project.created', { projectId: project.id, slug: finalSlug }, req)
    return reply.code(201).send(project)
  })

  // ── Update project ────────────────────────────────────────
  fastify.patch('/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const body = z.object({
      name: z.string().min(2).max(60).optional(),
      buildSettings: z.record(z.any()).optional(),
      branch: z.string().optional(),
    }).parse(req.body)

    const project = await prisma.project.findFirst({ where: { slug, userId: req.user.sub } })
    if (!project) return reply.code(404).send({ error: 'Project not found' })

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.buildSettings && { buildSettings: body.buildSettings }),
        ...(body.branch && { defaultBranch: body.branch }),
      },
    })
    return updated
  })

  // ── Delete project ────────────────────────────────────────
  fastify.delete('/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const project = await prisma.project.findFirst({ where: { slug, userId: req.user.sub } })
    if (!project) return reply.code(404).send({ error: 'Project not found' })

    await prisma.project.update({ where: { id: project.id }, data: { status: 'DELETED' } })
    await auditLog(req.user.sub, 'project.deleted', { projectId: project.id }, req)
    return { ok: true }
  })

  // ── Env vars ──────────────────────────────────────────────
  fastify.get('/:slug/env', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const project = await prisma.project.findFirst({
      where: { slug, userId: req.user.sub },
      include: { envVars: true },
    })
    if (!project) return reply.code(404).send({ error: 'Project not found' })
    // Return keys only — never plaintext values in list
    return project.envVars.map((v) => ({ id: v.id, key: v.key, updatedAt: v.updatedAt }))
  })

  fastify.put('/:slug/env', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const body = z.object({
      vars: z.array(z.object({ key: z.string().regex(/^[A-Z_][A-Z0-9_]*$/), value: z.string() })),
    }).parse(req.body)

    const project = await prisma.project.findFirst({ where: { slug, userId: req.user.sub } })
    if (!project) return reply.code(404).send({ error: 'Project not found' })

    // Upsert env vars
    await prisma.$transaction(
      body.vars.map((v) =>
        prisma.envVar.upsert({
          where: { projectId_key: { projectId: project.id, key: v.key } },
          update: { value: encrypt(v.value) },
          create: { projectId: project.id, key: v.key, value: encrypt(v.value) },
        })
      )
    )

    return { ok: true, count: body.vars.length }
  })

  fastify.delete('/:slug/env/:key', async (req, reply) => {
    const { slug, key } = req.params as { slug: string; key: string }
    const project = await prisma.project.findFirst({ where: { slug, userId: req.user.sub } })
    if (!project) return reply.code(404).send({ error: 'Project not found' })

    await prisma.envVar.deleteMany({ where: { projectId: project.id, key } })
    return { ok: true }
  })

  // ── Metrics ───────────────────────────────────────────────
  fastify.get('/:slug/metrics', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const { range = '1h' } = req.query as { range?: string }

    const project = await prisma.project.findFirst({ where: { slug, userId: req.user.sub } })
    if (!project) return reply.code(404).send({ error: 'Project not found' })

    const rangeMap: Record<string, number> = { '1h': 60, '6h': 360, '24h': 1440 }
    const minutes = rangeMap[range] || 60

    const metrics = await prisma.metric.findMany({
      where: {
        projectId: project.id,
        timestamp: { gte: new Date(Date.now() - minutes * 60 * 1000) },
      },
      orderBy: { timestamp: 'asc' },
      select: { cpuPercent: true, ramMb: true, timestamp: true },
    })

    return metrics
  })
}
