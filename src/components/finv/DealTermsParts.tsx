'use client'

import type { ReactNode } from 'react'
import { Field, Input } from './Dialog'
import df from './dealform.module.css'
import { REPAYMENT_CHOICES, money, type PreviewRow, type RepaymentChoice, type Words } from '@/lib/repayment-type'
import { formatMoneyBare } from '@/lib/utils'

// The parts Record fund in and Create fund out draw on a desktop (2026-10-27, the user's mockup
// fund-forms-desktop-mockup.html — "照这个样稿做"): a numbered card per part, the Repayment type's three cards (none
// chosen at first, the chosen one's box opening under it), and beside them the summary with the schedule.

/** One part of the form: its number, its title, a line under it. */
export function DealPart({ no, title, note, tag, children }: { no: number; title: string; note?: string; tag?: string; children: ReactNode }) {
  return (
    <section className={df.part}>
      <div className={df.head}>
        <span className={df.no} aria-hidden="true">
          {no}
        </span>
        <div>
          <div className={df.title}>
            {title}
            {tag ? <span className={df.tag}>{tag}</span> : null}
          </div>
          {note ? <div className={df.note}>{note}</div> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

/** Words with their bold parts, as lib/repayment-type writes them. */
function WordsOf({ words }: { words: Words }) {
  return (
    <>
      {words.map((w, i) => (typeof w === 'string' ? <span key={i}>{w}</span> : <b key={i}>{w.b}</b>))}
    </>
  )
}

/**
 * Repayment type on a new deal: a choice is needed — the boxes of the one chosen open under it (the user, 2026-10-27:
 * "我希望是我选了repayment type 才跳出来给我填这些资料").
 */
export function DealRepaymentType(props: {
  choice: RepaymentChoice | null
  onChoice: (c: RepaymentChoice) => void
  amount: string
  onAmount: (v: string) => void
  months: string
  onMonths: (v: string) => void
  /** What the chosen box works out to — or what it still waits for. */
  worked: { words: Words; late: string | null } | { wait: string } | null
  /** The fields' ids, one form to a page. */
  idPrefix: string
}) {
  const { choice, worked, idPrefix } = props
  return (
    <>
      <div className={df.typeLabel}>
        Repayment type <span className={df.tag}>New</span>
      </div>
      <div role="radiogroup" aria-label="Repayment type" data-testid="repayment-type">
        {REPAYMENT_CHOICES.map((c) => {
          const on = choice === c.value
          return (
            <div key={c.value} className={df.type} data-on={on ? 'true' : undefined}>
              <label className={df.typeHead}>
                <input type="radio" name={`${idPrefix}-repayment`} value={c.value} checked={on} onChange={() => props.onChoice(c.value)} />
                <span>
                  {c.label}
                  <span className={df.typeNote}>{c.note}</span>
                </span>
              </label>
              {on ? (
                <div className={df.typeBody}>
                  {c.value === 'none' ? (
                    <div className={df.worked}>No principal falls due each month — repay any amount, any time. Interest is charged on the full amount every month.</div>
                  ) : (
                    <>
                      <Field label={c.value === 'amount' ? 'Principal a month (RM)' : 'Number of months'} htmlFor={c.value === 'amount' ? `${idPrefix}-per-month` : `${idPrefix}-repay-months`}>
                        {c.value === 'amount' ? (
                          <Input
                            id={`${idPrefix}-per-month`}
                            mono
                            className={df.narrow}
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="e.g. 1,000.00"
                            value={props.amount}
                            onChange={(e) => props.onAmount(e.target.value)}
                            onBlur={() => {
                              const n = Number(props.amount.replace(/[,\s]/g, ''))
                              if (props.amount.trim() && n > 0) props.onAmount(money(Math.round(n * 100) / 100))
                            }}
                          />
                        ) : (
                          <Input
                            id={`${idPrefix}-repay-months`}
                            mono
                            className={df.narrow}
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="e.g. 12"
                            value={props.months}
                            onChange={(e) => props.onMonths(e.target.value)}
                          />
                        )}
                      </Field>
                      {worked ? (
                        'wait' in worked ? (
                          <p className={df.worked} data-wait="true" data-testid="repayment-worked">
                            {worked.wait}
                          </p>
                        ) : (
                          <p className={df.worked} data-testid="repayment-worked">
                            <WordsOf words={worked.words} />
                          </p>
                        )
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      {choice ? null : <p className={df.pick}>Choose one and what to fill in opens under it.</p>}
    </>
  )
}

/** A line of the summary: its name and what it is (`mono` for figures, `todo` while it is still to be filled). */
export interface SummaryLine {
  key: string
  value: string
  mono?: boolean
  todo?: boolean
}

/** Beside the parts: what the deal adds up to, the schedule its terms make, and the line under them. */
export function DealSummary({ lines, schedule, foot }: { lines: SummaryLine[]; schedule: { rows: PreviewRow[]; foot: string; empty: string | null }; foot: string }) {
  const cell = (n: number | null) => (n == null ? '—' : formatMoneyBare(n))
  return (
    <aside className={df.side}>
      <div className={df.sum} data-testid="deal-summary">
        <div className={df.sumHead}>Summary</div>
        {lines.map((l) => (
          <div key={l.key} className={df.sumRow}>
            <span className={df.sumKey}>{l.key}</span>
            <span className={`${df.sumVal} ${l.todo ? df.todo : ''}`} data-mono={l.mono ? 'true' : undefined}>
              {l.value}
            </span>
          </div>
        ))}
        <div className={df.sched}>
          <div className={df.sumHead}>Schedule</div>
          {schedule.empty ? (
            <p className={df.empty}>{schedule.empty}</p>
          ) : (
            <>
              <table className={df.table}>
                <thead>
                  <tr>
                    <th>Months</th>
                    <th>Principal</th>
                    <th>Interest</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.rows.map((r) => (
                    <tr key={r.months} data-last={r.last ? 'true' : undefined}>
                      <td>{r.months}</td>
                      <td>{cell(r.principal)}</td>
                      <td>{cell(r.interest)}</td>
                      <td>{cell(r.due)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={df.schedNote}>{schedule.foot}</div>
            </>
          )}
        </div>
        <div className={df.sumFoot}>{foot}</div>
      </div>
    </aside>
  )
}
