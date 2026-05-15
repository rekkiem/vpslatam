import { http, HttpResponse } from 'msw'

const API = '/api'

const mockUser = {
  id: 'user-1',
  email: 'test@test.com',
  name: 'Test User',
  plan: 'FREE',
  role: 'MEMBER',
  avatarUrl: null,
  createdAt: new Date().toISOString(),
  subscriptions: [],
}

const mockProject = {
  id: 'proj-1',
  slug: 'my-app',
  name: 'My App',
  githubFullName: 'user/my-app',
  defaultBranch: 'main',
  framework: 'NODEJS',
  status: 'ACTIVE',
  memoryLimit: 512,
  cpuLimit: 0.5,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deployments: [{
    id: 'dep-1',
    status: 'RUNNING',
    endpoint: 'https://my-app.vpslatam.cloud',
    createdAt: new Date().toISOString(),
    commitSha: 'abc1234',
    commitMsg: 'feat: initial deploy',
    branch: 'main',
    buildDuration: 45,
    errorMessage: null,
  }],
  domains: [{ domain: 'my-app.vpslatam.cloud', verified: true }],
}

const mockDeployment = {
  id: 'dep-new',
  projectId: 'proj-1',
  status: 'QUEUED',
  branch: 'main',
  createdAt: new Date().toISOString(),
}

export const handlers = [
  // Auth
  http.get(`${API}/auth/me`, () => HttpResponse.json(mockUser)),

  http.post(`${API}/auth/login`, async ({ request }) => {
    const body = await request.json() as any
    if (body.email === 'test@test.com' && body.password === 'password123') {
      return HttpResponse.json({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        user: mockUser,
      })
    }
    return HttpResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }),

  http.post(`${API}/auth/register`, async ({ request }) => {
    const body = await request.json() as any
    if (body.email === 'exists@test.com') {
      return HttpResponse.json({ error: 'Email already registered' }, { status: 409 })
    }
    return HttpResponse.json({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      user: { ...mockUser, email: body.email, name: body.name },
    }, { status: 201 })
  }),

  http.post(`${API}/auth/refresh`, async ({ request }) => {
    const body = await request.json() as any
    if (body.refreshToken === 'valid-refresh-token') {
      return HttpResponse.json({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      })
    }
    return HttpResponse.json({ error: 'Session expired' }, { status: 401 })
  }),

  http.get(`${API}/auth/github/repos`, () =>
    HttpResponse.json([
      {
        id: 123,
        name: 'my-app',
        fullName: 'user/my-app',
        private: false,
        defaultBranch: 'main',
        language: 'TypeScript',
        updatedAt: new Date().toISOString(),
        description: 'My awesome app',
      },
      {
        id: 456,
        name: 'flask-api',
        fullName: 'user/flask-api',
        private: true,
        defaultBranch: 'main',
        language: 'Python',
        updatedAt: new Date().toISOString(),
        description: null,
      },
    ])
  ),

  // Projects
  http.get(`${API}/projects`, () => HttpResponse.json([mockProject])),

  http.get(`${API}/projects/:slug`, ({ params }) => {
    if (params.slug === 'not-found') {
      return HttpResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    return HttpResponse.json(mockProject)
  }),

  http.post(`${API}/projects`, async ({ request }) => {
    const body = await request.json() as any
    return HttpResponse.json({
      ...mockProject,
      name: body.name,
      slug: body.name.toLowerCase().replace(/\s+/g, '-'),
    }, { status: 201 })
  }),

  http.delete(`${API}/projects/:slug`, () => HttpResponse.json({ ok: true })),

  http.get(`${API}/projects/:slug/metrics`, () => HttpResponse.json([])),

  // Deployments
  http.get(`${API}/deployments/project/:slug`, () =>
    HttpResponse.json([mockProject.deployments[0]])
  ),

  http.post(`${API}/deployments/project/:slug`, () =>
    HttpResponse.json(mockDeployment, { status: 202 })
  ),

  http.get(`${API}/deployments/:id/logs`, () =>
    HttpResponse.json({
      lines: [
        '[2024-01-01T00:00:00.000Z] 🚀 Starting deploy...',
        '[2024-01-01T00:00:10.000Z] 📥 Cloning repository...',
        '[2024-01-01T00:00:30.000Z] 🏗  Building Docker image...',
        '[2024-01-01T00:01:00.000Z] ✅ Container started',
      ],
      status: 'RUNNING',
      total: 4,
    })
  ),

  // Billing
  http.get(`${API}/billing/plans`, () =>
    HttpResponse.json([
      { id: 'FREE',     label: 'Free',     price: 0,  features: ['1 project', '512 MB RAM'] },
      { id: 'STARTER',  label: 'Starter',  price: 5,  features: ['3 projects', '512 MB RAM'] },
      { id: 'PRO',      label: 'Pro',      price: 20, features: ['10 projects', '1 GB RAM'] },
      { id: 'BUSINESS', label: 'Business', price: 50, features: ['30 projects', '2 GB RAM'] },
    ])
  ),

  http.get(`${API}/billing/subscription`, () =>
    HttpResponse.json({ subscription: null, plan: 'FREE' })
  ),

  http.get(`${API}/billing/invoices`, () => HttpResponse.json([])),

  http.post(`${API}/billing/checkout`, async ({ request }) => {
    const body = await request.json() as any
    return HttpResponse.json({ url: `https://checkout.stripe.com/mock?plan=${body.plan}` })
  }),

  // Admin
  http.get(`${API}/admin/stats`, () =>
    HttpResponse.json({
      users: { total: 50, active: 48, suspended: 2 },
      projects: { total: 120, runningDeployments: 15 },
      revenue: { total: 240, paidSubscriptions: 12 },
    })
  ),

  http.get(`${API}/admin/users`, () =>
    HttpResponse.json({
      users: [mockUser],
      total: 1,
      page: 1,
      pages: 1,
    })
  ),

  http.get(`${API}/admin/audit-logs`, () =>
    HttpResponse.json({
      logs: [{
        id: 'log-1',
        action: 'user.login',
        createdAt: new Date().toISOString(),
        user: { email: 'test@test.com' },
      }],
      total: 1,
    })
  ),
]
