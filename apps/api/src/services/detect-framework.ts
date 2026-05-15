// FIX BUG-22: add timeouts to all GitHub API calls
import got from 'got'

type Framework = 'NODEJS' | 'NEXTJS' | 'PYTHON' | 'STATIC' | 'DOCKER' | 'UNKNOWN'

const GITHUB_API = 'https://api.github.com'
const TIMEOUT_MS = 8_000

async function fileExists(
  fullName: string, branch: string, filePath: string, token: string
): Promise<boolean> {
  try {
    await got(
      `${GITHUB_API}/repos/${fullName}/contents/${encodeURIComponent(filePath)}`,
      {
        searchParams: { ref: branch },
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        timeout: { request: TIMEOUT_MS },
      }
    )
    return true
  } catch {
    return false
  }
}

async function fetchFileContent(
  fullName: string, branch: string, filePath: string, token: string
): Promise<string | null> {
  try {
    const res = await got(
      `${GITHUB_API}/repos/${fullName}/contents/${encodeURIComponent(filePath)}`,
      {
        searchParams: { ref: branch },
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
        timeout: { request: TIMEOUT_MS },
      }
    ).json<{ content: string; encoding: string }>()

    if (res.encoding === 'base64') {
      return Buffer.from(res.content.replace(/\n/g, ''), 'base64').toString('utf8')
    }
    return null
  } catch {
    return null
  }
}

export async function detectFramework(
  fullName: string, branch: string, token: string
): Promise<Framework> {
  if (!fullName) return 'UNKNOWN'

  // Run checks in parallel with FIX BUG-22 timeout
  const [hasDockerfile, packageJsonRaw, hasRequirements, hasIndexHtml] =
    await Promise.all([
      fileExists(fullName, branch, 'Dockerfile', token),
      fetchFileContent(fullName, branch, 'package.json', token),
      fileExists(fullName, branch, 'requirements.txt', token),
      fileExists(fullName, branch, 'index.html', token),
    ])

  if (hasDockerfile) return 'DOCKER'

  if (packageJsonRaw) {
    try {
      const pkg = JSON.parse(packageJsonRaw) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
      if ('next' in allDeps) return 'NEXTJS'
      return 'NODEJS'
    } catch {
      return 'NODEJS'
    }
  }

  if (hasRequirements) return 'PYTHON'
  if (hasIndexHtml) return 'STATIC'

  return 'UNKNOWN'
}
