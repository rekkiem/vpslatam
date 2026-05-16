import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAuthStore } from '../store/auth'

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset store state
    useAuthStore.setState({ user: null, loading: false, initialized: false })
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('login()', () => {
    it('sets user and tokens on success', async () => {
      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await result.current.login('test@test.com', 'password123')
      })

      expect(result.current.user).not.toBeNull()
      expect(result.current.user?.email).toBe('test@test.com')
      expect(result.current.loading).toBe(false)
      expect(localStorage.setItem).toHaveBeenCalledWith('access_token', 'mock-access-token')
      expect(localStorage.setItem).toHaveBeenCalledWith('refresh_token', 'mock-refresh-token')
    })

    it('sets loading to false on error', async () => {
      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        try {
          await result.current.login('test@test.com', 'wrong-password')
        } catch {}
      })

      expect(result.current.loading).toBe(false)
      expect(result.current.user).toBeNull()
    })

    it('throws on invalid credentials', async () => {
      const { result } = renderHook(() => useAuthStore())
      let error: unknown

      await act(async () => {
        try {
          await result.current.login('test@test.com', 'wrong')
        } catch (err) {
          error = err
        }
      })

      expect(error).toBeDefined()
    })
  })

  describe('register()', () => {
    it('creates account and sets user', async () => {
      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await result.current.register('new@test.com', 'password123', 'New User')
      })

      expect(result.current.user?.email).toBe('new@test.com')
      expect(localStorage.setItem).toHaveBeenCalledWith('access_token', 'mock-access-token')
    })
  })

  describe('loadUser()', () => {
    it('loads user when token exists', async () => {
      localStorage.setItem('access_token', 'valid-token')
      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await result.current.loadUser()
      })

      expect(result.current.initialized).toBe(true)
      expect(result.current.user?.email).toBe('test@test.com')
    })

    it('marks as initialized even without token', async () => {
      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await result.current.loadUser()
      })

      expect(result.current.initialized).toBe(true)
      expect(result.current.user).toBeNull()
    })
  })

  describe('logout()', () => {
    it('clears user and tokens', async () => {
      useAuthStore.setState({
        user: { id: 'u1', email: 'test@test.com', name: 'Test', avatarUrl: null, plan: 'FREE', role: 'MEMBER' },
        loading: false,
        initialized: true,
      })
      localStorage.setItem('access_token', 'token')
      localStorage.setItem('refresh_token', 'refresh')

      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await result.current.logout()
      })

      expect(localStorage.removeItem).toHaveBeenCalledWith('access_token')
      expect(localStorage.removeItem).toHaveBeenCalledWith('refresh_token')
    })
  })

  describe('setTokens()', () => {
    it('persists tokens to localStorage', () => {
      const { result } = renderHook(() => useAuthStore())
      result.current.setTokens('access-123', 'refresh-456')

      expect(localStorage.setItem).toHaveBeenCalledWith('access_token', 'access-123')
      expect(localStorage.setItem).toHaveBeenCalledWith('refresh_token', 'refresh-456')
    })
  })
})
