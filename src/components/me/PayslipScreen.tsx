'use client'

import { dayMon, monthName } from '@/lib/attendance/engine'
import { rm } from '@/lib/me/format'
import { openMonth, slipYears } from '@/lib/me/pay'
import type { MePayslip } from '@/lib/me/types'
import { NUM, Title } from './kit'

/** Me › Payslip (2026-10-17, the handoff's list layout): the month still open, then each paid month by year. */
export function PayslipScreen({ payslips, error, workDay, openSlip }: {
  payslips: MePayslip[] | null
  error: string | null
  workDay: string
  openSlip: (p: MePayslip) => void
}) {
  const years = slipYears(payslips ?? [])
  const open = payslips ? openMonth(payslips, workDay) : null
  const thisYear = workDay.slice(0, 4)
  if (!years.some(y => y.year === thisYear)) years.unshift({ year: thisYear, slips: [] })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <Title title="Payslip" sub="Paid on the last working day" />
      {years.map(y => (
        <div key={y.year} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)' }}>
            <span>{y.year}</span><span>Net pay</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--ds-ink)' }}>
            {y.year === thisYear && open ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0', borderBottom: '1px solid var(--ds-border)', color: 'var(--ds-ink-3)' }}>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{open.name}</span>
                  <span style={{ fontSize: 12 }}>{open.line}</span>
                </span>
                <span style={{ ...NUM, fontSize: 15 }}>—</span><span style={{ width: 12 }} />
              </div>
            ) : null}
            {y.slips.map(p => (
              <button key={p.month} type="button" className="me-hover" onClick={() => openSlip(p)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0', border: 0, borderBottom: '1px solid var(--ds-border)', background: 'none',
                textAlign: 'left', fontFamily: 'inherit', color: 'var(--ds-ink)', cursor: 'pointer',
              }}>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{monthName(p.month)}</span>
                  <span style={{ fontSize: 12, color: 'var(--ds-ink-2)' }}>{p.paidOn ? `Paid ${dayMon(p.paidOn)}` : 'Paid'}</span>
                </span>
                <span style={{ ...NUM, fontSize: 15 }}>{rm(p.net)}</span>
                <span style={{ width: 12, color: 'var(--ds-ink-3)', fontSize: 16 }}>›</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {error ? <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ds-danger)' }}>{error}</p> : null}
      {payslips === null && !error ? <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ds-ink-3)' }}>Reading your payslips…</p> : null}
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--ds-ink-2)' }}>Tap a month for the full payslip and PDF.</p>
    </div>
  )
}
