import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import dns from 'dns/promises'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { v4 as uuid } from 'uuid'
import { config } from '../config'

export async function domainRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth)

  // ── List domains for project ──────────────────────────────
  fastify.get('/project/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const project = await prisma.project.findFirst({
      where: { slug, userId: req.user.sub },
      include: { domains: true },
    })
    if (!project) return reply.code(404).send({ error: 'Project not found' })
    return project.domains
  })

  // ── Add custom domain ─────────────────────────────────────
  fastify.post('/project/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const { domain } = z.object({
      domain: z.string().regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/, 'Invalid domain format'),
    }).parse(req.body)

    // Plan check — custom domains require PRO+
    if (!['PRO', 'BUSINESS'].includes(req.user.plan)) {
      return reply.code(402).send({ error: 'Custom domains require Pro plan or higher' })
    }

    const project = await prisma.project.findFirst({
      where: { slug, userId: req.user.sub },
    })
    if (!project) return reply.code(404).send({ error: 'Project not found' })

    const existing = await prisma.domain.findUnique({ where: { domain } })
    if (existing) return reply.code(409).send({ error: 'Domain already in use' })

    const verifyToken = `vpslatam-verify=${uuid().replace(/-/g, '').slice(0, 16)}`

    const d = await prisma.domain.create({
      data: {
        projectId: project.id,
        domain,
        isCustom: true,
        verified: false,
        verifyToken,
      },
    })

    return {
      domain: d,
      instructions: {
        method: 'CNAME',
        record: `CNAME  ${domain}  →  ${slug}.${config.BASE_DOMAIN}`,
        txtRecord: `TXT  _vpslatam-verify.${domain}  →  ${verifyToken}`,
        note: 'Add either the CNAME or TXT record, then click Verify.',
      },
    }
  })

  // ── Verify domain ─────────────────────────────────────────
  fastify.post('/project/:slug/:domainId/verify', async (req, reply) => {
    const { slug, domainId } = req.params as { slug: string; domainId: string }

    const project = await prisma.project.findFirst({ where: { slug, userId: req.user.sub } })
    if (!project) return reply.code(404).send({ error: 'Project not found' })

    const domainRecord = await prisma.domain.findFirst({
      where: { id: domainId, projectId: project.id, isCustom: true },
    })
    if (!domainRecord) return reply.code(404).send({ error: 'Domain not found' })

    // Try TXT verification
    let verified = false
    try {
      const txtRecords = await dns.resolveTxt(`_vpslatam-verify.${domainRecord.domain}`)
      verified = txtRecords.flat().includes(domainRecord.verifyToken || '')
    } catch { /* DNS not propagated yet */ }

    // Fallback: CNAME check
    if (!verified) {
      try {
        const cname = await dns.resolveCname(domainRecord.domain)
        const expected = `${slug}.${config.BASE_DOMAIN}`
        verified = cname.some((c) => c.endsWith(expected) || c === expected)
      } catch { /* not set */ }
    }

    if (!verified) {
      return reply.code(400).send({
        error: 'Domain not verified yet. DNS changes can take up to 48h to propagate.',
      })
    }

    await prisma.domain.update({
      where: { id: domainId },
      data: { verified: true, verifyToken: null },
    })

    return { ok: true, message: 'Domain verified! SSL will be issued automatically by Traefik.' }
  })

  // ── Remove domain ─────────────────────────────────────────
  fastify.delete('/project/:slug/:domainId', async (req, reply) => {
    const { slug, domainId } = req.params as { slug: string; domainId: string }

    const project = await prisma.project.findFirst({ where: { slug, userId: req.user.sub } })
    if (!project) return reply.code(404).send({ error: 'Project not found' })

    const d = await prisma.domain.findFirst({
      where: { id: domainId, projectId: project.id, isCustom: true },
    })
    if (!d) return reply.code(404).send({ error: 'Domain not found or is a system domain' })

    await prisma.domain.delete({ where: { id: domainId } })
    return { ok: true }
  })
}
