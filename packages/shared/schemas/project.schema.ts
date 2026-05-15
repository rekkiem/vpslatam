import { z } from 'zod'

// ── Project schemas ───────────────────────────────────────────────────────────
export const buildSettingsSchema = z.object({
  buildCmd: z.string().max(500).optional(),
  startCmd: z.string().max(500).optional(),
  port: z.number().int().min(1).max(65535).default(3000),
  rootDir: z.string().default('/'),
  nodeVersion: z.enum(['18', '20', '21']).default('20'),
  pythonVersion: z.enum(['3.10', '3.11', '3.12']).default('3.12'),
})

export const createProjectSchema = z.object({
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(60, 'Name must be at most 60 characters')
    .regex(/^[a-zA-Z0-9\s_-]+$/, 'Only letters, numbers, spaces, dashes and underscores'),
  githubFullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'Invalid GitHub repo format (owner/repo)'),
  githubRepoId: z.number().int().positive(),
  branch: z.string().min(1).max(100).default('main'),
  buildSettings: buildSettingsSchema.default({}),
})

export const updateProjectSchema = createProjectSchema.partial().omit({
  githubFullName: true,
  githubRepoId: true,
})

// ── Deployment schemas ────────────────────────────────────────────────────────
export const triggerDeploySchema = z.object({
  branch: z.string().min(1).max(100).optional(),
})

// ── Env var schemas ───────────────────────────────────────────────────────────
export const envVarSchema = z.object({
  key: z.string()
    .min(1)
    .max(100)
    .regex(/^[A-Z_][A-Z0-9_]*$/, 'Keys must be UPPER_SNAKE_CASE'),
  value: z.string().max(8192),
})

export const setEnvVarsSchema = z.object({
  vars: z.array(envVarSchema).min(1).max(50),
})

// ── Auth schemas ──────────────────────────────────────────────────────────────
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2).max(100),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// ── Domain schemas ────────────────────────────────────────────────────────────
export const addDomainSchema = z.object({
  domain: z.string()
    .min(3)
    .max(253)
    .regex(/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, 'Invalid domain format'),
})

// ── Billing schemas ───────────────────────────────────────────────────────────
export const checkoutSchema = z.object({
  plan: z.enum(['STARTER', 'PRO', 'BUSINESS']),
})

// ── Admin schemas ─────────────────────────────────────────────────────────────
export const suspendUserSchema = z.object({
  reason: z.string().max(500).optional(),
})

export const changePlanSchema = z.object({
  plan: z.enum(['FREE', 'STARTER', 'PRO', 'BUSINESS']),
})

// ── Type exports ──────────────────────────────────────────────────────────────
export type BuildSettings = z.infer<typeof buildSettingsSchema>
export type CreateProject = z.infer<typeof createProjectSchema>
export type UpdateProject = z.infer<typeof updateProjectSchema>
export type EnvVar = z.infer<typeof envVarSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
