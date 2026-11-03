'use client'

import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import RowMenu, { type RowMenuAnchor, type RowMenuItem } from '@/components/RowMenu'
import { BulkBar, BulkButton, HeadButton, HubCards, HubHead, ItemList, MonthNav, hubStyles as hs, type ItemRow } from '@/components/finv/Hub'
import { FinTable, type FinColumn } from '@/components/finv/FinTable'
import { fd } from '@/components/finv/DrawerParts'
import { officeTime } from '@/lib/office-time'
import { InvoiceDrawer, invoiceSteps, statusText, statusTone, type InvoiceCan, type InvoiceStep, type InvoiceStepKey } from './InvoiceDrawer'
import PayrollBasisDrawer from './PayrollBasisDrawer'
import { useInvoiceWork } from './invoice-work'
import { INVOICE_CARD, invoiceCards, isStatusCard } from '../_lib/invoice-cards'
import { invoicedTotal, onCard, returnedNote, settleSelection, type HubInvoice, type InvoiceCardKey, type InvoiceHubData } from '../_lib/invoice-model'
import { mktLineState, mktSummary } from '../_lib/marketing-lines'

// Invoice's hub (2026-10-14, the Finance revamp v2 — D10 of `.design/fin-r2/handoff`):
// the head (Create invoice ▾, Payroll ▾, Export ▾), the month's total with its
// month pill, a card a list — All invoices, Issued, Paid, Draft, Voided, then
// Credit notes, Marketing billing, Non-billable — the table with its column
// tools and *Select* (a dark bar at the foot settles one payer's invoices on
// one receipt), and the drawer an invoice opens. Every step is the system's
// own (Service Billing's actions, their rules and gates — `useInvoiceWork`,
// which the Finance phone app's Invoice screens share); what the design
// leaves out and the page had is kept, out of the way: another month's open
// invoices on the same receipt, a part payment, Print / Void selected, Approve
// all drafts, Copy, the payroll basis and Finance's department mode.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// The design's Name · Description · Amount, and its COLS.invoices to tick on (Category is ours, kept).
const COLUMNS: FinColumn<HubInvoice>[] = [
  { key: 'name', label: 'Name', kind: 'name', fixed: true, width: 180, min: 120, value: (r) => r.party.name.toLowerCase(), text: (r) => r.party.name },
  { key: 'desc', label: 'Description', kind: 'desc', fixed: true, width: 200, min: 120, value: (r) => r.summary.toLowerCase(), text: (r) => r.summary || '—' },
  { key: 'no', label: 'Invoice #', kind: 'no', width: 170, value: (r) => r.no ?? '', text: (r) => r.no ?? '—' },
  { key: 'date', label: 'Date', kind: 'date', width: 112, value: (r) => r.date ?? '', text: (r) => fd(r.date) },
  { key: 'due', label: 'Due', kind: 'date', width: 112, value: (r) => r.due ?? '', text: (r) => fd(r.due) },
  { key: 'mode', label: 'Billing mode', kind: 'text', width: 150, value: (r) => r.mode.toLowerCase(), text: (r) => r.mode },
  { key: 'cat', label: 'Category', kind: 'text', width: 130, value: (r) => (r.category ?? '').toLowerCase(), text: (r) => r.category ?? '—' },
  {
    key: 'status',
    label: 'Status',
    kind: 'chip',
    width: 112,
    value: (r) => r.status,
    text: (r) => statusText(r.status),
    chip: (r) => ({ text: statusText(r.status), tone: statusTone(r.status) }),
  },
  { key: 'amount', label: 'Amount', kind: 'amount', fixed: true, width: 130, value: (r) => r.total, text: (r) => rm(r.total) },
]

export default function InvoicesHubClient({
  hub,
  can,
  canSetDefault,
  today,
  thisMonth,
  initialCard,
  openNew,
}: {
  hub: InvoiceHubData
  can: InvoiceCan
  /** Finance and the Principal may make their arrangement everyone's default. */
  canSetDefault: boolean
  /** The office's today, `YYYY-MM-DD`. */
  today: string
  /** The office's month, `YYYY-MM`. */
  thisMonth: string
  initialCard: InvoiceCardKey
  /** `?new=1` — arrive with Create invoice open (the Overview's button). */
  openNew: boolean
}) {
  const router = useRouter()
  const month = hub.period.slice(0, 7)
  const [yy, mm] = month.split('-').map(Number)
  const monthLong = `${MONTH[mm - 1]} ${yy}`
  const monthShort = `${MON[mm - 1]} ${yy}`
  const shift = (n: number) => {
    const t = new Date(Date.UTC(yy, mm - 1 + n, 1))
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
  }
  const go = (ym: string) => router.push(`/statements?period=${ym}-01`)

  const [card, setCard] = useState<InvoiceCardKey>(initialCard)
  const [query, setQuery] = useState('')
  const [others, setOthers] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [basisOpen, setBasisOpen] = useState(false)
  const [rowMenu, setRowMenu] = useState<{ inv: HubInvoice; anchor: RowMenuAnchor } | null>(null)

  // The selection, the drawer and Select belong to the month on show.
  const [shownPeriod, setShownPeriod] = useState(hub.period)
  if (shownPeriod !== hub.period) {
    setShownPeriod(hub.period)
    setSelected(new Set())
    setSelecting(false)
    setDrawerId(null)
  }

  // The card in the URL, so a refresh or a link lands on it (no navigation: the lists are here).
  useEffect(() => {
    const url = new URL(window.location.href)
    if (card === 'all') url.searchParams.delete('status')
    else url.searchParams.set('status', card)
    if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, '', url.toString())
  }, [card])

  const all = useMemo(() => new Map([...hub.invoices, ...hub.otherOpen].map((i) => [i.id, i])), [hub])
  const status = isStatusCard(card) ? card : null
  const withOthers = others && selecting && (card === 'all' || card === 'issued') && hub.otherOpen.length > 0
  const q = query.trim().toLowerCase()
  const rows = useMemo(() => {
    if (!status) return []
    const base = withOthers ? [...hub.invoices, ...hub.otherOpen] : hub.invoices
    return base.filter((i) => onCard(i, status) && (!q || `${i.no ?? ''} ${i.party.name} ${i.description} ${i.mode}`.toLowerCase().includes(q)))
  }, [hub, status, withOthers, q])

  // ── Select: one payer's invoices on one receipt ──
  const canTick = (i: HubInvoice) => i.settleable || i.voidable
  const mayTick = (can.create || can.void || can.docExport) && (card === 'all' || card === 'issued')
  // Another month's invoice counts only while Other months shows it.
  const ticked = [...selected].map((id) => all.get(id)).filter((i): i is HubInvoice => !!i && (!i.other || withOthers))
  const sel = settleSelection(ticked)

  const work = useInvoiceWork({
    hub,
    can,
    today,
    thisMonth,
    all,
    here: '/statements',
    onOpen: setDrawerId,
    onGone: () => setDrawerId(null),
    goMonth: go,
    onRefused: (id) => {
      if (!drawerId) setDrawerId(id)
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
    onBasis: () => setBasisOpen(true),
  })

  // Arriving from the Overview's Create invoice (`?new=1`), or back from a department pool's settle (`?receipt=`).
  useEffect(() => {
    const url = new URL(window.location.href)
    const receipt = url.searchParams.get('receipt')
    const fresh = url.searchParams.get('new') === '1'
    if (receipt) flash(returnedNote(receipt))
    if (fresh && openNew && can.create) work.openDialog('new')
    if (receipt || url.searchParams.has('new')) {
      url.searchParams.delete('receipt')
      url.searchParams.delete('new')
      window.history.replaceState(window.history.state, '', url.toString())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── The cards: the month's ──
  const hero = invoicedTotal(hub.invoices)
  const drafts = work.drafts
  const cards = useMemo(() => invoiceCards(hub), [hub])
  const pickCard = (k: InvoiceCardKey) => {
    setCard(k)
    setSelecting(false)
    setSelected(new Set())
  }

  // ── Doing things: the hook's, with the row menu closed first ──
  const onStep = (key: InvoiceStepKey, inv: HubInvoice) => {
    setRowMenu(null)
    work.onStep(key, inv)
  }

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
  const toggleAll = (rs: HubInvoice[]) =>
    setSelected((prev) => {
      const allOn = rs.every((r) => prev.has(r.id))
      const next = new Set(prev)
      for (const r of rs) {
        if (allOn) next.delete(r.id)
        else next.add(r.id)
      }
      return next
    })
  const settleTicked = () => {
    if (sel.payees > 1) return flash('One receipt can only settle one company’s invoices')
    if (sel.settleable.length === 0) return flash('Only issued invoices can be settled')
    work.settle(sel.settleable.map((i) => i.id))
  }

  // ── The row menu: Open, a new tab, the invoice's PDF, then what the drawer offers ──
  const rowMenuItems = (inv: HubInvoice): RowMenuItem[] => {
    const { bar, more } = invoiceSteps(inv, can)
    const steps = [...bar, ...more]
    const item = (s: InvoiceStep): RowMenuItem => ({ key: s.key, label: s.label, hint: s.off ?? s.sub, danger: s.kind === 'danger', disabled: !!s.off, onSelect: () => onStep(s.key, inv) })
    const items: RowMenuItem[] = [
      { key: 'open', label: 'Open', onSelect: () => setDrawerId(inv.id) },
      { key: 'new-tab', label: 'Open in new tab', onSelect: () => window.open(`/invoices/${inv.id}`, '_blank', 'noopener,noreferrer') },
    ]
    if (can.docExport) items.push({ key: 'pdf', label: 'PDF', onSelect: () => window.open(`/billing/invoice-doc?id=${inv.id}`, '_blank', 'noopener,noreferrer') })
    const quiet = steps.filter((s) => s.kind !== 'danger')
    const loud = steps.filter((s) => s.kind === 'danger')
    if (quiet.length > 0) items.push('sep', ...quiet.map(item))
    if (loud.length > 0) items.push('sep', ...loud.map(item))
    return items
  }
  const onRowContextMenu = (inv: HubInvoice, e: MouseEvent<HTMLElement>) => {
    if (selecting) return
    e.preventDefault()
    setRowMenu({ inv, anchor: { x: e.clientX, y: e.clientY } })
  }

  // ── The lists that are not the table's ──
  const cnItems: ItemRow[] = hub.creditNotes.map((cn) => ({
    key: cn.id,
    label: cn.no ?? 'Draft',
    sub: [cn.party, cn.reason, cn.status].filter(Boolean).join(' · '),
    value: `−${f2(cn.amount)}`,
    valueTone: cn.status === 'voided' ? null : 'danger',
    action:
      cn.status === 'draft' && can.approveCn
        ? { label: 'Approve', onClick: () => work.askCreditNote('cn-approve', cn) }
        : can.docExport
          ? { label: 'PDF', href: `/billing/credit-note-doc?id=${cn.id}`, newTab: true }
          : null,
    onOpen: () => work.openCreditNote(cn),
  }))
  // Marketing billing (2026-10-26, ②b-2h): each line Marketing's manager confirmed — its party, Track ID, account and
  // state; Invoice opens the draft it was imported onto.
  const mkt = mktSummary(hub.marketing)
  const mktItems: ItemRow[] = hub.marketing.lines.map((l) => ({
    key: l.bill,
    label: l.words,
    sub: [l.party.name, l.track, l.account ? l.account.code : 'no account', mktLineState(l)].join(' · '),
    value: f2(l.amount),
    action: l.invoice
      ? { label: 'Invoice', onClick: () => setDrawerId(l.invoice!.id), title: l.invoice.no ?? undefined }
      : { label: 'Invoice', disabled: true, title: 'Not on an invoice yet — Create invoice ▾ › Import Marketing billing puts it on its draft.' },
  }))
  const nbItems: ItemRow[] = hub.nonBillable.map((t) => ({
    key: t.id,
    label: t.description,
    sub: `${fd(officeTime(t.at).format('YYYY-MM-DD'))} · ${t.type.replace(/_/g, ' ')} · ${t.source}`,
    value: t.out ? f2(t.amount) : `+${f2(t.amount)}`,
    valueTone: t.out ? null : 'ledger',
  }))

  // ── The toolbar's own buttons ──
  const tools =
    status === 'draft' ? (
      can.edit && drafts > 0 ? (
        <button type="button" className={hs.toolBtn} onClick={work.askApproveMonth}>
          Approve all <span className={hs.toolN}>· {drafts}</span>
        </button>
      ) : null
    ) : card === 'all' || card === 'issued' ? (
      <>
        {/* Ours: another month's unsettled invoices, for one receipt across months — while selecting. */}
        {selecting && hub.otherOpen.length > 0 ? (
          <button
            type="button"
            className={hs.toolBtn}
            data-on={others ? 'true' : undefined}
            aria-pressed={others}
            title="Other months’ unsettled invoices — tick them into the same receipt"
            onClick={() => setOthers((v) => !v)}
          >
            Other months <span className={hs.toolN}>· {hub.otherOpen.length}</span>
          </button>
        ) : null}
        {mayTick ? (
          <button
            type="button"
            className={hs.toolBtn}
            data-on={selecting ? 'true' : undefined}
            onClick={() => {
              setSelecting((v) => !v)
              setSelected(new Set())
            }}
          >
            {selecting ? 'Done' : 'Select'}
          </button>
        ) : null}
      </>
    ) : null

  const drawerInvoice = drawerId ? (all.get(drawerId) ?? null) : null
  const listTitle = INVOICE_CARD[card].label
  return (
    <div className={hs.root} data-fin-kit="">
      <HubHead
        roman="I."
        eyebrow="Daily · Invoices"
        title="Invoices"
        actions={
          <>
            {can.create ? (
              <HeadButton primary onClick={() => work.openMenu('create')}>
                Create invoice ▾
              </HeadButton>
            ) : null}
            <HeadButton onClick={() => work.openMenu('payroll')}>Payroll ▾</HeadButton>
            {work.exportItems.length > 0 ? <HeadButton onClick={() => work.openMenu('export')}>Export ▾</HeadButton> : null}
          </>
        }
      />

      <div className={hs.hub}>
        <HubCards
          heroLabel={`Invoiced · ${plural(hero.count, 'invoice', 'invoices')}`}
          heroValue={rm(hero.amount)}
          heroExtra={<MonthNav label={monthLong} onPrev={() => go(shift(-1))} onNext={() => go(shift(1))} month={month} thisMonth={thisMonth} onPick={go} />}
          cards={cards}
          active={card}
          onSelect={(k) => pickCard(k as InvoiceCardKey)}
        />
        {status ? (
          <FinTable
            layoutId="fin.invoices"
            title={listTitle}
            rows={rows}
            rowKey={(r) => r.id}
            columns={COLUMNS}
            amountOf={(r) => r.total}
            faint={(r) => r.status === 'voided'}
            search={{ value: query, onChange: setQuery, placeholder: 'Search invoice # / company / mode…' }}
            countLabel={(n) => `${n} · ${monthShort}${withOthers ? ' + other months' : ''}`}
            tools={tools}
            select={{ on: selecting, isSelected: (r) => selected.has(r.id), canSelect: canTick, onToggle: toggle, onToggleAll: toggleAll }}
            activeKey={drawerId}
            onRowClick={(r) => setDrawerId(r.id)}
            onRowContextMenu={onRowContextMenu}
            emptyText={hub.invoices.length === 0 && !withOthers ? `No invoices for ${monthLong} yet.` : 'No invoices here.'}
            canSetDefault={canSetDefault}
          />
        ) : (
          <FinTable
            layoutId="fin.invoices"
            title={listTitle}
            rows={[] as HubInvoice[]}
            rowKey={(r) => r.id}
            columns={COLUMNS}
            amountOf={(r) => r.total}
            onRowClick={() => {}}
            emptyText=""
            countText={card === 'cn' ? plural(hub.creditNotes.length, 'credit note', 'credit notes') : card === 'mkt' ? plural(mkt.lines, 'line', 'lines') : plural(hub.nonBillable.length, 'transaction', 'transactions')}
            tools={
              card === 'mkt' && can.create && mkt.toImport > 0 ? (
                <button type="button" className={hs.toolBtn} onClick={() => work.openDialog('marketing')}>
                  Import <span className={hs.toolN}>· {mkt.toImport}</span>
                </button>
              ) : card === 'nonbill' && can.voucher ? (
                <Link href="/payments/new?preset=non_billable" className={hs.toolBtn}>
                  + Add non-billable expense
                </Link>
              ) : null
            }
          >
            {card === 'cn' ? (
              <ItemList title="Credit notes" count={plural(hub.creditNotes.length, 'credit note', 'credit notes')} items={cnItems} empty={`No credit notes in ${monthLong}.`} />
            ) : card === 'mkt' ? (
              <ItemList title="Marketing billing" count={plural(mkt.lines, 'line', 'lines')} items={mktItems} empty={`Nothing confirmed by Marketing for ${monthLong} yet.`} />
            ) : (
              <ItemList title="Non-billable" count={plural(hub.nonBillable.length, 'transaction', 'transactions')} items={nbItems} empty={`Nothing in ${monthLong} yet.`} />
            )}
          </FinTable>
        )}
      </div>

      {selecting && ticked.length > 0 ? (
        <BulkBar
          text={`${ticked.length} selected · ${rm(sel.total)}`}
          sub={sel.payees > 1 ? 'Different companies can’t be combined' : (sel.payer ?? (sel.voidable.length > 0 ? 'Void or print — nothing here settles on a receipt' : ''))}
        >
          <BulkButton onClick={() => setSelected(new Set())}>Clear</BulkButton>
          {can.docExport || can.void ? (
            <BulkButton aria-label="More" onClick={() => work.openMenu('bulk')}>
              ⋯
            </BulkButton>
          ) : null}
          {can.create ? (
            <BulkButton primary off={sel.payees !== 1} onClick={settleTicked}>
              {`Settle ${sel.settleable.length} →`}
            </BulkButton>
          ) : null}
        </BulkBar>
      ) : null}

      <InvoiceDrawer
        invoice={drawerInvoice}
        open={!!drawerId}
        onClose={() => {
          setDrawerId(null)
          work.setError(null)
        }}
        can={can}
        today={today}
        busy={work.busy}
        error={work.shownError}
        onStep={onStep}
        onMore={work.openMore}
      />
      <PayrollBasisDrawer open={basisOpen} onClose={() => setBasisOpen(false)} month={monthLong} basis={hub.basis} department={hub.department} />

      {work.dialogs}

      {rowMenu ? (
        <RowMenu
          title={`${rowMenu.inv.no ?? 'Draft'} · ${statusText(rowMenu.inv.status)}`}
          anchor={rowMenu.anchor}
          items={rowMenuItems(rowMenu.inv)}
          onClose={() => setRowMenu(null)}
        />
      ) : null}
    </div>
  )
}
