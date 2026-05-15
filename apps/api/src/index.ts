import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import rawBody from '@fastify/raw-body'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import websocket from '@fastify/websocket'
import cron from 'node-cron'

import { config } from './config'
import { prisma } from './lib/prisma'
import { boss } from './queues/boss'
import { startDeployWorker } from './queues/deploy-queue'
import { collectMetrics } from './services/metrics'

import { authRoutes } from './routes/auth'
import { projectRoutes } from './routes/projects'
import { deploymentRoutes } from './routes/deployments'
import { webhookRoutes } from './routes/webhooks'
import { adminRoutes } from './routes/admin'
import { billingRoutes } from './routes/billing'
import { domainRoutes } from './routes/domains'

export function buildServer() {
  const server = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        config.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    trustProxy: true,
  })

  return server
}

export async function registerPlugins(server: ReturnType<typeof buildServer>) {
  // FIX BUG-05+08: @fastify/raw-body MUST be registered before routes
  // so webhooks can access req.rawBody
  await server.register(rawBody, {
    field: 'rawBody',
    global: false,      // only on routes that set config.rawBody = true
    encoding: false,    // keep as Buffer
    runFirst: true,
  })

  await server.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })

  await server.register(cors, {
    origin: (origin, cb) => {
      const allowed = [config.FRONTEND_URL, `https://${config.BASE_DOMAIN}`]
      if (!origin || allowed.includes(origin)) return cb(null, true)
      cb(new Error('CORS: not allowed'), false)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  // FIX BUG-25: rate-limit with per-route config support
  await server.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    keyGenerator: (req) =>
      (req.headers['x-real-ip'] as string) || req.ip,
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit reached. Try again in ${Math.ceil(Number(context.after) / 1000)}s`,
    }),
  })

  await server.register(jwt, { secret: config.JWT_SECRET })
  await server.register(websocket)

  if (config.NODE_ENV !== 'production') {
    await server.register(swagger, {
      openapi: {
        info: { title: 'VPS LATAM Cloud API', version: '0.2.0' },
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
      },
    })
    await server.register(swaggerUi, { routePrefix: '/docs' })
  }

  return server
}

export async function registerRoutes(server: ReturnType<typeof buildServer>) {
  await server.register(authRoutes, { prefix: '/api/auth' })
  await server.register(projectRoutes, { prefix: '/api/projects' })
  await server.register(deploymentRoutes, { prefix: '/api/deployments' })
  await server.register(webhookRoutes, { prefix: '/api/webhooks' })
  await server.register(adminRoutes, { prefix: '/api/admin' })
  await server.register(billingRoutes, { prefix: '/api/billing' })
  await server.register(domainRoutes, { prefix: '/api/domains' })

  server.get('/health', async () => ({
    status: 'ok',
    ts: new Date().toISOString(),
    version: '0.2.0',
    uptime: process.uptime(),
  }))

  return server
}

async function bootstrap() {
  const server = buildServer()
  await registerPlugins(server)
  await registerRoutes(server)

  await boss.start()
  await startDeployWorker(boss)
  server.log.info('✅ pg-boss worker started')

  cron.schedule('* * * * *', async () => {
    try { await collectMetrics() }
    catch (err) { server.log.error(err, 'metrics collection failed') }
  })

  await server.listen({ port: config.PORT, host: config.HOST })
  server.log.info(`🚀 API on port ${config.PORT}`)

  const shutdown = async (signal: string) => {
    server.log.info(`${signal} — shutting down`)
    await boss.stop()
    await prisma.$disconnect()
    await server.close()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

if (require.main === module) {
  bootstrap().catch((err) => { console.error(err); process.exit(1) })
}
