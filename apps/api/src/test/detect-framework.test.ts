import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectFramework } from '../services/detect-framework'

const mockedFetch = vi.fn()

describe('detectFramework', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockedFetch)
  })

  function mockGithubFile(url: unknown, path: string, content = '') {
    if (typeof url !== 'string' && !(url instanceof URL)) return undefined
    if (!url.toString().includes(path)) return undefined
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        content: Buffer.from(content).toString('base64'),
        encoding: 'base64',
      }),
    })
  }

  function mockNotFound() {
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
  }

  it('returns DOCKER when Dockerfile is present', async () => {
    // Dockerfile exists (200) → all others don't matter
    mockedFetch.mockImplementation((url) => mockGithubFile(url, 'Dockerfile') ?? mockNotFound())

    const result = await detectFramework('owner/repo', 'main', 'token')
    expect(result).toBe('DOCKER')
  })

  it('returns NEXTJS for package.json with next dependency', async () => {
    const pkg = JSON.stringify({ dependencies: { next: '^14.0.0', react: '^18.0.0' } })
    mockedFetch.mockImplementation((url) => mockGithubFile(url, 'package.json', pkg) ?? mockNotFound())

    const result = await detectFramework('owner/nextjs-app', 'main', 'token')
    expect(result).toBe('NEXTJS')
  })

  it('returns NODEJS for package.json without next', async () => {
    const pkg = JSON.stringify({ dependencies: { express: '^4.18.0' } })
    mockedFetch.mockImplementation((url) => mockGithubFile(url, 'package.json', pkg) ?? mockNotFound())

    const result = await detectFramework('owner/express-app', 'main', 'token')
    expect(result).toBe('NODEJS')
  })

  it('returns PYTHON when requirements.txt found', async () => {
    mockedFetch.mockImplementation((url) => mockGithubFile(url, 'requirements.txt') ?? mockNotFound())

    const result = await detectFramework('owner/flask-app', 'main', 'token')
    expect(result).toBe('PYTHON')
  })

  it('returns STATIC for index.html', async () => {
    mockedFetch.mockImplementation((url) => mockGithubFile(url, 'index.html') ?? mockNotFound())

    const result = await detectFramework('owner/static-site', 'main', 'token')
    expect(result).toBe('STATIC')
  })

  it('returns UNKNOWN when no recognized file found', async () => {
    mockedFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) })

    const result = await detectFramework('owner/mystery-app', 'main', 'token')
    expect(result).toBe('UNKNOWN')
  })

  it('returns UNKNOWN for empty fullName', async () => {
    const result = await detectFramework('', 'main', 'token')
    expect(result).toBe('UNKNOWN')
  })

  it('handles malformed package.json gracefully', async () => {
    mockedFetch.mockImplementation((url) =>
      mockGithubFile(url, 'package.json', '{invalid json}}}') ?? mockNotFound()
    )

    // Malformed JSON → should still return NODEJS (fallback)
    const result = await detectFramework('owner/broken-pkg', 'main', 'token')
    expect(result).toBe('NODEJS')
  })
})
