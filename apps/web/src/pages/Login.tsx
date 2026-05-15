import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Zap, Github, Loader2, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import clsx from 'clsx'

export default function LoginPage({ mode = 'login' }: { mode?: 'login' | 'register' }) {
  const navigate = useNavigate()
  const { login, register } = useAuthStore()

  const [isRegister, setIsRegister] = useState(mode === 'register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const GITHUB_OAUTH_URL = `${import.meta.env.VITE_API_URL || '/api'}/auth/github`

  const handleSubmit = async () => {
    setError('')
    setLoading(true)
    try {
      if (isRegister) {
        await register(email, password, name)
      } else {
        await login(email, password)
      }
      navigate({ to: '/' })
    } catch (err: any) {
      setError(err.message ?? 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Left panel - decorative */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-slate-900 to-slate-950 border-r border-slate-800 items-center justify-center p-12">
        <div className="max-w-md">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center">
              <Zap size={20} className="text-white" />
            </div>
            <span className="text-2xl font-bold text-white">VPS LATAM Cloud</span>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4 leading-tight">
            Deploy desde GitHub<br />
            <span className="text-violet-400">en 3 clics.</span>
          </h2>
          <p className="text-slate-400 leading-relaxed">
            Plataforma de despliegue para LATAM. Sin configuraciones complejas,
            sin sorpresas. Solo conecta tu repo y listo.
          </p>

          <div className="mt-10 space-y-4">
            {[
              'Node.js, Next.js, Python, HTML estático',
              'SSL automático con Let\'s Encrypt',
              'Deploy en cada push a GitHub',
              'Desde USD 5/mes con plan Starter',
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-3 text-sm text-slate-300">
                <div className="w-5 h-5 rounded-full bg-violet-600/20 border border-violet-700 flex items-center justify-center shrink-0">
                  <div className="w-1.5 h-1.5 bg-violet-400 rounded-full" />
                </div>
                {feat}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:text-left">
            <div className="flex items-center gap-2 justify-center lg:hidden mb-6">
              <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
                <Zap size={16} className="text-white" />
              </div>
              <span className="text-xl font-bold text-white">VPS LATAM</span>
            </div>
            <h1 className="text-2xl font-bold text-white">
              {isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {isRegister
                ? 'Comienza gratis — sin tarjeta de crédito'
                : 'Bienvenido de vuelta'}
            </p>
          </div>

          {/* GitHub OAuth */}
          <a
            href={GITHUB_OAUTH_URL}
            className="flex items-center justify-center gap-2.5 w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-lg text-sm font-medium text-white transition-all mb-4"
          >
            <Github size={16} />
            Continuar con GitHub
          </a>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-xs text-slate-600">o con email</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-950/50 border border-red-800 rounded-lg text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="space-y-3">
            {isRegister && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="tu@email.com"
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Contraseña</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder={isRegister ? 'Mínimo 8 caracteres' : '••••••••'}
                  className="w-full pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className={clsx(
              'mt-5 w-full py-2.5 rounded-lg text-sm font-semibold transition-all',
              'bg-violet-600 hover:bg-violet-500 text-white',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'shadow-md shadow-violet-900/30'
            )}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                {isRegister ? 'Creando cuenta...' : 'Iniciando sesión...'}
              </span>
            ) : (
              isRegister ? 'Crear cuenta gratis' : 'Iniciar sesión'
            )}
          </button>

          <p className="mt-5 text-center text-sm text-slate-500">
            {isRegister ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}
            {' '}
            <button
              onClick={() => { setIsRegister(!isRegister); setError('') }}
              className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
            >
              {isRegister ? 'Iniciar sesión' : 'Crear cuenta gratis'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
