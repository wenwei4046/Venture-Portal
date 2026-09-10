'use client'

import { useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatMoneyBare } from '@/lib/utils'
import {
  bankIssue,
  isNotableMove,
  type BodyKey,
  type ContributionTotals,
  type CycleTotals,
  type DeptGroup,
  type Granularity,
  type Headline,
  type Milestone,
  type Phase,
  type Scheme,
  type Scope,
  type StatutoryRow,
  type VarianceSummary,
} from '@/lib/payment-cycle'
import { createPayrollDisbursement, generateStatutoryDirectorTopup, generateStatutoryScheme, setPayrollPvDate } from '../actions'
import ContribBand from './ContribBand'
import DeptRows from './DeptRows'
import DeptWindow from './DeptWindow'
import Overview, { type Facts } from './Overview'
import StatutoryRows from './StatutoryRows'
import StatutoryWindow from './StatutoryWindow'

export interface BoardProps {
  period: string
  periodLabel: string
  periodRange: string
  prevMonthName: string
  groups: DeptGroup[]
  rows: StatutoryRow[]
  totals: CycleTotals
  band: ContributionTotals
  headline: Headline
  milestones: Milestone[]
  variances: VarianceSummary
  facts: Facts
  phase: Phase
  staffFunded: boolean
  directorsFunded: boolean
  payoutBank: { name: string; last4: string } | null
  /** ISO date, computed on the server so the due-day maths cannot drift at hydration. */
  today: string
  defaultDate: string
  fundingSlot: ReactNode
}

type Win = { kind: 'dept'; key: string } | { kind: 'body'; key: BodyKey } | null
type Confirm = { kind: 'all-salary'; at: 'over' | 'list' } | { kind: 'all-stat'; at: 'over' | 'list' } | { kind: 'dept'; key: string } | null

/**
 * The state of the page — which window is open, the PV-per switch, the
 * dates, what is being confirmed — and the calls to the actions. Every
 * judgement about the data is made in lib/payment-cycle.ts; the layout is
 * the researched one (see Overview, DeptRows, StatutoryRows).
 */
export default function PaymentBoard({
  period,
  periodLabel,
  periodRange,
  prevMonthName,
  groups,
  rows,
  totals,
  band,
  headline,
  milestones,
  variances,
  facts,
  phase,
  staffFunded,
  directorsFunded,
  payoutBank,
  today,
  defaultDate,
  fundingSlot,
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

  async function generateSchemes(schemes: Scheme[]) {
    const failures: string[] = []
    for (const scheme of schemes) {
      try {
        await generateStatutoryScheme(period, scheme, dates.stat[scheme] || undefined)
      } catch (e) {
        failures.push(`${scheme}: ${e instanceof Error ? e.message : 'failed'}`)
      }
    }
    if (failures.length) throw new Error(failures.join(' · '))
  }

  const salaryTodo = groups.filter((g) => g.headcount > 0 && remainingOf(g) > 0)
  const salaryTodoFunded = salaryTodo.filter(fundedFor)
  const salaryDone = groups.length > 0 && groups.every((g) => g.stage === 'paid' || g.headcount === 0)
  const allPeople = salaryTodoFunded.reduce((s, g) => s + remainingOf(g), 0)
  const allPvCount = gran === 'department' ? salaryTodoFunded.length : allPeople
  const allSalaryLabel = gran === 'department' ? `Generate ${allPvCount} ${allPvCount === 1 ? 'PV' : 'PVs'} · ${allPeople} people` : `Generate ${allPeople} PVs`
  const allOwed = salaryTodoFunded.reduce((s, g) => s + g.people.filter((p) => p.net > 0 && !p.voucher).reduce((t, p) => t + p.net, 0), 0)
  const pendingStat = rows.filter((r) => r.pv == null && r.total > 0)
  const blockers = groups.flatMap((g) => (g.stage === 'paid' ? [] : g.people.filter((p) => p.net > 0 && bankIssue(p) != null)))
  const notable = salaryDone ? [] : variances.top.filter((v) => isNotableMove(v.d))
  const openGroup = win?.kind === 'dept' ? groups.find((g) => g.key === win.key) ?? null : null
  const openBody = win?.kind === 'body' ? win.key : null
  const bankName = payoutBank ? `${payoutBank.name} ···${payoutBank.last4}` : 'the Alliance payroll account'
  const ddmm = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—')
  const canGenerateAll = salaryTodoFunded.length > 0
  const allTitle = salaryTodoFunded.length === 0 && salaryTodo.length > 0 ? 'Funding is not complete yet' : undefined

  const confirmAllSalary = (
    <div className="pay-confirm">
      <span>
        <b>RM {formatMoneyBare(allOwed)}</b> leaves {bankName} — staff on <b>{ddmm(dates.staff)}</b>
        {salaryTodoFunded.some((g) => g.scope === 'directors') ? (
          <>
            , directors on <b>{ddmm(dates.directors)}</b>
          </>
        ) : null}{' '}
        · {allPeople} people · <b>{allPvCount} {allPvCount === 1 ? 'PV' : 'PVs'}</b> — generate?
      </span>
      <button type="button" className="pay-btn pri" onClick={() => run('gen:all', generateAllSalary)} disabled={busy != null}>
        {busy === 'gen:all' ? 'Generating…' : 'Yes, generate'}
      </button>
      <button type="button" className="text-xs font-sans text-muted hover:text-ink" onClick={() => setConfirm(null)} disabled={busy != null}>
        Cancel
      </button>
    </div>
  )
  const confirmAllStat = (
    <div className="pay-confirm">
      <span>
        <b>RM {formatMoneyBare(pendingStat.reduce((s, r) => s + r.total, 0))}</b> to {Array.from(new Set(pendingStat.map((r) => r.body))).join(' · ')} from {bankName}
        {dates.stat.KWSP ? (
          <>
            {' '}
            on <b>{ddmm(dates.stat.KWSP)}</b>
          </>
        ) : (
          <> · date to be set</>
        )}{' '}
        · <b>{pendingStat.length} {pendingStat.length === 1 ? 'PV' : 'PVs'}</b> — generate?
      </span>
      <button type="button" className="pay-btn pri" onClick={() => run('stat:all', () => generateSchemes(pendingStat.map((r) => r.scheme)))} disabled={busy != null}>
        {busy === 'stat:all' ? 'Generating…' : 'Yes, generate'}
      </button>
      <button type="button" className="text-xs font-sans text-muted hover:text-ink" onClick={() => setConfirm(null)} disabled={busy != null}>
        Cancel
      </button>
    </div>
  )

  const overviewAction = () => {
    if (headline.action.kind === 'generate-salary') setConfirm({ kind: 'all-salary', at: 'over' })
    else if (headline.action.kind === 'generate-statutory') setConfirm({ kind: 'all-stat', at: 'over' })
  }

  return (
    <div>
      {blockers.length > 0 ? (
        <div className="pay-block">
          <b>Payment blocked for {blockers.length} staff — fix their bank details.</b> The Alliance file skips them; the rest of their department still pays.{' '}
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
      {notable.length > 0 ? (
        <div className="pay-warn">
          <b>
            {variances.notable} {variances.notable === 1 ? 'person' : 'people'} moved 20% or more vs {prevMonthName}
          </b>{' '}
          — worth a look before generating; nothing is blocked.{' '}
          <span className="who">
            {notable.map((v, i) => (
              <span key={v.row_id}>
                {i > 0 ? ' · ' : ''}
                <button type="button" className="text-accent hover:underline" onClick={() => setWin({ kind: 'dept', key: v.key })}>
                  {v.name}
                </button>{' '}
                {v.d.dir === 'up' ? '▲' : '▼'} {v.d.pct == null ? formatMoneyBare(Math.abs(v.d.abs)) : `${Math.abs(v.d.pct).toFixed(0)}%`}
              </span>
            ))}
            {variances.notable > notable.length ? ` · and ${variances.notable - notable.length} more` : ''}
          </span>
        </div>
      ) : null}

      <Overview
        periodLabel={periodLabel}
        periodRange={periodRange}
        prevMonthName={prevMonthName}
        headline={headline}
        milestones={milestones}
        variances={variances}
        totals={totals}
        facts={facts}
        bankLabel={bankName}
        actionLabel={headline.action.kind === 'generate-salary' ? allSalaryLabel : headline.action.label}
        actionDisabled={busy != null || (headline.action.kind === 'generate-salary' ? !canGenerateAll : !staffFunded) || confirm?.kind === 'all-salary' || confirm?.kind === 'all-stat'}
        actionTitle={headline.action.kind === 'generate-salary' ? allTitle : undefined}
        onAction={overviewAction}
        fundingSlot={fundingSlot}
        confirm={confirm?.kind === 'all-salary' && confirm.at === 'over' ? confirmAllSalary : confirm?.kind === 'all-stat' && confirm.at === 'over' ? confirmAllStat : null}
        onOpenGroup={(key) => setWin({ kind: 'dept', key })}
      />

      {error && !win ? <div className="pay-err mb-4">{error}</div> : null}

      {phase !== 'no-payroll' && phase !== 'drafts-pending' ? (
        <>
          {/* ── Salary PVs ─────────────────────────────────────────────── */}
          <section className="mb-10">
            <div className="sect-head">
              <h2>Salary PVs</h2>
              <span className="rule" aria-hidden />
              <span className="count">
                {groups.length} GROUPS · {totals.staffCount} STAFF + {totals.directorCount} DIRECTORS · NET RM {formatMoneyBare(totals.net)}
              </span>
            </div>
            <ContribBand band={band} />
            <DeptRows
              period={period}
              groups={groups}
              prevMonthName={prevMonthName}
              today={today}
              gran={gran}
              onGran={setGran}
              dates={{ staff: dates.staff, directors: dates.directors }}
              onDate={(scope: Scope, v) => setDates((d) => (scope === 'directors' ? { ...d, directors: v } : { ...d, staff: v }))}
              fundedFor={fundedFor}
              busy={busy}
              confirmKey={confirm?.kind === 'all-salary' && confirm.at === 'list' ? 'all' : confirm?.kind === 'dept' ? confirm.key : null}
              allLabel={allSalaryLabel}
              canGenerateAll={canGenerateAll}
              allTitle={allTitle}
              onAskAll={() => setConfirm({ kind: 'all-salary', at: 'list' })}
              onAskGroup={(g) => setConfirm({ kind: 'dept', key: g.key })}
              onConfirmGroup={(g) => run(`gen:${g.key}`, () => generateGroup(g))}
              onCancel={() => setConfirm(null)}
              onOpen={(key) => setWin({ kind: 'dept', key })}
              confirmAll={confirmAllSalary}
              payoutBank={payoutBank}
              hint={
                (gran === 'department' ? 'One PV per department with the people as lines; directors are one batch of their own. ' : 'One PV per person, grouped by department. ') +
                'Staff and directors keep separate dates and separate Principal approvals. Any department can go alone from its row. Deductions = gross − net: the employee side of EPF, SOCSO, EIS, PCB and SKBBK.'
              }
            />
          </section>

          {/* ── Statutory PVs ──────────────────────────────────────────── */}
          <section className="mb-6">
            <div className="sect-head">
              <h2>Statutory PVs</h2>
              <span className="rule" aria-hidden />
              <span className="count">
                4 BODIES · 5 PVS · RM {formatMoneyBare(totals.statutory)} · STAFF {formatMoneyBare(totals.statutoryStaff)} + DIRECTORS {formatMoneyBare(totals.statutoryDirectors)}
              </span>
            </div>
            <div className="pay-well">
              <StatutoryRows
                rows={rows}
                today={today}
                dates={dates.stat}
                onDateAll={(v) => setDates((d) => ({ ...d, stat: { KWSP: v, SOCSO: v, EIS: v, PCB: v, SKBBK: v } }))}
                busy={busy}
                staffFunded={staffFunded}
                pendingStat={pendingStat.length}
                onAskAll={() => setConfirm({ kind: 'all-stat', at: 'list' })}
                confirming={confirm?.kind === 'all-stat' && confirm.at === 'list'}
                confirmAll={confirmAllStat}
                onGenerate={(schemes, key) => run(key, () => generateSchemes(schemes))}
                onOpen={(body) => setWin({ kind: 'body', key: body })}
              />
            </div>
            <p className="font-serif italic text-muted text-xs mt-3">
              Net {formatMoneyBare(totals.net)} + statutory {formatMoneyBare(totals.statutory)} = CTC {formatMoneyBare(totals.ctc)}, what Finance funded. Paid to the portals from the Alliance payroll account; once all five are paid the HR pool is HR&apos;s own money again. Public holidays are not in the due-date rule.
            </p>
          </section>
        </>
      ) : null}

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
