// FIX BUG-01+02+03: Correct TanStack Router v1 API (createRootRoute/createRoute/createRouter)
// Single QueryClientProvider, no circular dependency
import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
} from '@tanstack/react-router'

import { AppShell } from './App'
import LoginPage from './pages/Login'
import DashboardPage from './pages/Dashboard'
import NewProjectPage from './pages/NewProject'
import ProjectPage from './pages/Project'
import BillingPage from './pages/Billing'
import AdminPage from './pages/Admin'
import SettingsPage from './pages/Settings'

// ── Query client (single instance) ───────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
})

// ── Auth callback ─────────────────────────────────────────────
function AuthCallbackPage() {
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const refresh = params.get('refresh')
    if (token) localStorage.setItem('access_token', token)
    if (refresh) localStorage.setItem('refresh_token', refresh)
    window.location.replace('/')
  }, [])
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// ── FIX BUG-01: createRootRoute (v1 API) ─────────────────────
const rootRoute = createRootRoute({
  component: () => (
    // FIX BUG-02: Outlet is the router's output, AppShell wraps it
    <AppShell>
      <Outlet />
    </AppShell>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: () => <LoginPage mode="register" />,
})

const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/callback',
  component: AuthCallbackPage,
})

const newProjectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/new',
  component: NewProjectPage,
})

// FIX BUG-17: createRoute with correct path param for useParams
const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$slug',
  component: ProjectPage,
})

const billingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/billing',
  component: BillingPage,
})

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: AdminPage,
})

// FIX BUG-20: Settings route was missing from router
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  authCallbackRoute,
  newProjectRoute,
  projectRoute,
  billingRoute,
  adminRoute,
  settingsRoute,
])

// FIX BUG-01: createRouter (v1 API)
const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

// FIX BUG-03: single QueryClientProvider at the very top
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
)
