// FIX BUG-19: adminApi added to centralized client
// All API calls go through this module with auto-refresh logic
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('access_token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      const newToken = localStorage.getItem('access_token')
      if (newToken) headers['Authorization'] = `Bearer ${newToken}`
      const retry = await fetch(`${API_BASE}${path}`, { ...options, headers })
      if (!retry.ok) {
        const err = await retry.json().catch(() => ({ error: 'Request failed' }))
        throw new ApiError(retry.status, err.error ?? 'Request failed')
      }
      return retry.json() as Promise<T>
    }
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    window.location.replace('/login')
    throw new ApiError(401, 'Session expired')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new ApiError(res.status, err.error ?? 'Request failed')
  }

  // 204 No Content
  if (res.status === 204) return {} as T
  return res.json() as Promise<T>
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) return false
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return false
    const data = await res.json() as { accessToken: string; refreshToken: string }
    localStorage.setItem('access_token', data.accessToken)
    localStorage.setItem('refresh_token', data.refreshToken)
    return true
  } catch {
    return false
  }
}

// ── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (body: { email: string; password: string; name: string }) =>
    request<{ accessToken: string; refreshToken: string; user: any }>('/auth/register', {
      method: 'POST', body: JSON.stringify(body),
    }),
  login: (body: { email: string; password: string }) =>
    request<{ accessToken: string; refreshToken: string; user: any }>('/auth/login', {
      method: 'POST', body: JSON.stringify(body),
    }),
  me: () => request<any>('/auth/me'),
  githubRepos: (page = 1) => request<any[]>(`/auth/github/repos?page=${page}`),
  logout: (refreshToken: string) =>
    request('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
}

// ── Projects ────────────────────────────────────────────────────────────────
export const projectsApi = {
  list:   ()           => request<any[]>('/projects'),
  get:    (slug: string) => request<any>(`/projects/${slug}`),
  create: (body: any)  => request<any>('/projects', { method: 'POST', body: JSON.stringify(body) }),
  update: (slug: string, body: any) =>
    request<any>(`/projects/${slug}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (slug: string) => request<any>(`/projects/${slug}`, { method: 'DELETE' }),
  getEnv: (slug: string) => request<any[]>(`/projects/${slug}/env`),
  setEnv: (slug: string, vars: { key: string; value: string }[]) =>
    request<any>(`/projects/${slug}/env`, { method: 'PUT', body: JSON.stringify({ vars }) }),
  deleteEnvKey: (slug: string, key: string) =>
    request<any>(`/projects/${slug}/env/${key}`, { method: 'DELETE' }),
  metrics: (slug: string, range = '1h') =>
    request<any[]>(`/projects/${slug}/metrics?range=${range}`),
}

// ── Deployments ─────────────────────────────────────────────────────────────
export const deploymentsApi = {
  list:     (slug: string) => request<any[]>(`/deployments/project/${slug}`),
  get:      (id: string)   => request<any>(`/deployments/${id}`),
  trigger:  (slug: string, branch?: string) =>
    request<any>(`/deployments/project/${slug}`, {
      method: 'POST', body: JSON.stringify({ branch }),
    }),
  cancel:   (id: string) => request<any>(`/deployments/${id}/cancel`, { method: 'POST' }),
  rollback: (id: string) => request<any>(`/deployments/${id}/rollback`, { method: 'POST' }),
  getLogs:  (id: string, lines = 200) =>
    request<{ lines: string[]; status: string; total: number }>(`/deployments/${id}/logs?lines=${lines}`),
}

// ── Billing ─────────────────────────────────────────────────────────────────
export const billingApi = {
  plans:        () => request<any[]>('/billing/plans'),
  subscription: () => request<any>('/billing/subscription'),
  checkout:     (plan: string) =>
    request<{ url: string }>('/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) }),
  portal:       () => request<{ url: string }>('/billing/portal', { method: 'POST' }),
  invoices:     () => request<any[]>('/billing/invoices'),
}

// ── Domains ─────────────────────────────────────────────────────────────────
export const domainsApi = {
  list:   (slug: string) => request<any[]>(`/domains/project/${slug}`),
  add:    (slug: string, domain: string) =>
    request<any>(`/domains/project/${slug}`, { method: 'POST', body: JSON.stringify({ domain }) }),
  verify: (slug: string, domainId: string) =>
    request<any>(`/domains/project/${slug}/${domainId}/verify`, { method: 'POST' }),
  remove: (slug: string, domainId: string) =>
    request<any>(`/domains/project/${slug}/${domainId}`, { method: 'DELETE' }),
}

// ── Admin (FIX BUG-19: centralized, not raw fetch) ──────────────────────────
export const adminApi = {
  stats:     () => request<any>('/admin/stats'),
  users:     (page = 1, search = '') =>
    request<any>(`/admin/users?page=${page}&search=${encodeURIComponent(search)}`),
  getUser:   (id: string) => request<any>(`/admin/users/${id}`),
  suspend:   (id: string) =>
    request<any>(`/admin/users/${id}/suspend`, { method: 'POST', body: '{}' }),
  unsuspend: (id: string) =>
    request<any>(`/admin/users/${id}/unsuspend`, { method: 'POST', body: '{}' }),
  changePlan:(id: string, plan: string) =>
    request<any>(`/admin/users/${id}/plan`, { method: 'PATCH', body: JSON.stringify({ plan }) }),
  auditLogs: (page = 1) => request<any>(`/admin/audit-logs?page=${page}`),
  deployments: (status?: string) =>
    request<any[]>(`/admin/deployments${status ? `?status=${status}` : ''}`),
}
