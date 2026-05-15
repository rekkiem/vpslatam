import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { config } from '../config'

const PLANS = {
  STARTER:  { price: 500,  priceId: process.env.STRIPE_PRICE_STARTER  || '', label: 'Starter',  usd: 5  },
  PRO:      { price: 2000, priceId: process.env.STRIPE_PRICE_PRO      || '', label: 'Pro',      usd: 20 },
  BUSINESS: { price: 5000, priceId: process.env.STRIPE_PRICE_BUSINESS || '', label: 'Business', usd: 50 },
}

export async function billingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth)

  // ── Get current subscription ──────────────────────────────
  fastify.get('/subscription', async (req) => {
    const sub = await prisma.subscription.findFirst({
      where: { userId: req.user.sub, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
      orderBy: { createdAt: 'desc' },
    })
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { plan: true },
    })
    return { subscription: sub, plan: user?.plan ?? 'FREE' }
  })

  // ── Get available plans ───────────────────────────────────
  fastify.get('/plans', async () => {
    return [
      {
        id: 'FREE', label: 'Free', price: 0,
        features: ['1 project', '512 MB RAM', '0.25 vCPU', 'Community support'],
      },
      {
        id: 'STARTER', label: 'Starter', price: 5,
        features: ['3 projects', '512 MB RAM', '0.5 vCPU', 'Email support'],
      },
      {
        id: 'PRO', label: 'Pro', price: 20,
        features: ['10 projects', '1 GB RAM', '1 vCPU', 'Priority support', 'Custom domains'],
      },
      {
        id: 'BUSINESS', label: 'Business', price: 50,
        features: ['30 projects', '2 GB RAM', '2 vCPU', 'Dedicated support', 'SLA 99.9%'],
      },
    ]
  })

  // ── Create Stripe checkout session ────────────────────────
  fastify.post('/checkout', async (req, reply) => {
    if (!config.STRIPE_SECRET_KEY) {
      return reply.code(503).send({ error: 'Stripe not configured' })
    }

    const { plan } = z.object({
      plan: z.enum(['STARTER', 'PRO', 'BUSINESS']),
    }).parse(req.body)

    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(config.STRIPE_SECRET_KEY)

    const planConfig = PLANS[plan]

    // Find or create Stripe customer
    let stripeCustomerId: string
    const existing = await prisma.subscription.findFirst({
      where: { userId: req.user.sub, stripeCustomerId: { not: null } },
      select: { stripeCustomerId: true },
    })

    if (existing?.stripeCustomerId) {
      stripeCustomerId = existing.stripeCustomerId
    } else {
      const user = await prisma.user.findUnique({
        where: { id: req.user.sub },
        select: { email: true, name: true },
      })
      const customer = await stripe.customers.create({
        email: user!.email,
        name: user!.name || undefined,
        metadata: { userId: req.user.sub },
      })
      stripeCustomerId = customer.id
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      success_url: `${config.FRONTEND_URL}/billing?success=1&plan=${plan}`,
      cancel_url: `${config.FRONTEND_URL}/billing?cancelled=1`,
      metadata: { userId: req.user.sub, plan },
      subscription_data: { metadata: { userId: req.user.sub, plan } },
    })

    return { url: session.url }
  })

  // ── Customer portal (manage subscription) ─────────────────
  fastify.post('/portal', async (req, reply) => {
    if (!config.STRIPE_SECRET_KEY) {
      return reply.code(503).send({ error: 'Stripe not configured' })
    }

    const sub = await prisma.subscription.findFirst({
      where: { userId: req.user.sub, stripeCustomerId: { not: null } },
    })
    if (!sub?.stripeCustomerId) {
      return reply.code(400).send({ error: 'No active subscription' })
    }

    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(config.STRIPE_SECRET_KEY)

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${config.FRONTEND_URL}/billing`,
    })

    return { url: session.url }
  })

  // ── Invoice list ──────────────────────────────────────────
  fastify.get('/invoices', async (req) => {
    const invoices = await prisma.invoice.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: 'desc' },
      take: 24,
    })
    return invoices
  })
}
