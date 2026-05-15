// FIX BUG-19: Use centralized API client with auth refresh logic
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Activity, DollarSign, Search, ShieldOff, ShieldCheck, BarChart2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import clsx from 'clsx'
import { adminApi } from '../lib/api'

const PLAN_COLORS: Record<string, string> = {
  FREE: 'bg-slate-700 text-slate-300',
  STARTER: 'bg-blue-800 text-blue-200',
  PRO: 'bg-violet-800 text-violet-200',
  BUSINESS: 'bg-amber-800 text-amber-200',
}

export default function AdminPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: adminApi.stats,
    refetchInterval: 30_000,
  })

  const { data: usersData } = useQuery({
    queryKey: ['admin-users', page, search],
    queryFn: () => adminApi.users(page, search),
    placeholderData: prev => prev,
  })

  const { data: auditData } = useQuery({
    queryKey: ['admin-audit'],
    queryFn: adminApi.auditLogs,
  })

  const suspend = useMutation({
    mutationFn: adminApi.suspend,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const unsuspend = useMutation({
    mutationFn: adminApi.unsuspend,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ShieldCheck size={22} className="text-violet-400" />
          Panel de Administración
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">Vista interna del sistema</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Usuarios totales', value: stats.users.total, icon: Users, color: 'text-blue-400' },
            { label: 'Activos', value: stats.users.active, icon: Activity, color: 'text-green-400' },
            { label: 'Proyectos', value: stats.projects.total, icon: BarChart2, color: 'text-violet-400' },
            { label: 'Revenue total', value: `$${(stats.revenue.total ?? 0).toFixed(0)}`, icon: DollarSign, color: 'text-amber-400' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">{label}</span>
                <Icon size={14} className={color} />
              </div>
              <p className="text-2xl font-bold text-white">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Usuarios</h2>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Buscar..."
                className="pl-7 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500 w-44"
              />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    {['Usuario', 'Plan', 'Proyectos', 'Estado', 'Acción'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {(usersData?.users ?? []).map((u: any) => (
                    <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-xs font-medium text-white truncate max-w-[140px]">{u.name ?? '—'}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[140px]">{u.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded', PLAN_COLORS[u.plan])}>
                          {u.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{u._count?.projects ?? 0}</td>
                      <td className="px-4 py-3">
                        {u.suspended
                          ? <span className="text-xs text-red-400 flex items-center gap-1"><ShieldOff size={10} /> Suspendido</span>
                          : <span className="text-xs text-green-400">Activo</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right">
                        {u.suspended ? (
                          <button
                            onClick={() => unsuspend.mutate(u.id)}
                            disabled={unsuspend.isPending}
                            className="text-xs text-green-400 hover:text-green-300 transition-colors"
                          >
                            Restaurar
                          </button>
                        ) : (
                          <button
                            onClick={() => { if (confirm(`¿Suspender a ${u.email}?`)) suspend.mutate(u.id) }}
                            disabled={suspend.isPending}
                            className="text-xs text-red-400 hover:text-red-300 transition-colors"
                          >
                            Suspender
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {usersData && usersData.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
                <span className="text-xs text-slate-500">{usersData.total} usuarios</span>
                <div className="flex gap-1">
                  {Array.from({ length: usersData.pages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={clsx('w-6 h-6 text-xs rounded transition-all', page === p ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-slate-800')}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-white mb-4">Audit Log</h2>
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-h-[480px] overflow-y-auto">
            {(auditData?.logs ?? []).map((log: any) => (
              <div key={log.id} className="flex items-start gap-3 px-4 py-3 border-b border-slate-800/50 last:border-0">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-500 mt-1.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-mono text-slate-300 truncate">{log.action}</p>
                  <p className="text-xs text-slate-500">{log.user?.email ?? 'sistema'}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: es })}
                  </p>
                </div>
              </div>
            ))}
            {!(auditData?.logs?.length) && (
              <p className="text-xs text-slate-500 text-center py-8">Sin logs aún</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
