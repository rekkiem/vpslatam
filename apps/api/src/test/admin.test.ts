import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import { adminRoutes } from '../routes/admin'
import { prisma } from '../lib/prisma'

async function buildAdminServer(role = 'SUPER_ADMIN') {
  const app = Fastify({ logger: false })
  await app.register(jwt, { secret: process.env.JWT_SECRET! })
  await app.addHook('preHandler', async (req) => {
    req.user = { sub: 'admin-user', email: 'admin@t.com', role, plan: 'BUSINESS', iat: 0, exp: 9999999999 }
  })
  await app.register(adminRoutes, { prefix: '/admin' })
  await app.ready()
  return app
}

describe('Admin routes', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('GET /admin/stats', () => {
    it('returns system stats for admin', async () => {
      const app = await buildAdminServer('SUPER_ADMIN')
      vi.mocked(prisma.user.count)
        .mockResolvedValueOnce(100)  // total
        .mockResolvedValueOnce(95)   // active
        .mockResolvedValueOnce(5)    // suspended
      vi.mocked(prisma.project.count).mockResolvedValue(42)
      vi.mocked(prisma.deployment.count).mockResolvedValue(7)
      vi.mocked(prisma.invoice.aggregate).mockResolvedValue({ _sum: { amount: 50000 } } as any)
      vi.mocked(prisma.subscription.count).mockResolvedValue(12)

      const res = await app.inject({ method: 'GET', url: '/admin/stats' })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.users.total).toBe(100)
      expect(body.users.suspended).toBe(5)
      expect(body.projects.total).toBe(42)
      expect(body.revenue.total).toBe(500) // 50000 cents / 100
    })

    it('blocks non-admin users', async () => {
      const app = await buildAdminServer('MEMBER')
      const res = await app.inject({ method: 'GET', url: '/admin/stats' })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('POST /admin/users/:id/suspend', () => {
    it('suspends a user', async () => {
      const app = await buildAdminServer('SUPER_ADMIN')
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-bad', email: 'bad@t.com', role: 'MEMBER' as any,
        name: null, plan: 'FREE' as any, passwordHash: null,
        suspended: false, emailVerified: true, avatarUrl: null,
        suspendedAt: null, suspendedBy: null, createdAt: new Date(), updatedAt: new Date(),
      })
      vi.mocked(prisma.user.update).mockResolvedValue({} as any)
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any)

      const res = await app.inject({
        method: 'POST', url: '/admin/users/user-bad/suspend',
        payload: { reason: 'Spam' },
      })
      expect(res.statusCode).toBe(200)
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ suspended: true }) })
      )
    })

    it('cannot suspend another admin', async () => {
      const app = await buildAdminServer('SUPER_ADMIN')
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'other-admin', email: 'admin2@t.com', role: 'SUPER_ADMIN' as any,
        name: null, plan: 'BUSINESS' as any, passwordHash: null,
        suspended: false, emailVerified: true, avatarUrl: null,
        suspendedAt: null, suspendedBy: null, createdAt: new Date(), updatedAt: new Date(),
      })

      const res = await app.inject({
        method: 'POST', url: '/admin/users/other-admin/suspend',
        payload: {},
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toContain('Cannot suspend admin')
    })
  })
})
