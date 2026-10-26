'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { flash } from '@/components/hrv/toast'
import { drawerStyles as d } from '@/components/finv/Drawer'
import { fd } from '@/components/finv/DrawerParts'
import { officeTime } from '@/lib/office-time'
import { HUB_HREF } from '@/lib/fin-app/routes'
import { openInvoicePage } from '@/app/(portal)/statements/page-actions'
import type { InvoicePageData } from '@/app/(portal)/invoices/[id]/_lib/invoice-page'
import { InvoiceDetailBody, InvoiceHero, invoiceSteps, type InvoiceBodyExtras, type InvoiceCan } from '@/app/(portal)/statements/_components/InvoiceDrawer'
import { PayrollBasisBody } from '@/app/(portal)/statements/_components/PayrollBasisDrawer'
import { useInvoiceWork } from '@/app/(portal)/statements/_components/invoice-work'
import CreatePaymentDialog, { type PaymentPreset } from '@/app/(portal)/payments/_components/CreatePaymentDialog'
import { openInvoiceRefund } from '@/app/(portal)/payments/create-actions'
import { SettleReceiptSheet } from './InvoiceSheets'
import { mktSummary } from '@/app/(portal)/statements/_lib/marketing-lines'
import { INVOICE_CARD, invoiceCards, isStatusCard } from '@/app/(portal)/statements/_lib/invoice-cards'
import {
  invoicedTotal,
  onCard,
  returnedNote,
  settleSelection,
  type HubCreditNote,
  type HubInvoice,
  type InvoiceCardKey,
  type InvoiceHubData,
  type StatusCardKey,
} from '@/app/(portal)/statements/_lib/invoice-model'
import AppScreen, { PageHead, type BarButton, type BulkBar } from './AppScreen'
import { useHubTabs } from './hub-tabs'
import { useStep } from './nav'
import { BankHero, ItemGroup, ListBlock, MonthNav, Row, SearchRow, StackCards, type ChipTone, type ItemLine } from './parts'
import s from './fin-app.module.css'

// Daily › Invoice in the Finance phone app (2026-10-15, the Finance revamp v2's
// phone — M10–M11): the hub (its top tabs, the month's total under its month
// pill, a stacked card per list, Create invoice ▾ · Payroll ▾ · Export ▾), a
// card's list (its month, search and *Select* — tick one payer's issued
// invoices, a dark bar settles them on one receipt), the credit notes,
// Marketing's billing lines and non-billable lines, the payroll basis, and an
// invoice — the drawer's parts with what the full page adds, since on a phone
// this screen is the invoice's page. Every figure is the desktop hub's
// (`loadInvoiceHub`, `invoiceCards`), every step and window the desktop's
// (`useInvoiceWork`), its windows rising as sheets.

export type InvoiceStep =
  | { kind: 'hub' }
  | { kind: 'list'; card: StatusCardKey }
  | { kind: 'items'; card: 'cn' | 'mkt' | 'nonbill' }
  | { kind: 'basis' }
  | { kind: 'record'; id: string; from: InvoiceCardKey | null }

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const CARDS: readonly string[] = ['all', 'issued', 'paid', 'draft', 'voided', 'cn', 'mkt', 'nonbill']
const asCard = (v: string | null): InvoiceCardKey | null => (v && CARDS.includes(v) ? (v as InvoiceCardKey) : null)

export function readInvoiceStep(q: URLSearchParams): InvoiceStep {
  const id = q.get('id')
  if (id) return { kind: 'record', id, from: asCard(q.get('from')) }
  const f = q.get('f')
  if (f === 'basis') return { kind: 'basis' }
  const card = asCard(f)
  if (card && isStatusCard(card)) return { kind: 'list', card }
  if (card === 'cn' || card === 'mkt' || card === 'nonbill') return { kind: 'items', card }
  return { kind: 'hub' }
}

/** Where a step lives (its query, the month's beside it), and the step above it. */
export function searchOfStep(step: InvoiceStep): string {
  if (step.kind === 'record') return `id=${encodeURIComponent(step.id)}${step.from ? `&from=${step.from}` : ''}`
  if (step.kind === 'list' || step.kind === 'items') return `f=${step.card}`
  if (step.kind === 'basis') return 'f=basis'
  return ''
}
export function parentSearch(step: InvoiceStep): string {
  if (step.kind === 'record') return step.from ? `f=${step.from}` : ''
  return ''
}

/** The month's place in the address: none for the office's own month. */
const monthQuery = (ym: string, thisMonth: string) => (ym === thisMonth ? '' : `m=${ym}`)
const join = (...parts: string[]) => parts.filter(Boolean).join('&')

/** A credit note's state, as the design's item lists chip it. */
const CN_TONE: Record<string, ChipTone> = { draft: 'accent', approved: 'ledger', voided: 'def' }

export default function InvoiceApp({
  hub,
  can,
  search,
  today,
  thisMonth,
  record: initialRecord,
  refused: initialRefused,
}: {
  hub: InvoiceHubData
  can: InvoiceCan
  /** The address's query as the server read it (a refresh, a link). */
  search: string
  /** The office's today, `YYYY-MM-DD`. */
  today: string
  /** The office's month, `YYYY-MM`. */
  thisMonth: string
  /** The invoice the address names, read with the page. */
  record: InvoicePageData | null
  refused: string | null
}) {
  const router = useRouter()
  const [step, open, back] = useStep(readInvoiceStep, search)
  const { topTabs, swipe } = useHubTabs('daily', 'invoices')

  // ── The month on show ──
  const month = hub.period.slice(0, 7)
  const [yy, mm] = month.split('-').map(Number)
  const monthLong = `${MONTH[mm - 1]} ${yy}`
  const monthShort = `${MON[mm - 1]} ${yy}`
  const mq = monthQuery(month, thisMonth)
  const shift = (n: number) => {
    const t = new Date(Date.UTC(yy, mm - 1 + n, 1))
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
  }
  const [pending, startMonth] = useTransition()
  const [goingTo, setGoingTo] = useState<string | null>(null)
  /** Another month: the server reads it; this step stays (a list stays a list). */
  const goMonth = (ym: string, at: InvoiceStep = step) => {
    setGoingTo(ym)
    const q = join(monthQuery(ym, thisMonth), at.kind === 'record' ? '' : searchOfStep(at))
    startMonth(() => router.replace(`${HUB_HREF.invoices}${q ? `?${q}` : ''}`, { scroll: false }))
  }
  const shownMonth = goingTo && pending ? goingTo : month
  const shownLong = `${MONTH[Number(shownMonth.slice(5, 7)) - 1]} ${shownMonth.slice(0, 4)}`

  const go = (next: InvoiceStep) => open(join(mq, searchOfStep(next)))
  const backTo = () => back(join(mq, parentSearch(step)))

  // Back from the voucher page (a department pool's settle by netting, a refund) with the voucher it wrote.
  useEffect(() => {
    const url = new URL(window.location.href)
    const no = url.searchParams.get('receipt')
    if (!no) return
    flash(returnedNote(no))
    url.searchParams.delete('receipt')
    // null: Next takes the address as its own (nav.ts), so its next update does not bring ?receipt= back.
    window.history.replaceState(null, '', url.toString())
  }, [])

  // ── The invoice a record screen shows: the hub's, and the page read for it ──
  const [page, setPage] = useState<InvoicePageData | null>(initialRecord)
  const [refused, setRefused] = useState<string | null>(initialRefused)
  const load = useCallback((id: string) => {
    setRefused(null)
    void openInvoicePage(id).then(
      (res) => {
        if (res.ok) setPage(res.page)
        else {
          setPage(null)
          setRefused(res.reason)
        }
      },
      () => {
        setPage(null)
        setRefused('This invoice could not be read just now. Try again.')
      },
    )
  }, [])
  const recordId = step.kind === 'record' ? step.id : null
  useEffect(() => {
    if (!recordId || page?.invoice.id === recordId) return
    setPage(null)
    load(recordId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId])
  // A step taken refreshes the hub — the open invoice's page is read again with it (its trail, its audit log).
  const shownHub = useRef(hub)
  useEffect(() => {
    if (shownHub.current === hub) return
    shownHub.current = hub
    if (recordId) load(recordId)
  }, [hub, recordId, load])

  const all = useMemo(() => {
    const m = new Map([...hub.invoices, ...hub.otherOpen].map((i) => [i.id, i]))
    if (page && !m.has(page.invoice.id)) m.set(page.invoice.id, page.invoice)
    return m
  }, [hub, page])

  // ── Select: one payer's invoices on one receipt ──
  const listCard = step.kind === 'list' ? step.card : null
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [others, setOthers] = useState(false)
  const [query, setQuery] = useState<Record<string, string>>({})
  useEffect(() => {
    setSelecting(false)
    setSelected(new Set())
    setOthers(false)
  }, [listCard])
  const withOthers = others && selecting && (listCard === 'all' || listCard === 'issued') && hub.otherOpen.length > 0
  const ticked = [...selected].map((id) => all.get(id)).filter((i): i is HubInvoice => !!i && (!i.other || withOthers))
  const sel = settleSelection(ticked)
  const canTick = (i: HubInvoice) => i.settleable || i.voidable
  const mayTick = (can.create || can.void || can.docExport) && (listCard === 'all' || listCard === 'issued')

  // ── The voucher page's work, as sheets (part E4b): a pool's settle by netting, a paid invoice's refund,
  // a non-billable expense ──
  const [settleFor, setSettleFor] = useState<HubInvoice | null>(null)
  const [payment, setPayment] = useState<{ key: string; preset: PaymentPreset } | null>(null)
  const [paying, setPaying] = useState(false)
  const startRefund = (inv: HubInvoice) => {
    void openInvoiceRefund(inv.id).then(
      (res) => {
        if (!res.ok) return flash(res.reason)
        const r = res.preset
        setPayment({
          key: `refund:${inv.id}`,
          preset: { title: 'Refund payment', payee: r.company_name, companyId: r.company_id, amount: r.amount, description: `Refund invoice ${r.invoice_no ?? ''} — ${r.company_name}` },
        })
        setPaying(true)
      },
      () => flash('The invoice could not be read. Try again.'),
    )
  }

  // Copy lands in this month's list: the record steps aside for it (see goMonth below).
  const leaving = useRef(false)
  const work = useInvoiceWork({
    hub,
    can,
    today,
    thisMonth,
    all,
    here: HUB_HREF.invoices,
    onOpen: (id) => go({ kind: 'record', id, from: step.kind === 'list' || step.kind === 'items' ? step.card : null }),
    onGone: () => {
      leaving.current = true
      queueMicrotask(() => {
        if (!leaving.current) return
        leaving.current = false
        if (step.kind === 'record') backTo()
      })
    },
    goMonth: (ym) => {
      leaving.current = false
      goMonth(ym, { kind: 'list', card: 'draft' })
    },
    ticked,
    onDoneWith: (ids, settled) => {
      if (settled) {
        setSelected(new Set())
        setSelecting(false)
        return
      }
      setSelected((prev) => {
        const next = new Set(prev)
        for (const id of ids) next.delete(id)
        return next
      })
    },
    onBasis: () => go({ kind: 'basis' }),
    onVoucher: (key, inv) => (key === 'settle_netting' ? setSettleFor(inv) : startRefund(inv)),
  })

  const toggle = (i: HubInvoice) => {
    if (!canTick(i)) {
      flash('Only issued invoices can be settled')
      return
    }
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i.id)) next.delete(i.id)
      else next.add(i.id)
      return next
    })
  }
  const settleTicked = () => {
    if (sel.payees > 1) return flash('One receipt can only settle one company’s invoices')
    if (sel.settleable.length === 0) return flash('Only issued invoices can be settled')
    work.settle(sel.settleable.map((i) => i.id))
  }

  // ── The hub's own bar ──
  const hubBar: BarButton[] = [
    ...(can.create ? [{ key: 'create', label: 'Create invoice ▾', kind: 'primary' as const, onClick: () => work.openMenu('create') }] : []),
    { key: 'payroll', label: 'Payroll ▾', onClick: () => work.openMenu('payroll') },
    ...(work.exportItems.length > 0 ? [{ key: 'export', label: 'Export ▾', onClick: () => work.openMenu('export') }] : []),
  ]
  const monthPill = { label: shownLong, prev: () => goMonth(shift(-1)), next: () => goMonth(shift(1)) }

  // ── The screens ──
  let screen: ReactNode
  if (step.kind === 'record') {
    const inv = all.get(step.id) ?? null
    const fromTitle = step.from ? (step.from === 'all' ? 'All' : INVOICE_CARD[step.from].label) : 'Invoices'
    const pageFor = page && page.invoice.id === step.id ? page : null
    const extras: InvoiceBodyExtras | null = pageFor
      ? {
          said: pageFor.said,
          period: pageFor.offMonth ? `${MONTH[Number(pageFor.invoice.periodMonth.slice(5, 7)) - 1]} ${pageFor.invoice.periodMonth.slice(0, 4)}` : null,
          address: pageFor.address,
          contact: pageFor.contact,
          createdBy: pageFor.createdBy,
          createdAt: pageFor.createdAt,
          trail: pageFor.trail,
          audit: pageFor.audit,
        }
      : null
    const steps = inv ? invoiceSteps(inv, can) : { bar: [], more: [] }
    const recordBar: BarButton[] = inv
      ? [
          ...steps.bar.map((st) => ({
            key: st.key,
            label: st.label,
            kind: st.kind,
            off: !!st.off,
            disabled: work.busy,
            onClick: () => (st.off ? flash(st.off) : work.onStep(st.key, inv)),
          })),
          ...(steps.more.length > 0 ? [{ key: 'more', label: '⋯', kind: 'more' as const, onClick: () => work.openMore(inv) }] : []),
        ]
      : []
    screen = (
      <AppScreen
        screenKey={`invoices?${searchOfStep(step)}`}
        head={{ kind: 'back', title: inv?.no ?? (inv ? 'Draft' : 'Invoice'), backLabel: fromTitle, onBack: backTo }}
        actions={inv && can.docExport ? [{ key: 'pdf', label: 'PDF', href: `/billing/invoice-doc?id=${inv.id}` }] : []}
        bar={recordBar}
      >
        {inv ? (
          <>
            <InvoiceDetailBody inv={inv} today={today} error={work.shownError} extras={extras} />
            {!extras ? <div className={d.loading}>{refused ?? 'Loading…'}</div> : null}
          </>
        ) : (
          <>
            {page && page.invoice.id === step.id ? <InvoiceHero inv={page.invoice} /> : null}
            <div className={d.loading}>{refused ?? 'Loading…'}</div>
          </>
        )}
      </AppScreen>
    )
  } else if (step.kind === 'basis') {
    screen = (
      <AppScreen screenKey="invoices?f=basis" head={{ kind: 'back', title: 'Payroll basis', backLabel: 'Invoices', onBack: backTo }}>
        <PageHead roman="I." eyebrow={`Invoices · ${monthLong}`} title="Payroll basis" />
        <PayrollBasisBody basis={hub.basis} department={hub.department} />
      </AppScreen>
    )
  } else if (step.kind === 'items') {
    const card = step.card
    const title = INVOICE_CARD[card].label
    let group: ReactNode
    let bar: BarButton[] = []
    if (card === 'cn') {
      const items: ItemLine[] = hub.creditNotes.map((cn: HubCreditNote) => ({
        key: cn.id,
        label: cn.no ?? 'Draft',
        sub: [cn.party, cn.reason].filter(Boolean).join(' · '),
        value: `−${f2(cn.amount)}`,
        tone: cn.status === 'voided' ? 'muted' : 'out',
        chip: { text: cn.status, tone: CN_TONE[cn.status] ?? 'def' },
        action:
          cn.status === 'draft' && can.approveCn
            ? { label: 'Approve', onClick: () => work.askCreditNote('cn-approve', cn) }
            : can.docExport
              ? { label: 'PDF', href: `/billing/credit-note-doc?id=${cn.id}`, newTab: true }
              : null,
        onOpen: () => work.openCreditNote(cn),
      }))
      group = <ItemGroup title="Credit notes" count={plural(hub.creditNotes.length, 'credit note', 'credit notes')} items={items} empty={`No credit notes in ${monthLong}.`} />
    } else if (card === 'mkt') {
      // Marketing billing (2026-10-26, ②b-2h): the lines Marketing's manager confirmed; Import puts those on no invoice
      // yet onto drafts.
      const mkt = mktSummary(hub.marketing)
      const items: ItemLine[] = hub.marketing.lines.map((l) => ({
        key: l.bill,
        label: l.words,
        sub: [l.party.name, l.track, l.account ? l.account.code : 'no account'].join(' · '),
        value: f2(l.amount),
        chip: l.invoice ? { text: l.invoice.status === 'paid_via_netting' ? 'paid via netting' : l.invoice.status, tone: 'ledger' } : { text: 'to import', tone: 'def' },
        action: l.invoice
          ? { label: 'Invoice', onClick: () => go({ kind: 'record', id: l.invoice!.id, from: 'mkt' }) }
          : { label: 'Invoice', off: true, onClick: () => flash('Not on an invoice yet — Create invoice ▾ › Import Marketing billing puts it on its draft.') },
      }))
      group = <ItemGroup title="Marketing billing" count={plural(mkt.lines, 'line', 'lines')} items={items} empty={`Nothing confirmed by Marketing for ${monthLong} yet.`} />
      if (can.create && mkt.toImport > 0) bar = [{ key: 'import', label: `Import · ${mkt.toImport}`, kind: 'primary', onClick: () => work.openDialog('marketing') }]
    } else {
      const items: ItemLine[] = hub.nonBillable.map((t) => ({
        key: t.id,
        label: t.description,
        sub: `${fd(officeTime(t.at).format('YYYY-MM-DD'))} · ${t.type.replace(/_/g, ' ')} · ${t.source}`,
        value: t.out ? f2(t.amount) : `+${f2(t.amount)}`,
        tone: t.out ? null : 'ledger',
      }))
      group = <ItemGroup title="Non-billable" count={plural(hub.nonBillable.length, 'transaction', 'transactions')} items={items} empty={`Nothing in ${monthLong} yet.`} />
      if (can.voucher)
        bar = [
          {
            key: 'new',
            label: '+ Add non-billable expense',
            kind: 'primary',
            // The voucher page's non-billable preset: Create payment, on the Venture Pool.
            onClick: () => {
              setPayment({ key: 'non-billable', preset: { title: 'Non-billable expense' } })
              setPaying(true)
            },
          },
        ]
    }
    screen = (
      <AppScreen screenKey={`invoices?f=${card}`} head={{ kind: 'back', title, backLabel: 'Invoices', onBack: backTo }} bar={bar}>
        <PageHead roman="I." eyebrow={`Invoices · ${monthLong}`} title={title} />
        <div className={pending ? s.pending : undefined}>{group}</div>
      </AppScreen>
    )
  } else if (step.kind === 'list') {
    const card = step.card
    const title = INVOICE_CARD[card].label
    const q = (query[card] ?? '').trim().toLowerCase()
    const base = withOthers ? [...hub.invoices, ...hub.otherOpen] : hub.invoices
    const rows = base.filter((i) => onCard(i, card) && (!q || `${i.no ?? ''} ${i.party.name} ${i.description} ${i.mode}`.toLowerCase().includes(q)))
    const listBar: BarButton[] =
      card === 'issued' && rows.some(canTick) && mayTick
        ? [{ key: 'select', label: 'Select to settle', kind: 'primary', onClick: () => setSelecting(true) }]
        : card === 'draft' && can.edit && work.drafts > 0
          ? [{ key: 'approve-all', label: `Approve all · ${work.drafts}`, kind: 'primary', onClick: work.askApproveMonth }]
          : []
    const bulk: BulkBar | null =
      selecting && ticked.length > 0
        ? {
            text: `${ticked.length} selected · ${rm(sel.total)}`,
            sub: sel.payees > 1 ? 'Different companies can’t be combined' : (sel.payer ?? (sel.voidable.length > 0 ? 'Void or print — nothing here settles on a receipt' : '')),
            label: can.create ? `Settle ${sel.settleable.length} →` : null,
            off: sel.payees !== 1,
            onClear: () => setSelected(new Set()),
            onGo: settleTicked,
          }
        : null
    screen = (
      <AppScreen
        screenKey={`invoices?f=${card}`}
        head={{ kind: 'back', title: card === 'all' ? 'All' : title, backLabel: 'Invoices', onBack: backTo }}
        // The design's bar holds Clear and Settle; what else the ticked can have done (Print, Void selected — ours) is the head's ⋯.
        actions={bulk && (can.docExport || can.void) ? [{ key: 'bulk', label: '⋯', onClick: () => work.openMenu('bulk') }] : []}
        bar={selecting ? [] : listBar}
        bulk={bulk}
      >
        <PageHead roman="I." eyebrow={`Invoices · ${monthLong}`} title={title} />
        <MonthNav label={shownLong} prev={() => goMonth(shift(-1))} next={() => goMonth(shift(1))} />
        <SearchRow
          value={query[card] ?? ''}
          onChange={(v) => setQuery((prev) => ({ ...prev, [card]: v }))}
          placeholder="Search invoice # / company / mode…"
          select={
            mayTick
              ? {
                  on: selecting,
                  toggle: () => {
                    setSelecting((v) => !v)
                    setSelected(new Set())
                  },
                }
              : null
          }
        />
        {/* Ours: another month's unsettled invoices, for one receipt across months — while selecting. */}
        {selecting && hub.otherOpen.length > 0 ? (
          <div className={s.toolRow}>
            <button type="button" className={s.toolChip} aria-pressed={others} onClick={() => setOthers((v) => !v)}>
              Other months · {hub.otherOpen.length}
            </button>
          </div>
        ) : null}
        <div className={pending ? s.pending : undefined}>
          <ListBlock
            title={title}
            count={`${rows.length} · ${monthShort}${withOthers ? ' + other months' : ''}`}
            empty={rows.length === 0 ? (hub.invoices.length === 0 && !withOthers ? `No invoices for ${monthLong} yet.` : 'No invoices here.') : null}
          >
            {rows.map((i) => (
              <Row
                key={i.id}
                title={i.party.name}
                desc={i.summary}
                amount={rm(i.total)}
                tone={i.status === 'voided' ? 'void' : null}
                tick={selecting ? { on: selected.has(i.id), can: canTick(i) } : null}
                onClick={selecting ? () => toggle(i) : () => go({ kind: 'record', id: i.id, from: card })}
              />
            ))}
          </ListBlock>
        </div>
      </AppScreen>
    )
  } else {
    const hero = invoicedTotal(hub.invoices)
    screen = (
      <AppScreen screenKey={HUB_HREF.invoices} head={{ kind: 'bare' }} topTabs={topTabs} bar={hubBar} root onSwipe={swipe}>
        <BankHero value={rm(hero.amount)} label={`Invoiced · ${plural(hero.count, 'invoice', 'invoices')}`} month={monthPill} />
        <div className={pending ? s.pending : undefined}>
          <StackCards
            cards={invoiceCards(hub)}
            onOpen={(k) => {
              const card = k as InvoiceCardKey
              go(isStatusCard(card) ? { kind: 'list', card } : { kind: 'items', card: card as 'cn' | 'mkt' | 'nonbill' })
            }}
          />
        </div>
      </AppScreen>
    )
  }

  return (
    <>
      {screen}
      {work.dialogs}
      <SettleReceiptSheet
        invoiceId={settleFor?.id ?? null}
        label={settleFor?.no ?? 'the invoice'}
        today={today}
        onClose={() => setSettleFor(null)}
        onDone={(no) => {
          flash(returnedNote(no))
          router.refresh()
        }}
      />
      {payment ? (
        <CreatePaymentDialog
          key={payment.key}
          open={paying}
          onClose={() => setPaying(false)}
          prefix={`HV-PV-${thisMonth.replace('-', '')}`}
          today={today}
          preset={payment.preset}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </>
  )
}
