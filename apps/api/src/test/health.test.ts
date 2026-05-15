import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import jwt from '@fastify/jwt'

async function buildMinimalServer() {
  const app = Fastify({ logger: false })
  await app.register(jwt, { secret: process.env.JWT_SECRET! })
  app.get('/health', async () => ({
    status: 'ok', ts: new Date().toISOString(), version: '0.2.0', uptime: process.uptime(),
  }))
  await app.ready()
  return app
}

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const app = await buildMinimalServer()
    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('ok')
    expect(body.version).toBe('0.2.0')
    expect(body).toHaveProperty('ts')
    expect(body).toHaveProperty('uptime')
  })

  it('ts is valid ISO 8601', async () => {
    const app = await buildMinimalServer()
    const res = await app.inject({ method: 'GET', url: '/health' })
    const { ts } = res.json()
    expect(() => new Date(ts).toISOString()).not.toThrow()
  })
})
