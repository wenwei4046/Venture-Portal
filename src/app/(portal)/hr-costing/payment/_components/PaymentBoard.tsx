'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { payrollComponentSelection, type SalaryComponentSelection } from '@/lib/payroll-selection'
import type { BankAccountSelection } from '@/lib/staff-bank-accounts'
import {
  type BodyKey, type ContributionTotals, type CycleTotals, type DeptGroup,
  type Granularity, type Headline, type Milestone, type StatutoryCoverage, type Phase,
  type StatutoryRow, type VarianceSummary,
} from '@/lib/payment-cycle'
import { createPayrollDisbursement, setPayrollPvDate } from '../actions'
import DeptRows from './DeptRows'
import DeptWindow from './DeptWindow'
import Overview, { type Facts } from './Overview'
import StatutoryRows from './StatutoryRows'
import StatutoryWindow from './StatutoryWindow'
import StatutoryGenerator from './StatutoryGenerator'
import SalaryChanges from './SalaryChanges'
import './payment-tables.css'

export interface BoardProps {
  period: string
  periodLabel: string
  periodRange: string
  prevMonthName: string
  groups: DeptGroup[]
  rows: StatutoryRow[]
  statutoryCoverage?: StatutoryCoverage[]
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
  today: string
  defaultDate: string
  fundingSlot: ReactNode
}

type WindowState = { kind: 'dept'; key: string; mode: Granularity | 'view' } | { kind: 'body'; key: BodyKey } | null
type SalaryReview = { key: string; rowIds: string[]; selectionKeys: string[]; components: SalaryComponentSelection[]; accounts: Record<string, BankAccountSelection>; group: DeptGroup; granularity: Granularity; date: string }

export default function PaymentBoard({ period, periodLabel, periodRange, prevMonthName, groups, rows, statutoryCoverage = [], totals, band, headline, milestones, variances, facts, phase, staffFunded, directorsFunded, payoutBank, today, defaultDate, fundingSlot }: BoardProps) {
  const router = useRouter()
  const [tab, setTab] = useState<'salary' | 'statutory'>('salary')
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  const [dates, setDates] = useState({ staff: defaultDate, directors: defaultDate })
  const [win, setWin] = useState<WindowState>(null)
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [accounts, setAccounts] = useState<Record<string, BankAccountSelection>>({})
  const [review, setReview] = useState<SalaryReview | null>(null)
  const [generator, setGenerator] = useState<{ body: BodyKey; mode: Granularity } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const submitting = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const fundedFor = (g: DeptGroup) => g.scope === 'directors' ? directorsFunded : staffFunded
  const bankName = payoutBank ? `${payoutBank.name} ···${payoutBank.last4}` : 'the Alliance payroll account'

  function openSalary(g: DeptGroup, mode: Granularity | 'view') {
    if (submitting.current) return
    setReview(null)
    setError(null)
    setWin({ kind: 'dept', key: g.key, mode })
  }

  async function run(key: string, action: () => Promise<unknown>) {
    if (submitting.current) return
    submitting.current = true
    setBusy(key)
    setError(null)
    try {
      await action()
      setReview(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      submitting.current = false
      setBusy(null)
      router.refresh()
    }
  }

  function askSalary(g: DeptGroup, granularity: Granularity) {
    const selection = payrollComponentSelection(g.people, granularity === 'department' ? null : selections[g.key] ?? [], granularity, accounts)
    if (!selection.count || selection.missingAccounts.length || selection.negativeComponents.length) return
    setReview({ key: g.key, rowIds: selection.rowIds, selectionKeys: selection.selectionKeys, components: selection.componentSelections, accounts: { ...accounts }, group: g, granularity, date: dates[g.scope] })
  }

  function confirmSalary(g: DeptGroup) {
    if (!review || review.key !== g.key) return
    const snapshot = review
    void run(`gen:${g.key}`, async () => {
      await createPayrollDisbursement(period, g.scope, snapshot.date, snapshot.granularity, g.scope === 'staff' ? g.dept_id : null, snapshot.rowIds, snapshot.components)
      setSelections(current => ({ ...current, [g.key]: [] }))
    })
  }

  function closeWindow() {
    if (submitting.current) return
    setWin(null)
    setReview(null)
    setError(null)
  }

  function openStatutory(body: BodyKey, mode: Granularity) {
    if (submitting.current) return
    setWin(null)
    setError(null)
    setTab('statutory')
    setGenerator({ body, mode })
  }

  const openGroup = win?.kind === 'dept' ? groups.find(g => g.key === win.key) ?? null : null
  const openMode = win?.kind === 'dept' ? win.mode : 'view'
  const openReview = review?.key === openGroup?.key ? review : null
  const openBody = win?.kind === 'body' ? win.key : null
  const salaryAction = headline.action.kind === 'generate-salary'
  const statutoryAction = headline.action.kind === 'generate-statutory'

  return <div>
    <Overview
      periodLabel={periodLabel} periodRange={periodRange} prevMonthName={prevMonthName}
      headline={headline} milestones={milestones} variances={variances} totals={totals}
      band={band} rows={rows} groups={groups} facts={facts} bankLabel={bankName}
      actionLabel={salaryAction ? 'Open salary' : statutoryAction ? 'Open statutory' : headline.action.label}
      actionDisabled={busy != null} onAction={() => {
        const index = statutoryAction ? 1 : 0
        setTab(index ? 'statutory' : 'salary')
        tabs.current[index]?.focus()
      }}
      fundingSlot={fundingSlot} confirm={null}
      onOpenGroup={key => { const g = groups.find(group => group.key === key); if (g) openSalary(g, 'view') }}
    />
    {error && !win ? <div className="pay-err" role="alert">{error}</div> : null}
    {phase !== 'no-payroll' && phase !== 'drafts-pending' ? <>
      <div className="payment-tabs" role="tablist" aria-label="Payment type">
        {(['salary', 'statutory'] as const).map((name, index) => <button
          key={name} ref={node => { tabs.current[index] = node }} type="button" role="tab"
          id={`payment-${name}-tab`} aria-controls={`payment-${name}-panel`} aria-selected={tab === name}
          tabIndex={tab === name ? 0 : -1} onClick={() => setTab(name)}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index
            setTab(next ? 'statutory' : 'salary')
            tabs.current[next]?.focus()
          }}
        >{name === 'salary' ? 'Salary' : 'Statutory'}</button>)}
      </div>
      <div id="payment-salary-panel" role="tabpanel" aria-labelledby="payment-salary-tab" hidden={tab !== 'salary'}>
        <section className="payment-section" aria-label="Salary PVs">
          <h2>Salary PVs</h2>
          <DeptRows period={period} groups={groups} prevMonthName={prevMonthName} today={today}
            dates={dates} fundedFor={fundedFor} busy={busy} payoutBank={payoutBank}
            onGenerate={openSalary} onOpen={key => { const g = groups.find(group => group.key === key); if (g) openSalary(g, 'view') }} />
        </section>
        <SalaryChanges groups={groups} variances={variances} prevMonthName={prevMonthName}
          onOpen={key => { const g = groups.find(group => group.key === key); if (g) openSalary(g, 'view') }} />
      </div>
      <div id="payment-statutory-panel" role="tabpanel" aria-labelledby="payment-statutory-tab" hidden={tab !== 'statutory'}>
        <section className="payment-section" aria-label="Statutory PVs">
          <div className="pay-section-toolbar"><h2>Statutory PVs</h2><span className="pay-muted">Contributions &amp; deductions · MYR</span></div>
          <StatutoryRows rows={rows} today={today} busy={busy} staffFunded={staffFunded}
            onGenerate={openStatutory} onOpen={body => { setError(null); setWin({ kind: 'body', key: body }) }} />
        </section>
      </div>
      {generator ? <StatutoryGenerator key={`${generator.body}:${generator.mode}`} period={period} body={generator.body}
        mode={generator.mode} groups={groups} rows={rows} coverage={statutoryCoverage}
        fundedFor={fundedFor} onClose={() => setGenerator(null)} /> : null}
    </> : null}
    {openGroup ? <DeptWindow key={`${openGroup.key}:${openMode}`} group={openReview?.group ?? openGroup} period={period} periodLabel={periodLabel}
      prevMonthName={prevMonthName} gran={openReview?.granularity ?? (openMode === 'department' ? 'department' : 'employee')}
      readOnly={openMode === 'view'} selectedIds={openReview?.selectionKeys ?? (openMode === 'department' ? null : selections[openGroup.key] ?? [])}
      onSelection={ids => setSelections(current => ({ ...current, [openGroup.key]: ids ?? payrollComponentSelection(openGroup.people, null, 'employee').selectionKeys }))}
      accounts={openReview?.accounts ?? accounts} onAccount={(key, account) => setAccounts(current => ({ ...current, [key]: account }))}
      date={openReview?.date ?? dates[openGroup.scope]} onDate={date => setDates(current => ({ ...current, [openGroup.scope]: date }))}
      funded={fundedFor(openGroup)} busy={busy} error={error} confirming={!!openReview}
      onAskGenerate={() => askSalary(openGroup, openMode === 'department' ? 'department' : 'employee')}
      onConfirmGenerate={() => confirmSalary(openGroup)} onCancel={() => setReview(null)}
      onSaveDates={() => { void run(`date:${openGroup.key}`, async () => {
        for (const voucher of openGroup.vouchers) {
          if (['pending_approval', 'draft'].includes(voucher.status) && voucher.payment_date !== dates[openGroup.scope])
            await setPayrollPvDate(voucher.id, dates[openGroup.scope])
        }
      }) }} payoutBank={payoutBank} onClose={closeWindow} /> : null}
    {openBody ? <StatutoryWindow body={openBody} rows={rows.filter(row => row.body === openBody)} groups={groups}
      periodLabel={periodLabel} today={today} onGenerate={mode => openStatutory(openBody, mode)}
      onSaveDate={(id, date) => { void run(`date:${id}`, () => setPayrollPvDate(id, date)) }}
      busy={busy} error={error} onClose={closeWindow} /> : null}
  </div>
}
