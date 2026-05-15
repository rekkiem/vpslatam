// FIX BUG-18: useNavigate with correct TanStack Router v1 API
import { useState } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Search, GitBranch, Lock, Globe, Loader2,
  ChevronRight, CheckCircle2, ArrowLeft, AlertTriangle,
} from 'lucide-react'
import { authApi, projectsApi } from '../lib/api'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import clsx from 'clsx'

const LANG_ICON: Record<string, string> = {
  JavaScript: '🟨', TypeScript: '🔷', Python: '🐍',
  HTML: '🌐', Go: '🩵', Rust: '🦀', Ruby: '💎',
  Java: '☕', PHP: '🐘', CSS: '🎨',
}

type Step = 'select-repo' | 'configure'

export default function NewProjectPage() {
  // FIX BUG-18: useNavigate from TanStack Router v1
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('select-repo')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<any>(null)
  const [branch, setBranch] = useState('')
  const [port, setPort] = useState('3000')
  const [buildCmd, setBuildCmd] = useState('')
  const [startCmd, setStartCmd] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const { data: repos = [], isLoading: reposLoading, error: reposError } = useQuery({
    queryKey: ['github-repos'],
    queryFn: () => authApi.githubRepos(),
    staleTime: 60_000,
    retry: 1,
  })

  const create = useMutation({
    mutationFn: () =>
      projectsApi.create({
        name: selected.name,
        githubFullName: selected.fullName,
        githubRepoId: selected.id,
        branch: branch || selected.defaultBranch,
        buildSettings: {
          port: parseInt(port) || 3000,
          buildCmd: buildCmd.trim() || undefined,
          startCmd: startCmd.trim() || undefined,
          rootDir: '/',
        },
      }),
    // FIX BUG-18: navigate with correct TanStack Router v1 API
    onSuccess: (project) => {
      navigate({ to: '/projects/$slug', params: { slug: project.slug } })
    },
  })

  const filtered = (repos as any[]).filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.fullName.toLowerCase().includes(search.toLowerCase())
  )

  // ── Step 1 ─────────────────────────────────────────────────
  if (step === 'select-repo') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white mb-6 transition-colors">
          <ArrowLeft size={14} /> Volver
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Nuevo proyecto</h1>
          <p className="text-sm text-slate-400">Selecciona un repositorio de GitHub</p>
        </div>

        {reposError && (
          <div className="mb-4 px-4 py-3 bg-amber-950/40 border border-amber-800/50 rounded-lg flex items-center gap-2 text-sm text-amber-300">
            <AlertTriangle size={14} className="shrink-0" />
            GitHub no conectado. <Link to="/settings" className="underline">Conecta tu cuenta →</Link>
          </div>
        )}

        <div className="relative mb-4">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar repositorio..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
          />
        </div>

        <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
          {reposLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-slate-900 border border-slate-800 rounded-lg animate-pulse" />
              ))
            : filtered.map((repo: any) => (
                <button
                  key={repo.id}
                  onClick={() => { setSelected(repo); setBranch(repo.defaultBranch); setStep('configure') }}
                  className="w-full flex items-center gap-3 p-3.5 bg-slate-900 border border-slate-800 rounded-lg hover:border-violet-600 hover:bg-slate-800/50 transition-all text-left group"
                >
                  <span className="text-xl shrink-0">
                    {LANG_ICON[repo.language] ?? '📦'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white truncate">{repo.name}</span>
                      {repo.private
                        ? <Lock size={10} className="text-slate-500 shrink-0" />
                        : <Globe size={10} className="text-slate-500 shrink-0" />
                      }
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                      <GitBranch size={10} />
                      <span>{repo.defaultBranch}</span>
                      {repo.language && <span>· {repo.language}</span>}
                      <span>· {formatDistanceToNow(new Date(repo.updatedAt), { addSuffix: true, locale: es })}</span>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-slate-600 group-hover:text-violet-400 transition-colors shrink-0" />
                </button>
              ))
          }
          {!reposLoading && filtered.length === 0 && (
            <p className="text-center text-sm text-slate-500 py-10">
              {repos.length === 0 ? 'No se encontraron repositorios' : 'Sin resultados para esa búsqueda'}
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── Step 2: Configure ──────────────────────────────────────
  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <button
        onClick={() => setStep('select-repo')}
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft size={14} /> Cambiar repo
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Configurar proyecto</h1>
        <p className="text-sm text-slate-400 font-mono">{selected?.fullName}</p>
      </div>

      {create.isError && (
        <div className="mb-4 px-4 py-3 bg-red-950/40 border border-red-800/50 rounded-lg flex items-start gap-2 text-sm text-red-300">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          {(create.error as any)?.message ?? 'Error al crear el proyecto'}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Branch</label>
          <div className="relative">
            <GitBranch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={branch}
              onChange={e => setBranch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Puerto de la aplicación</label>
          <input
            type="number"
            value={port}
            onChange={e => setPort(e.target.value)}
            min={1} max={65535}
            className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-violet-500"
          />
          <p className="mt-1 text-xs text-slate-500">Puerto en el que escucha tu aplicación</p>
        </div>

        {/* Advanced */}
        <div className="border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <span>Configuración avanzada (opcional)</span>
            <ChevronRight size={12} className={clsx('transition-transform', showAdvanced && 'rotate-90')} />
          </button>

          {showAdvanced && (
            <div className="px-4 pb-4 space-y-3 border-t border-slate-800">
              <div className="pt-3">
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Comando de build</label>
                <input
                  value={buildCmd}
                  onChange={e => setBuildCmd(e.target.value)}
                  placeholder="npm run build"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Comando de inicio</label>
                <input
                  value={startCmd}
                  onChange={e => setStartCmd(e.target.value)}
                  placeholder="node dist/index.js"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-1.5">
          {[
            'Framework detectado automáticamente (Node.js, Next.js, Python, HTML)',
            'SSL automático con Let\'s Encrypt via Traefik',
            `Deploy automático en cada push a "${branch}"`,
          ].map(f => (
            <p key={f} className="flex items-center gap-2 text-xs text-slate-400">
              <CheckCircle2 size={11} className="text-green-500 shrink-0" />
              {f}
            </p>
          ))}
        </div>

        <button
          onClick={() => create.mutate()}
          disabled={create.isPending || !branch.trim()}
          className={clsx(
            'w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all',
            'bg-violet-600 hover:bg-violet-500 text-white',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'shadow-lg shadow-violet-900/30'
          )}
        >
          {create.isPending
            ? <><Loader2 size={16} className="animate-spin" /> Creando proyecto...</>
            : <><CheckCircle2 size={16} /> Crear y desplegar</>
          }
        </button>
      </div>
    </div>
  )
}
