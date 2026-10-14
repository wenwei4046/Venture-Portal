'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flash } from '@/components/hrv/toast'
import { DialogMenu, FinDialog, type DialogMenuItem } from '@/components/finv/Dialog'
import { drawerStyles as d } from '@/components/finv/Drawer'
import { fd } from '@/components/finv/DrawerParts'
import { HUB_HREF, HUB_TITLE } from '@/lib/fin-app/routes'
import { IN_CARDS, OUT_CARDS, cardAmountOf, cardLabel, fundCards, fundHaystack, fundLine, movedInMonth, onFundCard, type FundCardKey, type FundRecord, type FundSide } from '@/lib/fund-hub'
import type { RepaymentPlan } from '@/lib/repayment-plan'
import type { TermsChangeComparison, TermsSegment } from '@/lib/treasury-terms'
import { FundDetailBody, fundSteps, type FundCan } from '@/components/treasury/FundHub'
import { segmentLine } from '@/components/treasury/TermsTimeline'
import { scheduleCount } from '@/components/treasury/RepaymentScheduleSection'
import { RevertTermsDialog } from '@/components/treasury/RevertTermsDialog'
import { VoidRepaymentDialog } from '@/app/(portal)/fund-out/[id]/_components/VoidRepaymentDialog'
import CreateFundOutDialog from '@/app/(portal)/fund-out/_components/CreateFundOutDialog'
import RecordFundInDialog from '@/app/(portal)/fund-in/_components/RecordFundInDialog'
import { exportLoansCSV, setLoanMinPayInterest } from '@/app/(portal)/fund-out/actions'
import { setFundSourceMinPayInterest } from '@/app/(portal)/fund-in/actions'
import { openLoanPage } from '@/app/(portal)/fund-out/page-actions'
import { openSourcePage } from '@/app/(portal)/fund-in/page-actions'
import type { LoanPageModel } from '@/app/(portal)/fund-out/[id]/_lib/loan-page'
import type { SourcePageModel } from '@/app/(portal)/fund-in/[id]/_lib/source-page'
import AppScreen, { PageHead, type BarButton } from './AppScreen'
import { useHubTabs } from './hub-tabs'
import { pushIntent, setIntent, useStep } from './nav'
import { BankHero, ListBlock, RecordItems, Row, SearchRow, StackCards, type ItemLine } from './parts'
import { DealCancelSheet, FundingSourceSheet, LoanRepaymentSheet, NotesSheet, RepaymentStartSheet, SourceRepaymentSheet } from './FundSheets'

// Fund › Fund out and Fund › Fund in in the Finance phone app (2026-10-15, the
// Finance revamp v2's phone — M13–M14): the hub (its top tabs, *Fund out ·
// {Month YYYY}* — what moved this office month — a stacked card per list, the
// user's categories: Fund OUT by the loans' status, Fund IN by the source's
// type, Pending approval; *Create fund out · Loan aging* / *Record fund in*),
// a card's list, and a deal — the drawer's parts (FundDetailBody) with what
// its full page adds, since on a phone this screen is the deal's page: the
// repayment schedule, the repayments recorded (a loan's each reversible), the
// terms over time and their revert, the repayment settings, a fund source's
// notes, Record repayment, the steps, the audit log. Every figure is the
// desktop hub's (`lib/fund-hub`) and the page's (`loadLoanPage`,
// `loadSourcePage`); every write the page's own Server Action.

export type FundStep = { kind: 'hub' } | { kind: 'list'; card: FundCardKey } | { kind: 'record'; id: string; from: FundCardKey | null }

/** The deal a record screen shows, as its full page reads it. */
export type DealPage = { side: 'out'; loan: LoanPageModel } | { side: 'in'; source: SourcePageModel }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const pct = (r: number) => `${(r * 100).toFixed(3)}%`
const signed = (n: number) => (Math.abs(n) < 0.005 ? '—' : `${n > 0 ? '+' : '−'}${f2(Math.abs(n))}`)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** A side's step reader: `?id=` a deal (`&from=` its card), `?f=` a card's list, else the hub. */
export function readFundStep(cards: readonly FundCardKey[]) {
  const asCard = (v: string | null): FundCardKey | null => (v && (cards as readonly string[]).includes(v) ? (v as FundCardKey) : null)
  return (q: URLSearchParams): FundStep => {
    const id = q.get('id')
    if (id) return { kind: 'record', id, from: asCard(q.get('from')) }
    const card = asCard(q.get('f'))
    if (card) return { kind: 'list', card }
    return { kind: 'hub' }
  }
}

/** Where a step lives (its query), and the step above it. */
export function searchOfStep(step: FundStep): string {
  if (step.kind === 'record') return `id=${encodeURIComponent(step.id)}${step.from ? `&from=${step.from}` : ''}`
  if (step.kind === 'list') return `f=${step.card}`
  return ''
}
export function parentSearch(step: FundStep): string {
  if (step.kind === 'record') return step.from ? `f=${step.from}` : ''
  return ''
}

export interface FundAppCan extends FundCan {
  /** Treasury · Create — Create fund out / Record fund in. */
  create: boolean
  /** Fund OUT: Reports, and Loan Aging's page open to this reader. */
  loanAging?: boolean
  /** Fund OUT: Treasury · Export — the loans' CSV. */
  export?: boolean
}

type Sheet =
  | { kind: 'repay' }
  | { kind: 'funding' }
  | { kind: 'start' }
  | { kind: 'notes' }
  | { kind: 'void'; id: string; label: string }
  | { kind: 'revert'; from: string }

export default function FundApp({
  side,
  records,
  month,
  today,
  search,
  can,
  page: initialPage,
  refused: initialRefused,
}: {
  side: FundSide
  records: FundRecord[]
  /** The office's month, `YYYY-MM` — the hero's. */
  month: string
  /** The office's day. */
  today: string
  /** The address's query as the server read it (a refresh, a link). */
  search: string
  can: FundAppCan
  /** The deal the address names, read with the page. */
  page: DealPage | null
  refused: string | null
}) {
  const router = useRouter()
  const out = side === 'out'
  const hub = out ? 'fund-out' : 'fund-in'
  const base = out ? '/fund-out' : '/fund-in'
  const read = useMemo(() => readFundStep(out ? OUT_CARDS : IN_CARDS), [out])
  const [step, open, back] = useStep(read, search)
  const { topTabs, swipe } = useHubTabs('fund', hub)

  const go = (next: FundStep) => open(searchOfStep(next))
  const backTo = () => back(parentSearch(step))

  // ── The deal a record screen shows, as its page reads it ──
  const [page, setPage] = useState<DealPage | null>(initialPage)
  const [refused, setRefused] = useState<string | null>(initialRefused)
  const load = useCallback(
    (id: string) => {
      setRefused(null)
      const fail = (reason: string) => {
        setPage(null)
        setRefused(reason)
      }
      const read: Promise<{ ok: true; page: DealPage } | { ok: false; reason: string }> = out
        ? openLoanPage(id).then((res) => (res.ok ? { ok: true, page: { side: 'out', loan: res.page } } : res))
        : openSourcePage(id).then((res) => (res.ok ? { ok: true, page: { side: 'in', source: res.page } } : res))
      void read.then(
        (res) => (res.ok ? setPage(res.page) : fail(res.reason)),
        () => fail(out ? 'This loan could not be read just now. Try again.' : 'This fund source could not be read just now. Try again.'),
      )
    },
    [out],
  )
  const recordId = step.kind === 'record' ? step.id : null
  const pageId = page ? (page.side === 'out' ? page.loan.id : page.source.id) : null
  useEffect(() => {
    if (!recordId || pageId === recordId) return
    setPage(null)
    load(recordId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId])
  // A step taken refreshes the list — the open deal's page is read again with it.
  const shownRecords = useRef(records)
  useEffect(() => {
    if (shownRecords.current === records) return
    shownRecords.current = records
    if (recordId) load(recordId)
  }, [records, recordId, load])

  // ── Windows ──
  const [making, setMaking] = useState(false)
  const [menu, setMenu] = useState<'hub' | 'record' | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [cancelAsk, setCancelAsk] = useState<'withdraw' | 'cancel' | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState<Record<string, string>>({})
  const [openChange, setOpenChange] = useState<string | null>(null)

  const done = (message: string) => {
    flash(message)
    router.refresh()
  }

  // ── The hub's own steps ──
  const goLoanAging = () => {
    setIntent('tab')
    router.push(HUB_HREF.loan)
  }
  const exportCsv = async () => {
    setMenu(null)
    try {
      const csv = await exportLoansCSV()
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `loan-portfolio-${today}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Export failed')
    }
  }
  const makeBtn: BarButton | null = can.create ? { key: 'create', label: out ? 'Create fund out' : 'Record fund in', kind: 'primary', onClick: () => setMaking(true) } : null

  // ── The deal on screen, as its page reads it, and its ⋯ — Request cancellation (an active deal; a loan's shut,
  // saying why, once a repayment is recorded) ──
  const recordOn = step.kind === 'record' ? (records.find((x) => x.id === step.id) ?? null) : null
  const loanOn = step.kind === 'record' && page?.side === 'out' && page.loan.id === step.id ? page.loan : null
  const sourceOn = step.kind === 'record' && page?.side === 'in' && page.source.id === step.id ? page.source : null
  const dealOn = loanOn ?? sourceOn
  const cancelShut = loanOn && loanOn.status === 'active' && loanOn.repayments.length > 0 ? `${plural(loanOn.repayments.length, 'repayment', 'repayments')} recorded — reverse those first` : null
  const recordMore: DialogMenuItem[] =
    can.void && dealOn?.status === 'active' && !dealOn.pendingCancel
      ? [
          {
            key: 'cancel',
            label: 'Request cancellation',
            danger: true,
            disabled: !!cancelShut,
            sub: cancelShut ?? undefined,
            onClick: () => {
              setMenu(null)
              setCancelAsk('cancel')
            },
          },
        ]
      : []

  // ── The screens ──
  let screen: ReactNode
  if (step.kind === 'record') {
    const r = recordOn
    const loan = loanOn
    const source = sourceOn
    const fromTitle = step.from ? cardLabel(side, step.from) : HUB_TITLE[hub]
    const status = dealOn?.status ?? r?.status ?? null
    const live = status === 'active' || status === 'matured'
    const recordable = loan ? loan.can.recordRepayment : !!source?.repay
    const amendable = can.amend && status === 'active'
    const mayEdit = loan ? loan.can.edit : !!source?.can.financeEdit
    const pendingCancel = dealOn?.pendingCancel ?? null

    const toggleMinPay = async () => {
      const deal = loan ?? source
      if (busy || !deal) return
      setBusy(true)
      const next = !deal.minPayInterest
      try {
        const res = out ? await setLoanMinPayInterest(deal.id, next) : await setFundSourceMinPayInterest(deal.id, next)
        if (res?.error) flash(res.error)
        else done(next ? 'Minimum pay interest turned on' : 'Minimum pay interest turned off')
      } catch (err) {
        flash(err instanceof Error ? err.message : 'That did not go through. Try again.')
      } finally {
        setBusy(false)
      }
    }

    // The record's steps: a pending deal's (the drawer's — Open in Approvals, Edit, Cancel / Withdraw); a live
    // one's — Record repayment, Amend terms, and Request cancellation in the ⋯.
    const bar: BarButton[] = []
    if (r && status === 'pending_approval') {
      for (const st of fundSteps(r, can)) {
        bar.push(
          st.href
            ? { key: st.key, label: st.label, kind: st.kind === 'secondary' ? undefined : st.kind, href: st.href }
            : { key: st.key, label: st.label, kind: 'danger', onClick: () => setCancelAsk('withdraw') },
        )
      }
    } else if ((loan || source) && live) {
      if (recordable) bar.push({ key: 'repay', label: 'Record repayment', kind: 'primary', onClick: () => setSheet({ kind: 'repay' }) })
      if (amendable) bar.push({ key: 'amend', label: 'Amend terms', href: `${base}/${step.id}/edit` })
      if (recordMore.length > 0) bar.push({ key: 'more', label: '⋯', kind: 'more', onClick: () => setMenu('record') })
    }

    const more: ReactNode =
      loan || source ? (
        <DealSections
          plan={(loan ?? source)!.plan}
          cancelled={status === 'cancelled'}
          repayments={
            loan
              ? loan.repayments.map((x) => ({
                  key: x.id,
                  label: `${cap(x.type)} · ${fd(x.date)}`,
                  sub: x.notes ?? undefined,
                  value: f2(x.amount),
                  action: loan.can.void ? { label: 'Void', onClick: () => setSheet({ kind: 'void', id: x.id, label: `${x.type} RM ${f2(x.amount)} · ${fd(x.date)}` }) } : null,
                }))
              : source!.repayments.map((x) => ({
                  key: x.id,
                  label: `${cap(x.type)} · ${fd(x.date)}`,
                  sub: [x.voucherNo, x.notes].filter(Boolean).join(' · ') || undefined,
                  value: f2(x.amount),
                }))
          }
          segments={(loan ?? source)!.termsSegments}
          changes={(loan ?? source)!.termsChanges}
          openChange={openChange}
          onToggleChange={(from) => setOpenChange((v) => (v === from ? null : from))}
          onRevert={can.amend && status === 'active' ? (from) => setSheet({ kind: 'revert', from }) : null}
          settings={[
            ...(loan
              ? [{ key: 'funding', label: 'Funding source', value: loan.fundingSource ? `SC ${loan.fundingSource}` : '—', action: mayEdit ? { label: 'Edit', onClick: () => setSheet({ kind: 'funding' }) } : null }]
              : []),
            {
              key: 'start',
              label: 'Repayment starts',
              value: (loan ?? source)!.start.date ? fd((loan ?? source)!.start.date) : '—',
              sub: (loan ?? source)!.start.set ? undefined : 'the month after, by default',
              action: mayEdit ? { label: 'Edit', onClick: () => setSheet({ kind: 'start' }) } : null,
            },
            {
              key: 'minpay',
              label: 'Minimum pay interest',
              chip: (loan ?? source)!.minPayInterest ? { text: 'on', tone: 'ledger' as const } : { text: 'off', tone: 'def' as const },
              action: mayEdit ? { label: (loan ?? source)!.minPayInterest ? 'Turn off' : 'Turn on', off: busy, onClick: () => void toggleMinPay() } : null,
            },
          ]}
          notes={
            source
              ? { text: source.notes, action: mayEdit ? { label: 'Edit', onClick: () => setSheet({ kind: 'notes' }) } : null }
              : null
          }
          pendingCancel={live ? pendingCancel : null}
        />
      ) : (
        <div className={d.loading}>{refused ?? 'Loading…'}</div>
      )

    screen = (
      <AppScreen
        screenKey={`${hub}?${searchOfStep(step)}`}
        head={{ kind: 'back', title: r?.party ?? loan?.companyName ?? source?.fromLabel ?? (out ? 'Loan' : 'Fund source'), backLabel: fromTitle, onBack: backTo }}
        actions={status && status !== 'cancelled' ? [{ key: 'print', label: 'Print', href: `${base}/${step.id}?print=1` }] : []}
        bar={bar}
      >
        {r ? (
          <FundDetailBody r={r} today={today} more={more} audit={(loan ?? source)?.audit ?? null} />
        ) : (
          <div className={d.loading}>{refused ?? 'This is not on the list any more.'}</div>
        )}
      </AppScreen>
    )
  } else if (step.kind === 'list') {
    const card = step.card
    const title = cardLabel(side, card)
    const q = (query[card] ?? '').trim().toLowerCase()
    const amountOf = cardAmountOf(card)
    const rows = records
      .filter((r) => onFundCard(r, card) && (!q || fundHaystack(r).includes(q)))
      .sort((a, b) => (b.date ?? b.createdAt.slice(0, 10)).localeCompare(a.date ?? a.createdAt.slice(0, 10)))
    const total = rows.reduce((t, r) => t + amountOf(r), 0)
    screen = (
      <AppScreen screenKey={`${hub}?f=${card}`} head={{ kind: 'back', title, backLabel: HUB_TITLE[hub], onBack: backTo }} bar={makeBtn ? [makeBtn] : []}>
        <PageHead roman="II." eyebrow={`Fund · ${HUB_TITLE[hub]}`} title={title} />
        <SearchRow value={query[card] ?? ''} onChange={(v) => setQuery((prev) => ({ ...prev, [card]: v }))} placeholder="Search company, description…" />
        <ListBlock
          title={out ? 'Transfers out' : 'Transfers in'}
          count={`${rows.length} · ${rm(total)}`}
          empty={rows.length === 0 ? (records.length === 0 ? (out ? 'No loans yet.' : 'No fund sources yet.') : 'Nothing here yet.') : null}
        >
          {rows.map((r) => (
            <Row
              key={r.id}
              title={r.party}
              desc={fundLine(r)}
              amount={`${out ? '−' : '+'}${f2(r.amount)}`}
              tone={r.status === 'cancelled' ? 'void' : out ? 'out' : 'ledger'}
              onClick={() => go({ kind: 'record', id: r.id, from: card })}
            />
          ))}
        </ListBlock>
      </AppScreen>
    )
  } else {
    const [y, m] = month.split('-').map(Number)
    const hubBar: BarButton[] = [
      ...(makeBtn ? [makeBtn] : []),
      ...(out && can.loanAging ? [{ key: 'aging', label: 'Loan aging', onClick: goLoanAging } as BarButton] : []),
      ...(out && can.export ? [{ key: 'more', label: '⋯', kind: 'more', onClick: () => setMenu('hub') } as BarButton] : []),
    ]
    screen = (
      <AppScreen screenKey={HUB_HREF[hub]} head={{ kind: 'bare' }} topTabs={topTabs} bar={hubBar} root onSwipe={swipe}>
        <BankHero value={rm(movedInMonth(records, month))} label={`${out ? 'Fund out' : 'Fund in'} · ${MONTHS[m - 1]} ${y}`} />
        <StackCards cards={fundCards(side, records)} onOpen={(k) => go({ kind: 'list', card: k as FundCardKey })} />
      </AppScreen>
    )
  }

  return (
    <>
      {screen}

      {out ? (
        can.create ? <CreateFundOutDialog open={making} onClose={() => setMaking(false)} onSaved={done} today={today} /> : null
      ) : can.create ? (
        <RecordFundInDialog open={making} onClose={() => setMaking(false)} onSaved={done} today={today} />
      ) : null}

      <FinDialog open={menu === 'hub'} onClose={() => setMenu(null)} title="Fund OUT">
        <DialogMenu items={[{ key: 'csv', label: 'Export CSV', onClick: () => void exportCsv() }]} />
      </FinDialog>
      <FinDialog open={menu === 'record'} onClose={() => setMenu(null)} title={recordOn?.party ?? (out ? 'Loan' : 'Fund source')}>
        <DialogMenu items={recordMore} />
      </FinDialog>

      {loanOn ? (
        <>
          {loanOn.can.recordRepayment ? (
            <LoanRepaymentSheet open={sheet?.kind === 'repay'} onClose={() => setSheet(null)} onDone={done} loanId={loanOn.id} outstanding={loanOn.outstanding} today={today} />
          ) : null}
          <FundingSourceSheet key={`fs:${loanOn.fundingSource ?? ''}`} open={sheet?.kind === 'funding'} onClose={() => setSheet(null)} onDone={done} loanId={loanOn.id} current={loanOn.fundingSource} />
          <RepaymentStartSheet
            key={`st:${loanOn.start.set ? loanOn.start.date : ''}`}
            open={sheet?.kind === 'start'}
            onClose={() => setSheet(null)}
            onDone={done}
            side="out"
            id={loanOn.id}
            current={loanOn.start.set ? loanOn.start.date : null}
            min={loanOn.disbursementDate}
            today={today}
          />
          {sheet?.kind === 'void' ? (
            <VoidRepaymentDialog open onClose={() => setSheet(null)} onDone={() => done('Repayment voided — its entry, bank and pool reversed')} repaymentId={sheet.id} loanId={loanOn.id} label={sheet.label} />
          ) : null}
        </>
      ) : null}
      {sourceOn ? (
        <>
          {sourceOn.repay ? (
            <SourceRepaymentSheet
              open={sheet?.kind === 'repay'}
              onClose={() => setSheet(null)}
              onDone={(v) => {
                flash(`${v.voucherNo} saved as draft — send it for approval`)
                pushIntent()
                router.push(`${HUB_HREF.payments}?id=${encodeURIComponent(v.id)}`)
              }}
              sourceId={sourceOn.id}
              repay={sourceOn.repay}
              today={today}
            />
          ) : null}
          <RepaymentStartSheet
            key={`st:${sourceOn.start.set ? sourceOn.start.date : ''}`}
            open={sheet?.kind === 'start'}
            onClose={() => setSheet(null)}
            onDone={done}
            side="in"
            id={sourceOn.id}
            current={sourceOn.start.set ? sourceOn.start.date : null}
            min={sourceOn.effectiveDate}
            today={today}
          />
          <NotesSheet key={`nt:${sourceOn.notes ?? ''}`} open={sheet?.kind === 'notes'} onClose={() => setSheet(null)} onDone={done} sourceId={sourceOn.id} current={sourceOn.notes} />
        </>
      ) : null}
      {(loanOn || sourceOn) && sheet?.kind === 'revert' ? (
        <RevertTermsDialog
          open
          onClose={() => setSheet(null)}
          onDone={() => done(`The change from ${sheet.from} reverted`)}
          kind={out ? 'loan' : 'fund_source'}
          recordId={(loanOn ?? sourceOn)!.id}
          latestFrom={sheet.from}
        />
      ) : null}
      {recordOn ? (
        <DealCancelSheet
          ask={cancelAsk}
          onClose={() => setCancelAsk(null)}
          onDone={(message, gone) => {
            flash(message)
            if (gone) backTo()
            router.refresh()
          }}
          side={side}
          id={recordOn.id}
          party={recordOn.party}
          amount={recordOn.amount}
        />
      ) : null}
    </>
  )
}

/**
 * What a deal's full page adds to the drawer's parts, numbered on from them: IV the repayment schedule, V the
 * repayments as recorded, VI the terms over time (each change opens onto its months), VII the repayment
 * settings, VIII a fund source's notes, and a cancellation filed.
 */
function DealSections({
  plan,
  cancelled,
  repayments,
  segments,
  changes,
  openChange,
  onToggleChange,
  onRevert,
  settings,
  notes,
  pendingCancel,
}: {
  plan: RepaymentPlan
  cancelled: boolean
  repayments: ItemLine[]
  segments: TermsSegment[]
  changes: TermsChangeComparison[]
  openChange: string | null
  onToggleChange: (from: string) => void
  /** Revert the latest change (Treasury · Approve, an active deal). */
  onRevert: ((from: string) => void) | null
  settings: ItemLine[]
  notes: { text: string | null; action: ItemLine['action'] } | null
  pendingCancel: { by: string; at: string } | null
}) {
  const romans = ['IV.', 'V.', 'VI.', 'VII.', 'VIII.', 'IX.']
  let n = 0
  const next = () => romans[n++] ?? ''

  const schedule: ItemLine[] = plan.rows.map((row) => ({
    key: `n${row.no}`,
    label: `${row.no} · ${fd(row.due)}`,
    sub: row.remark || (row.principal === null ? `interest ${f2(row.interest)}` : `principal ${f2(row.principal)} · interest ${f2(row.interest)}`),
    value: f2(row.installment),
    tone: row.tone === 'ledger' ? 'ledger' : row.tone === 'danger' ? 'out' : row.tone === 'alert' ? 'alert' : null,
  }))

  const changed = segments.some((sg) => sg.changed)
  const latest = changes.length > 0 ? changes[changes.length - 1].fromYM : null
  const terms: ItemLine[] = changed
    ? [
        ...segments.map((sg, i) => ({
          key: `seg:${sg.fromYM}`,
          label: `${sg.fromYM} → ${sg.toYM ?? (sg.compounding ? 'open' : (sg.scheduledEndYM ?? 'open'))}`,
          sub: segmentLine(sg, i),
          chip: i === segments.length - 1 ? { text: 'current', tone: 'ledger' as const } : null,
        })),
        ...changes.flatMap((c) => {
          const compounding = c.rows.length === 0
          const perMonth = c.new.interestPerMonth - c.old.interestPerMonth
          const head: ItemLine = {
            key: `chg:${c.fromYM}`,
            label: `Change from ${c.fromYM}`,
            sub: `rate ${pct(c.old.rate)} → ${pct(c.new.rate)} · ${compounding ? 'compounding' : `difference ${perMonth < 0 ? '−' : '+'}RM ${f2(Math.abs(perMonth))} /mo`}`,
            onOpen: compounding ? undefined : () => onToggleChange(c.fromYM),
            action: onRevert && c.fromYM === latest ? { label: 'Revert', onClick: () => onRevert(c.fromYM) } : null,
          }
          const months: ItemLine[] =
            openChange === c.fromYM && !compounding
              ? c.rows.map((mr) => ({
                  key: `chg:${c.fromYM}:${mr.ym}`,
                  label: mr.ym,
                  sub: `interest ${f2(mr.oldInterest)} → ${f2(mr.newInterest)}`,
                  value: signed(mr.diffInterest),
                  tone: Math.abs(mr.diffInterest) < 0.005 ? ('muted' as const) : null,
                }))
              : []
          return [head, ...months]
        }),
      ]
    : []

  return (
    <>
      <RecordItems roman={next()} title="Repayment schedule" count={scheduleCount(plan)} items={schedule} empty={cancelled ? 'Cancelled — no schedule.' : 'No installments yet.'} />
      {repayments.length > 0 ? <RecordItems roman={next()} title="Repayments recorded" count={String(repayments.length)} items={repayments} /> : null}
      {changed ? <RecordItems roman={next()} title="Terms over time" count={plural(changes.length, 'change', 'changes')} items={terms} /> : null}
      <RecordItems roman={next()} title="Repayment settings" items={settings} />
      {notes ? <RecordItems roman={next()} title="Notes" items={[{ key: 'notes', label: notes.text || 'No notes', action: notes.action }]} /> : null}
      {pendingCancel ? (
        <RecordItems roman={next()} title="Cancellation" items={[{ key: 'requested', label: `Requested by ${pendingCancel.by}`, sub: pendingCancel.at, chip: { text: 'waiting for Principal', tone: 'wait' } }]} />
      ) : null}
    </>
  )
}
