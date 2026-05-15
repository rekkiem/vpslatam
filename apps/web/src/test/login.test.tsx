import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import LoginPage from '../pages/Login'
import { useAuthStore } from '../store/auth'

// ── Test helpers ──────────────────────────────────────────────
function wrapWithRouter(component: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const root = createRootRoute({ component: () => component as any })
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => component as any })
  const router = createRouter({ routeTree: root.addChildren([index]), history: createMemoryHistory() })
  return (
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, loading: false, initialized: true })
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders login form by default', () => {
    render(wrapWithRouter(<LoginPage />))
    expect(screen.getByPlaceholderText('tu@email.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument()
  })

  it('toggles to register form', async () => {
    const user = userEvent.setup()
    render(wrapWithRouter(<LoginPage />))

    await user.click(screen.getByText('Crear cuenta gratis'))

    expect(screen.getByPlaceholderText(/mínimo 8 caracteres/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /crear cuenta gratis/i })).toBeInTheDocument()
  })

  it('shows error on invalid credentials', async () => {
    const user = userEvent.setup()
    render(wrapWithRouter(<LoginPage />))

    await user.type(screen.getByPlaceholderText('tu@email.com'), 'test@test.com')
    await user.type(screen.getByPlaceholderText('••••••••'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument()
    })
  })

  it('calls login and redirects on success', async () => {
    const user = userEvent.setup()
    render(wrapWithRouter(<LoginPage />))

    await user.type(screen.getByPlaceholderText('tu@email.com'), 'test@test.com')
    await user.type(screen.getByPlaceholderText('••••••••'), 'password123')
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    await waitFor(() => {
      expect(useAuthStore.getState().user?.email).toBe('test@test.com')
    })
  })

  it('shows loading state during submission', async () => {
    const user = userEvent.setup()
    render(wrapWithRouter(<LoginPage />))

    await user.type(screen.getByPlaceholderText('tu@email.com'), 'test@test.com')
    await user.type(screen.getByPlaceholderText('••••••••'), 'password123')

    // Click and immediately check loading
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }))
    expect(screen.getByText(/iniciando sesión/i)).toBeInTheDocument()
  })

  it('toggles password visibility', async () => {
    const user = userEvent.setup()
    render(wrapWithRouter(<LoginPage />))

    const passwordInput = screen.getByPlaceholderText('••••••••')
    expect(passwordInput).toHaveAttribute('type', 'password')

    // Click eye icon
    const eyeButton = passwordInput.parentElement?.querySelector('button')
    if (eyeButton) await user.click(eyeButton)

    expect(passwordInput).toHaveAttribute('type', 'text')
  })

  it('renders in register mode when mode="register"', () => {
    render(wrapWithRouter(<LoginPage mode="register" />))
    expect(screen.getByRole('button', { name: /crear cuenta gratis/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/tu nombre/i)).toBeInTheDocument()
  })

  it('shows error on duplicate email during register', async () => {
    const user = userEvent.setup()
    render(wrapWithRouter(<LoginPage mode="register" />))

    await user.type(screen.getByPlaceholderText(/tu nombre/i), 'Test User')
    await user.type(screen.getByPlaceholderText('tu@email.com'), 'exists@test.com')
    await user.type(screen.getByPlaceholderText(/mínimo 8 caracteres/i), 'password123')
    await user.click(screen.getByRole('button', { name: /crear cuenta gratis/i }))

    await waitFor(() => {
      expect(screen.getByText(/already registered/i)).toBeInTheDocument()
    })
  })

  it('submits on Enter key press', async () => {
    const user = userEvent.setup()
    render(wrapWithRouter(<LoginPage />))

    const emailInput = screen.getByPlaceholderText('tu@email.com')
    const passwordInput = screen.getByPlaceholderText('••••••••')

    await user.type(emailInput, 'test@test.com')
    await user.type(passwordInput, 'password123{Enter}')

    await waitFor(() => {
      expect(useAuthStore.getState().user).not.toBeNull()
    })
  })
})
