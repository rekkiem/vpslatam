import { vi } from 'vitest'

// Set minimal env vars for tests
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.JWT_SECRET = 'test_jwt_secret_minimum_32_characters_here'
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_minimum_32_characters_here'
process.env.ENCRYPTION_KEY = 'a'.repeat(64)
process.env.GITHUB_CLIENT_ID = 'test_gh_id'
process.env.GITHUB_CLIENT_SECRET = 'test_gh_secret'
process.env.GITHUB_WEBHOOK_SECRET = 'test_webhook_secret'
process.env.FRONTEND_URL = 'http://localhost:5173'
process.env.API_URL = 'http://localhost:4000'
process.env.BASE_DOMAIN = 'localhost'
process.env.RATE_LIMIT_MAX = '1000'
process.env.RATE_LIMIT_WINDOW = '1 minute'

// Mock Prisma globally
vi.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    session: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    account: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    project: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    deployment: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    envVar: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    metric: { findMany: vi.fn(), create: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    domain: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    subscription: { findFirst: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    invoice: { findMany: vi.fn(), updateMany: vi.fn(), aggregate: vi.fn() },
    backgroundJob: { findMany: vi.fn() },
    $transaction: vi.fn(),
    $disconnect: vi.fn(),
  },
}))

// Mock pg-boss
vi.mock('../queues/boss', () => ({
  boss: {
    send: vi.fn().mockResolvedValue('job-id'),
    start: vi.fn(),
    stop: vi.fn(),
    work: vi.fn(),
  },
}))
