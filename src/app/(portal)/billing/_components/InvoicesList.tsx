'use client'

import { useEffect, useState, useTransition } from 'react'
import { backdropDismiss } from '@/components/modal-dismiss'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dayjs from 'dayjs'
import { officeToday } from '@/lib/office-time'
import { formatMoney } from '@/lib/utils'
import { ApproveInvoiceButton, BulkIssueInvoicesButton, EditInvoiceButton } from './InvoiceActions'
import CreateCreditNoteButton from './CreateCreditNoteButton'
import ReassignInvoiceGlButton from './ReassignInvoiceGlButton'
import { useFinView } from '@/components/layout/fin-view'
import SortableTable from '@/components/SortableTable'
import { SlidingTabs } from '@/components/motion/SlidingTabs'
import RowMenu, { type RowMenuAnchor, type RowMenuItem } from '@/components/RowMenu'
import type { AccountType } from '@/lib/coa'
import { billingModeLabel, invoiceParty } from '@/lib/invoice-labels'
import { copyInvoice, deleteDraftInvoice, settleInvoicesConsolidated, voidIssuedInvoices } from '../actions'
import { payeeKey } from '@/lib/invoice-settlement'
import ColumnFoot from './ColumnFoot'

// What the list's own bars, banners and dialogs say: English on the Finance
// view (2026-10-10, the handoff — "settle / void dialogs in English"), the
// portal's Chinese everywhere else, as it always was.
const money = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 2 })
const WORDS = {
  zh: {
    dismiss: '知道了',
    close: '关闭',
    receiptBack: (no: string) => `收据 ${no} 已开 — 发票结清。`,
    copyAsk: (no: string) => `复制 ${no} 为本月新草稿?复制后可在草稿里改金额/描述再 issue。`,
    voidNone: '没有选到可作废的发票',
    voidNoReason: '作废要写原因',
    voided: (list: string[]) => `已作废 ${list.length} 张：${list.join('、')}`,
    voidFailed: '作废失败',
    oneCompany: '一张收据只能结同一家公司的单，请只勾选同一家公司的发票',
    amountZero: '实收金额必须大于 0',
    amountOver: (rem: number) => `实收金额超过发票余额 RM ${rem.toFixed(2)}`,
    partial: (no: string, got: number, left: number) => `Receipt ${no} — 部分收款 RM ${got.toFixed(2)}，发票保持未结，余额还剩 RM ${left.toFixed(2)}。`,
    settleHere: '就地开收据,不用离开 Billing',
    settleVoucher: '部门间结算走冲账凭单,开好会带你回来',
    more: '更多动作 — 也可以在这一行按右键',
    settleTitle: '合并结算 · 生成收据',
    settleSub: (n: number, total: number) => `${n} 张发票 · RM ${money(total)}。合并为一张收款凭证（Official Receipt），所选发票全部标记为已付。`,
    amountLabel: '实收金额 (RM)',
    balance: (rem: number) => `发票余额 RM ${rem.toFixed(2)}`,
    received: (got: number) => `（已收 RM ${got.toFixed(2)}）`,
    partialHint: '　·　少于余额 = 部分收款，发票保持未结，之后可以继续收。',
    settling: '结算中…',
    settleGo: (n: number) => `生成收据 · 结 ${n} 张`,
    voidTitle: '作废发票',
    voidSub: '开票的账会冲掉（报表自动不算），单号保留、状态变 voided。只能作废还没收钱、没 credit note 的 issued 发票。',
    reason: '原因',
    reasonHint: '例：开错金额，重开',
    voiding: '作废中…',
    voidGo: (n: number) => `作废 ${n} 张`,
  },
  en: {
    dismiss: 'Dismiss',
    close: 'Close',
    receiptBack: (no: string) => `Receipt ${no} written — the invoice is settled.`,
    copyAsk: (no: string) => `Copy ${no} as a new draft for this month? Change the amount or description in the draft, then issue it.`,
    voidNone: 'No voidable invoice is selected',
    voidNoReason: 'Give a reason for voiding',
    voided: (list: string[]) => `Voided ${list.length}: ${list.join(', ')}`,
    voidFailed: 'Void failed',
    oneCompany: 'One receipt settles one company’s invoices — tick invoices of the same company only',
    amountZero: 'The amount received must be more than 0',
    amountOver: (rem: number) => `That is more than the invoice’s balance of RM ${rem.toFixed(2)}`,
    partial: (no: string, got: number, left: number) => `Receipt ${no} — part payment RM ${got.toFixed(2)}; the invoice stays open with RM ${left.toFixed(2)} left.`,
    settleHere: 'Write the receipt here, without leaving Billing',
    settleVoucher: 'Settled through a netting voucher — it brings you back here',
    more: 'More actions — or right-click the row',
    settleTitle: 'Settle — one receipt',
    settleSub: (n: number, total: number) =>
      `${n} ${n === 1 ? 'invoice' : 'invoices'} · RM ${money(total)}. One official receipt covers them all; every invoice selected is marked paid.`,
    amountLabel: 'Amount received (RM)',
    balance: (rem: number) => `Balance RM ${rem.toFixed(2)}`,
    received: (got: number) => ` (received RM ${got.toFixed(2)})`,
    partialHint: ' · less than the balance is a part payment — the invoice stays open for the rest.',
    settling: 'Settling…',
    settleGo: (n: number) => `Settle ${n} ${n === 1 ? 'invoice' : 'invoices'}`,
    voidTitle: 'Void invoices',
    voidSub: 'The invoice’s entry is reversed (reports leave it out); its number stays and its status becomes voided. Only an issued invoice with no money in and no credit note can be voided.',
    reason: 'Reason',
    reasonHint: 'e.g. wrong amount — reissued',
    voiding: 'Voiding…',
    voidGo: (n: number) => `Void ${n}`,
  },
}

interface Invoice {
  id: string
  invoice_no: string | null
  company_id: string | null
  period_month: string
  billing_mode: string
  total_amount: number
  status: string
  // Item 5: 4-way billable target. Subsidiary still uses company_id;
  // others use these polymorphic columns.
  billable_to_type?: 'subsidiary' | 'director' | 'dept_pool' | 'freetext' | null
  billable_to_department_id?: string | null
  billable_to_freetext_name?: string | null
  billable_to_freetext_address?: string | null
  billable_to_freetext_phone?: string | null
  billable_to_freetext_email?: string | null
  // Detail-modal fields (read-only). No per-invoice detail page exists, so
  // these power the click-into-row popup.
  description?: string | null
  invoice_date?: string | null
  due_date?: string | null
  reference_no?: string | null
  category_code?: string | null
  created_at?: string | null
}

// Resolve the "who is being billed" label for an invoice row. Mig 225's
// 4-way polymorphism (subsidiary / director / dept_pool / freetext)
// means the label source varies per row, so this is centralised so the
// table cell, the sort key, and the credit-note payee field all stay in
// sync.
function resolvePartyLabel(
  inv: Invoice,
  companyMap: Map<string, { name: string; code: string }>,
  departmentMap: Map<string, string>,
): { primary: string; sub: string } {
  if (inv.company_id) {
    const company = companyMap.get(inv.company_id)
    return { primary: company?.name ?? '—', sub: company?.code ?? '' }
  }
  if (inv.billable_to_type === 'dept_pool' && inv.billable_to_department_id) {
    return {
      primary: departmentMap.get(inv.billable_to_department_id) ?? '—',
      sub: 'Dept pool',
    }
  }
  const primary = inv.billable_to_freetext_name ?? '—'
  const sub =
    inv.billable_to_type === 'director'
      ? 'Director'
      : inv.billable_to_type === 'dept_pool'
        ? 'Dept pool'
        : inv.billable_to_type === 'freetext'
          ? 'Free text'
          : '—'
  return { primary, sub }
}

// Humanize the billing mode enum values for UI display — raw snake_case
// reads like a dev dump.
function formatBillingMode(mode: string): string {
  switch (mode) {
    case 'marketing_project':
      return 'Marketing project'
    case 'director_office_attribution':
      return 'Director Office OPEX'
    case 'director_attribution':
      return 'Director OPEX'
    case 'non_billable':
      return 'Non-billable'
    case 'payroll_consolidated':
      return 'Payroll (consolidated)'
    default:
      return mode
  }
}

interface Props {
  invoices: Invoice[]
  companyMap: Map<string, { name: string; code: string }>
  /** Mig 225: dept_pool invoices resolve their party label from this map
   *  (billable_to_department_id → department name). Subsidiary invoices use
   *  companyMap; director/freetext invoices use the freetext name on the row. */
  departmentMap: Map<string, string>
  period: string
  /** Phase 11 / post-unified-COA + mig 246: chart_of_accounts rows for
   *  credit-note multi-pool routing. type + parent_code let AccountPicker
   *  filter to revenue-side leaves only. */
  categories?: Array<{
    code: string
    label: string
    type: AccountType
    parent_code: string | null
  }>
  /** Banks shown in the batch-settle modal. Drives which bank account
   *  receives the inflow when knocking off multiple issued invoices. */
  bankAccounts?: Array<{ id: string; bank_name: string; account_number: string | null }>
  /** invoice_id → line items, prefills the (create-form-mirroring) edit modal. */
  invoiceLines?: Record<string, Array<{ description: string | null; amount: number; category_code: string | null }>>
  /** invoice_id → Σ receipts already recorded (partial payments). Issued
   *  invoices settle for their REMAINING balance; part-paid rows get a badge. */
  paidByInvoice?: Record<string, number>
  /** invoice_id → Σ APPROVED credit notes (CN v2, 2026-08-19) — reduces the
   *  settle balance exactly like receipts do. */
  cnByInvoice?: Record<string, number>
  /** 跨月合并结算 (2026-08-20): OTHER periods' still-issued invoices. Hidden
   *  until the 跨月 toggle is on, then they join the list so one receipt can
   *  cover a payer's invoices across months. Period totals ignore them. */
  extraOpenInvoices?: Invoice[]
  /** invoice_id → receipts recorded against it. The list no longer shows them
   *  (2026-10-09: an invoice opens its own page, /invoices/<id>, which reads
   *  its own); BillingView still hands them over. */
  receiptsByInvoice?: Record<string, Array<{ voucherNo: string | null; date: string | null; amount: number; batch?: boolean }>>
  /** invoice_id → credit notes raised against it — likewise no longer shown here. */
  cnDetailByInvoice?: Record<string, Array<{ cnNo: string | null; amount: number; status: string; reason: string | null }>>
  /** Dynamically provisioned dept modes — forwarded to the CN modal. */
  extraModes?: Array<{ value: string; label: string }>
  /** invoice_id → the account names its lines post to ("Design Income + Social
   *  Media"), the sheet's Category column (2026-10-07). */
  categoryByInvoice?: Record<string, string>
  /** The viewer may keep the arrangement on show as everyone's default. */
  canSetDefault?: boolean
}

// Invoices for the selected period. Populated by Step 5's generate_monthly_invoices
// RPC. Until Step 5 ships, this section shows the empty state with an explanation.
export default function InvoicesList({ invoices, companyMap, departmentMap, period, categories = [], bankAccounts = [], invoiceLines = {}, paidByInvoice = {}, cnByInvoice = {}, extraOpenInvoices = [], extraModes = [], categoryByInvoice = {}, canSetDefault = false }: Props) {
  const router = useRouter()
  // On the Finance view the row menu reads in English (2026-10-09), and since
  // 2026-10-10 the list follows the handoff (see the test's last block).
  const fin = useFinView()
  const W = fin ? WORDS.en : WORDS.zh
  /** An invoice's own page (2026-10-09, the Finance revamp). */
  const pageOf = (inv: Invoice) => `/invoices/${inv.id}`
  const [isPending, startTransition] = useTransition()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // The selection belongs to the month on screen. A ?period= navigation keeps
  // this list mounted, so a selection made in one month used to leak into the
  // next — hidden from the checkboxes, but 打印所选 printed the old ids. Reset
  // it when the period prop moves. The 跨月 toggle below is a view preference
  // and deliberately survives the move.
  const [selectionPeriod, setSelectionPeriod] = useState(period)
  if (selectionPeriod !== period) {
    setSelectionPeriod(period)
    setSelectedIds(new Set())
  }
  /** The distinct accounts an invoice's lines posted to, with their totals —
   *  the reassign dialog ticks them off and moves them in one submit. */
  const postedAccountsOf = (invoiceId: string) => {
    const byCode = new Map<string, number>()
    for (const l of invoiceLines[invoiceId] ?? []) {
      if (!l.category_code) continue
      const next = (byCode.get(l.category_code) ?? 0) + Number(l.amount)
      byCode.set(l.category_code, Math.round(next * 100) / 100)
    }
    return [...byCode.entries()]
      .map(([code, amount]) => ({ code, amount }))
      .sort((a, b) => a.code.localeCompare(b.code))
  }

  // code → account name, labels the detail modal's line categories.
  const catLabelByCode: Record<string, string> = Object.fromEntries(
    categories.map((c) => [c.code, c.label]),
  )
  const categoryOf = (inv: Invoice): string | null =>
    categoryByInvoice[inv.id] ?? (inv.category_code ? (catLabelByCode[inv.category_code] ?? inv.category_code) : null)
  // 跨月: reveal other periods' unsettled invoices in the same list.
  const [showAllOpen, setShowAllOpen] = useState(false)
  const displayRows = showAllOpen ? [...invoices, ...extraOpenInvoices] : invoices
  // The sheet's tabs by status (2026-10-07). 'paid' takes paid_via_netting too.
  type StatusTab = 'all' | 'issued' | 'paid' | 'draft' | 'voided'
  const [statusTab, setStatusTab] = useState<StatusTab>('all')
  const inTab = (inv: Invoice, tab: StatusTab) =>
    tab === 'all' ? true : tab === 'paid' ? inv.status === 'paid' || inv.status === 'paid_via_netting' : inv.status === tab
  const tabRows = displayRows.filter((inv) => inTab(inv, statusTab))
  // The handoff counts what the tab would show, the other months included once
  // they are switched in (2026-10-10); elsewhere the month alone, as before.
  const tabCount = (tab: StatusTab) => (fin ? displayRows : invoices).filter((inv) => inTab(inv, tab)).length
  const [showSettleModal, setShowSettleModal] = useState(false)
  const [settleBank, setSettleBank] = useState<string>('')
  const [settleDate, setSettleDate] = useState<string>(officeToday())
  const [settleAmount, setSettleAmount] = useState<string>('')
  const [settleError, setSettleError] = useState<string | null>(null)
  const [settleResult, setSettleResult] = useState<string | null>(null)

  // Partial payments: what an issued invoice still owes.
  const remainingOf = (inv: Invoice) =>
    Math.round(
      (Number(inv.total_amount) - (paidByInvoice[inv.id] ?? 0) - (cnByInvoice[inv.id] ?? 0)) * 100,
    ) / 100

  // Only 'issued' subsidiary/freetext invoices are batch-settleable.
  // (Drafts need approval first; paid is done; dept_pool/inter-billing
  // needs the more involved single-voucher path.)
  function isBatchSettleable(inv: Invoice): boolean {
    return inv.status === 'issued' && inv.billable_to_type !== 'dept_pool'
  }
  // 作废 (2026-09-15): an issued invoice nothing has touched yet — no receipt,
  // no credit note. dept_pool invoices qualify too (the RPC reverses their
  // inter-billing clear as well). The RPC re-checks everything server-side.
  function isVoidable(inv: Invoice): boolean {
    return (
      inv.status === 'issued' &&
      (paidByInvoice[inv.id] ?? 0) <= 0 &&
      (cnByInvoice[inv.id] ?? 0) <= 0
    )
  }
  const [showVoidModal, setShowVoidModal] = useState(false)
  const [voidTargetIds, setVoidTargetIds] = useState<string[]>([])
  const [voidReason, setVoidReason] = useState('')
  const [voidError, setVoidError] = useState<string | null>(null)
  const [voidResult, setVoidResult] = useState<string | null>(null)
  function openVoidModal(ids: string[]) {
    setVoidTargetIds(ids)
    setVoidReason('')
    setVoidError(null)
    setShowVoidModal(true)
  }
  function handleVoid() {
    setVoidError(null)
    if (voidTargetIds.length === 0) return setVoidError(W.voidNone)
    if (!voidReason.trim()) return setVoidError(W.voidNoReason)
    startTransition(async () => {
      try {
        const res = await voidIssuedInvoices({ ids: voidTargetIds, reason: voidReason.trim() })
        setShowVoidModal(false)
        setSelectedIds(new Set())
        setVoidResult(W.voided(res.voided))
        router.refresh()
      } catch (err) {
        setVoidError(err instanceof Error ? err.message : W.voidFailed)
      }
    })
  }

  const selectedInvoices = displayRows.filter((i) => selectedIds.has(i.id) && isBatchSettleable(i))
  const selectedVoidable = displayRows.filter((i) => selectedIds.has(i.id) && isVoidable(i))
  // Batch settle collects the REMAINING balance of each invoice, not the
  // printed total (they differ once partial receipts exist).
  const selectedTotal = selectedInvoices.reduce((s, i) => s + remainingOf(i), 0)
  // A consolidated receipt covers one payer only. Detect mixed selections so
  // the UI can warn + block before the server rejects.
  const selectedPayeeKeys = new Set(
    selectedInvoices.map((i) =>
      payeeKey({
        id: i.id,
        status: i.status,
        billable_to_type: i.billable_to_type ?? null,
        company_id: i.company_id ?? null,
        billable_to_freetext_name: i.billable_to_freetext_name ?? null,
        total_amount: i.total_amount,
      }),
    ),
  )
  const crossCompany = selectedPayeeKeys.size > 1

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function selectAllIssued() {
    setSelectedIds(new Set(displayRows.filter(isBatchSettleable).map((i) => i.id)))
  }
  function clearSelection() {
    setSelectedIds(new Set())
  }

  // Batch print: open a multi-page PDF of the selected invoices (the invoice-doc
  // route already supports ?ids=a,b,c → one document page per invoice).
  function printSelected() {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    window.open(`/billing/invoice-doc?ids=${ids.join(',')}`, '_blank', 'noopener,noreferrer')
  }

  function openSettleModal() {
    setSettleError(null)
    setSettleResult(null)
    // Default bank to the first one (usually primary) if none chosen
    if (!settleBank && bankAccounts.length > 0) setSettleBank(bankAccounts[0].id)
    // Single invoice → editable received amount (partial payments); default
    // to the full remaining balance.
    setSettleAmount(
      selectedInvoices.length === 1 ? remainingOf(selectedInvoices[0]).toFixed(2) : '',
    )
    setShowSettleModal(true)
  }

  function handleBatchSettle() {
    setSettleError(null)
    setSettleResult(null)
    if (!settleBank) return setSettleError('Pick a bank account')
    if (!settleDate) return setSettleError('Pick a payment date')
    if (crossCompany) return setSettleError(W.oneCompany)
    const ids = selectedInvoices.map((i) => i.id)
    if (ids.length === 0) return setSettleError('No settleable invoices selected')
    let partialAmount: number | undefined
    if (selectedInvoices.length === 1) {
      const remaining = remainingOf(selectedInvoices[0])
      const amt = Number(settleAmount)
      if (!Number.isFinite(amt) || amt <= 0) return setSettleError(W.amountZero)
      if (amt > remaining + 0.005) return setSettleError(W.amountOver(remaining))
      partialAmount = amt
    }
    startTransition(async () => {
      try {
        const res = await settleInvoicesConsolidated({
          invoiceIds: ids,
          bankAccountId: settleBank,
          paymentDate: settleDate,
          partialAmount,
        })
        setSettleResult(
          res.isPartial
            ? W.partial(res.voucherNo, res.total, remainingOf(selectedInvoices[0]) - res.total)
            : `Receipt ${res.voucherNo} — settled ${res.settledCount} invoice(s).`,
        )
        setSelectedIds(new Set())
        setShowSettleModal(false)
        router.refresh()
      } catch (err) {
        setSettleError(err instanceof Error ? err.message : 'Consolidated settle failed')
      }
    })
  }
  const draftCount = invoices.filter((inv) => inv.status === 'draft').length

  // ─── The row menu (2026-10-02) ────────────────────────────────────────────
  // An issued invoice had six links in its Action cell, wrapping onto two
  // lines and doubling every row's height (user: "action 太多了,可以不可以
  // right click,然后我才选我要的 action"). The cell keeps the ONE action a row is
  // usually opened for; the rest are in the menu, on a right-click or the ⋯.
  const [menu, setMenu] = useState<{ invoice: Invoice; anchor: RowMenuAnchor } | null>(null)
  // The actions that are dialogs are mounted here, once, for the row that
  // asked — not in every row as before. `nonce` remounts the component so
  // choosing the same action on the same invoice opens it again. (The
  // read-only popup went on 2026-10-09: an invoice has a page of its own.)
  type DialogKind = 'edit' | 'credit_note' | 'reassign'
  const [dialog, setDialog] = useState<{ kind: DialogKind; invoice: Invoice; nonce: number } | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const openDialog = (kind: DialogKind, invoice: Invoice) => setDialog({ kind, invoice, nonce: Date.now() })

  function copyOne(inv: Invoice) {
    if (!confirm(W.copyAsk(inv.invoice_no ?? (fin ? 'this invoice' : '此发票')))) return
    setRowError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('invoice_id', inv.id)
      try {
        await copyInvoice(fd)
      } catch (e) {
        if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) throw e
        setRowError(`${inv.invoice_no ?? 'Invoice'}: ${e instanceof Error ? e.message : 'Copy failed'}`)
      }
    })
  }
  function deleteOne(inv: Invoice) {
    if (!confirm(`Delete draft invoice ${inv.invoice_no ?? inv.id.slice(0, 8)}? This cannot be undone.`)) return
    setRowError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('id', inv.id)
      try {
        await deleteDraftInvoice(fd)
      } catch (e) {
        setRowError(`${inv.invoice_no ?? 'Invoice'}: ${e instanceof Error ? e.message : 'Delete failed'}`)
      }
    })
  }
  /** Everything that can be done to this invoice in its present status. */
  function menuItems(inv: Invoice): RowMenuItem[] {
    const items: RowMenuItem[] = [
      { key: 'open', label: fin ? 'Open' : '打开', hint: fin ? 'or double-click' : '发票页 · 双击也可以', onSelect: () => router.push(pageOf(inv)) },
    ]
    // The handoff's row menu: Open, Open in new tab, then the page's own (2026-10-10).
    if (fin) {
      items.push({ key: 'new-tab', label: 'Open in new tab', onSelect: () => window.open(pageOf(inv), '_blank', 'noopener,noreferrer') })
    }
    if (inv.status === 'draft') {
      items.push({
        key: 'approve',
        label: 'Approve & issue',
        hint: fin ? 'issue it' : '开出去',
        // The row's own button does it, so its 'Issuing…' and any error show there.
        onSelect: () => document.querySelector<HTMLButtonElement>(`[data-approve="${inv.id}"] button`)?.click(),
      })
      items.push({ key: 'edit', label: 'Edit', hint: fin ? 'change it' : '改内容', onSelect: () => openDialog('edit', inv) })
    }
    if (inv.status === 'issued') {
      items.push({
        key: 'settle',
        label: 'Settle',
        hint: fin ? 'collect, write the receipt' : '收钱、开收据',
        onSelect: () =>
          isBatchSettleable(inv) ? settleOne(inv) : router.push(`/payments/new?invoice_id=${inv.id}&return_to=/billing`),
      })
    }
    if (inv.status === 'issued' || inv.status === 'paid' || inv.status === 'paid_via_netting') {
      // 2026-10-07 (user: "invoice edit 我要全部都可以改"): an issued invoice is
      // edited with the same form as a draft; its entry is corrected in place.
      items.push({ key: 'edit', label: 'Edit', hint: fin ? 'whole invoice, entry corrected in place' : '整张改，JE 原地改', onSelect: () => openDialog('edit', inv) })
    }
    items.push({
      key: 'pdf',
      label: 'PDF',
      hint: fin ? 'the invoice document' : '看发票',
      onSelect: () => window.open(`/billing/invoice-doc?id=${inv.id}`, '_blank', 'noopener,noreferrer'),
    })
    items.push({ key: 'copy', label: 'Copy', hint: fin ? 'as a new draft this month' : '复制成本月新草稿', onSelect: () => copyOne(inv) })
    if (inv.status === 'paid') {
      items.push({
        key: 'refund',
        label: 'Refund',
        hint: fin ? 'raise a refund' : '退款',
        onSelect: () => router.push(`/payments/new?mode=refund&invoice_id=${inv.id}&return_to=/billing`),
      })
    }
    if (inv.status !== 'draft' && inv.status !== 'voided') {
      items.push({ key: 'credit_note', label: '+ Credit note', hint: fin ? 'raise a CN' : '开 CN', onSelect: () => openDialog('credit_note', inv) })
      items.push({ key: 'reassign', label: fin ? 'Change account' : '改 account', hint: fin ? 'another GL account' : '换科目', onSelect: () => openDialog('reassign', inv) })
    }
    const last: RowMenuItem[] = []
    if (isVoidable(inv)) {
      last.push({ key: 'void', label: fin ? 'Void' : '作废', hint: fin ? 'the whole invoice' : '整张作废', danger: true, onSelect: () => openVoidModal([inv.id]) })
    }
    if (inv.status === 'draft') {
      last.push({ key: 'delete', label: 'Delete', hint: fin ? 'this draft' : '删掉这张 draft', danger: true, onSelect: () => deleteOne(inv) })
    }
    return last.length > 0 ? [...items, 'sep', ...last] : items
  }

  // One invoice settles in the SAME dialog the batch uses, so Billing never
  // disappears under you (user, 2026-09-29). It cannot cover a dept_pool
  // invoice — inter-billing and own-share settle by netting on the voucher
  // page — so that one still leaves, and comes back here when it is saved.
  function settleOne(inv: Invoice) {
    setSettleError(null)
    setSettleResult(null)
    setSelectedIds(new Set([inv.id]))
    if (!settleBank && bankAccounts.length > 0) setSettleBank(bankAccounts[0].id)
    setSettleAmount(remainingOf(inv).toFixed(2))
    setShowSettleModal(true)
  }

  // …and the receipt it made is announced here, not left behind on the
  // voucher page. Read off the URL so no server plumbing is needed, then
  // dropped from it so a refresh does not repeat the banner.
  const [returnedReceipt, setReturnedReceipt] = useState<string | null>(null)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const receipt = params.get('receipt')
    if (!receipt) return
    setReturnedReceipt(receipt)
    params.delete('receipt')
    const query = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : ''))
  }, [])

  const otherCount = extraOpenInvoices.length
  const dialogSub = fin ? 'text-graphite text-xs mt-1' : 'font-serif italic text-graphite text-xs mt-1'
  const visibleTotal = (rows: Invoice[]) => rows.filter((inv) => inv.status !== 'voided').reduce((t, inv) => t + Number(inv.total_amount), 0)
  /** Who the invoice bills, with what kind of party that is — the handoff's Bill to. */
  const partyOf = (inv: Invoice) =>
    invoiceParty(
      {
        company_id: inv.company_id,
        billable_to_type: inv.billable_to_type ?? null,
        billable_to_department_id: inv.billable_to_department_id ?? null,
        billable_to_freetext_name: inv.billable_to_freetext_name ?? null,
      },
      companyMap,
      departmentMap,
    )
  const tabs = (
    <SlidingTabs
      variant="control"
      items={[
        { key: 'all', label: 'All', count: tabCount('all') },
        { key: 'issued', label: 'Issued', count: tabCount('issued') },
        { key: 'paid', label: 'Paid', count: tabCount('paid') },
        { key: 'draft', label: 'Draft', count: tabCount('draft') },
        { key: 'voided', label: 'Voided', count: tabCount('voided') },
      ]}
      active={statusTab}
      onTabChange={(key) => setStatusTab(key as StatusTab)}
    />
  )

  return (
    <section className="fin-queue invoices-sheet mb-12">
      {rowError ? (
        <div className="mb-4 flex items-baseline justify-between gap-3 bg-danger-bg border border-danger text-danger rounded-md px-3 py-2">
          <span className="font-sans text-sm">{rowError}</span>
          <button type="button" onClick={() => setRowError(null)} className="font-sans text-xs opacity-70 hover:opacity-100">
            {W.dismiss}
          </button>
        </div>
      ) : null}
      {returnedReceipt ? (
        <div className="mb-4 flex items-baseline justify-between gap-3 border border-ledger/40 bg-ledger/10 text-ledger rounded-md px-3 py-2">
          <span className="font-sans text-sm">{W.receiptBack(returnedReceipt)}</span>
          <button
            type="button"
            onClick={() => setReturnedReceipt(null)}
            className="font-sans text-xs opacity-70 hover:opacity-100"
          >
            {W.dismiss}
          </button>
        </div>
      ) : null}
      <div className="sect-head">
        <h2>Invoices</h2>
        <span className="rule" aria-hidden />
        <span className="count">
          {invoices.length} {invoices.length === 1 ? 'INVOICE' : 'INVOICES'} · {dayjs(period).format('MMMM YYYY').toUpperCase()}
          {fin
            ? showAllOpen && otherCount > 0
              ? ` + ${otherCount} OTHER ${otherCount === 1 ? 'MONTH' : 'MONTHS'}`
              : ''
            : selectedIds.size > 0
              ? ` · ${selectedIds.size} SELECTED`
              : ''}
        </span>
      </div>

      {invoices.length === 0 && otherCount === 0 ? (
        fin ? (
          <div className="bil-empty">No invoices.</div>
        ) : (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No invoices generated for this period yet. Finance generates them from
              the HR cost submission + billing configs (Step 5 <em>Generate invoices</em>
              button lands next).
            </p>
          </div>
        )
      ) : (
        <>
          {fin ? (
            // The handoff's tab row: the statuses, and at its end the switch
            // that brings other months' unsettled invoices in (跨月, 2026-08-20),
            // so one receipt can cover a payer across months.
            <div className="bil-tabrow">
              {tabs}
              {otherCount > 0 ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={showAllOpen}
                  onClick={() => setShowAllOpen((v) => !v)}
                  title="Unsettled invoices from other months — tick them into the same receipt"
                  className="bil-switch"
                >
                  <span className="bil-switch-track" aria-hidden>
                    <span className="bil-switch-knob" />
                  </span>
                  Include other months · {otherCount}
                </button>
              ) : null}
            </div>
          ) : (
            tabs
          )}

          {/* The handoff's selection bar sits ABOVE the table (2026-10-10). */}
          {fin && selectedIds.size > 0 && !showSettleModal ? (
            <div className="bil-selbar" role="region" aria-label="What is ticked">
              <span>
                {selectedIds.size} selected · RM {money(selectedTotal)}
              </span>
              <div className="bil-selbar-actions">
                <button type="button" onClick={clearSelection} className="bil-btn">
                  Clear
                </button>
                <button type="button" onClick={printSelected} className="bil-btn">
                  Print selected
                </button>
                <button
                  type="button"
                  onClick={() => openVoidModal(selectedVoidable.map((i) => i.id))}
                  disabled={selectedVoidable.length === 0 || isPending}
                  title="Only an issued invoice with no money in and no credit note"
                  className="bil-btn danger"
                >
                  Void selected {selectedVoidable.length}
                </button>
                <button
                  type="button"
                  onClick={openSettleModal}
                  disabled={selectedInvoices.length === 0 || crossCompany}
                  title={crossCompany ? 'One receipt settles one company’s invoices' : 'Settle them on one receipt'}
                  className="bil-btn primary"
                >
                  {crossCompany ? 'Different companies can’t be combined' : `Settle ${selectedInvoices.length} →`}
                </button>
              </div>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <SortableTable<Invoice>
              layoutId="billing.invoices"
              layoutTitle="Invoices"
              canSetDefault={canSetDefault}
              // The Finance revamp (2026-10-09): the list in a scroll box, columns
              // resized against their neighbour.
              scrollBox
              resizeMode="neighbour"
              openLabel="Open the invoice →"
              rowClassName={(inv) =>
                [selectedIds.has(inv.id) ? 'st-selected' : '', inv.status === 'voided' ? 'inv-void' : ''].filter(Boolean).join(' ') || undefined
              }
              emptyState={fin ? <span className="text-muted text-sm">No invoices.</span> : undefined}
              footer={(visible) =>
                fin ? (
                  // The handoff's Total row: the figure under the Amount, voided left out.
                  <ColumnFoot label="Total" labelSkip={['_select']} cells={{ total_amount: formatMoney(visibleTotal(visible)) }} />
                ) : (
                  <tr>
                    <td colSpan={1000} className="q-foot">
                      <span>
                        {visible.length} {visible.length === 1 ? 'invoice' : 'invoices'} · voided left out of the total
                      </span>
                      <span className="num">{formatMoney(visibleTotal(visible))}</span>
                    </td>
                  </tr>
                )
              }
              onRowOpen={(inv) => router.push(pageOf(inv))}
              onRowContextMenu={(inv, e) => {
                e.preventDefault()
                setMenu({ invoice: inv, anchor: { x: e.clientX, y: e.clientY } })
              }}
              rows={tabRows}
              getRowKey={(inv) => inv.id}
              defaultSort={{ key: 'invoice_no', dir: 'desc' }}
              searchKeys={['invoice_no', 'company', 'billing_mode', 'description']}
              searchPlaceholder="Search invoice # / company / mode…"
              toolbarRight={
                fin ? (
                  // Extras the handoff lacks, kept: approve every draft at once,
                  // and tick everything that can be settled.
                  draftCount > 0 || displayRows.some(isBatchSettleable) ? (
                    <>
                      {draftCount > 0 ? <BulkIssueInvoicesButton period={period} count={draftCount} /> : null}
                      {displayRows.some(isBatchSettleable) ? (
                        <button type="button" onClick={selectAllIssued} className="bil-btn">
                          Select all to settle
                        </button>
                      ) : null}
                    </>
                  ) : undefined
                ) : displayRows.some(isBatchSettleable) || displayRows.some(isVoidable) || extraOpenInvoices.length > 0 ? (
                  <>
                    {draftCount > 0 ? <BulkIssueInvoicesButton period={period} count={draftCount} /> : null}
                    {extraOpenInvoices.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setShowAllOpen((v) => !v)}
                        title="同一家公司跨月的未结发票可以一起勾选、开一张收据"
                        className={`border rounded-md px-3 py-1.5 text-xs font-sans transition-colors whitespace-nowrap ${
                          showAllOpen
                            ? 'bg-accent text-white border-accent hover:bg-accent-hover'
                            : 'bg-surface hover:bg-surface-2 border-hairline text-ink'
                        }`}
                      >
                        {showAllOpen ? '只看本月' : `跨月：其他月份未结 +${extraOpenInvoices.length}`}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={selectAllIssued}
                      className="bg-surface hover:bg-surface-2 border border-hairline rounded-md px-3 py-1.5 text-xs font-sans text-ink transition-colors whitespace-nowrap"
                    >
                      全选可结算发票
                    </button>
                  </>
                ) : undefined
              }
              columns={[
                {
                  key: '_select',
                  label: '',
                  sortable: false,
                  pinned: 'start',
                  resizable: false,
                  mobile: 'keep',
                  cellClassName: 'st-tick-cell',
                  render: (inv) => {
                    const settleable = isBatchSettleable(inv)
                    const selectable = settleable || isVoidable(inv)
                    return (
                      // The whole cell is the tap target, not the 18px box.
                      <label className="st-tick">
                        <input
                          type="checkbox"
                          disabled={!selectable || isPending}
                          checked={selectedIds.has(inv.id)}
                          onChange={() => toggle(inv.id)}
                          className="accent-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label={selectable ? `Select ${inv.invoice_no ?? 'invoice'}` : 'Not selectable'}
                        />
                      </label>
                    )
                  },
                },
                {
                  key: 'invoice_no',
                  group: '基本',
                  label: 'Invoice #',
                  // The phone's small print under Bill to carries the number —
                  // on the Finance view the number titles the row (the handoff).
                  mobile: fin ? 'keep' : 'drop',
                  // The number opens the invoice's page (2026-10-09) — a link, so
                  // a middle-click or Ctrl-click opens it in a new tab.
                  render: (inv) => (
                    <>
                      <Link
                        href={pageOf(inv)}
                        className="font-sans text-[12px] font-medium text-ink hover:text-accent transition-colors underline-offset-2 hover:underline whitespace-nowrap"
                      >
                        {inv.invoice_no ?? inv.id.slice(0, 8)}
                      </Link>
                      {fin ? (
                        // The phone's small print: who it bills, then the status and the date.
                        <span className="q-sub md:hidden">
                          <span className="q-sub-no">{partyOf(inv).name}</span>
                          <span className="q-sub-by">
                            <span className="by">
                              <InvoiceStatus status={inv.status} />
                            </span>
                            <span className="on">{inv.invoice_date ? dayjs(inv.invoice_date).format('D MMM') : ''}</span>
                          </span>
                        </span>
                      ) : null}
                    </>
                  ),
                  sortValue: (inv) => inv.invoice_no ?? inv.id,
                  // The Finance view's phone small print under the number may wrap.
                  cellClassName: fin ? undefined : 'whitespace-nowrap',
                },
                {
                  // 2026-10-02 (user: "invoice 没有日期"). The date printed on the
                  // invoice, with its year: 跨月 brings other months' invoices
                  // into this list, and the number alone does not say which.
                  key: 'invoice_date',
                  group: '日期',
                  label: 'Date',
                  mobile: 'detail',
                  render: (inv) =>
                    inv.invoice_date ? dayjs(inv.invoice_date).format('D MMM YYYY') : <span className="text-muted">—</span>,
                  sortValue: (inv) => (inv.invoice_date ? new Date(inv.invoice_date) : null),
                  filterable: true,
                  range: 'date',
                  cellClassName: 'text-graphite whitespace-nowrap',
                },
                {
                  key: 'company',
                  group: '基本',
                  label: 'Bill to',
                  mobile: fin ? 'detail' : 'keep',
                  render: (inv) => {
                    if (fin) {
                      // The handoff's Bill to: the party's name, its kind under it.
                      const party = partyOf(inv)
                      return (
                        <>
                          <div className="text-ink">{party.name}</div>
                          <div className="mt-0.5 text-[11px] text-muted">{party.kind}</div>
                        </>
                      )
                    }
                    const labels = resolvePartyLabel(inv, companyMap, departmentMap)
                    // A subsidiary by its code, its name under it (the sheet, 2026-10-07).
                    const code = inv.company_id ? labels.sub : null
                    const firstLine = (inv.description ?? '').trim().split(/\r?\n/)[0]
                    return (
                      <>
                        <div className="font-serif text-md text-ink">
                          <span>{code ?? labels.primary}</span>
                          {firstLine ? (
                            <span className="md:hidden text-graphite">{` · ${firstLine.length > 40 ? `${firstLine.slice(0, 40)}…` : firstLine}`}</span>
                          ) : null}
                        </div>
                        <div className="font-mono text-xs text-muted">{code ? labels.primary : labels.sub}</div>
                        {/* The phone's small print: the number, then the status and the date. */}
                        <span className="q-sub md:hidden">
                          {inv.invoice_no ? <span className="q-sub-no">{inv.invoice_no}</span> : null}
                          <span className="q-sub-by">
                            <span className="by">
                              <InvoiceStatus status={inv.status} />
                            </span>
                            <span className="on">{inv.invoice_date ? dayjs(inv.invoice_date).format('D MMM') : ''}</span>
                          </span>
                        </span>
                      </>
                    )
                  },
                  sortValue: (inv) => (fin ? partyOf(inv).name : resolvePartyLabel(inv, companyMap, departmentMap).primary),
                  filterValue: (inv) => (fin ? partyOf(inv).name : resolvePartyLabel(inv, companyMap, departmentMap).primary),
                  filterable: true,
                },
                {
                  key: 'description',
                  group: '基本',
                  label: 'Description',
                  mobile: 'detail',
                  render: (inv) => {
                    const d = inv.description?.trim()
                    if (!d) return <span className="text-muted">—</span>
                    const firstLine = d.split(/\r?\n/)[0]
                    const text = firstLine.length > 48 ? `${firstLine.slice(0, 48)}…` : firstLine
                    return <span title={d}>{text}</span>
                  },
                  sortValue: (inv) => inv.description ?? '',
                  filterValue: (inv) => inv.description ?? '',
                  filterable: true,
                  // The handoff's UI text is the body face (2026-10-10).
                  cellClassName: fin ? undefined : 'font-serif italic text-graphite text-sm',
                },
                {
                  // What the lines post to (2026-10-07): the account names, or
                  // the header's category for an invoice without lines.
                  key: 'category',
                  group: '入账',
                  label: 'Category',
                  mobile: 'detail',
                  filterable: true,
                  render: (inv) => categoryOf(inv) ?? <span className="text-muted">—</span>,
                  sortValue: (inv) => categoryOf(inv) ?? '',
                  filterValue: (inv) => categoryOf(inv) ?? '',
                  cellClassName: fin ? undefined : 'font-serif italic text-graphite text-sm',
                },
                {
                  key: 'billing_mode',
                  group: '入账',
                  label: 'Mode',
                  mobile: 'detail',
                  // The handoff names every mode in words ("HR attribution"); elsewhere as before.
                  render: (inv) => (fin ? billingModeLabel(inv.billing_mode, extraModes) : formatBillingMode(inv.billing_mode)),
                  sortValue: (inv) => (fin ? billingModeLabel(inv.billing_mode, extraModes) : formatBillingMode(inv.billing_mode)),
                  filterable: true,
                  cellClassName: fin ? undefined : 'font-serif italic text-graphite text-sm',
                },
                {
                  key: 'total_amount',
                  group: '金额',
                  label: 'Amount',
                  align: 'right',
                  mobile: 'keep',
                  filterable: true,
                  range: 'number',
                  render: (inv) => {
                    const paid = paidByInvoice[inv.id] ?? 0
                    const credited = cnByInvoice[inv.id] ?? 0
                    if (inv.status !== 'issued' || (paid <= 0 && credited <= 0)) {
                      return formatMoney(Number(inv.total_amount))
                    }
                    return (
                      <div>
                        <div>{formatMoney(Number(inv.total_amount))}</div>
                        <div className="font-mono text-[11px] text-alert">
                          {paid > 0 ? `part-paid ${formatMoney(paid)} · ` : ''}
                          {credited > 0 ? `CN −${formatMoney(credited)} · ` : ''}
                          bal {formatMoney(remainingOf(inv))}
                        </div>
                      </div>
                    )
                  },
                  sortValue: (inv) => Number(inv.total_amount),
                  // Figures at 400 on the Finance view — the handoff keeps 500/600 for totals.
                  cellClassName: fin ? 'font-mono tabular text-ink whitespace-nowrap' : 'font-mono tabular font-medium text-ink',
                },
                {
                  key: 'status',
                  group: '基本',
                  label: 'Status',
                  // The phone's small print carries the chip.
                  mobile: 'drop',
                  render: (inv) => <InvoiceStatus status={inv.status} />,
                  sortValue: (inv) => inv.status,
                  filterable: true,
                },
                {
                  key: 'action',
                  label: 'Action',
                  sortable: false,
                  align: 'right',
                  pinned: 'end',
                  // On a phone the opened row offers the same Settle and ⋯.
                  mobile: 'detail',
                  render: (inv) => (
                    <div className="flex items-center justify-end gap-2">
                      {/* The one action this row is usually opened for. */}
                      {inv.status === 'draft' ? (
                        <span data-approve={inv.id}>
                          <ApproveInvoiceButton id={inv.id} />
                        </span>
                      ) : inv.status === 'issued' ? (
                        isBatchSettleable(inv) ? (
                          <button
                            type="button"
                            onClick={() => settleOne(inv)}
                            className={fin ? 'inv-settle bil-row-btn' : 'inv-settle text-xs text-accent hover:text-accent-hover font-serif italic'}
                            title={W.settleHere}
                          >
                            Settle →
                          </button>
                        ) : (
                          <Link
                            href={`/payments/new?invoice_id=${inv.id}&return_to=/billing`}
                            className={fin ? 'inv-settle bil-row-btn' : 'inv-settle text-xs text-accent hover:text-accent-hover font-serif italic'}
                            title={W.settleVoucher}
                          >
                            Settle →
                          </Link>
                        )
                      ) : null}
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-label={`Actions for ${inv.invoice_no ?? 'invoice'}`}
                        title={W.more}
                        onClick={(e) => {
                          const r = e.currentTarget.getBoundingClientRect()
                          setMenu({ invoice: inv, anchor: { x: r.right - 220, y: r.bottom + 4 } })
                        }}
                        className="grid place-items-center h-7 w-7 rounded-md border border-transparent text-graphite text-base leading-none hover:border-hairline hover:bg-surface"
                      >
                        ⋯
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          </div>

          {/* What is ticked, and what to do with it (2026-10-07): the bar the
              Approvals queue has, instead of a summary squeezed into the toolbar. */}
          {!fin && selectedIds.size > 0 && !showSettleModal ? (
            <div className="bulk-bar" role="region" aria-label="Decision on what is ticked">
              <div className="bulk-bar-l">
                <b>{selectedIds.size}</b> selected · <b>RM {selectedTotal.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</b>
                <small>
                  {' · '}
                  {crossCompany ? '一张收据只能结同一家公司的单' : 'one receipt covers them all — same payer only'}
                </small>
              </div>
              <div className="bulk-bar-r">
                <button type="button" onClick={clearSelection} className="bulk-quiet font-sans text-sm">
                  Clear
                </button>
                <button type="button" onClick={printSelected} className="bulk-sec font-serif italic text-sm">
                  Print selected
                </button>
                <button
                  type="button"
                  onClick={() => openVoidModal(selectedVoidable.map((i) => i.id))}
                  disabled={selectedVoidable.length === 0 || isPending}
                  title="作废所选：只对还没收钱、没 credit note 的 issued 发票"
                  className="bulk-danger font-serif italic text-sm"
                >
                  作废所选 {selectedVoidable.length}
                </button>
                <button
                  type="button"
                  onClick={openSettleModal}
                  disabled={selectedInvoices.length === 0 || crossCompany}
                  title={crossCompany ? '一张收据只能结同一家公司的单' : '合并结算，生成一张收据'}
                  className="bulk-pri font-serif italic text-sm"
                >
                  {crossCompany ? '不同公司不能合并' : `Settle ${selectedInvoices.length} →`}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      {menu ? (
        <RowMenu
          title={`${menu.invoice.invoice_no ?? 'Invoice'} · ${menu.invoice.status}`}
          anchor={menu.anchor}
          items={menuItems(menu.invoice)}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {/* The dialogs the menu opens — one instance, for the row that asked. */}
      {dialog?.kind === 'edit' ? (
        <EditInvoiceButton
          key={`edit:${dialog.invoice.id}:${dialog.nonce}`}
          autoOpen
          hideTrigger
          id={dialog.invoice.id}
          invoiceNo={dialog.invoice.invoice_no}
          status={dialog.invoice.status}
          // Money in against it — a settlement, or part-payments on an issued one.
          settled={dialog.invoice.status === 'paid' || dialog.invoice.status === 'paid_via_netting' || (paidByInvoice[dialog.invoice.id] ?? 0) > 0}
          initial={{
            total_amount: Number(dialog.invoice.total_amount),
            category_code: dialog.invoice.category_code ?? null,
            description: dialog.invoice.description ?? null,
            invoice_date: dialog.invoice.invoice_date ?? null,
            due_date: dialog.invoice.due_date ?? null,
            reference_no: dialog.invoice.reference_no ?? null,
            billing_mode: dialog.invoice.billing_mode ?? null,
            billable_to_type: dialog.invoice.billable_to_type ?? null,
            company_id: dialog.invoice.company_id ?? null,
            billable_to_department_id: dialog.invoice.billable_to_department_id ?? null,
            billable_to_freetext_name: dialog.invoice.billable_to_freetext_name ?? null,
            billable_to_freetext_address: dialog.invoice.billable_to_freetext_address ?? null,
            billable_to_freetext_phone: dialog.invoice.billable_to_freetext_phone ?? null,
            billable_to_freetext_email: dialog.invoice.billable_to_freetext_email ?? null,
            period_month: dialog.invoice.period_month ?? null,
          }}
          initialLines={invoiceLines[dialog.invoice.id] ?? []}
          categories={categories ?? []}
          companies={Array.from(companyMap, ([cid, c]) => ({ id: cid, name: c.name }))}
          departments={Array.from(departmentMap, ([did, dname]) => ({ id: did, name: dname }))}
        />
      ) : null}
      {dialog?.kind === 'credit_note' ? (
        <CreateCreditNoteButton
          key={`cn:${dialog.invoice.id}:${dialog.nonce}`}
          autoOpen
          hideTrigger
          invoiceId={dialog.invoice.id}
          invoiceNo={dialog.invoice.invoice_no}
          invoiceTotal={Number(dialog.invoice.total_amount)}
          payeeLabel={resolvePartyLabel(dialog.invoice, companyMap, departmentMap).primary}
          categories={categories}
          extraModes={extraModes}
        />
      ) : null}
      {dialog?.kind === 'reassign' ? (
        <ReassignInvoiceGlButton
          key={`gl:${dialog.invoice.id}:${dialog.nonce}`}
          autoOpen
          hideTrigger
          invoiceId={dialog.invoice.id}
          invoiceNo={dialog.invoice.invoice_no}
          currentCategory={dialog.invoice.category_code ?? null}
          categories={categories.map((c) => ({ code: c.code, label: c.label }))}
          postedAccounts={postedAccountsOf(dialog.invoice.id)}
        />
      ) : null}

      {/* Batch-settle modal */}
      {showSettleModal ? (
        <div
          className="fixed inset-0 z-50 bg-scrim/45 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
          {...backdropDismiss(() => !isPending && setShowSettleModal(false))}
        >
          <div
            className="bg-paper border border-hairline rounded-panel shadow-xl w-full max-w-lg my-12"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline">
              <div>
                <h2 className="font-serif text-2xl text-ink">{W.settleTitle}</h2>
                <p className={dialogSub}>{W.settleSub(selectedInvoices.length, selectedTotal)}</p>
              </div>
              <button
                onClick={() => !isPending && setShowSettleModal(false)}
                disabled={isPending}
                className="text-muted hover:text-ink text-2xl leading-none pt-1 disabled:opacity-50"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <label className="block">
                <div className="text-xs font-sans font-medium text-graphite mb-1">
                  Bank account <span className="text-danger">*</span>
                </div>
                <select
                  value={settleBank}
                  onChange={(e) => setSettleBank(e.target.value)}
                  disabled={isPending}
                  className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
                >
                  <option value="">Select bank…</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name}{b.account_number ? ` · ${b.account_number}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <div className="text-xs font-sans font-medium text-graphite mb-1">
                  Payment date <span className="text-danger">*</span>
                </div>
                <input
                  type="date"
                  value={settleDate}
                  onChange={(e) => setSettleDate(e.target.value)}
                  disabled={isPending}
                  className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink font-mono focus:outline-none focus:border-accent-border"
                />
              </label>
              {selectedInvoices.length === 1 ? (
                <label className="block">
                  <div className="text-xs font-sans font-medium text-graphite mb-1">
                    {W.amountLabel} <span className="text-danger">*</span>
                  </div>
                  <input
                    type="text"
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    disabled={isPending}
                    className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink font-mono tabular focus:outline-none focus:border-accent-border"
                  />
                  <p className="text-[11px] font-sans text-muted mt-1">
                    {W.balance(remainingOf(selectedInvoices[0]))}
                    {paidByInvoice[selectedInvoices[0].id] ? W.received(paidByInvoice[selectedInvoices[0].id] ?? 0) : null}
                    {W.partialHint}
                  </p>
                </label>
              ) : null}
              <div className="text-xs font-mono text-muted">
                Invoices to settle:
              </div>
              <ul className="max-h-48 overflow-y-auto text-xs font-mono space-y-1 border border-hairline rounded-md p-2 bg-surface">
                {selectedInvoices.map((inv) => (
                  <li key={inv.id} className="flex justify-between">
                    <span>{inv.invoice_no ?? inv.id.slice(0, 8)}</span>
                    <span className="tabular">RM {Number(inv.total_amount).toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>
                  </li>
                ))}
              </ul>
              {settleError ? (
                <div className="bg-danger/10 border border-danger/30 text-danger rounded-md px-3 py-2 text-sm font-sans">
                  {settleError}
                </div>
              ) : null}
              {settleResult ? (
                <div className="bg-surface border border-hairline rounded-md px-3 py-2 text-sm font-sans">
                  {settleResult}
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-hairline bg-surface">
              <button
                onClick={() => !isPending && setShowSettleModal(false)}
                disabled={isPending}
                className="text-sm font-sans text-muted hover:text-ink disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBatchSettle}
                disabled={isPending || selectedInvoices.length === 0 || crossCompany}
                className={`bg-accent hover:bg-accent-hover ${fin ? 'text-ink font-sans font-medium' : 'text-white font-serif italic'} text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isPending ? W.settling : W.settleGo(selectedInvoices.length)}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── 作废已开发票 (2026-09-15) ── */}
      {voidResult && !showVoidModal ? (
        <div className="mt-4 bg-surface border border-hairline rounded-md px-3 py-2 text-sm font-sans flex items-center justify-between">
          <span>{voidResult}</span>
          <button type="button" onClick={() => setVoidResult(null)} className="text-xs text-muted hover:text-ink">{W.close}</button>
        </div>
      ) : null}
      {showVoidModal ? (
        <div
          className="fixed inset-0 z-50 bg-scrim/45 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
          {...backdropDismiss(() => !isPending && setShowVoidModal(false))}
        >
          <div
            className="bg-paper border border-hairline rounded-panel shadow-xl w-full max-w-lg my-12"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline">
              <div>
                <h2 className="font-serif text-2xl text-ink">{W.voidTitle}</h2>
                <p className={dialogSub}>{W.voidSub}</p>
              </div>
              <button
                onClick={() => !isPending && setShowVoidModal(false)}
                disabled={isPending}
                className="text-muted hover:text-ink text-2xl leading-none pt-1 disabled:opacity-50"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <ul className="text-sm font-mono divide-y divide-hairline border border-hairline rounded-md max-h-48 overflow-y-auto">
                {displayRows
                  .filter((i) => voidTargetIds.includes(i.id))
                  .map((inv) => (
                    <li key={inv.id} className="px-3 py-1.5 flex items-center justify-between">
                      <span>{inv.invoice_no ?? inv.id.slice(0, 8)}</span>
                      <span className="tabular">RM {Number(inv.total_amount).toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>
                    </li>
                  ))}
              </ul>
              <label className="block">
                <div className="text-xs font-sans font-medium text-graphite mb-1">
                  {W.reason} <span className="text-danger">*</span>
                </div>
                <input
                  type="text"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  disabled={isPending}
                  placeholder={W.reasonHint}
                  className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border disabled:opacity-50"
                />
              </label>
              {voidError ? (
                <div className="bg-danger/10 border border-danger/30 text-danger rounded-md px-3 py-2 text-sm font-sans">
                  {voidError}
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-hairline bg-surface">
              <button
                onClick={() => !isPending && setShowVoidModal(false)}
                disabled={isPending}
                className="text-sm font-sans text-muted hover:text-ink disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleVoid}
                disabled={isPending || voidTargetIds.length === 0 || !voidReason.trim()}
                className={`bg-danger hover:opacity-90 text-white ${fin ? 'font-sans font-medium' : 'font-serif italic'} text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isPending ? W.voiding : W.voidGo(voidTargetIds.length)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function InvoiceStatus({ status }: { status: string }) {
  // The sheet's chip (2026-10-07): issued waits, paid is done, the rest is quiet.
  const tone = status === 'issued' ? ' alert' : status === 'paid' || status === 'paid_via_netting' ? ' ledger' : status === 'voided' ? ' danger' : ''
  return (
    <span className={`chip${tone}`}>
      <i className="dot" />
      {status === 'paid_via_netting' ? 'paid via netting' : status}
    </span>
  )
}

