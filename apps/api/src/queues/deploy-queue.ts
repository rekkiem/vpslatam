// FIX BUG-06+07+13+21+22+25: Complete rewrite of deploy worker
import PgBoss from 'pg-boss'
import path from 'path'
import fs from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import Docker from 'dockerode'
import tar from 'tar-fs'
import { prisma } from '../lib/prisma'
import { config } from '../config'
import { decrypt } from '../lib/crypto'
import { detectFramework } from '../services/detect-framework'

const execFileAsync = promisify(execFile)
const docker = new Docker({ socketPath: config.DOCKER_SOCKET })

interface DeployJob {
  deploymentId: string
  projectId: string
  userId: string
  rollbackFromImageTag?: string
}

// FIX BUG-13: pg-boss v9 work() — teamConcurrency renamed, correct signature
export async function startDeployWorker(boss: PgBoss) {
  await boss.work<DeployJob>(
    'deploy',
    { teamSize: 3, teamConcurrency: 1 },
    async (job) => {
      const { deploymentId, projectId, rollbackFromImageTag } = job.data
      await runDeploy(deploymentId, projectId, rollbackFromImageTag)
    }
  )
}

async function runDeploy(
  deploymentId: string,
  projectId: string,
  rollbackFromImageTag?: string
) {
  fs.mkdirSync(config.LOGS_DIR, { recursive: true })
  const logsPath = path.join(config.LOGS_DIR, `${deploymentId}.log`)
  const logStream = fs.createWriteStream(logsPath, { flags: 'a' })

  const log = (msg: string) => {
    const line = `[${new Date().toISOString()}] ${msg}\n`
    logStream.write(line)
    process.stdout.write(line)
  }

  // FIX BUG-21: always cleanup builds dir, even on failure
  const buildDir = path.join(config.BUILDS_DIR, deploymentId)

  const cleanup = () => {
    logStream.end()
    try { fs.rmSync(buildDir, { recursive: true, force: true }) } catch { /* ok */ }
  }

  const fail = async (msg: string) => {
    log(`❌ FAILED: ${msg}`)
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'FAILED', errorMessage: msg.slice(0, 500), finishedAt: new Date(), logsPath },
    })
    await prisma.project.update({ where: { id: projectId }, data: { status: 'INACTIVE' } })
    cleanup()
  }

  try {
    const [deployment, project] = await Promise.all([
      prisma.deployment.findUnique({ where: { id: deploymentId } }),
      prisma.project.findUnique({
        where: { id: projectId },
        include: {
          envVars: true,
          domains: { where: { verified: true } },
        },
      }),
    ])

    if (!deployment || !project) return await fail('Deployment or project not found')
    if (deployment.status === 'CANCELLED') { cleanup(); return }

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'BUILDING', startedAt: new Date(), logsPath },
    })
    await prisma.project.update({ where: { id: projectId }, data: { status: 'ACTIVE' } })

    log(`🚀 Deploy: ${project.slug} (${project.githubFullName ?? 'no-repo'})`)
    const buildStart = Date.now()
    const imageTag = `vpslatam/${project.slug}:${deploymentId}`

    // ── Rollback shortcut ──────────────────────────────────────
    if (rollbackFromImageTag) {
      log(`⏪ Rollback → ${rollbackFromImageTag}`)
      await startContainer(project, deployment, rollbackFromImageTag, log)
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: 'RUNNING', imageTag: rollbackFromImageTag,
          buildDuration: Math.round((Date.now() - buildStart) / 1000),
          finishedAt: new Date(),
        },
      })
      cleanup()
      return
    }

    // ── Get GitHub token ───────────────────────────────────────
    const account = await prisma.account.findFirst({
      where: { userId: project.userId, provider: 'github' },
    })
    if (!account?.accessToken) return await fail('GitHub token not found. Reconnect GitHub in settings.')

    // ── Clone repo ─────────────────────────────────────────────
    fs.mkdirSync(buildDir, { recursive: true })
    log(`📥 Cloning ${project.githubFullName}@${deployment.branch}`)
    const cloneUrl = `https://x-access-token:${account.accessToken}@github.com/${project.githubFullName}.git`

    try {
      await execFileAsync('git', [
        'clone', '--depth=1', '--branch', deployment.branch, cloneUrl, buildDir,
      ], { timeout: 120_000 })
    } catch (err: any) {
      return await fail(`Git clone failed: ${err.stderr ?? err.message}`)
    }

    // ── Get commit SHA ─────────────────────────────────────────
    try {
      const { stdout } = await execFileAsync('git', ['-C', buildDir, 'rev-parse', 'HEAD'])
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { commitSha: stdout.trim().slice(0, 40) },
      })
    } catch { /* non-fatal */ }

    // ── Detect framework ───────────────────────────────────────
    const settings = project.buildSettings as Record<string, any>
    const framework = project.framework === 'UNKNOWN'
      ? await detectFramework(project.githubFullName ?? '', deployment.branch, account.accessToken)
      : project.framework

    // ── Generate Dockerfile if absent ─────────────────────────
    const dockerfilePath = path.join(buildDir, 'Dockerfile')
    if (!fs.existsSync(dockerfilePath)) {
      log(`🔍 No Dockerfile — generating for: ${framework}`)
      const generated = generateDockerfile(framework, settings)
      if (!generated) return await fail(
        `Unsupported framework: ${framework}. Add a Dockerfile to your repo.`
      )
      fs.writeFileSync(dockerfilePath, generated)
      log(`✅ Generated Dockerfile (${framework})`)
    }

    // ── Decrypt env vars ───────────────────────────────────────
    const envVars: Record<string, string> = {}
    for (const v of project.envVars) {
      try { envVars[v.key] = decrypt(v.value) }
      catch { log(`⚠️  Could not decrypt env var: ${v.key}`) }
    }

    // ── Build image ────────────────────────────────────────────
    log(`🏗  Building image: ${imageTag}`)

    // FIX BUG-06+07: use tar-fs to create proper build context stream
    const tarStream = tar.pack(buildDir)

    const buildStream = await docker.buildImage(tarStream, {
      t: imageTag,
      buildargs: envVars,
      labels: {
        'vpslatam.project': project.slug,
        'vpslatam.deployment': deploymentId,
        'vpslatam.user': project.userId,
      },
    })

    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(
        buildStream,
        (err: Error | null) => (err ? reject(err) : resolve()),
        (event: Record<string, string>) => {
          if (event.stream) log(event.stream.trimEnd())
          if (event.error) log(`BUILD ERROR: ${event.error}`)
        }
      )
    })

    log(`✅ Image built: ${imageTag}`)

    // ── Start container ────────────────────────────────────────
    await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'STARTING' } })

    // FIX WARNING-05: retry container start up to 2 times
    let startErr: Error | null = null
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await startContainer(project, deployment, imageTag, log, envVars)
        startErr = null
        break
      } catch (err: any) {
        startErr = err
        log(`⚠️  Container start attempt ${attempt} failed: ${err.message}`)
        if (attempt < 2) await new Promise(r => setTimeout(r, 3000))
      }
    }
    if (startErr) return await fail(`Container failed to start: ${startErr.message}`)

    const duration = Math.round((Date.now() - buildStart) / 1000)
    const primaryDomain = project.domains?.[0]?.domain ?? `${project.slug}.${config.BASE_DOMAIN}`
    log(`🎉 Deployed in ${duration}s → https://${primaryDomain}`)

    cleanup()
  } catch (err: any) {
    await fail(err?.message ?? String(err))
  }
}

async function startContainer(
  project: any,
  deployment: any,
  imageTag: string,
  log: (m: string) => void,
  envVars: Record<string, string> = {}
) {
  const containerName = `vpslatam-${project.slug}`
  const port = (project.buildSettings as any)?.port ?? 3000

  // Stop + remove old container gracefully
  try {
    const old = docker.getContainer(containerName)
    await old.stop({ t: 10 })
    await old.remove({ force: true })
    log(`🗑  Removed old container: ${containerName}`)
  } catch { /* no existing container — ok */ }

  const primaryDomain =
    project.domains?.[0]?.domain ?? `${project.slug}.${config.BASE_DOMAIN}`

  const allDomains: string[] = project.domains
    ?.filter((d: any) => d.verified)
    .map((d: any) => d.domain as string) ?? [primaryDomain]

  const hostRule = allDomains.map(d => `Host(\`${d}\`)`).join(' || ')

  const traefikLabels: Record<string, string> = {
    'traefik.enable': 'true',
    // HTTPS router
    [`traefik.http.routers.${project.slug}.rule`]: hostRule,
    [`traefik.http.routers.${project.slug}.entrypoints`]: 'websecure',
    [`traefik.http.routers.${project.slug}.tls.certresolver`]: 'letsencrypt',
    [`traefik.http.services.${project.slug}.loadbalancer.server.port`]: String(port),
    // HTTP redirect router
    [`traefik.http.routers.${project.slug}-http.rule`]: hostRule,
    [`traefik.http.routers.${project.slug}-http.entrypoints`]: 'web',
    [`traefik.http.routers.${project.slug}-http.middlewares`]: 'https-redirect@docker',
  }

  const container = await docker.createContainer({
    name: containerName,
    Image: imageTag,
    Env: Object.entries(envVars).map(([k, v]) => `${k}=${v}`),
    Labels: traefikLabels,
    HostConfig: {
      NetworkMode: 'traefik-net',
      Memory: project.memoryLimit * 1024 * 1024,
      NanoCpus: Math.round(project.cpuLimit * 1e9),
      RestartPolicy: { Name: 'unless-stopped' },
      LogConfig: {
        Type: 'json-file',
        Config: { 'max-size': '50m', 'max-file': '3' },
      },
    },
  })

  await container.start()
  const info = await container.inspect()

  await prisma.deployment.update({
    where: { id: deployment.id },
    data: {
      status: 'RUNNING',
      containerId: info.Id,
      imageTag,
      port,
      endpoint: `https://${primaryDomain}`,
      finishedAt: new Date(),
    },
  })

  log(`✅ Container started: ${containerName}`)
}

function generateDockerfile(framework: string, settings: Record<string, any>): string | null {
  const port = settings?.port ?? 3000
  const startCmd = settings?.startCmd as string | undefined
  const buildCmd = settings?.buildCmd as string | undefined
  const nodeVer = settings?.nodeVersion ?? '20'
  const pyVer = settings?.pythonVersion ?? '3.12'

  switch (framework) {
    case 'NODEJS':
      return `FROM node:${nodeVer}-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
${buildCmd ? `RUN ${buildCmd}` : ''}
EXPOSE ${port}
CMD ${startCmd ? `["sh","-c","${startCmd}"]` : '["node","index.js"]'}
`
    case 'NEXTJS':
      return `FROM node:${nodeVer}-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:${nodeVer}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node","server.js"]
`
    case 'PYTHON':
      return `FROM python:${pyVer}-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE ${port}
CMD ${startCmd ? `["sh","-c","${startCmd}"]` : `["gunicorn","--bind","0.0.0.0:${port}","--workers","2","app:app"]`}
`
    case 'STATIC':
      return `FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
`
    default:
      return null
  }
}
