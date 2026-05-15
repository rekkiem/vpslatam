// FIX BUG-12+24+WARNING-01: auth routes — safe null handling, proper session expiry
import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { config } from '../config'
import { requireAuth } from '../middleware/auth'
import { auditLog } from '../services/audit'
import { v4 as uuid } from 'uuid'
import got from 'got'

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_USER_URL = 'https://api.github.com/user'
const GITHUB_EMAIL_URL = 'https://api.github.com/user/emails'

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function newRefreshExpiry() {
  return new Date(Date.now() + REFRESH_TTL_MS)
}

function makeAccessToken(
  fastify: FastifyInstance,
  userId: string,
  payload: { email: string; role: string; plan: string }
) {
  return fastify.jwt.sign(
    { sub: userId, email: payload.email, role: payload.role, plan: payload.plan },
    { expiresIn: config.JWT_ACCESS_TTL }
  )
}

// ── Schemas ───────────────────────────────────────────────────────────────────
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2).max(100),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function authRoutes(fastify: FastifyInstance) {
  // ── Register ───────────────────────────────────────────────
  fastify.post('/register', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const result = registerSchema.safeParse(req.body)
    if (!result.success) {
      return reply.code(400).send({ error: result.error.issues[0]?.message ?? 'Invalid input' })
    }
    const { email, password, name } = result.data

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return reply.code(409).send({ error: 'Email already registered' })

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({ data: { email, passwordHash, name } })

    const accessToken = makeAccessToken(fastify, user.id, user)
    const refreshToken = uuid()

    await prisma.session.create({
      data: {
        userId: user.id, refreshToken,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
        expiresAt: newRefreshExpiry(),
      },
    })

    await auditLog(user.id, 'user.registered', { email }, req)
    return reply.code(201).send({
      accessToken, refreshToken,
      user: { id: user.id, email, name, plan: user.plan, role: user.role },
    })
  })

  // ── Login ──────────────────────────────────────────────────
  fastify.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const result = loginSchema.safeParse(req.body)
    if (!result.success) return reply.code(400).send({ error: 'Invalid input' })
    const { email, password } = result.data

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.passwordHash) {
      // constant-time to prevent email enumeration
      await bcrypt.compare(password, '$2b$12$invalidhashfortimingequalizer00')
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return reply.code(401).send({ error: 'Invalid credentials' })
    if (user.suspended) return reply.code(403).send({ error: 'Account suspended' })

    const accessToken = makeAccessToken(fastify, user.id, user)
    const refreshToken = uuid()

    await prisma.session.create({
      data: {
        userId: user.id, refreshToken,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
        expiresAt: newRefreshExpiry(),
      },
    })

    await auditLog(user.id, 'user.login', {}, req)
    return {
      accessToken, refreshToken,
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan, role: user.role },
    }
  })

  // ── Refresh ────────────────────────────────────────────────
  // FIX BUG-24: proper expiry + rotation
  fastify.post('/refresh', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = z.object({ refreshToken: z.string().uuid() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid refreshToken' })

    const session = await prisma.session.findUnique({
      where: { refreshToken: body.data.refreshToken },
    })

    // FIX BUG-24: check expiry explicitly
    if (!session || session.expiresAt < new Date()) {
      if (session) await prisma.session.delete({ where: { id: session.id } })
      return reply.code(401).send({ error: 'Session expired. Please log in again.' })
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId } })
    if (!user || user.suspended) {
      await prisma.session.delete({ where: { id: session.id } })
      return reply.code(403).send({ error: 'Account unavailable' })
    }

    const newRefreshToken = uuid()
    await prisma.session.update({
      where: { id: session.id },
      data: { refreshToken: newRefreshToken, expiresAt: newRefreshExpiry() },
    })

    return {
      accessToken: makeAccessToken(fastify, user.id, user),
      refreshToken: newRefreshToken,
    }
  })

  // ── Logout ─────────────────────────────────────────────────
  fastify.post('/logout', { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ refreshToken: z.string().optional() }).safeParse(req.body)
    if (body.success && body.data.refreshToken) {
      await prisma.session.deleteMany({ where: { refreshToken: body.data.refreshToken } })
    }
    return { ok: true }
  })

  // ── GitHub OAuth init ──────────────────────────────────────
  fastify.get('/github', async (_req, reply) => {
    const state = uuid()
    const url = new URL(GITHUB_AUTH_URL)
    url.searchParams.set('client_id', config.GITHUB_CLIENT_ID)
    url.searchParams.set('redirect_uri', `${config.API_URL}/api/auth/github/callback`)
    url.searchParams.set('scope', 'user:email,repo')
    url.searchParams.set('state', state)
    return reply.redirect(302, url.toString())
  })

  // ── GitHub OAuth callback ──────────────────────────────────
  fastify.get('/github/callback', async (req, reply) => {
    const query = req.query as { code?: string; state?: string; error?: string }
    if (query.error || !query.code) {
      return reply.redirect(302, `${config.FRONTEND_URL}/login?error=github_denied`)
    }

    let tokenRes: { access_token: string; scope: string }
    try {
      tokenRes = await got.post(GITHUB_TOKEN_URL, {
        json: {
          client_id: config.GITHUB_CLIENT_ID,
          client_secret: config.GITHUB_CLIENT_SECRET,
          code: query.code,
          redirect_uri: `${config.API_URL}/api/auth/github/callback`,
        },
        headers: { Accept: 'application/json' },
        timeout: { request: 10_000 },
      }).json<{ access_token: string; scope: string }>()
    } catch {
      return reply.redirect(302, `${config.FRONTEND_URL}/login?error=github_token`)
    }

    if (!tokenRes.access_token) {
      return reply.redirect(302, `${config.FRONTEND_URL}/login?error=github_no_token`)
    }

    const ghHeaders = {
      Authorization: `Bearer ${tokenRes.access_token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }

    // FIX BUG-12: safe null handling for GitHub user
    let ghUser: {
      id: number; login: string; email: string | null
      name: string | null; avatar_url: string
    }
    try {
      ghUser = await got(GITHUB_USER_URL, { headers: ghHeaders, timeout: { request: 10_000 } })
        .json()
    } catch {
      return reply.redirect(302, `${config.FRONTEND_URL}/login?error=github_user`)
    }

    // Get primary email if not public
    let email = ghUser.email
    if (!email) {
      try {
        const emails = await got(GITHUB_EMAIL_URL, { headers: ghHeaders })
          .json<Array<{ email: string; primary: boolean; verified: boolean }>>()
        email = emails.find(e => e.primary && e.verified)?.email ?? null
      } catch { /* fallback below */ }
    }
    const finalEmail = email ?? `${ghUser.login}@users.noreply.github.com`

    // Upsert user + account
    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'github',
          providerAccountId: String(ghUser.id),
        },
      },
      include: { user: true },
    })

    let userId: string

    if (existingAccount) {
      userId = existingAccount.userId
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: { accessToken: tokenRes.access_token, scope: tokenRes.scope },
      })
    } else {
      // Try to merge with existing email account
      let user = await prisma.user.findUnique({ where: { email: finalEmail } })
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: finalEmail,
            name: ghUser.name ?? ghUser.login,
            avatarUrl: ghUser.avatar_url,
            emailVerified: true,
          },
        })
      }
      await prisma.account.create({
        data: {
          userId: user.id,
          provider: 'github',
          providerAccountId: String(ghUser.id),
          accessToken: tokenRes.access_token,
          scope: tokenRes.scope,
        },
      })
      userId = user.id
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    if (user.suspended) {
      return reply.redirect(302, `${config.FRONTEND_URL}/login?error=suspended`)
    }

    const accessToken = makeAccessToken(fastify, userId, user)
    const refreshToken = uuid()
    await prisma.session.create({
      data: {
        userId, refreshToken,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
        expiresAt: newRefreshExpiry(),
      },
    })

    await auditLog(userId, 'user.github_login', { login: ghUser.login }, req)
    return reply.redirect(
      302,
      `${config.FRONTEND_URL}/auth/callback?token=${accessToken}&refresh=${refreshToken}`
    )
  })

  // ── Me ─────────────────────────────────────────────────────
  fastify.get('/me', { preHandler: requireAuth }, async (req) => {
    return prisma.user.findUnique({
      where: { id: req.user.sub },
      select: {
        id: true, email: true, name: true, avatarUrl: true,
        plan: true, role: true, createdAt: true, emailVerified: true,
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 1,
          select: { plan: true, status: true, currentPeriodEnd: true } },
      },
    })
  })

  // ── GitHub repos list ──────────────────────────────────────
  // WARNING-01 FIX: removed simple-git, use GitHub API directly
  fastify.get('/github/repos', { preHandler: requireAuth }, async (req, reply) => {
    const account = await prisma.account.findFirst({
      where: { userId: req.user.sub, provider: 'github' },
    })
    if (!account?.accessToken) {
      return reply.code(400).send({ error: 'GitHub not connected. Please sign in with GitHub.' })
    }

    const page = Number((req.query as any).page) || 1
    const repos = await got('https://api.github.com/user/repos', {
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      searchParams: { per_page: 30, page, sort: 'updated', type: 'all' },
      timeout: { request: 15_000 },
    }).json<Array<{
      id: number; name: string; full_name: string; private: boolean
      html_url: string; default_branch: string; language: string | null
      updated_at: string; description: string | null; pushed_at: string
    }>>()

    return repos.map(r => ({
      id: r.id, name: r.name, fullName: r.full_name,
      private: r.private, url: r.html_url,
      defaultBranch: r.default_branch, language: r.language,
      updatedAt: r.updated_at, description: r.description,
    }))
  })
}
