import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory, createRootRoute, createRoute,
  createRouter, RouterProvider,
} from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { server } from './mocks/server'
import BillingPage from '../pages/Billing'
import { useAuthStore } from '../store/auth'

function makeRouter(component: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const root = createRootRoute({ component: () => component as any })
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => component as any })
  const router = createRouter({ routeTree: root.addChildren([index]), history: createMemoryHistory() })
  return <QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>
}

describe('BillingPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'test@test.com', name: 'Test', avatarUrl: null, plan: 'FREE', role: 'MEMBER' },
      loading: false, initialized: true,
    })
  })

  it('renders all 4 plan cards', async () => {
    render(makeRouter(<BillingPage />))
    await waitFor(() => {
      expect(screen.getByText('Free')).toBeInTheDocument()
      expect(screen.getByText('Starter')).toBeInTheDocument()
      expect(screen.getByText('Pro')).toBeInTheDocument()
      expect(screen.getByText('Business')).toBeInTheDocument()
    })
  })

  it('shows FREE plan as current', async () => {
    render(makeRouter(<BillingPage />))
    await waitFor(() => {
      const currentLabels = screen.getAllByText('Plan actual')
      expect(currentLabels.length).toBeGreaterThan(0)
    })
  })

  it('shows upgrade buttons for higher plans', async () => {
    render(makeRouter(<BillingPage />))
    await waitFor(() => {
      const upgradeBtns = screen.getAllByText('Actualizar')
      expect(upgradeBtns.length).toBe(3) // Starter, Pro, Business
    })
  })

  it('clicking Actualizar initiates Stripe checkout', async () => {
    let checkoutCalled = false
    let planRequested = ''
    server.use(
      http.post('/api/billing/checkout', async ({ request }) => {
        const body = await request.json() as any
        checkoutCalled = true
        planRequested = body.plan
        return HttpResponse.json({ url: 'https://checkout.stripe.com/mock?plan=STARTER' })
      })
    )

    // Mock window.location.href assignment
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, href: '' },
    })

    render(makeRouter(<BillingPage />))
    await waitFor(() => screen.getAllByText('Actualizar'))

    fireEvent.click(screen.getAllByText('Actualizar')[0])

    await waitFor(() => {
      expect(checkoutCalled).toBe(true)
      expect(planRequested).toBe('STARTER')
    })
  })

  it('shows empty invoices state', async () => {
    render(makeRouter(<BillingPage />))
    await waitFor(() => {
      expect(screen.getByText(/sin facturas aún/i)).toBeInTheDocument()
    })
  })

  it('shows invoices when they exist', async () => {
    server.use(
      http.get('/api/billing/invoices', () =>
        HttpResponse.json([{
          id: 'inv-1',
          amount: 2000,
          currency: 'usd',
          status: 'PAID',
          createdAt: new Date().toISOString(),
          pdfUrl: 'https://example.com/invoice.pdf',
          paidAt: new Date().toISOString(),
        }])
      )
    )

    render(makeRouter(<BillingPage />))
    await waitFor(() => {
      expect(screen.getByText('$20.00 USD')).toBeInTheDocument()
      expect(screen.getByText('PAID')).toBeInTheDocument()
    })
  })

  it('shows plan features', async () => {
    render(makeRouter(<BillingPage />))
    await waitFor(() => {
      expect(screen.getByText('1 project')).toBeInTheDocument()
      expect(screen.getByText('10 projects')).toBeInTheDocument()
    })
  })
})
