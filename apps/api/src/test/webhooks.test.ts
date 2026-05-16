import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import rawBody from 'fastify-raw-body'
import crypto from 'crypto'
import { webhookRoutes } from '../routes/webhooks'
import { prisma } from '../lib/prisma'
import { boss } from '../queues/boss'

async function buildTestServer() {
  const app = Fastify({ logger: false })
  await app.register(rawBody, { field: 'rawBody', global: false, encoding: false, runFirst: true })
  await app.register(webhookRoutes, { prefix: '/webhooks' })
  await app.ready()
  return app
}

function makeSignature(secret: string, body: string) {
  return `sha256=${crypto.createHmac('sha256', secret).update(Buffer.from(body)).digest('hex')}`
}

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET!

describe('POST /webhooks/github', () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildTestServer()
  })

  it('returns 400 without signature', async () => {
    const res = await app.inject({
      method: 'POST', url: '/webhooks/github',
      headers: { 'x-github-event': 'push', 'content-type': 'application/json' },
      payload: JSON.stringify({ ref: 'refs/heads/main' }),
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 401 with invalid signature', async () => {
    const body = JSON.stringify({ ref: 'refs/heads/main' })
    const res = await app.inject({
      method: 'POST', url: '/webhooks/github',
      headers: {
        'x-github-event': 'push',
        'x-hub-signature-256': 'sha256=invalid_signature_here',
        'content-type': 'application/json',
      },
      payload: body,
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 200 and skips non-push events', async () => {
    const body = JSON.stringify({ zen: 'ping' })
    const res = await app.inject({
      method: 'POST', url: '/webhooks/github',
      headers: {
        'x-github-event': 'ping',
        'x-hub-signature-256': makeSignature(WEBHOOK_SECRET, body),
        'content-type': 'application/json',
      },
      payload: body,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().skipped).toBe(true)
  })

  it('triggers deploy on valid push with matching project', async () => {
    const payload = {
      ref: 'refs/heads/main',
      repository: { id: 12345, full_name: 'owner/repo' },
      head_commit: { id: 'abc123', message: 'feat: add feature' },
    }
    const body = JSON.stringify(payload)

    vi.mocked(prisma.project.findMany).mockResolvedValue([{
      id: 'proj-1', userId: 'user-1', slug: 'my-app',
      user: { suspended: false },
    } as any])
    vi.mocked(prisma.deployment.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.deployment.create).mockResolvedValue({
      id: 'deploy-1', projectId: 'proj-1', status: 'QUEUED',
    } as any)

    const res = await app.inject({
      method: 'POST', url: '/webhooks/github',
      headers: {
        'x-github-event': 'push',
        'x-hub-signature-256': makeSignature(WEBHOOK_SECRET, body),
        'content-type': 'application/json',
      },
      payload: body,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().triggered).toContain('deploy-1')
    expect(boss.send).toHaveBeenCalledWith('deploy', expect.objectContaining({
      deploymentId: 'deploy-1',
      projectId: 'proj-1',
    }))
  })

  it('skips deploy if user is suspended', async () => {
    const payload = {
      ref: 'refs/heads/main',
      repository: { id: 99999, full_name: 'suspended/repo' },
      head_commit: { id: 'xyz', message: 'hack attempt' },
    }
    const body = JSON.stringify(payload)

    vi.mocked(prisma.project.findMany).mockResolvedValue([{
      id: 'proj-sus', userId: 'sus-user', slug: 'sus-app',
      user: { suspended: true },
    } as any])

    const res = await app.inject({
      method: 'POST', url: '/webhooks/github',
      headers: {
        'x-github-event': 'push',
        'x-hub-signature-256': makeSignature(WEBHOOK_SECRET, body),
        'content-type': 'application/json',
      },
      payload: body,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().triggered).toHaveLength(0)
    expect(boss.send).not.toHaveBeenCalled()
  })

  it('skips if active deployment already in progress', async () => {
    const payload = {
      ref: 'refs/heads/main',
      repository: { id: 55555, full_name: 'owner/busy-repo' },
      head_commit: { id: 'abc', message: 'update' },
    }
    const body = JSON.stringify(payload)

    vi.mocked(prisma.project.findMany).mockResolvedValue([{
      id: 'proj-busy', userId: 'user-1', slug: 'busy',
      user: { suspended: false },
    } as any])
    vi.mocked(prisma.deployment.findFirst).mockResolvedValue({
      id: 'active-deploy', status: 'BUILDING',
    } as any)

    const res = await app.inject({
      method: 'POST', url: '/webhooks/github',
      headers: {
        'x-github-event': 'push',
        'x-hub-signature-256': makeSignature(WEBHOOK_SECRET, body),
        'content-type': 'application/json',
      },
      payload: body,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().triggered).toHaveLength(0)
  })
})
