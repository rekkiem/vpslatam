import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import { projectRoutes } from '../routes/projects'
import { prisma } from '../lib/prisma'

const testUser = { sub: 'user-test', email: 't@t.com', role: 'MEMBER', plan: 'PRO' }

async function buildTestServer() {
  const app = Fastify({ logger: false })
  await app.register(jwt, { secret: process.env.JWT_SECRET! })
  await app.register(projectRoutes, { prefix: '/projects' })
  await app.ready()
  return app
}

function authHeaders(app: Awaited<ReturnType<typeof buildTestServer>>) {
  return { authorization: `Bearer ${app.jwt.sign(testUser)}` }
}

const mockProject = {
  id: 'proj-1', slug: 'my-app', name: 'My App',
  userId: 'user-test', teamId: null,
  githubFullName: 'user/my-app', githubRepoId: 123,
  githubRepoUrl: null,
  defaultBranch: 'main', framework: 'NODEJS' as any,
  buildSettings: { port: 3000 }, envVars: [],
  status: 'ACTIVE' as any, memoryLimit: 512, cpuLimit: 0.5,
  createdAt: new Date(), updatedAt: new Date(),
}

describe('GET /projects', () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ suspended: false } as any)
    app = await buildTestServer()
  })

  it('returns list of projects', async () => {
    vi.mocked(prisma.project.findMany).mockResolvedValue([mockProject] as any)

    const res = await app.inject({ method: 'GET', url: '/projects', headers: authHeaders(app) })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
    expect(res.json()[0].slug).toBe('my-app')
  })

  it('returns empty array when no projects', async () => {
    vi.mocked(prisma.project.findMany).mockResolvedValue([])

    const res = await app.inject({ method: 'GET', url: '/projects', headers: authHeaders(app) })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(0)
  })
})

describe('POST /projects (create)', () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ suspended: false } as any)
    app = await buildTestServer()
  })

  it('creates project within plan limits', async () => {
    vi.mocked(prisma.project.count).mockResolvedValue(0)
    vi.mocked(prisma.account.findFirst).mockResolvedValue({
      id: 'acc-1', userId: 'user-test', provider: 'github',
      providerAccountId: '123', accessToken: 'gh_token',
      refreshToken: null, tokenExpiry: null, scope: null, createdAt: new Date(),
    })
    vi.mocked(prisma.project.findUnique).mockResolvedValue(null) // slug not taken
    vi.mocked(prisma.project.create).mockResolvedValue({
      ...mockProject,
      domains: [{ domain: 'my-app.localhost', verified: true }],
    } as any)

    const res = await app.inject({
      method: 'POST', url: '/projects',
      headers: authHeaders(app),
      payload: {
        name: 'My App',
        githubFullName: 'user/my-app',
        githubRepoId: 123,
        branch: 'main',
        buildSettings: { port: 3000 },
      },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().slug).toBe('my-app')
  })

  it('returns 402 when plan project limit reached', async () => {
    // PRO plan: max 10, user has 10
    vi.mocked(prisma.project.count).mockResolvedValue(10)

    const res = await app.inject({
      method: 'POST', url: '/projects',
      headers: authHeaders(app),
      payload: {
        name: 'One More App',
        githubFullName: 'user/one-more',
        githubRepoId: 999,
        branch: 'main',
        buildSettings: {},
      },
    })

    expect(res.statusCode).toBe(402)
    expect(res.json().error).toMatch(/plan/i)
  })

  it('returns 400 for invalid github repo format', async () => {
    vi.mocked(prisma.project.count).mockResolvedValue(0)

    const res = await app.inject({
      method: 'POST', url: '/projects',
      headers: authHeaders(app),
      payload: {
        name: 'Bad',
        githubFullName: 'not-valid-format',
        githubRepoId: 1,
        branch: 'main',
        buildSettings: {},
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 if GitHub not connected', async () => {
    vi.mocked(prisma.project.count).mockResolvedValue(0)
    vi.mocked(prisma.account.findFirst).mockResolvedValue(null)

    const res = await app.inject({
      method: 'POST', url: '/projects',
      headers: authHeaders(app),
      payload: {
        name: 'App',
        githubFullName: 'user/app',
        githubRepoId: 1,
        branch: 'main',
        buildSettings: {},
      },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('GitHub')
  })
})

describe('DELETE /projects/:slug', () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ suspended: false } as any)
    app = await buildTestServer()
  })

  it('soft-deletes a project (status = DELETED)', async () => {
    vi.mocked(prisma.project.findFirst).mockResolvedValue(mockProject as any)
    vi.mocked(prisma.project.update).mockResolvedValue({
      ...mockProject, status: 'DELETED' as any,
    })
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any)

    const res = await app.inject({ method: 'DELETE', url: '/projects/my-app', headers: authHeaders(app) })

    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)
    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'DELETED' } })
    )
  })

  it('returns 404 for non-existent project', async () => {
    vi.mocked(prisma.project.findFirst).mockResolvedValue(null)

    const res = await app.inject({ method: 'DELETE', url: '/projects/no-such-project', headers: authHeaders(app) })
    expect(res.statusCode).toBe(404)
  })
})

describe('PUT /projects/:slug/env', () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ suspended: false } as any)
    app = await buildTestServer()
  })

  it('accepts valid UPPER_SNAKE_CASE keys', async () => {
    vi.mocked(prisma.project.findFirst).mockResolvedValue(mockProject as any)
    vi.mocked(prisma.$transaction).mockResolvedValue([])

    const res = await app.inject({
      method: 'PUT', url: '/projects/my-app/env',
      headers: authHeaders(app),
      payload: {
        vars: [
          { key: 'DATABASE_URL', value: 'postgres://...' },
          { key: 'API_KEY', value: 'secret' },
        ],
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().count).toBe(2)
  })

  it('rejects lowercase env var keys', async () => {
    vi.mocked(prisma.project.findFirst).mockResolvedValue(mockProject as any)

    const res = await app.inject({
      method: 'PUT', url: '/projects/my-app/env',
      headers: authHeaders(app),
      payload: { vars: [{ key: 'lowercase_key', value: 'value' }] },
    })

    expect(res.statusCode).toBe(400)
  })
})
