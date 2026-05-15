// FIX BUG-02+03+04+WARNING-02: clean AppShell without RouterProvider or QueryClient
// No circular deps, useRouterState instead of broken useLocation
import { useEffect } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  LayoutDashboard, CreditCard, Settings, LogOut, Zap,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore } from './store/auth'

const NAV = [
  { to: '/' as const,        label: 'Proyectos', icon: LayoutDashboard },
  { to: '/billing' as const, label: 'Billing',   icon: CreditCard },
  { to: '/settings' as const,label: 'Ajustes',   icon: Settings },
]

const PLAN_BADGE: Record<string, string> = {
  FREE:     'bg-slate-700 text-slate-300',
  STARTER:  'bg-blue-900 text-blue-300',
  PRO:      'bg-violet-900 text-violet-300',
  BUSINESS: 'bg-amber-900 text-amber-300',
}

const PUBLIC_PATHS = ['/login', '/register', '/auth/callback']

// FIX WARNING-03: ErrorBoundary component
import React from 'react'

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
          <div className="max-w-md text-center">
            <div className="text-5xl mb-4">💥</div>
            <h1 className="text-xl font-bold text-white mb-2">Algo salió mal</h1>
            <p className="text-sm text-slate-400 mb-6 font-mono">
              {this.state.error.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Recargar página
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function Sidebar() {
  const { user, logout } = useAuthStore()
  // FIX BUG-04: useRouterState instead of broken useLocation
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  return (
    <aside className="fixed inset-y-0 left-0 w-56 bg-slate-950 border-r border-slate-800 flex-col z-30 hidden md:flex">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800">
        <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center">
          <Zap size={14} className="text-white" />
        </div>
        <span className="font-bold text-white text-sm">VPS LATAM</span>
        <span className="ml-auto text-[10px] font-medium text-violet-400 bg-violet-900/50 px-1.5 py-0.5 rounded">
          β
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active =
            currentPath === to ||
            (to !== '/' && currentPath.startsWith(to))
          return (
            <Link
              key={to}
              to={to}
              className={clsx(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                active
                  ? 'bg-violet-600/20 text-violet-300'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              )}
            >
              <Icon size={15} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      {user && (
        <div className="px-3 py-4 border-t border-slate-800">
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {(user.name?.[0] ?? user.email[0]).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">
                {user.name ?? user.email}
              </p>
              <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded', PLAN_BADGE[user.plan] ?? PLAN_BADGE.FREE)}>
                {user.plan}
              </span>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:text-red-400 hover:bg-red-900/10 rounded-lg transition-all mt-1"
          >
            <LogOut size={13} /> Cerrar sesión
          </button>
        </div>
      )}
    </aside>
  )
}

// AppShell — wraps every route, handles auth redirect
export function AppShell({ children }: { children: React.ReactNode }) {
  const { loadUser, initialized, user } = useAuthStore()
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const isPublic = PUBLIC_PATHS.some(p => currentPath.startsWith(p))

  useEffect(() => {
    loadUser()
  }, [loadUser])

  if (!initialized) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Not logged in → redirect to /login (only for protected routes)
  if (!user && !isPublic) {
    window.location.replace('/login')
    return null
  }

  if (isPublic) {
    return (
      <ErrorBoundary>
        <div className="min-h-screen bg-slate-950">{children}</div>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-950 text-white">
        <Sidebar />
        <main className="md:pl-56 min-h-screen">{children}</main>
      </div>
    </ErrorBoundary>
  )
}
