import { useQuery, useMutation } from '@tanstack/react-query'
import { billingApi } from '../lib/api'
import { Check, Loader2, ExternalLink, CreditCard, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useAuthStore } from '../store/auth'
import clsx from 'clsx'

const PLAN_GRADIENT: Record<string, string> = {
  FREE:     'from-slate-800 to-slate-900',
  STARTER:  'from-blue-900/40 to-slate-900',
  PRO:      'from-violet-900/40 to-slate-900',
  BUSINESS: 'from-amber-900/30 to-slate-900',
}

const PLAN_BORDER: Record<string, string> = {
  FREE:     'border-slate-700',
  STARTER:  'border-blue-700/50',
  PRO:      'border-violet-600/60',
  BUSINESS: 'border-amber-600/50',
}

const PLAN_BADGE: Record<string, string> = {
  FREE:     'bg-slate-700 text-slate-200',
  STARTER:  'bg-blue-700 text-blue-100',
  PRO:      'bg-violet-600 text-white',
  BUSINESS: 'bg-amber-600 text-white',
}

export default function BillingPage() {
  const { user } = useAuthStore()
  const { data: plans = [] } = useQuery({ queryKey: ['plans'], queryFn: billingApi.plans })
  const { data: subData } = useQuery({ queryKey: ['subscription'], queryFn: billingApi.subscription })
  const { data: invoices = [] } = useQuery({ queryKey: ['invoices'], queryFn: billingApi.invoices })

  const checkout = useMutation({
    mutationFn: (plan: string) => billingApi.checkout(plan),
    onSuccess: (data) => { window.location.href = data.url },
  })

  const portal = useMutation({
    mutationFn: billingApi.portal,
    onSuccess: (data) => { window.location.href = data.url },
  })

  const currentPlan = user?.plan ?? 'FREE'

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <p className="text-sm text-slate-400 mt-0.5">Gestiona tu plan y método de pago</p>
      </div>

      {/* Current subscription */}
      {subData?.subscription && (
        <div className="mb-8 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">Plan actual</p>
              <div className="flex items-center gap-2">
                <span className={clsx('text-sm font-bold px-2 py-0.5 rounded', PLAN_BADGE[currentPlan])}>
                  {currentPlan}
                </span>
                {subData.subscription.status === 'ACTIVE' && (
                  <span className="text-xs text-green-400">Activo</span>
                )}
              </div>
              {subData.subscription.currentPeriodEnd && (
                <p className="text-xs text-slate-500 mt-1">
                  Renueva el {format(new Date(subData.subscription.currentPeriodEnd), "d 'de' MMMM yyyy", { locale: es })}
                </p>
              )}
            </div>
            <button
              onClick={() => portal.mutate()}
              disabled={portal.isPending}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-300 border border-slate-700 hover:border-slate-500 px-3 py-2 rounded-lg transition-all"
            >
              {portal.isPending ? <Loader2 size={12} className="animate-spin" /> : <CreditCard size={12} />}
              Gestionar suscripción
            </button>
          </div>
        </div>
      )}

      {/* Plans grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {plans.map((plan: any) => {
          const isCurrent = plan.id === currentPlan
          const isUpgrade = ['FREE','STARTER','PRO','BUSINESS'].indexOf(plan.id) >
                            ['FREE','STARTER','PRO','BUSINESS'].indexOf(currentPlan)

          return (
            <div
              key={plan.id}
              className={clsx(
                'relative bg-gradient-to-b rounded-xl border p-5 flex flex-col',
                PLAN_GRADIENT[plan.id],
                PLAN_BORDER[plan.id],
                isCurrent && 'ring-2 ring-violet-500/30'
              )}
            >
              {isCurrent && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                  <span className="text-[10px] font-bold bg-violet-600 text-white px-2 py-0.5 rounded-full">
                    Plan actual
                  </span>
                </div>
              )}

              <div className="mb-4">
                <p className="text-sm font-semibold text-white">{plan.label}</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold text-white">
                    {plan.price === 0 ? 'Gratis' : `$${plan.price}`}
                  </span>
                  {plan.price > 0 && <span className="text-xs text-slate-400">/mes</span>}
                </div>
              </div>

              <ul className="flex-1 space-y-2 mb-5">
                {plan.features.map((f: string) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-slate-300">
                    <Check size={12} className="text-green-400 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {plan.id !== 'FREE' && !isCurrent && (
                <button
                  onClick={() => checkout.mutate(plan.id)}
                  disabled={checkout.isPending || !isUpgrade}
                  className={clsx(
                    'w-full py-2 rounded-lg text-xs font-semibold transition-all',
                    isUpgrade
                      ? 'bg-violet-600 hover:bg-violet-500 text-white'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  )}
                >
                  {checkout.isPending && checkout.variables === plan.id
                    ? <Loader2 size={12} className="animate-spin mx-auto" />
                    : isUpgrade ? 'Actualizar' : 'Downgrade'
                  }
                </button>
              )}
              {isCurrent && (
                <div className="w-full py-2 text-center text-xs text-slate-500">Plan actual</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Invoices */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <FileText size={16} className="text-slate-400" />
          Facturas
        </h2>

        {invoices.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-800 rounded-xl">
            Sin facturas aún — aparecerán aquí tras tu primer cobro
          </p>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Monto</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {invoices.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-slate-300">
                      {format(new Date(inv.createdAt), "d MMM yyyy", { locale: es })}
                    </td>
                    <td className="px-4 py-3 text-white font-medium">
                      ${(inv.amount / 100).toFixed(2)} {inv.currency.toUpperCase()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', {
                        'bg-green-900/50 text-green-400': inv.status === 'PAID',
                        'bg-yellow-900/50 text-yellow-400': inv.status === 'OPEN',
                        'bg-slate-800 text-slate-400': inv.status === 'DRAFT',
                        'bg-red-900/50 text-red-400': inv.status === 'VOID',
                      })}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {inv.pdfUrl && (
                        <a
                          href={inv.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                        >
                          <ExternalLink size={11} /> PDF
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
