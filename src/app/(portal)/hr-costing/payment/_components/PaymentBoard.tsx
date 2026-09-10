'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatMoneyBare } from '@/lib/utils'
import {
  BODIES,
  bankIssue,
  delta,
  isNotableMove,
  shortDate,
  shortDateTime,
  varianceLabel,
  type BodyKey,
  type CycleTotals,
  type DeptGroup,
  type Granularity,
  type Phase,
  type Scheme,
  type StatutoryRow,
} from '@/lib/payment-cycle'
import {
  createPayrollDisbursement,
  generateStatutoryDirectorTopup,
  generateStatutoryScheme,
  setPayrollPvDate,
} from '../actions'
import DeptWindow from './DeptWindow'
import StatutoryWindow, { dueLabel } from './StatutoryWindow'

export interface BoardProps {
  period: string
  periodLabel: string
  prevMonthName: string
  groups: DeptGroup[]
  rows: StatutoryRow[]
  totals: CycleTotals
  phase: Phase
  staffFunded: boolean
  directorsFunded: boolean
  payoutBank: { name: string; last4: string } | null
  /** ISO date, computed on the server so the due-day maths cannot drift at hydration. */
  today: string
  defaultDate: string
}

type Win = { kind: 'dept'; key: string } | { kind: 'body'; key: BodyKey } | null
type Confirm = { kind: 'all-salary' } | { kind: 'dept'; key: string } | null

function stageChip(g: DeptGroup) {
  if (g.stage === 'paid') return <span className="chip ledger"><span className="dot" />paid · {shortDate(g.vouchers[0]?.payment_date)}</span>
  if (g.stage === 'approved') return <span className="chip ledger"><span className="dot" />approved</span>
  if (g.stage === 'pending') return <span className="chip alert"><span className="dot" />{g.pending} awaiting Principal</span>
  if (g.stage === 'partial') return <span className="chip alert"><span className="dot" />{g.generated} of {g.headcount} generated</span>
  return <span className="chip">not generated</span>
}

/**
 * Proposal B (user 2026-09-10): one card per department, a window for the
 * people, four statutory bodies. Every judgement about the data is made in
 * lib/payment-cycle.ts; this component only holds the UI state (which window
 * is open, the granularity switch, the dates) and calls the actions.
 */
export default function PaymentBoard({
  period,
  periodLabel,
  prevMonthName,
  groups,
  rows,
  totals,
  phase,
  staffFunded,
  directorsFunded,
  payoutBank,
  today,
  defaultDate,
}: BoardProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [gran, setGran] = useState<Granularity>('department')
  const [dates, setDates] = useState<{ staff: string; directors: string; stat: Partial<Record<Scheme, string>> }>({
    staff: defaultDate,
    directors: defaultDate,
    stat: {},
  })
  const [win, setWin] = useState<Win>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function run(key: string, fn: () => Promise<unknown>) {
    setError(null)
    setBusy(key)
    startTransition(async () => {
      try {
        await fn()
        setConfirm(null)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed')
      } finally {
        setBusy(null)
      }
    })
  }

  const fundedFor = (g: DeptGroup) => (g.scope === 'directors' ? directorsFunded : staffFunded)
  const remainingOf = (g: DeptGroup) => g.headcount - g.generated

  function generateGroup(g: DeptGroup) {
    if (g.scope === 'staff' && !g.dept_id) throw new Error(`${g.name} has no department — assign one on the People page first`)
    const granularity: Granularity = g.stage === 'partial' ? 'employee' : gran
    const date = g.scope === 'directors' ? dates.directors : dates.staff
    return createPayrollDisbursement(period, g.scope, date, granularity, g.scope === 'staff' ? g.dept_id : null)
  }

  // Everything still owed this month. Nobody generated yet → ONE call per
  // scope (one approval group for all staff); otherwise the leftover
  // departments one by one. Sequential on purpose: voucher numbering derives
  // from a row count.
  async function generateAllSalary() {
    const todo = groups.filter((g) => g.headcount > 0 && remainingOf(g) > 0 && fundedFor(g))
    if (todo.length === 0) return
    const failures: string[] = []
    const staffTodo = todo.filter((g) => g.scope === 'staff')
    const staffUntouched = staffTodo.length > 0 && groups.filter((g) => g.scope === 'staff').every((g) => g.generated === 0)
    if (staffUntouched) {
      try {
        await createPayrollDisbursement(period, 'staff', dates.staff, gran, null)
      } catch (e) {
        failures.push(`Staff: ${e instanceof Error ? e.message : 'failed'}`)
      }
    } else {
      for (const g of staffTodo) {
        try {
          await generateGroup(g)
        } catch (e) {
          failures.push(`${g.name}: ${e instanceof Error ? e.message : 'failed'}`)
        }
      }
    }
    for (const g of todo.filter((g) => g.scope === 'directors')) {
      try {
        await generateGroup(g)
      } catch (e) {
        failures.push(`${g.name}: ${e instanceof Error ? e.message : 'failed'}`)
      }
    }
    if (failures.length) throw new Error(failures.join(' · '))
  }

  async function saveGroupDates(g: DeptGroup) {
    const date = g.scope === 'directors' ? dates.directors : dates.staff
    for (const v of g.vouchers) {
      if ((v.status === 'pending_approval' || v.status === 'draft') && v.payment_date !== date) {
        await setPayrollPvDate(v.id, date)
      }
    }
  }

  async function generateAllStatutory() {
    const failures: string[] = []
    for (const r of rows) {
      if (r.pv != null || r.total <= 0) continue
      try {
        await generateStatutoryScheme(period, r.scheme, dates.stat[r.scheme] || undefined)
      } catch (e) {
        failures.push(`${r.payee}: ${e instanceof Error ? e.message : 'failed'}`)
      }
    }
    if (failures.length) throw new Error(failures.join(' · '))
  }

  const salaryTodo = groups.filter((g) => g.headcount > 0 && remainingOf(g) > 0)
  const salaryTodoFunded = salaryTodo.filter(fundedFor)
  const allSalaryDone = groups.length > 0 && groups.every((g) => g.stage === 'paid' || g.headcount === 0)
  const allSalaryLabel = (() => {
    const staffN = salaryTodoFunded.filter((g) => g.scope === 'staff').length
    const dirN = salaryTodoFunded.filter((g) => g.scope === 'directors').length
    const people = salaryTodoFunded.reduce((s, g) => s + remainingOf(g), 0)
    if (gran === 'department') {
      const n = staffN + dirN
      return `Generate ${n} ${n === 1 ? 'PV' : 'PVs'} · ${people} people`
    }
    return `Generate ${people} PVs`
  })()
  const pendingStat = rows.filter((r) => r.pv == null && r.total > 0)
  const blockers = groups.flatMap((g) => (g.stage === 'paid' ? [] : g.people.filter((p) => p.net > 0 && bankIssue(p) != null)))
  const totalDelta = delta(totals.net, totals.prevNet)
  const openGroup = win?.kind === 'dept' ? groups.find((g) => g.key === win.key) ?? null : null
  const openBody = win?.kind === 'body' ? win.key : null

  return (
    <div>
      {blockers.length > 0 ? (
        <div className="pay-block">
          <b>Payment blocked for {blockers.length} staff:</b> fix their bank details before the Alliance file goes out — the file skips them, the rest of the department still pays.{' '}
          <span className="who">
            {blockers.map((p, i) => (
              <span key={p.row_id}>
                {i > 0 ? ' · ' : ''}
                {p.staff_id ? (
                  <Link href={`/team/people/${p.staff_id}`} className="text-accent hover:underline">
                    {p.name}
                  </Link>
                ) : (
                  p.name
                )}
              </span>
            ))}
          </span>
        </div>
      ) : null}

      {/* ── Salary PVs ─────────────────────────────────────────────────── */}
      <section className="mb-10">
        <div className="sect-head">
          <h2>Salary PVs</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {groups.length} GROUPS · {totals.staffCount} STAFF + {totals.directorCount} DIRECTORS · NET RM {formatMoneyBare(totals.net)}
            {totalDelta ? ` · ${varianceLabel(totalDelta, prevMonthName)}` : ''}
          </span>
        </div>

        <div className="pay-bar">
          <div className="f">
            <span className="l">PV per</span>
            <div className="pay-seg" role="group" aria-label="PV granularity">
              <button type="button" aria-pressed={gran === 'department'} onClick={() => setGran('department')} disabled={busy != null}>
                Department
              </button>
              <button type="button" aria-pressed={gran === 'employee'} onClick={() => setGran('employee')} disabled={busy != null}>
                Employee
              </button>
            </div>
          </div>
          <label className="f">
            <span className="l">Staff date</span>
            <input type="date" className="pay-date" value={dates.staff} onChange={(e) => setDates((d) => ({ ...d, staff: e.target.value }))} disabled={busy != null} />
          </label>
          <label className="f">
            <span className="l">Directors date</span>
            <input type="date" className="pay-date" value={dates.directors} onChange={(e) => setDates((d) => ({ ...d, directors: e.target.value }))} disabled={busy != null} />
          </label>
          <span className="spacer" />
          <Link
            href={`/hr-costing/payroll/${period}/bank-transfer?format=alliance`}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-xs px-3 py-1.5 rounded-md transition-colors"
          >
            Alliance file · all staff
          </Link>
          {!allSalaryDone ? (
            <button
              type="button"
              className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md disabled:opacity-50 transition-colors"
              onClick={() => setConfirm({ kind: 'all-salary' })}
              disabled={busy != null || salaryTodoFunded.length === 0 || confirm?.kind === 'all-salary'}
              title={salaryTodoFunded.length === 0 && salaryTodo.length > 0 ? 'Funding is not complete yet' : undefined}
            >
              {allSalaryLabel}
            </button>
          ) : null}
          <span className="hint">
            {gran === 'department'
              ? 'One PV per department with the people as lines; directors are one batch of their own. '
              : 'One PV per person, grouped by department. '}
            Staff and directors keep separate dates and separate Principal approvals. Any department can go alone from its card.
            {!staffFunded && salaryTodo.some((g) => g.scope === 'staff') ? ' Staff PVs wait for Finance to complete the funding.' : ''}
            {!directorsFunded && salaryTodo.some((g) => g.scope === 'directors') ? ' Directors wait for their own funding request.' : ''}
          </span>
        </div>

        {confirm?.kind === 'all-salary' ? (
          <div className="pay-confirm mb-3">
            <span>
              Generate <b>{allSalaryLabel.replace('Generate ', '')}</b> ·{' '}
              <b>RM {formatMoneyBare(salaryTodoFunded.reduce((s, g) => s + g.people.filter((p) => p.net > 0 && !p.voucher).reduce((t, p) => t + p.net, 0), 0))}</b>
              {payoutBank ? ` from ${payoutBank.name} ···${payoutBank.last4}` : ''} · staff on <b>{shortDate(dates.staff)}</b>
              {salaryTodoFunded.some((g) => g.scope === 'directors') ? (
                <>
                  , directors on <b>{shortDate(dates.directors)}</b>
                </>
              ) : null}
              . Principal approves each batch; approval is the payment.
            </span>
            <button
              type="button"
              className="bg-accent hover:bg-accent-hover text-white font-serif italic text-xs px-3.5 py-1.5 rounded-md disabled:opacity-50"
              onClick={() => run('gen:all', generateAllSalary)}
              disabled={busy != null}
            >
              {busy === 'gen:all' ? 'Generating…' : 'Confirm'}
            </button>
            <button type="button" className="text-xs font-sans text-muted hover:text-ink" onClick={() => setConfirm(null)} disabled={busy != null}>
              Cancel
            </button>
          </div>
        ) : null}
        {error && !win ? <div className="font-serif italic text-danger text-xs mb-3">{error}</div> : null}

        <div className="pay-cards">
          {groups.map((g) => {
            const d = delta(g.net, g.prev_net)
            const isNow = g.headcount > 0 && remainingOf(g) > 0 && fundedFor(g)
            const warn = g.blockers > 0 && g.stage !== 'paid'
            const pvLine =
              g.mode === 'department' && g.deptVoucher
                ? g.deptVoucher.no
                : g.generated > 0
                  ? `${g.vouchers.length} PV${g.vouchers.length === 1 ? '' : 's'}`
                  : ''
            const date = g.scope === 'directors' ? dates.directors : dates.staff
            const pendingVs = g.vouchers.filter((v) => v.status === 'pending_approval' || v.status === 'draft')
            const canGenerate = isNow && (g.scope === 'directors' || !!g.dept_id)
            return (
              <div key={g.key} className={`pay-card${isNow ? ' now' : ''}${warn ? ' warn' : ''}`}>
                <div className="hd">
                  <span className="nm">{g.name}</span>
                  <span className="cnt">
                    {g.headcount} {g.scope === 'directors' ? 'directors' : 'staff'}
                    {g.people.length > g.headcount ? ` · ${g.people.length - g.headcount} unpaid` : ''}
                  </span>
                </div>
                <div className="big">
                  <small>RM</small>
                  {formatMoneyBare(g.net)}
                </div>
                <div className="sub">
                  net · gross {formatMoneyBare(g.gross)} · deductions {formatMoneyBare(g.deductions)}
                  <br />
                  {g.scope === 'directors' ? 'own batch' : `${g.headcount - g.blockers} of ${g.headcount} with bank on file`} · {shortDate(g.vouchers[0]?.payment_date ?? date)}
                </div>
                <div className="st">
                  {stageChip(g)}
                  {pvLine ? <span className="pv">{pvLine}</span> : null}
                  {d ? <span className={`pay-delta ${d.dir}${isNotableMove(d) ? ' notable' : ''}`}>{varianceLabel(d, prevMonthName)}</span> : null}
                </div>
                {g.vouchers[0]?.created_at ? (
                  <div className="foot">
                    Generated {shortDateTime(g.vouchers[0].created_at)}
                    {g.vouchers[0].approved_at ? ` · Approved ${shortDateTime(g.vouchers[0].approved_at)}` : ''}
                  </div>
                ) : null}
                {confirm?.kind === 'dept' && confirm.key === g.key ? (
                  <div className="pay-confirm">
                    <span>
                      <b>{g.stage === 'partial' || gran === 'employee' ? `${remainingOf(g)} PVs` : '1 PV'}</b> · {g.name} ·{' '}
                      <b>RM {formatMoneyBare(g.people.filter((p) => p.net > 0 && !p.voucher).reduce((t, p) => t + p.net, 0))}</b> on <b>{shortDate(date)}</b>
                    </span>
                    <button
                      type="button"
                      className="bg-accent hover:bg-accent-hover text-white font-serif italic text-xs px-3 py-1.5 rounded-md disabled:opacity-50"
                      onClick={() => run(`gen:${g.key}`, () => generateGroup(g))}
                      disabled={busy != null}
                    >
                      {busy === `gen:${g.key}` ? 'Generating…' : 'Confirm'}
                    </button>
                    <button type="button" className="text-xs font-sans text-muted hover:text-ink" onClick={() => setConfirm(null)} disabled={busy != null}>
                      Cancel
                    </button>
                  </div>
                ) : null}
                <div className="ft">
                  <button type="button" className="open" onClick={() => setWin({ kind: 'dept', key: g.key })}>
                    Open {g.people.length} {g.people.length === 1 ? 'person' : 'people'} →
                  </button>
                  <span>
                    {remainingOf(g) > 0 && g.headcount > 0 ? (
                      <button
                        type="button"
                        className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-xs px-3 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                        onClick={() => setConfirm({ kind: 'dept', key: g.key })}
                        disabled={!canGenerate || busy != null}
                        title={!fundedFor(g) ? 'Funding is not complete yet' : undefined}
                      >
                        {g.stage === 'partial' ? `Generate remaining ${remainingOf(g)}` : 'Generate'}
                      </button>
                    ) : pendingVs.length > 0 && pendingVs[0].group_id ? (
                      <Link href={`/approvals?group_id=${pendingVs[0].group_id}`} className="font-mono text-xs text-accent hover:underline">
                        Approvals →
                      </Link>
                    ) : g.deptVoucher ? (
                      <Link href={`/payments/${g.deptVoucher.id}`} className="font-mono text-xs text-accent hover:underline">
                        PV →
                      </Link>
                    ) : g.vouchers.length > 0 ? (
                      <button type="button" className="open" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} onClick={() => setWin({ kind: 'dept', key: g.key })}>
                        {g.vouchers.length} PVs →
                      </button>
                    ) : null}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        <p className="font-serif italic text-muted text-xs mt-3">
          Deductions = gross − net (the employee side of EPF, SOCSO, EIS, PCB and SKBBK). A PV turns paid the moment Principal approves it; the Alliance file is what moves the cash.
        </p>
      </section>

      {/* ── Statutory PVs ──────────────────────────────────────────────── */}
      <section className="mb-6">
        <div className="sect-head">
          <h2>Statutory PVs</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            4 BODIES · 5 PVS · RM {formatMoneyBare(totals.statutory)} · STAFF {formatMoneyBare(totals.statutoryStaff)} + DIRECTORS {formatMoneyBare(totals.statutoryDirectors)}
          </span>
        </div>
        <div className="pay-well">
          <div className="pay-bar">
            <label className="f">
              <span className="l">Payment date</span>
              <input
                type="date"
                className="pay-date"
                value={dates.stat.KWSP ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setDates((d) => ({ ...d, stat: { KWSP: v, SOCSO: v, EIS: v, PCB: v, SKBBK: v } }))
                }}
                disabled={busy != null}
                aria-label="Payment date for all statutory PVs"
              />
              <span className="font-serif italic text-muted text-xs">blank = decide later, editable until approved</span>
            </label>
            <span className="spacer" />
            {pendingStat.length > 0 ? (
              <button
                type="button"
                className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md disabled:opacity-50 transition-colors"
                onClick={() => run('stat:all', generateAllStatutory)}
                disabled={busy != null || !staffFunded}
                title={!staffFunded ? 'Funding is not complete yet' : undefined}
              >
                {busy === 'stat:all' ? 'Generating…' : `Generate all 4 bodies (${pendingStat.length} PV${pendingStat.length === 1 ? '' : 's'})`}
              </button>
            ) : null}
            <span className="hint">
              One PV per body, staff + directors together, paid from the Alliance payroll account. Due the 15th of next month — KWSP rolls a weekend forward, PERKESO and LHDN roll it back. The by-department split is for reconciliation, not a separate PV.
            </span>
          </div>
          {error && !win ? <div className="font-serif italic text-danger text-xs mb-3">{error}</div> : null}
          <div className="pay-cards four">
            {BODIES.map((b) => {
              const brows = rows.filter((r) => r.body === b.key)
              const total = brows.reduce((s, r) => s + r.total, 0)
              const staff = brows.reduce((s, r) => s + r.staff, 0)
              const dirs = brows.reduce((s, r) => s + r.directors, 0)
              const allPaid = brows.every((r) => r.stage === 'paid')
              const anyGen = brows.some((r) => r.pv != null)
              const due = dueLabel(brows[0].due, today, allPaid ? 'paid' : 'open', brows[0].pv?.payment_date)
              const pvNos = brows.filter((r) => r.pv).map((r) => r.pv!.no ?? 'PV').join(' · ')
              const todo = brows.filter((r) => r.pv == null && r.total > 0)
              const isNow = !allPaid && staffFunded
              return (
                <div key={b.key} className={`pay-card${isNow && todo.length > 0 ? ' now' : ''}`}>
                  <div className="hd">
                    <span className="nm">{b.name}</span>
                    <span className="cnt">{b.schemes.length === 1 ? '1 PV' : '2 PVs'}</span>
                  </div>
                  <div className="big">
                    <small>RM</small>
                    {formatMoneyBare(total)}
                  </div>
                  <div className="sub">
                    {b.covers}
                    <br />
                    staff {formatMoneyBare(staff)} · directors {formatMoneyBare(dirs)}
                  </div>
                  <div className="st">
                    {allPaid ? (
                      <span className="chip ledger"><span className="dot" />paid</span>
                    ) : anyGen ? (
                      <span className="chip alert"><span className="dot" />awaiting Principal</span>
                    ) : (
                      <span className="chip">not generated</span>
                    )}
                    {pvNos ? <span className="pv">{pvNos}</span> : null}
                  </div>
                  <div className={`pay-due ${due.cls}`}>{due.text}</div>
                  <div className="foot">Portal · {b.portal}</div>
                  <div className="ft">
                    <button type="button" className="open" onClick={() => setWin({ kind: 'body', key: b.key })}>
                      By department →
                    </button>
                    <span>
                      {todo.length > 0 ? (
                        <button
                          type="button"
                          className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-xs px-3 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                          onClick={() =>
                            run(`stat:${b.key}`, async () => {
                              for (const r of todo) await generateStatutoryScheme(period, r.scheme, dates.stat[r.scheme] || undefined)
                            })
                          }
                          disabled={busy != null || !staffFunded}
                          title={!staffFunded ? 'Funding is not complete yet' : undefined}
                        >
                          {busy === `stat:${b.key}` ? 'Generating…' : todo.length === 1 ? 'Generate PV' : `Generate ${todo.length}`}
                        </button>
                      ) : brows.length === 1 && brows[0].pv ? (
                        <Link href={`/payments/${brows[0].pv.id}`} className="font-mono text-xs text-accent hover:underline">
                          PV →
                        </Link>
                      ) : null}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <p className="font-serif italic text-muted text-xs mt-3">
          Net {formatMoneyBare(totals.net)} + statutory {formatMoneyBare(totals.statutory)} = CTC {formatMoneyBare(totals.ctc)}, what Finance funded. Once all five are paid the HR pool returns to HR&apos;s own money.
        </p>
      </section>

      {openGroup ? (
        <DeptWindow
          group={openGroup}
          period={period}
          periodLabel={periodLabel}
          prevMonthName={prevMonthName}
          gran={gran}
          onGran={setGran}
          date={openGroup.scope === 'directors' ? dates.directors : dates.staff}
          onDate={(v) => setDates((d) => (openGroup.scope === 'directors' ? { ...d, directors: v } : { ...d, staff: v }))}
          funded={fundedFor(openGroup)}
          busy={busy}
          error={error}
          confirming={confirm?.kind === 'dept' && confirm.key === openGroup.key}
          onAskGenerate={() => setConfirm({ kind: 'dept', key: openGroup.key })}
          onConfirmGenerate={() => run(`gen:${openGroup.key}`, () => generateGroup(openGroup))}
          onCancel={() => setConfirm(null)}
          onSaveDates={() => run(`date:${openGroup.key}`, () => saveGroupDates(openGroup))}
          payoutBank={payoutBank}
          onClose={() => {
            setWin(null)
            setConfirm(null)
            setError(null)
          }}
        />
      ) : null}

      {openBody ? (
        <StatutoryWindow
          body={openBody}
          rows={rows.filter((r) => r.body === openBody)}
          groups={groups}
          periodLabel={periodLabel}
          today={today}
          dates={dates.stat}
          onDate={(scheme, v) => setDates((d) => ({ ...d, stat: { ...d.stat, [scheme]: v } }))}
          onGenerate={(scheme) => run(`stat:${scheme}`, () => generateStatutoryScheme(period, scheme, dates.stat[scheme] || undefined))}
          onTopup={(scheme) => run(`topup:${scheme}`, () => generateStatutoryDirectorTopup(period, scheme, dates.stat[scheme] || undefined))}
          onSaveDate={(id, date, key) => run(key, () => setPayrollPvDate(id, date))}
          busy={busy}
          error={error}
          onClose={() => {
            setWin(null)
            setError(null)
          }}
        />
      ) : null}
    </div>
  )
}
