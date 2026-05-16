import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory, createRootRoute, createRoute, Outlet,
  createRouter, RouterProvider,
} from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { server } from './mocks/server'
import DashboardPage from '../pages/Dashboard'
import { useAuthStore } from '../store/auth'

function makeRouter(component: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const root = createRootRoute({ component: Outlet })
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => component as any })
  const router = createRouter({
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return (
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'test@test.com', name: 'Test', avatarUrl: null, plan: 'FREE', role: 'MEMBER' },
      loading: false,
      initialized: true,
    })
    vi.clearAllMocks()
  })

  it('shows projects header', async () => {
    render(makeRouter(<DashboardPage />))
    expect(await screen.findByText('Proyectos')).toBeInTheDocument()
  })

  it('renders project cards after loading', async () => {
    render(makeRouter(<DashboardPage />))
    await waitFor(() => {
      expect(screen.getByText('My App')).toBeInTheDocument()
    })
  })

  it('shows project github repo name', async () => {
    render(makeRouter(<DashboardPage />))
    await waitFor(() => {
      expect(screen.getByText('user/my-app')).toBeInTheDocument()
    })
  })

  it('shows RUNNING status badge', async () => {
    render(makeRouter(<DashboardPage />))
    await waitFor(() => {
      expect(screen.getByText('Activo')).toBeInTheDocument()
    })
  })

  it('shows FREE plan banner', async () => {
    render(makeRouter(<DashboardPage />))
    await waitFor(() => {
      expect(screen.getByText(/plan gratuito/i)).toBeInTheDocument()
    })
  })

  it('does NOT show plan banner for PRO user', async () => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'pro@test.com', name: 'Pro', avatarUrl: null, plan: 'PRO', role: 'MEMBER' },
      loading: false, initialized: true,
    })
    render(makeRouter(<DashboardPage />))
    await waitFor(() => {
      expect(screen.queryByText(/plan gratuito/i)).not.toBeInTheDocument()
    })
  })

  it('shows empty state when no projects', async () => {
    server.use(http.get('/api/projects', () => HttpResponse.json([])))
    render(makeRouter(<DashboardPage />))
    await waitFor(() => {
      expect(screen.getByText('Sin proyectos aún')).toBeInTheDocument()
    })
  })

  it('keeps the dashboard shell visible while projects load', async () => {
    server.use(
      http.get('/api/projects', async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        return HttpResponse.json([])
      })
    )
    render(makeRouter(<DashboardPage />))
    expect(await screen.findByText('Proyectos')).toBeInTheDocument()
  })

  it('shows "Nuevo proyecto" link', async () => {
    render(makeRouter(<DashboardPage />))
    const link = await screen.findByRole('link', { name: /nuevo proyecto/i })
    expect(link).toHaveAttribute('href', '/projects/new')
  })

  it('triggers deploy on button click', async () => {
    let deployTriggered = false
    server.use(
      http.post('/api/deployments/project/:slug', () => {
        deployTriggered = true
        return HttpResponse.json({ id: 'dep-new', status: 'QUEUED' }, { status: 202 })
      })
    )

    render(makeRouter(<DashboardPage />))
    const deployBtn = await screen.findByRole('button', { name: /deploy/i })
    fireEvent.click(deployBtn)

    await waitFor(() => {
      expect(deployTriggered).toBe(true)
    })
  })

  it('shows project count in subtitle', async () => {
    render(makeRouter(<DashboardPage />))
    await waitFor(() => {
      expect(screen.getByText(/1 proyecto activo/i)).toBeInTheDocument()
    })
  })
})
