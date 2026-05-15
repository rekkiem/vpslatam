import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Plus, GitBranch, Globe, Activity, Clock,
  CheckCircle2, XCircle, Loader2, Pause, AlertCircle
} from 'lucide-react'
import { projectsApi, deploymentsApi } from '../lib/api'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { useAuthStore } from '../store/auth'
import clsx from 'clsx'

const STATUS_CONFIG = {
  QUEUED:    { label: 'En cola',      color: 'text-yellow-400', dot: 'bg-yellow-400',  icon: Clock        },
  BUILDING:  { label: 'Compilando',   color: 'text-blue-400',   dot: 'bg-blue-400 animate-pulse', icon: Loader2 },
  PUSHING:   { label: 'Subiendo',     color: 'text-blue-400',   dot: 'bg-blue-400 animate-pulse', icon: Loader2 },
  STARTING:  { label: 'Iniciando',    color: 'text-blue-300',   dot: 'bg-blue-300 animate-pulse', icon: Loader2 },
  RUNNING:   { label: 'Activo',       color: 'text-green-400',  dot: 'bg-green-400',  icon: CheckCircle2 },
  STOPPED:   { label: 'Detenido',     color: 'text-slate-400',  dot: 'bg-slate-400',  icon: Pause        },
  FAILED:    { label: 'Fallido',      color: 'text-red-400',    dot: 'bg-red-400',    icon: XCircle      },
  CANCELLED: { label: 'Cancelado',    color: 'text-slate-500',  dot: 'bg-slate-500',  icon: XCircle      },
  INACTIVE:  { label: 'Sin deploy',   color: 'text-slate-500',  dot: 'bg-slate-600',  icon: AlertCircle  },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.INACTIVE
  const Icon = cfg.icon
  return (
    <span className={clsx('flex items-center gap-1.5 text-xs font-medium', cfg.color)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
      <Icon size={12} className={status === 'BUILDING' || status === 'STARTING' ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  )
}

function ProjectCard({ project }: { project: any }) {
  const qc = useQueryClient()
  const lastDeploy = project.deployments?.[0]
  const status = lastDeploy?.status ?? 'INACTIVE'

  const deploy = useMutation({
    mutationFn: () => deploymentsApi.trigger(project.slug),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  return (
    <div className="group relative bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all duration-200 hover:shadow-lg hover:shadow-black/20">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shrink-0 text-white text-xs font-bold">
            {project.name[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <Link
              to="/projects/$slug"
              params={{ slug: project.slug }}
              className="text-sm font-semibold text-white hover:text-violet-400 transition-colors truncate block"
            >
              {project.name}
            </Link>
            <span className="text-xs text-slate-500 truncate block">{project.githubFullName}</span>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 mb-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <GitBranch size={11} />
          {project.defaultBranch}
        </span>
        {lastDeploy?.endpoint && (
          <a
            href={lastDeploy.endpoint}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-violet-400 transition-colors truncate max-w-[160px]"
          >
            <Globe size={11} />
            {lastDeploy.endpoint.replace('https://', '')}
          </a>
        )}
        {lastDeploy?.createdAt && (
          <span className="flex items-center gap-1 ml-auto shrink-0">
            <Clock size={11} />
            {formatDistanceToNow(new Date(lastDeploy.createdAt), { addSuffix: true, locale: es })}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => deploy.mutate()}
          disabled={deploy.isPending || ['QUEUED', 'BUILDING', 'STARTING'].includes(status)}
          className={clsx(
            'flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 px-3 rounded-lg transition-all',
            'bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed'
          )}
        >
          {deploy.isPending ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />}
          Deploy
        </button>
        <Link
          to="/projects/$slug"
          params={{ slug: project.slug }}
          className="flex items-center justify-center px-3 py-1.5 text-xs font-medium text-slate-400 border border-slate-700 rounded-lg hover:bg-slate-800 hover:text-white transition-all"
        >
          Ver
        </Link>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
    refetchInterval: 5000,
  })

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Proyectos</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {projects.length} proyecto{projects.length !== 1 ? 's' : ''} activo{projects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          to="/projects/new"
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          Nuevo proyecto
        </Link>
      </div>

      {/* Plan banner for FREE */}
      {user?.plan === 'FREE' && (
        <div className="mb-6 flex items-center justify-between bg-gradient-to-r from-violet-950 to-indigo-950 border border-violet-800/50 rounded-xl px-5 py-4">
          <div>
            <p className="text-sm font-medium text-white">Plan gratuito — 1 proyecto, 512 MB RAM</p>
            <p className="text-xs text-violet-300 mt-0.5">Actualiza para más proyectos y recursos</p>
          </div>
          <Link
            to="/billing"
            className="text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg transition-colors shrink-0"
          >
            Actualizar plan
          </Link>
        </div>
      )}

      {/* Projects grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse">
              <div className="flex gap-2 mb-4">
                <div className="w-8 h-8 bg-slate-800 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-slate-800 rounded w-2/3" />
                  <div className="h-2 bg-slate-800 rounded w-1/2" />
                </div>
              </div>
              <div className="h-2 bg-slate-800 rounded w-full mb-4" />
              <div className="h-8 bg-slate-800 rounded-lg" />
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-800 rounded-2xl">
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Activity size={28} className="text-slate-600" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Sin proyectos aún</h3>
          <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto">
            Conecta tu repositorio de GitHub y despliega en segundos.
          </p>
          <Link
            to="/projects/new"
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            <Plus size={16} /> Crear primer proyecto
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}
    </div>
  )
}
