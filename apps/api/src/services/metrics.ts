// FIX BUG-23: dockerode v4 stats API — use stream:false correctly
import Docker from 'dockerode'
import { prisma } from '../lib/prisma'
import { config } from '../config'

const docker = new Docker({ socketPath: config.DOCKER_SOCKET })

interface DockerStats {
  cpu_stats: {
    cpu_usage: { total_usage: number }
    system_cpu_usage: number
    online_cpus?: number
  }
  precpu_stats: {
    cpu_usage: { total_usage: number }
    system_cpu_usage: number
  }
  memory_stats: {
    usage: number
    stats?: { cache?: number; inactive_file?: number }
  }
  networks?: Record<string, { rx_bytes: number; tx_bytes: number }>
}

async function getContainerStats(containerName: string): Promise<DockerStats | null> {
  try {
    const container = docker.getContainer(containerName)
    // FIX BUG-23: in dockerode v4, stats() returns a stream — use { stream: false } to get one-shot
    return await new Promise<DockerStats | null>((resolve, reject) => {
      const timeout = setTimeout(() => resolve(null), 5000)
      container.stats({ stream: false }, (err, data) => {
        clearTimeout(timeout)
        if (err) return resolve(null) // container gone — ignore
        resolve(data as DockerStats)
      })
    })
  } catch {
    return null
  }
}

export async function collectMetrics(): Promise<void> {
  const projects = await prisma.project.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, slug: true },
  })

  const inserts: Array<{
    projectId: string
    cpuPercent: number
    ramMb: number
    transferredBytes: bigint
  }> = []

  await Promise.allSettled(
    projects.map(async (project: { id: string; slug: string }) => {
      const stats = await getContainerStats(`vpslatam-${project.slug}`)
      if (!stats) return

      // CPU %
      const cpuDelta =
        stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage
      const sysDelta =
        stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage
      const numCpus = stats.cpu_stats.online_cpus ?? 1
      const cpuPercent =
        sysDelta > 0 ? Math.min((cpuDelta / sysDelta) * numCpus * 100, 100) : 0

      // RAM MB — subtract cache (kernel page cache)
      const cacheBytes =
        stats.memory_stats.stats?.inactive_file ??
        stats.memory_stats.stats?.cache ?? 0
      const ramMb = Math.max(0, (stats.memory_stats.usage - cacheBytes) / (1024 * 1024))

      // Network bytes
      const transferred = Object.values(stats.networks ?? {}).reduce(
        (acc, net) => acc + (net.rx_bytes ?? 0) + (net.tx_bytes ?? 0),
        0
      )

      inserts.push({
        projectId: project.id,
        cpuPercent: Math.round(cpuPercent * 100) / 100,
        ramMb: Math.round(ramMb * 100) / 100,
        transferredBytes: BigInt(Math.round(transferred)),
      })
    })
  )

  if (inserts.length > 0) {
    await prisma.metric.createMany({ data: inserts })
  }

  // Keep only last 24h of metrics
  await prisma.metric.deleteMany({
    where: { timestamp: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  })
}
