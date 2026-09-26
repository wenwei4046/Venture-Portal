import type { ReactNode } from 'react'
import { formatMoney } from '@/lib/utils'
import { COMMISSIONABLE_HINT, SALES_VALUE_HINT } from './NoCommission'
import s from './commission-workbench.module.css'

export interface CommissionMonthStats {
  /** Everything on the month's bills, transport and every other charge included. */
  salesValue: number
  /** The part of those bills that earns commission. */
  commissionableValue: number
  totalOrders: number
  unmatchedAgents: number
  linesWithoutCost: number
}

export default function CommissionMonthSummary({ stats, peopleCount, totalCommission, status }: {
  stats: CommissionMonthStats
  peopleCount: number
  totalCommission: number
  status: string
}) {
  const noCommission = Math.round((stats.salesValue - stats.commissionableValue) * 100) / 100
  return <section className={s.monthSummary} aria-label="Monthly commission summary">
    <div className={s.monthMetrics}>
      <Card label="Total sales value" value={formatMoney(stats.salesValue)} title={SALES_VALUE_HINT} icon={<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 12h.01M18 12h.01" /></>} />
      <Card label="Commissionable value" value={formatMoney(stats.commissionableValue)} title={COMMISSIONABLE_HINT}
        note={noCommission >= 0.005 ? `${formatMoney(noCommission)} no commission` : undefined}
        icon={<><path d="M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.7 5 3.2 5 1.4 5 3.3-2.2 3-5 3-5-1.1-5-3" /></>} />
      <Card label="Total orders" value={String(stats.totalOrders)} icon={<><path d="M5 3l2 1 2-1 3 1 3-1 2 1 2-1v18l-2-1-2 1-3-1-3 1-2-1-2 1Z" /><path d="M9 8h6M9 12h6M9 16h4" /></>} />
      <Card label="Salespeople" value={String(peopleCount)} icon={<><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2" /></>} />
      <Card label="Total commission" value={formatMoney(totalCommission)} className={s.commissionCard} note={status}
        icon={<><circle cx="12" cy="12" r="9" /><path d="m8 16 8-8" /><circle cx="8" cy="8" r="1" /><circle cx="16" cy="16" r="1" /></>} />
      <Card label="Lines without a cost" value={String(stats.linesWithoutCost)} className={stats.linesWithoutCost > 0 ? s.costCard : undefined}
        icon={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M12 12v4M12 19h.01" /></>} />
    </div>
    <p className={s.unmatchedSummary}>Unmatched agents <strong data-warning={stats.unmatchedAgents > 0}>{stats.unmatchedAgents}</strong></p>
  </section>
}

function Card({ label, value, icon, note, className, title }: {
  label: string
  value: string
  icon: ReactNode
  note?: string
  className?: string
  title?: string
}) {
  return <div className={`${s.monthCard}${className ? ` ${className}` : ''}`} role="group" aria-label={label} title={title}>
    <div className={s.monthCardLabel}>{label}</div>
    <div className={s.monthCardValue}>{value}</div>
    <div className={s.monthCardFoot}>
      {note && <span>{note}</span>}
      <span className={s.monthCardIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{icon}</svg></span>
    </div>
  </div>
}
