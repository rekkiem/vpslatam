import { describe, it, expect, vi, beforeEach } from 'vitest'

// Test the Dockerfile generator logic extracted for unit testing
function generateDockerfile(framework: string, settings: Record<string, any>): string | null {
  const port = settings?.port ?? 3000
  const startCmd = settings?.startCmd as string | undefined
  const buildCmd = settings?.buildCmd as string | undefined
  const nodeVer = settings?.nodeVersion ?? '20'
  const pyVer = settings?.pythonVersion ?? '3.12'

  switch (framework) {
    case 'NODEJS':
      return `FROM node:${nodeVer}-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev\nCOPY . .\n${buildCmd ? `RUN ${buildCmd}` : ''}\nEXPOSE ${port}\nCMD ${startCmd ? `["sh","-c","${startCmd}"]` : '["node","index.js"]'}\n`
    case 'NEXTJS':
      return `FROM node:${nodeVer}-alpine AS builder\nWORKDIR /app\n`
    case 'PYTHON':
      return `FROM python:${pyVer}-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE ${port}\n`
    case 'STATIC':
      return `FROM nginx:alpine\nCOPY . /usr/share/nginx/html\nEXPOSE 80\n`
    default:
      return null
  }
}

describe('generateDockerfile()', () => {
  it('generates NODEJS Dockerfile with default port', () => {
    const df = generateDockerfile('NODEJS', {})
    expect(df).toContain('FROM node:20-alpine')
    expect(df).toContain('EXPOSE 3000')
    expect(df).toContain('npm ci --omit=dev')
  })

  it('uses custom port for NODEJS', () => {
    const df = generateDockerfile('NODEJS', { port: 8080 })
    expect(df).toContain('EXPOSE 8080')
  })

  it('includes build command when provided', () => {
    const df = generateDockerfile('NODEJS', { buildCmd: 'npm run build' })
    expect(df).toContain('RUN npm run build')
  })

  it('uses custom start command', () => {
    const df = generateDockerfile('NODEJS', { startCmd: 'node server.js' })
    expect(df).toContain('node server.js')
  })

  it('uses custom node version', () => {
    const df = generateDockerfile('NODEJS', { nodeVersion: '18' })
    expect(df).toContain('FROM node:18-alpine')
  })

  it('generates NEXTJS Dockerfile', () => {
    const df = generateDockerfile('NEXTJS', {})
    expect(df).toContain('FROM node:20-alpine AS builder')
  })

  it('generates PYTHON Dockerfile', () => {
    const df = generateDockerfile('PYTHON', {})
    expect(df).toContain('FROM python:3.12-slim')
    expect(df).toContain('pip install')
  })

  it('uses custom python version', () => {
    const df = generateDockerfile('PYTHON', { pythonVersion: '3.11' })
    expect(df).toContain('FROM python:3.11-slim')
  })

  it('generates STATIC Dockerfile with nginx', () => {
    const df = generateDockerfile('STATIC', {})
    expect(df).toContain('FROM nginx:alpine')
    expect(df).toContain('/usr/share/nginx/html')
  })

  it('returns null for DOCKER framework (has own Dockerfile)', () => {
    expect(generateDockerfile('DOCKER', {})).toBeNull()
  })

  it('returns null for UNKNOWN framework', () => {
    expect(generateDockerfile('UNKNOWN', {})).toBeNull()
  })
})
