// FIX BUG-17: useParams with correct TanStack Router v1 API
import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Globe, GitCommit, Clock, Activity, RefreshCw,
  ExternalLink, Terminal, BarChart3, Settings,
  Loader2, XCircle, RotateCcw, ArrowLeft, AlertTriangle,
} from 'lucide-react'
import { projectsApi, deploymentsApi } from '../lib/api'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import clsx from 'clsx'

const STATUS_COLORS: Record<string, string> = {
  QUEUED:    'text-yellow-400 bg-yellow-400/10 border-yellow-800/30',
  BUILDING:  'text-blue-400 bg-blue-400/10 border-blue-800/30',
  STARTING:  'text-blue-300 bg-blue-300/10 border-blue-800/30',
  PUSHING:   'text-blue-400 bg-blue-400/10 border-blue-800/30',
  RUNNING:   'text-green-400 bg-green-400/10 border-green-800/30',
  STOPPED:   'text-slate-400 bg-slate-400/10 border-slate-700',
  FAILED:    'text-red-400 bg-red-400/10 border-red-800/30',
  CANCELLED: 'text-slate-500 bg-slate-500/10 border-slate-700',
}

const ACTIVE_STATUSES = ['QUEUED', 'BUILDING', 'PUSHING', 'STARTING']

type Tab = 'deployments' | 'logs' | 'metrics' | 'settings'

export default function ProjectPage() {
  // FIX BUG-17: correct useParams hook for TanStack Router v1
  const { slug } = useParams({ from: '/projects/$slug' })
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('deployments')
  const [selectedDeployId, setSelectedDeployId] = useState<string | null>(null)
  const [metricsRange, setMetricsRange] = useState('1h')

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', slug],
    queryFn: () => projectsApi.get(slug),
    refetchInterval: (query) => {
      const d = query.state.data?.deployments?.[0]
      return d && ACTIVE_STATUSES.includes(d.status) ? 3000 : 15000
    },
  })

  const { data: deployments = [], isLoading: deploysLoading } = useQuery({
    queryKey: ['deployments', slug],
    queryFn: () => deploymentsApi.list(slug),
    refetchInterval: 5000,
    enabled: activeTab === 'deployments' || activeTab === 'logs',
  })

  const { data: logs } = useQuery({
    queryKey: ['logs', selectedDeployId],
    queryFn: () => deploymentsApi.getLogs(selectedDeployId!, 500),
    enabled: !!selectedDeployId && activeTab === 'logs',
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && ACTIVE_STATUSES.includes(status) ? 1500 : false
    },
  })

  const { data: metrics = [] } = useQuery({
    queryKey: ['metrics', slug, metricsRange],
    queryFn: () => projectsApi.metrics(slug, metricsRange),
    enabled: activeTab === 'metrics',
    refetchInterval: 60_000,
  })

  const triggerDeploy = useMutation({
    mutationFn: () => deploymentsApi.trigger(slug),
    onSuccess: (dep) => {
      qc.invalidateQueries({ queryKey: ['deployments', slug] })
      qc.invalidateQueries({ queryKey: ['project', slug] })
      setSelectedDeployId(dep.id)
      setActiveTab('logs')
    },
  })

  const rollback = useMutation({
    mutationFn: (id: string) => deploymentsApi.rollback(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployments', slug] })
    },
  })

  const cancelDeploy = useMutation({
    mutationFn: (id: string) => deploymentsApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deployments', slug] }),
  })

  // ── Error state ────────────────────────────────────────────
  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <AlertTriangle size={40} className="text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">Proyecto no encontrado</h2>
        <p className="text-sm text-slate-400 mb-6">
          {(error as any).message ?? 'No tienes acceso a este proyecto'}
        </p>
        <Link to="/" className="text-sm text-violet-400 hover:text-violet-300">
          ← Volver al dashboard
        </Link>
      </div>
    )
  }

  // ── Loading skeleton ───────────────────────────────────────
  if (isLoading || !project) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4 animate-pulse">
        <div className="h-4 bg-slate-800 rounded w-24" />
        <div className="h-8 bg-slate-800 rounded w-64" />
        <div className="h-10 bg-slate-900 border border-slate-800 rounded-xl" />
        <div className="h-64 bg-slate-900 border border-slate-800 rounded-xl" />
      </div>
    )
  }

  const lastDeploy = project.deployments?.[0]
  const isBuilding = lastDeploy && ACTIVE_STATUSES.includes(lastDeploy.status)

  const TABS = [
    { id: 'deployments' as Tab, label: 'Despliegues', icon: Activity },
    { id: 'logs' as Tab,        label: 'Logs',         icon: Terminal  },
    { id: 'metrics' as Tab,     label: 'Métricas',     icon: BarChart3 },
    { id: 'settings' as Tab,    label: 'Ajustes',      icon: Settings  },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Back */}
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft size={13} /> Proyectos
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{project.name}</h1>
            {lastDeploy && (
              <span className={clsx(
                'text-xs font-medium px-2 py-0.5 rounded-full border',
                STATUS_COLORS[lastDeploy.status] ?? 'text-slate-400 bg-slate-800 border-slate-700'
              )}>
                {isBuilding && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1.5 animate-pulse" />
                )}
                {lastDeploy.status}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-400 flex-wrap">
            <span className="font-mono text-xs">{project.githubFullName}</span>
            {lastDeploy?.endpoint && (
              <a
                href={lastDeploy.endpoint}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-violet-400 transition-colors"
              >
                <Globe size={12} />
                {lastDeploy.endpoint.replace('https://', '')}
                <ExternalLink size={10} />
              </a>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isBuilding && (
            <button
              onClick={() => lastDeploy && cancelDeploy.mutate(lastDeploy.id)}
              disabled={cancelDeploy.isPending}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 border border-slate-700 hover:border-red-700 hover:text-red-400 rounded-lg transition-all"
            >
              <XCircle size={13} /> Cancelar
            </button>
          )}
          <button
            onClick={() => triggerDeploy.mutate()}
            disabled={triggerDeploy.isPending || !!isBuilding}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              'bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-900/30',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            {triggerDeploy.isPending || isBuilding
              ? <><Loader2 size={14} className="animate-spin" /> Desplegando...</>
              : <><RefreshCw size={14} /> Re-deploy</>
            }
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800 mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all',
              activeTab === id
                ? 'border-violet-500 text-white'
                : 'border-transparent text-slate-400 hover:text-white hover:border-slate-600'
            )}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* ── Deployments ─────────────────────────────────────── */}
      {activeTab === 'deployments' && (
        <div className="space-y-2">
          {deploysLoading && (
            <div className="space-y-2">
              {[1,2,3].map(i => (
                <div key={i} className="h-20 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
              ))}
            </div>
          )}
          {!deploysLoading && deployments.length === 0 && (
            <div className="text-center py-16 text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
              Sin despliegues aún. Haz click en Re-deploy para comenzar.
            </div>
          )}
          {deployments.map((d: any) => (
            <div
              key={d.id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-all"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={clsx(
                    'text-xs font-medium px-2 py-0.5 rounded-full border shrink-0',
                    STATUS_COLORS[d.status] ?? 'text-slate-400 bg-slate-800 border-slate-700'
                  )}>
                    {ACTIVE_STATUSES.includes(d.status) && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1.5 animate-pulse" />
                    )}
                    {d.status}
                  </span>
                  {d.commitSha && (
                    <span className="flex items-center gap-1 text-xs text-slate-500 font-mono">
                      <GitCommit size={10} /> {d.commitSha.slice(0, 7)}
                    </span>
                  )}
                  {d.branch && (
                    <span className="text-xs text-slate-600 font-mono">{d.branch}</span>
                  )}
                </div>
                {d.commitMsg && (
                  <p className="text-sm text-slate-300 truncate">{d.commitMsg}</p>
                )}
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {formatDistanceToNow(new Date(d.createdAt), { addSuffix: true, locale: es })}
                  </span>
                  {d.buildDuration && <span>· {d.buildDuration}s</span>}
                  {d.endpoint && (
                    <a
                      href={d.endpoint}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-violet-400 transition-colors"
                    >
                      <Globe size={10} />
                      {d.endpoint.replace('https://', '')}
                    </a>
                  )}
                </div>
                {d.errorMessage && (
                  <div className="mt-2 px-2 py-1 bg-red-950/30 border border-red-900/30 rounded text-xs text-red-400 font-mono">
                    {d.errorMessage}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => { setSelectedDeployId(d.id); setActiveTab('logs') }}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-600 px-2.5 py-1.5 rounded-lg transition-all"
                >
                  <Terminal size={11} /> Logs
                </button>
                {d.status === 'RUNNING' && deployments[0]?.id !== d.id && (
                  <button
                    onClick={() => {
                      if (confirm(`¿Rollback a commit ${d.commitSha?.slice(0, 7)}?`)) {
                        rollback.mutate(d.id)
                      }
                    }}
                    disabled={rollback.isPending}
                    className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 border border-amber-800/40 hover:border-amber-700 px-2.5 py-1.5 rounded-lg transition-all"
                  >
                    <RotateCcw size={11} /> Rollback
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Logs ────────────────────────────────────────────── */}
      {activeTab === 'logs' && (
        <div className="space-y-3">
          {/* Deployment selector */}
          {deployments.length > 0 && (
            <select
              value={selectedDeployId ?? ''}
              onChange={e => setSelectedDeployId(e.target.value || null)}
              className="bg-slate-900 border border-slate-700 text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500"
            >
              <option value="">Selecciona un deploy...</option>
              {deployments.map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.commitSha?.slice(0, 7) ?? d.id.slice(0, 8)} — {d.status} — {
                    formatDistanceToNow(new Date(d.createdAt), { addSuffix: true, locale: es })
                  }
                </option>
              ))}
            </select>
          )}

          {selectedDeployId ? (
            <div className="bg-[#0d1117] border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900/50">
                <span className="text-xs font-mono text-slate-400">
                  {selectedDeployId.slice(0, 12)}...
                </span>
                {logs && (
                  <span className={clsx(
                    'text-xs px-2 py-0.5 rounded-full border',
                    STATUS_COLORS[logs.status] ?? 'text-slate-400 bg-slate-800 border-slate-700'
                  )}>
                    {ACTIVE_STATUSES.includes(logs.status) && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1.5 animate-pulse" />
                    )}
                    {logs.status}
                  </span>
                )}
              </div>
              <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-[520px] overflow-y-auto leading-[1.6] whitespace-pre-wrap break-all">
                {logs?.lines?.length
                  ? logs.lines.join('\n')
                  : <span className="text-slate-600 italic">Sin logs disponibles aún...</span>
                }
              </pre>
            </div>
          ) : (
            <div className="text-center text-slate-500 text-sm py-16 border border-dashed border-slate-800 rounded-xl">
              Selecciona un deploy para ver sus logs
            </div>
          )}
        </div>
      )}

      {/* ── Metrics ─────────────────────────────────────────── */}
      {activeTab === 'metrics' && (
        <div className="space-y-5">
          <div className="flex justify-end gap-2">
            {(['1h', '6h', '24h'] as const).map(r => (
              <button
                key={r}
                onClick={() => setMetricsRange(r)}
                className={clsx(
                  'px-3 py-1 text-xs rounded-lg transition-all font-medium',
                  metricsRange === r
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'
                )}
              >
                {r}
              </button>
            ))}
          </div>

          {metrics.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
              Sin datos de métricas. La app debe estar corriendo para registrar métricas.
            </div>
          ) : (
            <>
              {[
                { key: 'cpuPercent', label: 'CPU', unit: '%', color: '#8b5cf6', domain: [0, 100] as [number,number] },
                { key: 'ramMb',      label: 'RAM', unit: ' MB', color: '#22d3ee', domain: [0, 'auto'] as [number, string] },
              ].map(({ key, label, unit, color, domain }) => (
                <div key={key} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <h3 className="text-sm font-medium text-white mb-4">{label} {unit}</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={metrics}>
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={v => format(new Date(v), 'HH:mm')}
                        tick={{ fontSize: 10, fill: '#475569' }}
                        axisLine={false} tickLine={false}
                      />
                      <YAxis
                        domain={domain}
                        unit={unit}
                        width={42}
                        tick={{ fontSize: 10, fill: '#475569' }}
                        axisLine={false} tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
                        labelFormatter={v => format(new Date(v), 'HH:mm:ss')}
                        formatter={(v: number) => [`${v}${unit}`, label]}
                      />
                      <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Settings ─────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="space-y-4 max-w-lg">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Información del proyecto</h3>
            <dl className="space-y-2.5 text-sm">
              {[
                ['Slug', project.slug, true],
                ['Framework', project.framework, false],
                ['Límite RAM', `${project.memoryLimit} MB`, false],
                ['Límite CPU', `${project.cpuLimit} cores`, false],
                ['Creado', format(new Date(project.createdAt), "d MMM yyyy, HH:mm", { locale: es }), false],
              ].map(([label, value, mono]) => (
                <div key={label as string} className="flex justify-between gap-4">
                  <dt className="text-slate-400">{label as string}</dt>
                  <dd className={clsx('text-slate-300', mono && 'font-mono text-xs')}>{value as string}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-red-400 mb-1">Zona de peligro</h3>
            <p className="text-xs text-slate-500 mb-3">Esta acción no se puede deshacer.</p>
            <button
              onClick={async () => {
                if (!confirm(`¿Eliminar "${project.name}" y todos sus despliegues?`)) return
                await projectsApi.delete(slug)
                window.location.replace('/')
              }}
              className="flex items-center gap-1.5 text-xs font-medium text-red-400 hover:text-red-300 border border-red-800/40 hover:border-red-700 px-3 py-1.5 rounded-lg transition-all"
            >
              <XCircle size={12} /> Eliminar proyecto permanentemente
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
