'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { formatMoneyBare } from '@/lib/utils'
import { BODIES, duePill, shortDate, shortDateTime, type BodyKey, type Scheme, type StatutoryRow } from '@/lib/payment-cycle'

interface Props {
  rows: StatutoryRow[]
  today: string
  dates: Partial<Record<Scheme, string>>
  onDateAll: (v: string) => void
  busy: string | null
  staffFunded: boolean
  pendingStat: number
  onAskAll: () => void
  confirming: boolean
  confirmAll: ReactNode
  onGenerate: (schemes: Scheme[], key: string) => void
  onOpen: (body: BodyKey) => void
}

/**
 * Swingvy's statutory rows: one row per body, ADP's due pill, a sentence
 * that says where its PV is, and two buttons — the human-readable breakdown
 * (by department, for i-Akaun / ASSIST / e-PCB) and the machine-facing act
 * (Generate PV, or the PV itself). PERKESO is one body with two PVs.
 */
export default function StatutoryRows({ rows, today, dates, onDateAll, busy, staffFunded, pendingStat, onAskAll, confirming, confirmAll, onGenerate, onOpen }: Props) {
  return (
    <div className="pay-list">
      <div className="lh">
        <label className="f">
          <span className="l">Payment date</span>
          <input type="date" className="pay-date" value={dates.KWSP ?? ''} onChange={(e) => onDateAll(e.target.value)} disabled={busy != null} aria-label="Payment date for all statutory PVs" />
          <span className="font-serif italic text-muted text-xs">blank = decide later, editable until approved</span>
        </label>
        <span className="spacer" />
        {pendingStat > 0 ? (
          <button type="button" className="pay-btn pri" onClick={onAskAll} disabled={busy != null || !staffFunded || confirming} title={!staffFunded ? 'Funding is not complete yet' : undefined}>
            Generate all 4 bodies · {pendingStat} PV{pendingStat === 1 ? '' : 's'}
          </button>
        ) : null}
      </div>
      {confirming ? <div style={{ padding: '10px 18px 0' }}>{confirmAll}</div> : null}
      <div className="lt">
        <span>4 bodies · 5 PVs · due the 15th of next month</span>
        <span>KWSP rolls a weekend forward · PERKESO and LHDN roll it back</span>
      </div>

      {BODIES.map((b) => {
        const brows = rows.filter((r) => r.body === b.key)
        const total = brows.reduce((s, r) => s + r.total, 0)
        const staff = brows.reduce((s, r) => s + r.staff, 0)
        const dirs = brows.reduce((s, r) => s + r.directors, 0)
        const allPaid = brows.every((r) => r.stage === 'paid')
        const anyGen = brows.some((r) => r.pv != null)
        const todo = brows.filter((r) => r.pv == null && r.total > 0)
        const paidDate = allPaid ? (brows.map((r) => r.pv?.payment_date).find(Boolean) ?? brows[0].due) : null
        const pill = duePill(brows[0].due, today, paidDate)
        const pvNos = brows.filter((r) => r.pv).map((r) => r.pv!.no ?? 'PV').join(' · ')
        const since = brows.map((r) => r.pv?.created_at).filter(Boolean).sort()[0]
        const sentence = allPaid
          ? `Paid · ${pvNos}`
          : anyGen
            ? `${todo.length ? `${brows.length - todo.length} of ${brows.length} generated · ` : ''}awaiting Principal since ${shortDateTime(since)}`
            : total > 0
              ? `Not generated · staff ${formatMoneyBare(staff)} + directors ${formatMoneyBare(dirs)}`
              : 'Nothing to pay this month'
        const tone = allPaid ? 'ledger' : anyGen ? 'alert' : total > 0 ? (staffFunded ? 'accent' : 'muted') : 'muted'
        return (
          <div key={b.key} className="pay-row stat">
            <div className="who">
              <div className="nm">{b.name}</div>
              <div className="sub">
                <span>{b.covers}</span>
                <span>· {b.portal}</span>
              </div>
            </div>
            <div className="tl">
              <div className={`s ${tone}`}>
                <span className={`pay-pill ${pill.tone}`}>
                  <span className="dot" />
                  {pill.text}
                </span>
                <span className="txt">{sentence}</span>
              </div>
              {brows.length > 1 ? (
                <div className="schemes">
                  {brows.map((r) => (
                    <span key={r.scheme}>
                      {r.label} · RM {formatMoneyBare(r.total)} ·{' '}
                      {r.pv ? (
                        <Link href={`/payments/${r.pv.id}`}>
                          {r.pv.no ?? 'PV'} · {r.stage === 'paid' ? `paid ${shortDate(r.pv.payment_date)}` : 'awaiting Principal'}
                        </Link>
                      ) : (
                        'not generated'
                      )}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="amt">
              <div className="v">{formatMoneyBare(total)}</div>
              <div className="p">{brows.length === 1 ? '1 PV' : `${brows.length} PVs`} · {b.schemes.join(' + ')}</div>
            </div>
            <div className="act">
              <div className="row2">
                <button type="button" className="pay-btn sec" onClick={() => onOpen(b.key)}>
                  By department
                </button>
                {todo.length > 0 ? (
                  <button
                    type="button"
                    className="pay-btn pri"
                    onClick={() =>
                      onGenerate(
                        todo.map((r) => r.scheme),
                        `stat:${b.key}`,
                      )
                    }
                    disabled={busy != null || !staffFunded}
                    title={!staffFunded ? 'Funding is not complete yet' : undefined}
                  >
                    {busy === `stat:${b.key}` ? 'Generating…' : todo.length === 1 ? 'Generate PV' : `Generate ${todo.length} PVs`}
                  </button>
                ) : brows.length === 1 && brows[0].pv ? (
                  <Link href={`/payments/${brows[0].pv.id}`} className="pay-btn sec">
                    View PV
                  </Link>
                ) : anyGen ? (
                  <button type="button" className="pay-btn sec" onClick={() => onOpen(b.key)}>
                    2 PVs
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
