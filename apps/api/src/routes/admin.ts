import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAdmin } from '../middleware/auth'
import { auditLog } from '../services/audit'

export async function adminRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdmin)

  // ── Dashboard stats ───────────────────────────────────────
  fastify.get('/stats', async () => {
    const [
      totalUsers, activeUsers, suspendedUsers,
      totalProjects, runningDeployments,
      totalRevenue, mrr,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { suspended: false } }),
      prisma.user.count({ where: { suspended: true } }),
      prisma.project.count({ where: { status: { not: 'DELETED' } } }),
      prisma.deployment.count({ where: { status: 'RUNNING' } }),
      prisma.invoice.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true },
      }),
      prisma.subscription.count({ where: { status: 'ACTIVE', plan: { not: 'FREE' } } }),
    ])

    return {
      users: { total: totalUsers, active: activeUsers, suspended: suspendedUsers },
      projects: { total: totalProjects, runningDeployments },
      revenue: {
        total: (totalRevenue._sum.amount ?? 0) / 100,
        paidSubscriptions: mrr,
      },
    }
  })

  // ── List users ────────────────────────────────────────────
  fastify.get('/users', async (req) => {
    const { page = '1', search = '', plan } = req.query as {
      page?: string; search?: string; plan?: string
    }
    const take = 20
    const skip = (parseInt(page) - 1) * take

    const where: any = {}
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (plan) where.plan = plan

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, name: true, plan: true, role: true,
          suspended: true, createdAt: true, emailVerified: true,
          _count: { select: { projects: true, deployments: true } },
        },
      }),
      prisma.user.count({ where }),
    ])

    return { users, total, page: parseInt(page), pages: Math.ceil(total / take) }
  })

  // ── Get user detail ───────────────────────────────────────
  fastify.get('/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        projects: { where: { status: { not: 'DELETED' } }, select: { id: true, slug: true, name: true, status: true } },
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    })
    if (!user) return reply.code(404).send({ error: 'User not found' })
    return user
  })

  // ── Suspend user ──────────────────────────────────────────
  fastify.post('/users/:id/suspend', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body ?? {})

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return reply.code(404).send({ error: 'User not found' })
    if (user.role === 'SUPER_ADMIN') return reply.code(400).send({ error: 'Cannot suspend admin' })

    await prisma.user.update({
      where: { id },
      data: { suspended: true, suspendedAt: new Date(), suspendedBy: req.user.sub },
    })

    await auditLog(req.user.sub, 'admin.user.suspended', { targetUserId: id, reason }, req)
    return { ok: true }
  })

  // ── Unsuspend user ────────────────────────────────────────
  fastify.post('/users/:id/unsuspend', async (req, reply) => {
    const { id } = req.params as { id: string }
    await prisma.user.update({
      where: { id },
      data: { suspended: false, suspendedAt: null, suspendedBy: null },
    })
    await auditLog(req.user.sub, 'admin.user.unsuspended', { targetUserId: id }, req)
    return { ok: true }
  })

  // ── Change user plan ──────────────────────────────────────
  fastify.patch('/users/:id/plan', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { plan } = z.object({
      plan: z.enum(['FREE', 'STARTER', 'PRO', 'BUSINESS']),
    }).parse(req.body)

    await prisma.user.update({ where: { id }, data: { plan } })
    await auditLog(req.user.sub, 'admin.user.plan_changed', { targetUserId: id, plan }, req)
    return { ok: true }
  })

  // ── System audit logs ─────────────────────────────────────
  fastify.get('/audit-logs', async (req) => {
    const { page = '1', action } = req.query as { page?: string; action?: string }
    const take = 50
    const skip = (parseInt(page) - 1) * take

    const where: any = {}
    if (action) where.action = { contains: action }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true, name: true } } },
      }),
      prisma.auditLog.count({ where }),
    ])

    return { logs, total }
  })

  // ── List all deployments ──────────────────────────────────
  fastify.get('/deployments', async (req) => {
    const { status } = req.query as { status?: string }
    const deployments = await prisma.deployment.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        project: { select: { slug: true, name: true } },
        user: { select: { email: true } },
      },
    })
    return deployments
  })

  // ── Background jobs ───────────────────────────────────────
  fastify.get('/jobs', async () => {
    const jobs = await prisma.backgroundJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { email: true } } },
    })
    return jobs
  })
}
