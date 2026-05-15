import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import { authRoutes } from '../routes/auth'
import { prisma } from '../lib/prisma'
import bcrypt from 'bcryptjs'

// Helper: build test server with minimal plugins
async function buildTestServer() {
  const app = Fastify({ logger: false })
  await app.register(jwt, { secret: process.env.JWT_SECRET! })
  
  // Minimal rate-limit mock
  app.addHook('preHandler', async () => {})
  
  await app.register(authRoutes, { prefix: '/auth' })
  await app.ready()
  return app
}

describe('POST /auth/register', () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildTestServer()
  })

  it('creates user with valid input', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: 'user-1', email: 'test@test.com', name: 'Test User',
      plan: 'FREE' as any, role: 'MEMBER' as any,
      passwordHash: null, avatarUrl: null, emailVerified: false,
      suspended: false, suspendedAt: null, suspendedBy: null,
      createdAt: new Date(), updatedAt: new Date(),
    })
    vi.mocked(prisma.session.create).mockResolvedValue({} as any)
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any)

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'test@test.com', password: 'password123', name: 'Test User' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body).toHaveProperty('accessToken')
    expect(body).toHaveProperty('refreshToken')
    expect(body.user.email).toBe('test@test.com')
  })

  it('returns 409 if email already exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'existing' } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'existing@test.com', password: 'password123', name: 'Existing' },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toContain('already registered')
  })

  it('returns 400 for short password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'test@test.com', password: '123', name: 'Test' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for invalid email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'not-an-email', password: 'password123', name: 'Test' },
    })

    expect(res.statusCode).toBe(400)
  })
})

describe('POST /auth/login', () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildTestServer()
  })

  it('logs in with valid credentials', async () => {
    const passwordHash = await bcrypt.hash('password123', 12)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1', email: 'user@test.com', name: 'User',
      passwordHash, plan: 'FREE' as any, role: 'MEMBER' as any,
      suspended: false, emailVerified: true,
      avatarUrl: null, suspendedAt: null, suspendedBy: null,
      createdAt: new Date(), updatedAt: new Date(),
    })
    vi.mocked(prisma.session.create).mockResolvedValue({} as any)
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any)

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'user@test.com', password: 'password123' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('accessToken')
    expect(body).toHaveProperty('refreshToken')
    expect(body.user.email).toBe('user@test.com')
  })

  it('returns 401 for wrong password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 12)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1', email: 'user@test.com', passwordHash,
      plan: 'FREE' as any, role: 'MEMBER' as any,
      name: null, suspended: false, emailVerified: true,
      avatarUrl: null, suspendedAt: null, suspendedBy: null,
      createdAt: new Date(), updatedAt: new Date(),
    })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'user@test.com', password: 'wrong-password' },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('Invalid credentials')
  })

  it('returns 401 for non-existent user (timing safe)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ghost@test.com', password: 'password123' },
    })

    expect(res.statusCode).toBe(401)
    // Must NOT reveal whether email exists
    expect(res.json().error).toBe('Invalid credentials')
  })

  it('returns 403 for suspended user', async () => {
    const passwordHash = await bcrypt.hash('password123', 12)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1', email: 'banned@test.com', passwordHash,
      plan: 'FREE' as any, role: 'MEMBER' as any, name: null,
      suspended: true, emailVerified: true,
      avatarUrl: null, suspendedAt: new Date(), suspendedBy: 'admin',
      createdAt: new Date(), updatedAt: new Date(),
    })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'banned@test.com', password: 'password123' },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error).toContain('suspended')
  })
})

describe('POST /auth/refresh', () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildTestServer()
  })

  it('returns 400 for non-UUID refreshToken', async () => {
    const res = await app.inject({
      method: 'POST', url: '/auth/refresh',
      payload: { refreshToken: 'not-a-uuid' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 401 for expired session', async () => {
    const expiredDate = new Date(Date.now() - 1000)
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: 'sess-1', userId: 'user-1',
      refreshToken: '11111111-1111-1111-1111-111111111111',
      expiresAt: expiredDate,
      userAgent: null, ipAddress: null, createdAt: new Date(),
    })
    vi.mocked(prisma.session.delete).mockResolvedValue({} as any)

    const res = await app.inject({
      method: 'POST', url: '/auth/refresh',
      payload: { refreshToken: '11111111-1111-1111-1111-111111111111' },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toContain('expired')
  })

  it('rotates token on success', async () => {
    const futureDate = new Date(Date.now() + 86400_000)
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: 'sess-1', userId: 'user-1',
      refreshToken: '22222222-2222-2222-2222-222222222222',
      expiresAt: futureDate,
      userAgent: null, ipAddress: null, createdAt: new Date(),
    })
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1', email: 'u@t.com', passwordHash: null,
      plan: 'FREE' as any, role: 'MEMBER' as any, name: null,
      suspended: false, emailVerified: true, avatarUrl: null,
      suspendedAt: null, suspendedBy: null,
      createdAt: new Date(), updatedAt: new Date(),
    })
    vi.mocked(prisma.session.update).mockResolvedValue({} as any)

    const res = await app.inject({
      method: 'POST', url: '/auth/refresh',
      payload: { refreshToken: '22222222-2222-2222-2222-222222222222' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('accessToken')
    expect(body).toHaveProperty('refreshToken')
    // New refresh token must differ from old
    expect(body.refreshToken).not.toBe('22222222-2222-2222-2222-222222222222')
  })
})
