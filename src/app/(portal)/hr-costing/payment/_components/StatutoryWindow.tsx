'use client'

import Link from 'next/link'
import { formatMoneyBare } from '@/lib/utils'
import { BODIES, daysUntil, shortDate, type BodyKey, type DeptGroup, type Scheme, type StatutoryRow } from '@/lib/payment-cycle'
import PayWindow from './PayWindow'

interface Props {
  body: BodyKey
  /** Only this body's rows (PERKESO has two). */
  rows: StatutoryRow[]
  groups: DeptGroup[]
  periodLabel: string
  today: string
  dates: Partial<Record<Scheme, string>>
  onDate: (scheme: Scheme, v: string) => void
  onGenerate: (scheme: Scheme) => void
  onTopup: (scheme: Scheme) => void
  onSaveDate: (voucherId: string, date: string, key: string) => void
  busy: string | null
  error: string | null
  onClose: () => void
}

export function dueLabel(due: string, today: string, stage: string, paidDate?: string | null) {
  if (stage === 'paid') return { cls: '', text: `Paid ${shortDate(paidDate ?? due)}` }
  const n = daysUntil(due, new Date(today + 'T00:00:00Z'))
  if (n < 0) return { cls: 'late', text: `Overdue ${-n} day${n === -1 ? '' : 's'} · was due ${shortDate(due)}` }
  if (n === 0) return { cls: 'soon', text: `Due today · ${shortDate(due)}` }
  if (n <= 7) return { cls: 'soon', text: `Due ${shortDate(due)} · in ${n} day${n === 1 ? '' : 's'}` }
  return { cls: '', text: `Due ${shortDate(due)} · in ${n} days` }
}

function chip(stage: StatutoryRow['stage']) {
  if (stage === 'paid') return <span className="chip ledger"><span className="dot" />paid</span>
  if (stage === 'pending') return <span className="chip alert"><span className="dot" />awaiting Principal</span>
  return <span className="chip">not generated</span>
}

/**
 * One statutory body: its PV (PERKESO: two, SOCSO and EIS), the due date with
 * the body's own weekend rule, and the by-department breakdown that is read
 * from the payroll rows for reconciliation — it is not a separate PV (the
 * 16-PV split was voided on 20 Jul 2026).
 */
export default function StatutoryWindow({ body, rows, groups, periodLabel, today, dates, onDate, onGenerate, onTopup, onSaveDate, busy, error, onClose }: Props) {
  const def = BODIES.find((b) => b.key === body)!
  const staff = rows.reduce((s, r) => s + r.staff, 0)
  const dirs = rows.reduce((s, r) => s + r.directors, 0)
  const total = rows.reduce((s, r) => s + r.total, 0)
  const first = rows[0]
  const due = dueLabel(first.due, today, rows.every((r) => r.stage === 'paid') ? 'paid' : 'open', first.pv?.payment_date)

  return (
    <PayWindow
      eyebrow={`IV. STATUTORY · ${periodLabel.toUpperCase()}`}
      title={
        <>
          {def.name} <span>· {def.covers}</span>
        </>
      }
      onClose={onClose}
      footer={
        <span className="font-serif italic text-muted text-xs">
          Paid to {def.portal} from the Alliance payroll account; the HR custody pool is drained by the same amount. Public holidays are not in the due-date rule.
        </span>
      }
    >
      <div className="tiles">
        <div className="tile">
          <div className="l">Total</div>
          <div className="v">{formatMoneyBare(total)}</div>
        </div>
        <div className="tile">
          <div className="l">Staff · directors</div>
          <div className="v">
            {formatMoneyBare(staff)} <span className="text-graphite text-xs">· {formatMoneyBare(dirs)}</span>
          </div>
        </div>
        <div className="tile">
          <div className="l">Due</div>
          <div className={`v txt pay-due ${due.cls}`}>{due.text}</div>
        </div>
      </div>

      {error ? <div className="err">{error}</div> : null}

      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>PV</th>
              <th className="right">Staff</th>
              <th className="right">Directors</th>
              <th className="right">Total</th>
              <th>Payment date</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const date = dates[r.scheme] ?? r.pv?.payment_date ?? ''
              const paid = r.stage === 'paid'
              const pending = r.stage === 'pending'
              const offerTopup = r.pv != null && !r.directorsCovered && r.directors > 0
              return (
                <tr key={r.scheme}>
                  <td className="who">
                    <span className="nm">{r.payee}</span>
                    {r.pv ? (
                      <div>
                        <Link href={`/payments/${r.pv.id}`} className="pv text-accent hover:underline">
                          {r.pv.no ?? 'PV'}
                        </Link>
                        {r.topup ? (
                          <>
                            {' · '}
                            <Link href={`/payments/${r.topup.id}`} className="pv text-accent hover:underline">
                              {r.topup.no ?? 'top-up'}
                            </Link>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                  <td className="num text-graphite">{formatMoneyBare(r.staff)}</td>
                  <td className="num text-graphite">{formatMoneyBare(r.directors)}</td>
                  <td className="num">{formatMoneyBare(r.total)}</td>
                  <td>
                    {paid ? (
                      <span className="font-mono text-xs text-graphite">{r.pv?.payment_date ?? '—'}</span>
                    ) : (
                      <input type="date" className="pay-date" value={date} onChange={(e) => onDate(r.scheme, e.target.value)} disabled={busy != null} aria-label={`${r.payee} payment date`} />
                    )}
                  </td>
                  <td>{chip(r.stage)}</td>
                  <td className="text-right whitespace-nowrap">
                    {r.pv == null ? (
                      r.total > 0 ? (
                        <button
                          type="button"
                          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-xs px-3 py-1.5 rounded-md disabled:opacity-50"
                          onClick={() => onGenerate(r.scheme)}
                          disabled={busy != null}
                        >
                          {busy === `stat:${r.scheme}` ? 'Generating…' : 'Generate PV'}
                        </button>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )
                    ) : pending ? (
                      <button
                        type="button"
                        className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-xs px-3 py-1.5 rounded-md disabled:opacity-50"
                        onClick={() => onSaveDate(r.pv!.id, date, `date:${r.scheme}`)}
                        disabled={busy != null || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date === r.pv.payment_date}
                      >
                        {busy === `date:${r.scheme}` ? 'Saving…' : 'Save date'}
                      </button>
                    ) : null}
                    {offerTopup ? (
                      <div className="mt-1.5">
                        <button
                          type="button"
                          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-xs px-3 py-1.5 rounded-md disabled:opacity-50"
                          onClick={() => onTopup(r.scheme)}
                          disabled={busy != null}
                        >
                          {busy === `topup:${r.scheme}` ? 'Generating…' : 'Directors top-up'}
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div>
        <div className="page-eyebrow" style={{ marginBottom: 8 }}>
          BY DEPARTMENT · FOR RECONCILIATION
        </div>
        <div className="overflow-x-auto">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Department</th>
                {rows.map((r) => (
                  <th key={r.scheme} className="right">
                    {r.label}
                  </th>
                ))}
                {rows.length > 1 ? <th className="right">Total</th> : null}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const cells = rows.map((r) => r.byDepartment.find((b) => b.key === g.key)?.amount ?? 0)
                return (
                  <tr key={g.key}>
                    <td className="who">
                      <span className="nm">{g.name}</span>
                      <span className="cd">{g.people.length}</span>
                    </td>
                    {cells.map((c, i) => (
                      <td key={i} className="num text-graphite">
                        {formatMoneyBare(c)}
                      </td>
                    ))}
                    {rows.length > 1 ? <td className="num">{formatMoneyBare(cells.reduce((s, c) => s + c, 0))}</td> : null}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-hairline">
                <td className="font-serif italic text-accent">Total</td>
                {rows.map((r) => (
                  <td key={r.scheme} className="num font-semibold">
                    {formatMoneyBare(r.total)}
                  </td>
                ))}
                {rows.length > 1 ? <td className="num font-semibold">{formatMoneyBare(total)}</td> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </PayWindow>
  )
}
