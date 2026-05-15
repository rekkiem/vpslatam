import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectFramework } from '../services/detect-framework'
import got from 'got'

vi.mock('got')
const mockedGot = vi.mocked(got, true)

// Helper to mock a file existing or not
function mockFile(exists: boolean, content?: string) {
  if (!exists) {
    return vi.fn().mockRejectedValue(new Error('404'))
  }
  const mock = vi.fn().mockResolvedValue({
    json: () => Promise.resolve({
      content: content ? Buffer.from(content).toString('base64') : '',
      encoding: 'base64',
    }),
  })
  return mock
}

describe('detectFramework', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns DOCKER when Dockerfile is present', async () => {
    // Dockerfile exists (200) → all others don't matter
    mockedGot.mockImplementation((url: any) => {
      if (typeof url === 'string' && url.includes('Dockerfile')) {
        return { json: () => Promise.resolve({ content: '', encoding: 'base64' }) } as any
      }
      throw new Error('404')
    })

    const result = await detectFramework('owner/repo', 'main', 'token')
    expect(result).toBe('DOCKER')
  })

  it('returns NEXTJS for package.json with next dependency', async () => {
    const pkg = JSON.stringify({ dependencies: { next: '^14.0.0', react: '^18.0.0' } })
    mockedGot.mockImplementation((url: any) => {
      if (typeof url === 'string' && url.includes('Dockerfile')) throw new Error('404')
      if (typeof url === 'string' && url.includes('package.json')) {
        return {
          json: () => Promise.resolve({
            content: Buffer.from(pkg).toString('base64'),
            encoding: 'base64',
          }),
        } as any
      }
      throw new Error('404')
    })

    const result = await detectFramework('owner/nextjs-app', 'main', 'token')
    expect(result).toBe('NEXTJS')
  })

  it('returns NODEJS for package.json without next', async () => {
    const pkg = JSON.stringify({ dependencies: { express: '^4.18.0' } })
    mockedGot.mockImplementation((url: any) => {
      if (typeof url === 'string' && url.includes('Dockerfile')) throw new Error('404')
      if (typeof url === 'string' && url.includes('package.json')) {
        return {
          json: () => Promise.resolve({
            content: Buffer.from(pkg).toString('base64'),
            encoding: 'base64',
          }),
        } as any
      }
      throw new Error('404')
    })

    const result = await detectFramework('owner/express-app', 'main', 'token')
    expect(result).toBe('NODEJS')
  })

  it('returns PYTHON when requirements.txt found', async () => {
    mockedGot.mockImplementation((url: any) => {
      if (typeof url === 'string' && url.includes('Dockerfile')) throw new Error('404')
      if (typeof url === 'string' && url.includes('package.json')) throw new Error('404')
      if (typeof url === 'string' && url.includes('requirements.txt')) {
        return { json: () => Promise.resolve({ content: '', encoding: 'base64' }) } as any
      }
      throw new Error('404')
    })

    const result = await detectFramework('owner/flask-app', 'main', 'token')
    expect(result).toBe('PYTHON')
  })

  it('returns STATIC for index.html', async () => {
    mockedGot.mockImplementation((url: any) => {
      if (typeof url === 'string' && url.includes('index.html')) {
        return { json: () => Promise.resolve({ content: '', encoding: 'base64' }) } as any
      }
      throw new Error('404')
    })

    const result = await detectFramework('owner/static-site', 'main', 'token')
    expect(result).toBe('STATIC')
  })

  it('returns UNKNOWN when no recognized file found', async () => {
    mockedGot.mockRejectedValue(new Error('404'))

    const result = await detectFramework('owner/mystery-app', 'main', 'token')
    expect(result).toBe('UNKNOWN')
  })

  it('returns UNKNOWN for empty fullName', async () => {
    const result = await detectFramework('', 'main', 'token')
    expect(result).toBe('UNKNOWN')
  })

  it('handles malformed package.json gracefully', async () => {
    mockedGot.mockImplementation((url: any) => {
      if (typeof url === 'string' && url.includes('Dockerfile')) throw new Error('404')
      if (typeof url === 'string' && url.includes('package.json')) {
        return {
          json: () => Promise.resolve({
            content: Buffer.from('{invalid json}}}').toString('base64'),
            encoding: 'base64',
          }),
        } as any
      }
      throw new Error('404')
    })

    // Malformed JSON → should still return NODEJS (fallback)
    const result = await detectFramework('owner/broken-pkg', 'main', 'token')
    expect(result).toBe('NODEJS')
  })
})
