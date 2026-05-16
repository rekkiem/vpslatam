import path from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'

loadDotenv()
loadDotenv({ path: path.resolve(__dirname, '../../../.env') })

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string(),

  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  ENCRYPTION_KEY: z.string().length(64), // 32 bytes hex

  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  GITHUB_WEBHOOK_SECRET: z.string(),

  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  API_URL: z.string().url().default('http://localhost:4000'),
  BASE_DOMAIN: z.string().default('vpslatam.cloud'),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('noreply@vpslatam.cloud'),

  DOCKER_SOCKET: z.string().default('/var/run/docker.sock'),
  REGISTRY_URL: z.string().default('localhost:5000'),
  BUILDS_DIR: z.string().default('/var/vpslatam/builds'),
  LOGS_DIR: z.string().default('/var/vpslatam/logs'),

  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
})

function loadEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('❌ Invalid environment variables:')
    result.error.issues.forEach((issue) => {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`)
    })
    process.exit(1)
  }
  return result.data
}

export const config = loadEnv()
export type Config = typeof config
