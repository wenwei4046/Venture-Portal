'use client'

import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import type { HrIconName } from '@/components/hrv/icons'
import RowMenu, { type RowMenuAnchor, type RowMenuItem } from '@/components/RowMenu'
import { BulkBar, BulkButton, HeadButton, HubCards, HubHead, ItemList, MonthNav, hubStyles as hs, type CardTone, type ItemRow } from '@/components/finv/Hub'
import { FinTable, type FinColumn } from '@/components/finv/FinTable'
import { DialogConfirm, DialogMenu, Field, FinDialog, Input, type DialogMenuItem } from '@/components/finv/Dialog'
import { fd } from '@/components/finv/DrawerParts'
import { officeTime } from '@/lib/office-time'
import CreateCreditNoteButton from '../../billing/_components/CreateCreditNoteButton'
import ReassignInvoiceGlButton from '../../billing/_components/ReassignInvoiceGlButton'
import GenerateInvoicesButton from '../../billing/_components/GenerateInvoicesButton'
import GenerateConsolidatedInvoicesButton from '../../billing/_components/GenerateConsolidatedInvoicesButton'
import ReconcilePayrollBillingButton from '../../billing/_components/ReconcilePayrollBillingButton'
import GenerateOwnShareInvoiceButton from '../../billing/_components/GenerateOwnShareInvoiceButton'
import { InvoiceDrawer, invoiceSteps, statusText, statusTone, type InvoiceCan, type InvoiceStep, type InvoiceStepKey } from './InvoiceDrawer'
import SettleDialog from './SettleDialog'
import CreateInvoiceDialog from './CreateInvoiceDialog'
import InvoiceLinesDialog from './InvoiceLinesDialog'
import PayrollBasisDrawer from './PayrollBasisDrawer'
import {
  hubApproveCreditNote,
  hubApproveInvoice,
  hubApproveMonth,
  hubCopyInvoice,
  hubDeleteCreditNote,
  hubDeleteDraft,
  hubVoidCreditNote,
  hubVoidInvoices,
  type HubResult,
} from '../invoice-actions'
import {
  STATUS_CARD_KEYS,
  invoicedTotal,
  onCard,
  settleSelection,
  statusCard,
  type HubContract,
  type HubCreditNote,
  type HubInvoice,
  type InvoiceCardKey,
  type InvoiceHubData,
  type StatusCardKey,
} from '../_lib/invoice-model'

// Invoice's hub (2026-10-14, the Finance revamp v2 — D10 of `.design/fin-r2/handoff`):
// the head (Create invoice ▾, Payroll ▾, Export ▾), the month's total with its
// month pill, a card a list — All invoices, Issued, Paid, Draft, Voided, then
// Credit notes, Marketing projects, Non-billable — the table with its column
// tools and *Select* (a dark bar at the foot settles one payer's invoices on
// one receipt), and the drawer an invoice opens. Every step is the system's
// own (Service Billing's actions, their rules and gates); what the design
// leaves out and the page had is kept, out of the way: another month's open
// invoices on the same receipt, a part payment, Print / Void selected, Approve
// all drafts, Copy, the payroll basis and Finance's department mode.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const r2 = (n: number) => Math.round(n * 100) / 100
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const CARD: Record<InvoiceCardKey, { label: string; tone: CardTone; icon: HrIconName }> = {
  all: { label: 'All invoices', tone: 'all', icon: 'doc' },
  issued: { label: 'Issued', tone: 'issued', icon: 'invoice' },
  paid: { label: 'Paid', tone: 'paid', icon: 'payroll' },
  draft: { label: 'Draft', tone: 'draft', icon: 'doc' },
  voided: { label: 'Voided', tone: 'quiet', icon: 'fileAlert' },
  cn: { label: 'Credit notes', tone: 'peach', icon: 'receipt' },
  mkt: { label: 'Marketing projects', tone: 'peach', icon: 'people' },
  nonbill: { label: 'Non-billable', tone: 'quiet', icon: 'doc' },
}
const CARD_KEYS = Object.keys(CARD) as InvoiceCardKey[]
const isStatusCard = (k: InvoiceCardKey): k is StatusCardKey => (STATUS_CARD_KEYS as readonly string[]).includes(k)

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

type DialogKind = 'single' | 'multi' | 'marketing' | 'consolidated' | 'reconcile' | 'own-share' | 'edit' | 'credit_note' | 'reassign'
type Ask =
  | { kind: 'void'; ids: string[] }
  | { kind: 'delete'; id: string }
  | { kind: 'copy'; id: string }
  | { kind: 'approve-month' }
  | { kind: 'cn-approve' | 'cn-void' | 'cn-delete'; cn: HubCreditNote }

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
  const [menu, setMenu] = useState<'create' | 'payroll' | 'export' | 'bulk' | null>(null)
  // The ⋯ menus keep what they were opened for while they play out.
  const [moreFor, setMoreFor] = useState<HubInvoice | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [cnMenu, setCnMenu] = useState<HubCreditNote | null>(null)
  const [cnOpen, setCnOpen] = useState(false)
  // A dialog of the kit's stays mounted while it fades out (open: false); the next one, a new nonce, starts afresh.
  const [dialog, setDialog] = useState<{ kind: DialogKind; id?: string; nonce: number; open: boolean } | null>(null)
  const [settleIds, setSettleIds] = useState<string[]>([])
  const [ask, setAsk] = useState<Ask | null>(null)
  const [reason, setReason] = useState('')
  const [basisOpen, setBasisOpen] = useState(false)
  const [rowMenu, setRowMenu] = useState<{ inv: HubInvoice; anchor: RowMenuAnchor } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  // Arriving from the Overview's Create invoice (`?new=1`), or back from a department pool's settle (`?receipt=`).
  useEffect(() => {
    const url = new URL(window.location.href)
    const receipt = url.searchParams.get('receipt')
    const fresh = url.searchParams.get('new') === '1'
    if (receipt) flash(`Receipt ${receipt} written — the invoice is settled`)
    if (fresh && openNew && can.create) setDialog({ kind: 'single', nonce: Date.now(), open: true })
    if (receipt || url.searchParams.has('new')) {
      url.searchParams.delete('receipt')
      url.searchParams.delete('new')
      window.history.replaceState(window.history.state, '', url.toString())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const all = useMemo(() => new Map([...hub.invoices, ...hub.otherOpen].map((i) => [i.id, i])), [hub])
  const status = isStatusCard(card) ? card : null
  const withOthers = others && selecting && (card === 'all' || card === 'issued') && hub.otherOpen.length > 0
  const q = query.trim().toLowerCase()
  const rows = useMemo(() => {
    if (!status) return []
    const base = withOthers ? [...hub.invoices, ...hub.otherOpen] : hub.invoices
    return base.filter((i) => onCard(i, status) && (!q || `${i.no ?? ''} ${i.party.name} ${i.description} ${i.mode}`.toLowerCase().includes(q)))
  }, [hub, status, withOthers, q])

  // ── The cards: the month's ──
  const hero = invoicedTotal(hub.invoices)
  const activeContracts = hub.contracts.filter((c) => c.status === 'active').length
  const cnTotal = r2(hub.creditNotes.filter((c) => c.status !== 'voided').reduce((s, c) => s + c.amount, 0))
  const deducted = r2(hub.nonBillable.filter((t) => t.out).reduce((s, t) => s + t.amount, 0))
  const drafts = hub.invoices.filter((i) => i.status === 'draft').length
  const cards = CARD_KEYS.map((k) => {
    const look = CARD[k]
    let sub: string
    let value: string
    if (isStatusCard(k)) {
      const f = statusCard(hub.invoices, k)
      sub = plural(f.count, 'invoice', 'invoices')
      value = rm(f.amount)
    } else if (k === 'cn') {
      sub = plural(hub.creditNotes.length, 'credit note', 'credit notes')
      value = cnTotal > 0 ? `−${rm(cnTotal)}` : rm(0)
    } else if (k === 'mkt') {
      sub = hub.contracts.length === 0 ? '0 projects' : `${plural(hub.contracts.length, 'project', 'projects')} · ${activeContracts} active`
      value = rm(r2(hub.contracts.reduce((s, c) => s + (c.amount ?? 0), 0)))
    } else {
      sub = plural(hub.nonBillable.length, 'transaction', 'transactions')
      value = rm(deducted)
    }
    return { key: k, tone: look.tone, icon: look.icon, label: look.label, sub, value }
  })
  const pickCard = (k: InvoiceCardKey) => {
    setCard(k)
    setSelecting(false)
    setSelected(new Set())
  }

  // ── Doing things ──
  const closeAsk = () => {
    if (busy) return
    setAsk(null)
    setError(null)
  }
  async function run<T>(call: () => Promise<HubResult<T>>, done: (value: T) => void): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      const res = await call()
      if (!res.ok) {
        setError(res.reason)
        return false
      }
      done(res.value)
      router.refresh()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through. Try again.')
      return false
    } finally {
      setBusy(false)
    }
  }
  const numberOf = (id: string) => all.get(id)?.no ?? 'the draft'

  const onStep = (key: InvoiceStepKey, inv: HubInvoice) => {
    setError(null)
    setMoreOpen(false)
    setRowMenu(null)
    const open = (kind: DialogKind) => setDialog({ kind, id: inv.id, nonce: Date.now(), open: true })
    switch (key) {
      case 'approve':
        void run(
          () => hubApproveInvoice(inv.id),
          () => flash('Approved & issued — posted to the GL'),
        ).then((ok) => !ok && !drawerId && setDrawerId(inv.id))
        return
      case 'edit':
        return open('edit')
      case 'credit_note':
        return open('credit_note')
      case 'reassign':
        return open('reassign')
      case 'delete':
        return setAsk({ kind: 'delete', id: inv.id })
      case 'copy':
        return setAsk({ kind: 'copy', id: inv.id })
      case 'void':
        setReason('')
        return setAsk({ kind: 'void', ids: [inv.id] })
      case 'settle':
        return setSettleIds([inv.id])
      case 'settle_netting':
        // A department pool's invoice settles by netting on the voucher page, which brings the reader back.
        return router.push(`/payments/new?invoice_id=${inv.id}&return_to=/statements`)
      case 'refund':
        return router.push(`/payments/new?mode=refund&invoice_id=${inv.id}&return_to=/statements`)
    }
  }

  const confirmAsk = () => {
    if (!ask || busy) return
    switch (ask.kind) {
      case 'void': {
        if (!reason.trim()) return setError('Give a reason for voiding — it goes on the audit trail.')
        void run(
          () => hubVoidInvoices(ask.ids, reason.trim()),
          (voided) => {
            flash(voided.length === 1 ? `${voided[0]} voided` : `${voided.length} invoices voided`)
            setAsk(null)
            setSelected((prev) => {
              const next = new Set(prev)
              for (const id of ask.ids) next.delete(id)
              return next
            })
          },
        )
        return
      }
      case 'delete':
        void run(
          () => hubDeleteDraft(ask.id),
          () => {
            flash('Draft deleted')
            setAsk(null)
            setDrawerId(null)
          },
        )
        return
      case 'copy':
        void run(
          () => hubCopyInvoice(ask.id),
          () => {
            flash('Copied as a new draft')
            setAsk(null)
            setDrawerId(null)
            if (month !== thisMonth) go(thisMonth)
          },
        )
        return
      case 'approve-month':
        void run(
          () => hubApproveMonth(hub.period),
          (n) => {
            flash(`${plural(n, 'draft', 'drafts')} approved & issued`)
            setAsk(null)
          },
        )
        return
      case 'cn-approve':
        void run(
          () => hubApproveCreditNote(ask.cn.id),
          () => {
            flash(`${ask.cn.no ?? 'Credit note'} approved — posted to the GL`)
            setAsk(null)
          },
        )
        return
      case 'cn-void':
        void run(
          () => hubVoidCreditNote(ask.cn.id),
          () => {
            flash(`${ask.cn.no ?? 'Credit note'} voided`)
            setAsk(null)
          },
        )
        return
      case 'cn-delete':
        void run(
          () => hubDeleteCreditNote(ask.cn.id),
          () => {
            flash('Draft credit note deleted')
            setAsk(null)
          },
        )
        return
    }
  }

  // ── Select: one payer's invoices on one receipt ──
  const canTick = (i: HubInvoice) => i.settleable || i.voidable
  const mayTick = (can.create || can.void || can.docExport) && (card === 'all' || card === 'issued')
  // Another month's invoice counts only while Other months shows it.
  const ticked = [...selected].map((id) => all.get(id)).filter((i): i is HubInvoice => !!i && (!i.other || withOthers))
  const sel = settleSelection(ticked)
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
    setSettleIds(sel.settleable.map((i) => i.id))
  }

  // ── The row menu: Open, a new tab, the invoice's PDF, then what the drawer offers ──
  const rowMenuItems = (inv: HubInvoice): RowMenuItem[] => {
    const { bar, more } = invoiceSteps(inv, can)
    const steps = [...bar, ...more]
    const item = (s: InvoiceStep): RowMenuItem => ({ key: s.key, label: s.label, hint: s.sub, danger: s.kind === 'danger', onSelect: () => onStep(s.key, inv) })
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
        ? { label: 'Approve', onClick: () => setAsk({ kind: 'cn-approve', cn }) }
        : can.docExport
          ? { label: 'PDF', href: `/billing/credit-note-doc?id=${cn.id}`, newTab: true }
          : null,
    onOpen: () => {
      setCnMenu(cn)
      setCnOpen(true)
    },
  }))
  const datesOf = (c: HubContract) => {
    const s = c.start ? fd(c.start) : null
    const e = c.end ? fd(c.end) : null
    if (s && e) return s.slice(-4) === e.slice(-4) ? `${s.slice(0, -5)} – ${e}` : `${s} – ${e}`
    return s ? `from ${s}` : e ? `to ${e}` : ''
  }
  const mktItems: ItemRow[] = hub.contracts.map((c) => ({
    key: c.id,
    label: c.description,
    sub: [c.company, datesOf(c), c.status].filter(Boolean).join(' · '),
    value: c.amount == null ? '—' : f2(c.amount),
    action: c.invoice
      ? { label: 'Invoice', onClick: () => setDrawerId(c.invoice!.id), title: c.invoice.no ?? undefined }
      : { label: 'Invoice', disabled: true, title: `No invoice for this project in ${monthLong} yet — Create invoice ▾ › Generate Marketing invoices raises them.` },
    onOpen: can.edit ? () => router.push(`/billing/contracts/${c.id}/edit`) : undefined,
  }))
  const nbItems: ItemRow[] = hub.nonBillable.map((t) => ({
    key: t.id,
    label: t.description,
    sub: `${fd(officeTime(t.at).format('YYYY-MM-DD'))} · ${t.type.replace(/_/g, ' ')} · ${t.source}`,
    value: t.out ? f2(t.amount) : `+${f2(t.amount)}`,
    valueTone: t.out ? null : 'ledger',
  }))

  // ── The head's menus ──
  const menuItem = (key: string, label: string, onClick: () => void, sub?: string): DialogMenuItem => ({
    key,
    label,
    sub,
    onClick: () => {
      setMenu(null)
      onClick()
    },
  })
  const openDialog = (kind: DialogKind) => () => setDialog({ kind, nonce: Date.now(), open: true })
  const createItems: DialogMenuItem[] = [
    menuItem('single', 'Single invoice', openDialog('single')),
    menuItem('multi', 'Multi-line invoice', openDialog('multi'), 'Several lines on one invoice'),
    menuItem('marketing', 'Generate Marketing invoices', openDialog('marketing'), `From ${plural(activeContracts, 'active marketing project', 'active marketing projects')}`),
  ]
  const payrollItems: DialogMenuItem[] = [
    ...(can.create
      ? [
          menuItem('consolidated', 'Generate payroll invoices', openDialog('consolidated'), `HR and Director salary basis for ${monthLong}`),
          menuItem('reconcile', 'Reconcile payroll', openDialog('reconcile')),
          menuItem('own-share', 'Own-share → Venture (Office)', openDialog('own-share')),
        ]
      : []),
    menuItem('basis', 'Payroll basis', () => setBasisOpen(true), `${hub.basis.status} · ${hub.basis.note}`),
  ]
  const exportItems: DialogMenuItem[] = [
    ...(can.listExport
      ? [
          menuItem('xlsx', 'Excel', () => window.location.assign(`/statements/export?format=xlsx&period=${month}`), `invoices-${month.replace('-', '')}.xlsx`),
          menuItem('pdf', 'PDF · list', () => window.open(`/statements/export?format=pdf&period=${month}`, '_blank', 'noopener,noreferrer'), 'One PDF with the list'),
        ]
      : []),
    ...(can.docExport
      ? [menuItem('docs', 'PDF · per invoice', () => window.open(`/billing/invoice-doc?period=${month}`, '_blank', 'noopener,noreferrer'), 'Each invoice on its own page')]
      : []),
  ]

  // ── What the confirms say ──
  let askTitle = ''
  let askText = ''
  let askLabel = ''
  let askDanger = false
  if (ask) {
    if (ask.kind === 'void') {
      const owed = r2(ask.ids.reduce((s, id) => s + (all.get(id)?.remaining ?? 0), 0))
      const one = ask.ids.length === 1 ? all.get(ask.ids[0]) : null
      askTitle = one ? `Void ${one.no ?? 'this invoice'}?` : `Void ${ask.ids.length} invoices?`
      askText = one
        ? `The invoice and its GL entry are reversed. ${one.party.name} will no longer owe ${rm(owed)}.`
        : `The invoices and their GL entries are reversed — ${rm(owed)} no longer owed.`
      askLabel = one ? 'Void invoice' : `Void ${ask.ids.length} invoices`
      askDanger = true
    } else if (ask.kind === 'delete') {
      askTitle = 'Delete this draft?'
      askText = `${numberOf(ask.id)} has not been issued. Deleting removes it.`
      askLabel = 'Delete'
      askDanger = true
    } else if (ask.kind === 'copy') {
      askTitle = `Copy ${numberOf(ask.id)}?`
      askText = `A new draft in ${MONTH[Number(thisMonth.slice(5, 7)) - 1]} ${thisMonth.slice(0, 4)}, with the same lines — change what you need, then issue it.`
      askLabel = 'Copy as new draft'
    } else if (ask.kind === 'approve-month') {
      askTitle = `Approve all ${plural(drafts, 'draft', 'drafts')}?`
      askText = `Each draft of ${monthLong} is issued and posted to the GL.`
      askLabel = 'Approve all'
    } else if (ask.kind === 'cn-approve') {
      askTitle = `Approve ${ask.cn.no ?? 'this credit note'}?`
      askText = `This posts the credit to the GL (${ask.cn.category ?? 'its account'} / AR) and takes ${rm(ask.cn.amount)} off what ${ask.cn.party} owes on ${ask.cn.invoiceNo ?? 'the invoice'}. It cannot be undone here.`
      askLabel = 'Approve'
    } else if (ask.kind === 'cn-void') {
      askTitle = `Void ${ask.cn.no ?? 'this credit note'}?`
      askText = `A reversing entry cancels its posting, and ${ask.cn.party} owes ${rm(ask.cn.amount)} again on ${ask.cn.invoiceNo ?? 'the invoice'}; an invoice it had brought to paid goes back to issued.`
      askLabel = 'Void credit note'
      askDanger = true
    } else {
      askTitle = 'Delete this draft credit note?'
      askText = `${ask.cn.no ?? 'It'} (${rm(ask.cn.amount)}) has not posted — deleting removes it.`
      askLabel = 'Delete'
      askDanger = true
    }
  }

  const drawerInvoice = drawerId ? (all.get(drawerId) ?? null) : null
  const dialogInvoice = dialog?.id ? all.get(dialog.id) : undefined
  const settling = settleIds.map((id) => all.get(id)).filter((i): i is HubInvoice => !!i)
  // An invoice keeps its company in Edit's list though the company has since gone inactive.
  const companiesForEdit =
    dialogInvoice?.edit.company_id && !hub.companies.some((c) => c.id === dialogInvoice.edit.company_id)
      ? [...hub.companies, { id: dialogInvoice.edit.company_id, name: dialogInvoice.party.name, short_code: '' }]
      : hub.companies
  const closeDialog = () => setDialog((d) => (d ? { ...d, open: false } : d))
  const dialogDone = (message: string) => {
    flash(message)
    router.refresh()
  }
  const postedAccounts = (inv: HubInvoice) => {
    const by = new Map<string, number>()
    for (const l of inv.editLines) if (l.category_code) by.set(l.category_code, r2((by.get(l.category_code) ?? 0) + Number(l.amount)))
    return [...by.entries()].map(([code, amount]) => ({ code, amount })).sort((a, b) => a.code.localeCompare(b.code))
  }

  // ── The toolbar's own buttons ──
  const tools =
    status === 'draft' ? (
      can.edit && drafts > 0 ? (
        <button type="button" className={hs.toolBtn} onClick={() => setAsk({ kind: 'approve-month' })}>
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

  const listTitle = CARD[card].label
  return (
    <div className={hs.root} data-fin-kit="">
      <HubHead
        roman="I."
        eyebrow="Daily · Invoices"
        title="Invoices"
        actions={
          <>
            {can.create ? (
              <HeadButton primary onClick={() => setMenu('create')}>
                Create invoice ▾
              </HeadButton>
            ) : null}
            <HeadButton onClick={() => setMenu('payroll')}>Payroll ▾</HeadButton>
            {exportItems.length > 0 ? <HeadButton onClick={() => setMenu('export')}>Export ▾</HeadButton> : null}
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
            countText={card === 'cn' ? plural(hub.creditNotes.length, 'credit note', 'credit notes') : card === 'mkt' ? plural(hub.contracts.length, 'project', 'projects') : plural(hub.nonBillable.length, 'transaction', 'transactions')}
            tools={
              card === 'mkt' && can.create ? (
                <Link href="/billing/contracts/new" className={hs.toolBtn}>
                  + New contract
                </Link>
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
              <ItemList title="Marketing projects" count={plural(hub.contracts.length, 'project', 'projects')} items={mktItems} empty="No marketing projects yet." />
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
            <BulkButton aria-label="More" onClick={() => setMenu('bulk')}>
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
          setError(null)
        }}
        can={can}
        today={today}
        busy={busy}
        error={ask || settleIds.length > 0 ? null : error}
        onStep={onStep}
        onMore={(inv) => {
          setMoreFor(inv)
          setMoreOpen(true)
        }}
      />
      <PayrollBasisDrawer open={basisOpen} onClose={() => setBasisOpen(false)} month={monthLong} basis={hub.basis} department={hub.department} />

      <SettleDialog
        invoices={settling}
        banks={hub.banks}
        today={today}
        onClose={() => setSettleIds([])}
        onSettled={(message) => {
          flash(message)
          setSettleIds([])
          setSelected(new Set())
          setSelecting(false)
          router.refresh()
        }}
      />

      {/* The head's menus, the ⋯ menus, the confirms. */}
      <FinDialog open={menu === 'create'} onClose={() => setMenu(null)} title="Create invoice">
        <DialogMenu items={createItems} />
      </FinDialog>
      <FinDialog open={menu === 'payroll'} onClose={() => setMenu(null)} title="From payroll">
        <DialogMenu items={payrollItems} />
      </FinDialog>
      <FinDialog open={menu === 'export'} onClose={() => setMenu(null)} title="Export" sub={monthLong}>
        <DialogMenu items={exportItems} />
      </FinDialog>
      <FinDialog open={menu === 'bulk'} onClose={() => setMenu(null)} title={`${ticked.length} selected`}>
        <DialogMenu
          items={[
            ...(can.docExport
              ? [menuItem('print', 'Print selected', () => window.open(`/billing/invoice-doc?ids=${ticked.map((i) => i.id).join(',')}`, '_blank', 'noopener,noreferrer'))]
              : []),
            ...(can.void
              ? [
                  {
                    ...menuItem('void', `Void selected · ${sel.voidable.length}`, () => {
                      setReason('')
                      setAsk({ kind: 'void', ids: sel.voidable.map((i) => i.id) })
                    }, 'Only an issued invoice with no money in and no credit note'),
                    danger: true,
                    disabled: sel.voidable.length === 0,
                  },
                ]
              : []),
          ]}
        />
      </FinDialog>
      <FinDialog open={moreOpen} onClose={() => setMoreOpen(false)} title={moreFor?.no ?? 'Draft'}>
        <DialogMenu
          items={(moreFor ? invoiceSteps(moreFor, can).more : []).map((s) => ({
            key: s.key,
            label: s.label,
            sub: s.sub,
            danger: s.kind === 'danger',
            onClick: () => moreFor && onStep(s.key, moreFor),
          }))}
        />
      </FinDialog>
      <FinDialog open={cnOpen} onClose={() => setCnOpen(false)} title={cnMenu?.no ?? 'Draft credit note'} sub={cnMenu ? `${cnMenu.party} · ${cnMenu.status}` : undefined}>
        <DialogMenu
          items={
            cnMenu
              ? [
                  menuItem('open', `Open ${cnMenu.invoiceNo ?? 'its invoice'}`, () => {
                    setCnOpen(false)
                    setDrawerId(cnMenu.invoiceId)
                  }),
                  ...(can.docExport ? [menuItem('pdf', 'PDF', () => window.open(`/billing/credit-note-doc?id=${cnMenu.id}`, '_blank', 'noopener,noreferrer'))] : []),
                  ...(cnMenu.status === 'draft' && can.approveCn ? [menuItem('approve', 'Approve', () => setAsk({ kind: 'cn-approve', cn: cnMenu }))] : []),
                  ...(cnMenu.status === 'draft' && can.edit ? [{ ...menuItem('delete', 'Delete draft', () => setAsk({ kind: 'cn-delete', cn: cnMenu })), danger: true }] : []),
                  ...(cnMenu.status === 'approved' && can.void ? [{ ...menuItem('void', 'Void credit note', () => setAsk({ kind: 'cn-void', cn: cnMenu })), danger: true }] : []),
                ].map((m) => ({ ...m, onClick: () => { setCnOpen(false); m.onClick() } }))
              : []
          }
        />
      </FinDialog>
      <FinDialog open={!!ask} onClose={closeAsk} title={askTitle} locked={busy}>
        <DialogConfirm
          text={askText}
          confirmLabel={busy ? 'Working…' : askLabel}
          danger={askDanger}
          busy={busy}
          off={ask?.kind === 'void' && !reason.trim()}
          error={ask ? error : null}
          onCancel={closeAsk}
          onConfirm={confirmAsk}
        >
          {ask?.kind === 'void' ? (
            <Field label="Reason" htmlFor="void-reason">
              <Input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong amount — reissued" autoFocus />
            </Field>
          ) : null}
        </DialogConfirm>
      </FinDialog>

      {rowMenu ? (
        <RowMenu
          title={`${rowMenu.inv.no ?? 'Draft'} · ${statusText(rowMenu.inv.status)}`}
          anchor={rowMenu.anchor}
          items={rowMenuItems(rowMenu.inv)}
          onClose={() => setRowMenu(null)}
        />
      ) : null}

      {/* The invoice dialogs (the design's inv-form), and the system's own for the rest, mounted open for what asked. */}
      {dialog?.kind === 'single' ? (
        <CreateInvoiceDialog
          key={dialog.nonce}
          open={dialog.open}
          onClose={closeDialog}
          onDone={dialogDone}
          period={hub.period}
          today={today}
          companies={hub.companies}
          departments={hub.departments}
          categories={hub.categories}
          extraModes={hub.extraModes}
        />
      ) : dialog?.kind === 'multi' ? (
        <InvoiceLinesDialog
          key={dialog.nonce}
          open={dialog.open}
          onClose={closeDialog}
          onDone={dialogDone}
          period={hub.period}
          today={today}
          companies={hub.companies}
          departments={hub.departments}
          categories={hub.categories}
          extraModes={hub.extraModes}
        />
      ) : dialog?.kind === 'marketing' ? (
        <GenerateInvoicesButton key={dialog.nonce} autoOpen hideTrigger currentPeriod={hub.period} modes={['marketing_project']} label="Generate Marketing invoices" />
      ) : dialog?.kind === 'consolidated' ? (
        <GenerateConsolidatedInvoicesButton key={dialog.nonce} autoOpen hideTrigger currentPeriod={hub.period} categories={hub.categories} />
      ) : dialog?.kind === 'reconcile' ? (
        <ReconcilePayrollBillingButton key={dialog.nonce} autoOpen hideTrigger currentPeriod={hub.period} />
      ) : dialog?.kind === 'own-share' ? (
        <GenerateOwnShareInvoiceButton key={dialog.nonce} autoOpen hideTrigger currentPeriod={hub.period} categories={hub.categories} />
      ) : dialog?.kind === 'edit' && dialogInvoice ? (
        <InvoiceLinesDialog
          key={dialog.nonce}
          open={dialog.open}
          onClose={closeDialog}
          onDone={dialogDone}
          period={hub.period}
          today={today}
          companies={companiesForEdit}
          departments={hub.departments}
          categories={hub.categories}
          extraModes={hub.extraModes}
          editing={{
            id: dialogInvoice.id,
            no: dialogInvoice.no,
            status: dialogInvoice.status,
            settled: dialogInvoice.status === 'paid' || dialogInvoice.status === 'paid_via_netting' || dialogInvoice.received > 0,
            initial: dialogInvoice.edit,
            lines: dialogInvoice.editLines,
          }}
        />
      ) : dialog?.kind === 'credit_note' && dialogInvoice ? (
        <CreateCreditNoteButton
          key={dialog.nonce}
          autoOpen
          hideTrigger
          invoiceId={dialogInvoice.id}
          invoiceNo={dialogInvoice.no}
          invoiceTotal={dialogInvoice.total}
          payeeLabel={dialogInvoice.party.name}
          categories={hub.categories}
          extraModes={hub.extraModes}
        />
      ) : dialog?.kind === 'reassign' && dialogInvoice ? (
        <ReassignInvoiceGlButton
          key={dialog.nonce}
          autoOpen
          hideTrigger
          invoiceId={dialogInvoice.id}
          invoiceNo={dialogInvoice.no}
          currentCategory={dialogInvoice.edit.category_code}
          categories={hub.categories.map((c) => ({ code: c.code, label: c.label }))}
          postedAccounts={postedAccounts(dialogInvoice)}
        />
      ) : null}
    </div>
  )
}
