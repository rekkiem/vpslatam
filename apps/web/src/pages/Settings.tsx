// FIX BUG-20: Settings page (was missing — caused 404 on sidebar nav)
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Github, Loader2, CheckCircle2, AlertTriangle, Key, Bell, Shield } from 'lucide-react'
import { authApi, projectsApi } from '../lib/api'
import { useAuthStore } from '../store/auth'
import clsx from 'clsx'

export default function SettingsPage() {
  const { user, loadUser } = useAuthStore()
  const qc = useQueryClient()
  const [name, setName] = useState(user?.name ?? '')
  const [saved, setSaved] = useState(false)

  const { data: repos, isLoading: reposLoading, error: reposError } = useQuery({
    queryKey: ['github-repos', 1],
    queryFn: () => authApi.githubRepos(1),
    retry: 0,
  })

  const updateName = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/auth/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error('Failed to update')
      return res.json()
    },
    onSuccess: () => {
      setSaved(true)
      loadUser()
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const GITHUB_OAUTH = `${import.meta.env.VITE_API_URL || '/api'}/auth/github`
  const isGithubConnected = !reposError && (repos !== undefined)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Ajustes</h1>
        <p className="text-sm text-slate-400 mt-0.5">Configura tu cuenta y conexiones</p>
      </div>

      <div className="space-y-5">
        {/* Profile */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={14} className="text-violet-400" />
            <h2 className="text-sm font-semibold text-white">Perfil</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
              <input
                value={user?.email ?? ''}
                disabled
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-400 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Nombre</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Plan actual</label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{user?.plan}</span>
                <a href="/billing" className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                  Cambiar plan →
                </a>
              </div>
            </div>
            <button
              onClick={() => updateName.mutate()}
              disabled={updateName.isPending || name === user?.name}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                saved
                  ? 'bg-green-600 text-white'
                  : 'bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed'
              )}
            >
              {updateName.isPending
                ? <><Loader2 size={14} className="animate-spin" /> Guardando...</>
                : saved
                  ? <><CheckCircle2 size={14} /> Guardado</>
                  : 'Guardar cambios'
              }
            </button>
          </div>
        </section>

        {/* GitHub connection */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Github size={14} className="text-slate-300" />
            <h2 className="text-sm font-semibold text-white">GitHub</h2>
          </div>

          {reposLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 size={14} className="animate-spin" />
              Verificando conexión...
            </div>
          ) : isGithubConnected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-green-400">
                <CheckCircle2 size={14} />
                GitHub conectado ({(repos as any[])?.length ?? 0} repos accesibles)
              </div>
              <a
                href={GITHUB_OAUTH}
                className="text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-all"
              >
                Reconectar
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-amber-400">
                <AlertTriangle size={14} />
                GitHub no conectado
              </div>
              <p className="text-xs text-slate-500">
                Conecta tu cuenta de GitHub para poder importar repositorios y hacer deploys automáticos.
              </p>
              <a
                href={GITHUB_OAUTH}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm font-medium text-white transition-all"
              >
                <Github size={15} />
                Conectar GitHub
              </a>
            </div>
          )}
        </section>

        {/* API tokens (placeholder for roadmap) */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 opacity-60">
          <div className="flex items-center gap-2 mb-3">
            <Key size={14} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-white">API Tokens</h2>
            <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded font-medium ml-auto">
              Próximamente
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Crea tokens de API para integrar VPS LATAM con tu CI/CD.
          </p>
        </section>

        {/* Notifications (placeholder) */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 opacity-60">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={14} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-white">Notificaciones</h2>
            <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded font-medium ml-auto">
              Próximamente
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Email cuando deploy falla o tu app se cae.
          </p>
        </section>
      </div>
    </div>
  )
}
