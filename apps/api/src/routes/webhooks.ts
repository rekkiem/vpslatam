// FIX BUG-05: rawBody plugin now registered globally in index.ts
// Routes that need raw body set config.rawBody = true
import { FastifyInstance } from 'fastify'
import crypto from 'crypto'
import { prisma } from '../lib/prisma'
import { boss } from '../queues/boss'
import { config } from '../config'

function verifyGithubSignature(rawBody: Buffer, signature: string): boolean {
  if (!signature.startsWith('sha256=')) return false
  const expected = `sha256=${crypto
    .createHmac('sha256', config.GITHUB_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex')}`
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expected, 'utf8')
    )
  } catch {
    return false
  }
}

export async function webhookRoutes(fastify: FastifyInstance) {

  // ── GitHub push webhook ────────────────────────────────────
  fastify.post('/github', {
    config: { rawBody: true },  // rawBody plugin activated per-route
  }, async (req, reply) => {
    const signature = req.headers['x-hub-signature-256'] as string | undefined
    const event = req.headers['x-github-event'] as string | undefined

    if (!signature || !event) {
      return reply.code(400).send({ error: 'Missing x-hub-signature-256 or x-github-event' })
    }

    // rawBody is typed by @fastify/raw-body — use (req as any) for compat
    const rawBody = (req as any).rawBody as Buffer | undefined
    if (!rawBody) {
      return reply.code(400).send({ error: 'Raw body unavailable' })
    }

    if (!verifyGithubSignature(rawBody, signature)) {
      return reply.code(401).send({ error: 'Invalid webhook signature' })
    }

    if (event !== 'push') {
      return { ok: true, skipped: true, event }
    }

    const payload = req.body as {
      ref?: string
      repository?: { id: number; full_name: string }
      head_commit?: { id: string; message: string }
    }

    if (!payload.ref || !payload.repository) {
      return reply.code(400).send({ error: 'Invalid push payload' })
    }

    const branch = payload.ref.replace('refs/heads/', '')
    const repoId = payload.repository.id

    const projects = await prisma.project.findMany({
      where: {
        githubRepoId: repoId,
        defaultBranch: branch,
        status: { notIn: ['DELETED', 'SUSPENDED'] },
      },
      include: { user: { select: { suspended: true } } },
    })

    const triggered: string[] = []

    for (const project of projects) {
      if (project.user.suspended) continue

      const active = await prisma.deployment.findFirst({
        where: {
          projectId: project.id,
          status: { in: ['QUEUED', 'BUILDING', 'PUSHING', 'STARTING'] },
        },
      })
      if (active) continue

      const deployment = await prisma.deployment.create({
        data: {
          projectId: project.id,
          userId: project.userId,
          branch,
          commitSha: payload.head_commit?.id,
          commitMsg: payload.head_commit?.message?.slice(0, 200),
          status: 'QUEUED',
        },
      })

      await boss.send('deploy', {
        deploymentId: deployment.id,
        projectId: project.id,
        userId: project.userId,
      })

      triggered.push(deployment.id)
    }

    return { ok: true, triggered, projects: projects.length }
  })

  // ── Stripe webhook ─────────────────────────────────────────
  fastify.post('/stripe', {
    config: { rawBody: true },
  }, async (req, reply) => {
    if (!config.STRIPE_SECRET_KEY || !config.STRIPE_WEBHOOK_SECRET) {
      return reply.code(503).send({ error: 'Stripe not configured' })
    }

    const sig = req.headers['stripe-signature'] as string | undefined
    if (!sig) return reply.code(400).send({ error: 'Missing stripe-signature' })

    const rawBody = (req as any).rawBody as Buffer | undefined
    if (!rawBody) return reply.code(400).send({ error: 'Raw body unavailable' })

    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(config.STRIPE_SECRET_KEY)

    let event
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, config.STRIPE_WEBHOOK_SECRET)
    } catch {
      return reply.code(400).send({ error: 'Invalid Stripe signature' })
    }

    const PRICE_TO_PLAN: Record<string, string> = {
      [process.env.STRIPE_PRICE_STARTER ?? '']: 'STARTER',
      [process.env.STRIPE_PRICE_PRO ?? '']: 'PRO',
      [process.env.STRIPE_PRICE_BUSINESS ?? '']: 'BUSINESS',
    }

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as any
        const priceId = sub.items?.data?.[0]?.price?.id ?? ''
        const plan = (PRICE_TO_PLAN[priceId] ?? 'FREE') as any

        await prisma.subscription.upsert({
          where: { stripeSubscriptionId: sub.id },
          create: {
            stripeSubscriptionId: sub.id,
            stripeCustomerId: sub.customer,
            stripePriceId: priceId,
            plan,
            status: sub.status === 'active' ? 'ACTIVE' : 'PAST_DUE',
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
            userId: sub.metadata?.userId ?? '',
          },
          update: {
            plan,
            status: sub.status === 'active' ? 'ACTIVE' : 'PAST_DUE',
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          },
        })

        if (sub.metadata?.userId) {
          await prisma.user.update({
            where: { id: sub.metadata.userId },
            data: { plan },
          })
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as any
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { status: 'CANCELLED' },
        })
        break
      }

      case 'invoice.paid': {
        const inv = event.data.object as any
        await prisma.invoice.updateMany({
          where: { stripeInvoiceId: inv.id },
          data: { status: 'PAID', paidAt: new Date() },
        })
        break
      }
    }

    return { received: true }
  })
}
