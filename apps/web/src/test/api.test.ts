import { describe, it, expect, beforeEach, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './mocks/server'
import { authApi, projectsApi, deploymentsApi, billingApi, ApiError } from '../lib/api'

describe('authApi', () => {
  describe('login()', () => {
    it('returns tokens and user on success', async () => {
      const result = await authApi.login({ email: 'test@test.com', password: 'password123' })
      expect(result.accessToken).toBe('mock-access-token')
      expect(result.refreshToken).toBe('mock-refresh-token')
      expect(result.user.email).toBe('test@test.com')
    })

    it('throws ApiError on invalid credentials', async () => {
      await expect(
        authApi.login({ email: 'test@test.com', password: 'wrong' })
      ).rejects.toThrow(ApiError)

      await expect(
        authApi.login({ email: 'test@test.com', password: 'wrong' })
      ).rejects.toMatchObject({ status: 401 })
    })
  })

  describe('register()', () => {
    it('creates user and returns tokens', async () => {
      const result = await authApi.register({
        email: 'new@test.com',
        password: 'password123',
        name: 'New User',
      })
      expect(result.accessToken).toBeTruthy()
      expect(result.user.email).toBe('new@test.com')
    })

    it('throws 409 for duplicate email', async () => {
      await expect(
        authApi.register({ email: 'exists@test.com', password: 'password123', name: 'Dup' })
      ).rejects.toMatchObject({ status: 409 })
    })
  })

  describe('me()', () => {
    it('returns current user', async () => {
      localStorage.setItem('access_token', 'mock-token')
      const user = await authApi.me()
      expect(user.email).toBe('test@test.com')
      expect(user.plan).toBe('FREE')
    })
  })

  describe('githubRepos()', () => {
    it('returns list of repos', async () => {
      const repos = await authApi.githubRepos()
      expect(repos).toHaveLength(2)
      expect(repos[0].language).toBe('TypeScript')
      expect(repos[1].private).toBe(true)
    })
  })
})

describe('projectsApi', () => {
  describe('list()', () => {
    it('returns projects array', async () => {
      const projects = await projectsApi.list()
      expect(projects).toHaveLength(1)
      expect(projects[0].slug).toBe('my-app')
    })
  })

  describe('get()', () => {
    it('returns single project', async () => {
      const project = await projectsApi.get('my-app')
      expect(project.name).toBe('My App')
      expect(project.deployments).toHaveLength(1)
    })

    it('throws 404 for missing project', async () => {
      await expect(projectsApi.get('not-found')).rejects.toMatchObject({ status: 404 })
    })
  })

  describe('create()', () => {
    it('creates and returns new project', async () => {
      const project = await projectsApi.create({
        name: 'New Project',
        githubFullName: 'user/new-project',
        githubRepoId: 789,
        branch: 'main',
        buildSettings: { port: 3000 },
      })
      expect(project.slug).toBe('new-project')
    })
  })

  describe('delete()', () => {
    it('deletes project', async () => {
      const result = await projectsApi.delete('my-app')
      expect(result.ok).toBe(true)
    })
  })
})

describe('deploymentsApi', () => {
  describe('trigger()', () => {
    it('queues a new deployment', async () => {
      const dep = await deploymentsApi.trigger('my-app')
      expect(dep.id).toBe('dep-new')
      expect(dep.status).toBe('QUEUED')
    })
  })

  describe('getLogs()', () => {
    it('returns log lines and status', async () => {
      const logs = await deploymentsApi.getLogs('dep-1')
      expect(logs.lines).toHaveLength(4)
      expect(logs.status).toBe('RUNNING')
      expect(logs.lines[0]).toContain('Starting deploy')
    })
  })
})

describe('billingApi', () => {
  describe('plans()', () => {
    it('returns all 4 plans', async () => {
      const plans = await billingApi.plans()
      expect(plans).toHaveLength(4)
      expect(plans.map((p: any) => p.id)).toEqual(['FREE', 'STARTER', 'PRO', 'BUSINESS'])
    })
  })

  describe('checkout()', () => {
    it('returns Stripe checkout URL', async () => {
      const result = await billingApi.checkout('PRO')
      expect(result.url).toContain('stripe.com')
      expect(result.url).toContain('PRO')
    })
  })
})

describe('ApiError', () => {
  it('is instanceof Error', () => {
    const err = new ApiError(404, 'Not found')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(404)
    expect(err.message).toBe('Not found')
    expect(err.name).toBe('ApiError')
  })
})

describe('Token auto-refresh', () => {
  it('retries request after refreshing expired token', async () => {
    // First: simulate 401 then success after refresh
    let callCount = 0
    server.use(
      http.get('/api/projects', () => {
        callCount++
        if (callCount === 1) {
          return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        return HttpResponse.json([{ slug: 'retried-project' }])
      }),
      http.post('/api/auth/refresh', () =>
        HttpResponse.json({
          accessToken: 'new-token',
          refreshToken: 'new-refresh',
        })
      )
    )

    localStorage.setItem('access_token', 'expired-token')
    localStorage.setItem('refresh_token', 'valid-refresh-token')

    const projects = await projectsApi.list()
    expect(projects[0].slug).toBe('retried-project')
  })

  it('redirects to /login when refresh fails', async () => {
    server.use(
      http.get('/api/projects', () =>
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
      ),
      http.post('/api/auth/refresh', () =>
        HttpResponse.json({ error: 'Session expired' }, { status: 401 })
      )
    )

    localStorage.setItem('access_token', 'expired')
    localStorage.setItem('refresh_token', 'also-expired')

    await expect(projectsApi.list()).rejects.toThrow()
    expect(window.location.replace).toHaveBeenCalledWith('/login')
  })
})
