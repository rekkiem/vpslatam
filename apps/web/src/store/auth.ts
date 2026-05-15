import { create } from 'zustand'
import { authApi } from '../lib/api'

export interface User {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  plan: string
  role: string
}

interface AuthState {
  user: User | null
  loading: boolean
  initialized: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>
  loadUser: () => Promise<void>
  setTokens: (access: string, refresh: string) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,

  setTokens: (access, refresh) => {
    localStorage.setItem('access_token', access)
    localStorage.setItem('refresh_token', refresh)
  },

  login: async (email, password) => {
    set({ loading: true })
    try {
      const data = await authApi.login({ email, password })
      localStorage.setItem('access_token', data.accessToken)
      localStorage.setItem('refresh_token', data.refreshToken)
      set({ user: data.user as User, loading: false })
    } catch (err) {
      set({ loading: false })
      throw err
    }
  },

  register: async (email, password, name) => {
    set({ loading: true })
    try {
      const data = await authApi.register({ email, password, name })
      localStorage.setItem('access_token', data.accessToken)
      localStorage.setItem('refresh_token', data.refreshToken)
      set({ user: data.user as User, loading: false })
    } catch (err) {
      set({ loading: false })
      throw err
    }
  },

  logout: async () => {
    const refresh = localStorage.getItem('refresh_token') ?? ''
    try { await authApi.logout(refresh) } catch { /* best effort */ }
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    set({ user: null })
    window.location.replace('/login')
  },

  loadUser: async () => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      set({ initialized: true })
      return
    }
    try {
      const user = await authApi.me()
      set({ user: user as User, initialized: true })
    } catch {
      set({ initialized: true })
    }
  },
}))
