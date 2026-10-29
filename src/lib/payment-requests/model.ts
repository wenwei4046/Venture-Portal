// Staff payment requests (2026-10-29, PR ② of docs/module-spec-payment-requests.md — the claim process the user settled
// with the boss): a claim ("I paid — pay me back") or a direct pay to a supplier, what it was for, its receipts, who is
// paid and which pool pays — as the database hands it (`payment_requests_json`), as the Claim page lists it, as the New
// request window builds it, and as Finance's Create PV starts from it. Pure.

import type { CardTone, ChipTone, HubCardItem } from '@/components/finv/Hub'
import type { HrIconName } from '@/components/hrv/icons'
import { rm } from '@/lib/fin-app/page-model'
import { officeDay } from '@/lib/office-time'

export type RequestKind = 'claim' | 'direct_pay'
export type RequestStatus = 'draft' | 'pending_approval' | 'with_finance' | 'rejected' | 'in_pv' | 'paid' | 'cancelled'

/** The private bucket a request's receipts go up into (mig 20261029180000) — the uploader's own folder. */
export const PR_BUCKET = 'payment-request-files'

/** As the database holds them (payment_request_save's own limits), and a file as the voucher's attachments take it. */
export const PR_LIMITS = { items: 30, shares: 10, files: 10, fileBytes: 25 * 1024 * 1024, words: 200 } as const

export interface RequestItem {
  id: string
  description: string
  amount: number
}

export interface RequestShare {
  id: string
  party: 'department' | 'company'
  departmentId: string | null
  departmentName: string | null
  companyId: string | null
  companyName: string | null
  amount: number
  /** Finance's answer: Yes drafts the invoice when the PV is made; null until answered. */
  billBack: boolean | null
  invoiceId: string | null
  invoiceNo: string | null
  invoiceStatus: string | null
}

export interface RequestFile {
  id: string
  kind: 'receipt' | 'supplier_invoice'
  name: string
  contentType: string | null
  size: number | null
}

export interface PaymentRequest {
  id: string
  /** PRQ-2610-0001 — from its first Submit. */
  requestNo: string | null
  status: RequestStatus
  kind: RequestKind
  /** The reader sent it. */
  mine: boolean
  requesterName: string
  departmentId: string
  departmentName: string
  /** The requester's department's pool, `dept_pool_<segment>`. */
  pool: string | null
  billingMode: string | null
  /** A claim paid into the salary account on the People record. */
  payToSalary: boolean
  payeeName: string | null
  payeeBank: string | null
  /** Whole for the requester and a reader with the Bank tick, else `•••• 4821`. */
  payeeAccount: string | null
  description: string
  total: number
  submittedAt: string | null
  createdAt: string
  updatedAt: string
  rejectedStage: 'approval' | 'finance' | null
  rejectedAt: string | null
  rejectReason: string | null
  rejectedByName: string | null
  pvId: string | null
  pvNo: string | null
  pvStatus: string | null
  items: RequestItem[]
  shares: RequestShare[]
  files: RequestFile[]
}

/** What the New request window offers (`payment_request_context`). */
export interface RequestContext {
  name: string
  departmentId: string
  departmentName: string
  pool: string | null
  /** The salary account HR holds: its bank and last four — or none on file. */
  salaryAccount: { bank: string; last4: string } | null
  departments: Array<{ id: string; name: string }>
  companies: Array<{ id: string; name: string }>
}

// ── Reading the database's answers ─────────────────────────────────────────

type Raw = Record<string, unknown>
const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {})
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const n = (v: unknown): number => {
  const x = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0
}
const list = (v: unknown): Raw[] => (Array.isArray(v) ? v.map(obj) : [])
const STATUSES: readonly RequestStatus[] = ['draft', 'pending_approval', 'with_finance', 'rejected', 'in_pv', 'paid', 'cancelled']

export function parseRequest(raw: unknown): PaymentRequest | null {
  const r = obj(raw)
  const id = str(r.id)
  const status = STATUSES.find((s) => s === r.status)
  if (!id || !status) return null
  return {
    id,
    requestNo: str(r.requestNo),
    status,
    kind: r.kind === 'direct_pay' ? 'direct_pay' : 'claim',
    mine: r.mine === true,
    requesterName: str(r.requesterName) ?? 'Somebody',
    departmentId: str(r.departmentId) ?? '',
    departmentName: str(r.departmentName) ?? '—',
    pool: str(r.pool),
    billingMode: str(r.billingMode),
    payToSalary: r.payToSalary !== false,
    payeeName: str(r.payeeName),
    payeeBank: str(r.payeeBank),
    payeeAccount: str(r.payeeAccount),
    description: str(r.description) ?? '',
    total: n(r.total),
    submittedAt: str(r.submittedAt),
    createdAt: str(r.createdAt) ?? '',
    updatedAt: str(r.updatedAt) ?? '',
    rejectedStage: r.rejectedStage === 'approval' || r.rejectedStage === 'finance' ? r.rejectedStage : null,
    rejectedAt: str(r.rejectedAt),
    rejectReason: str(r.rejectReason),
    rejectedByName: str(r.rejectedByName),
    pvId: str(r.pvId),
    pvNo: str(r.pvNo),
    pvStatus: str(r.pvStatus),
    items: list(r.items).map((i) => ({ id: str(i.id) ?? '', description: str(i.description) ?? '', amount: n(i.amount) })),
    shares: list(r.shares).map((s) => ({
      id: str(s.id) ?? '',
      party: s.party === 'company' ? 'company' : 'department',
      departmentId: str(s.departmentId),
      departmentName: str(s.departmentName),
      companyId: str(s.companyId),
      companyName: str(s.companyName),
      amount: n(s.amount),
      billBack: typeof s.billBack === 'boolean' ? s.billBack : null,
      invoiceId: str(s.invoiceId),
      invoiceNo: str(s.invoiceNo),
      invoiceStatus: str(s.invoiceStatus),
    })),
    files: list(r.files).map((f) => ({
      id: str(f.id) ?? '',
      kind: f.kind === 'supplier_invoice' ? 'supplier_invoice' : 'receipt',
      name: str(f.name) ?? 'file',
      contentType: str(f.contentType),
      size: typeof f.size === 'number' ? f.size : f.size == null ? null : n(f.size),
    })),
  }
}

export function parseRequests(raw: unknown): PaymentRequest[] {
  return (Array.isArray(raw) ? raw : []).map(parseRequest).filter((r): r is PaymentRequest => r !== null)
}

export function parseContext(raw: unknown): RequestContext | null {
  const c = obj(raw)
  const departmentId = str(c.departmentId)
  if (!departmentId) return null
  const acct = obj(c.salaryAccount)
  const named = (v: unknown) => list(v).map((x) => ({ id: str(x.id) ?? '', name: str(x.name) ?? '' })).filter((x) => x.id && x.name)
  return {
    name: str(c.name) ?? '',
    departmentId,
    departmentName: str(c.departmentName) ?? '',
    pool: str(c.pool),
    salaryAccount: str(acct.bank) && str(acct.last4) ? { bank: str(acct.bank)!, last4: str(acct.last4)! } : null,
    departments: named(c.departments),
    companies: named(c.companies),
  }
}

// ── Words ──────────────────────────────────────────────────────────────────

/** RM 1,234.50 — the hubs' own figure (lib/fin-app/page-model). */
export const rmOf = rm

/** The day it was sent (or made, a draft), the office's. */
export const requestDay = (r: PaymentRequest): string => {
  const at = r.submittedAt ?? r.createdAt
  return at ? officeDay(at).format('YYYY-MM-DD') : ''
}

/** What it was for, in a line: its items' words (the request's description), else the kind. */
export const whatOf = (r: PaymentRequest): string => r.description || (r.kind === 'claim' ? 'Claim' : 'Direct payment')

/** Who is paid, and where: "Salary account · Hong Leong Bank •••• 4821", "Public Bank 3187450210", a supplier's. */
export function payToWords(r: PaymentRequest): string {
  const where = [r.payeeBank, r.payeeAccount].filter(Boolean).join(' ')
  if (r.kind === 'claim') return r.payToSalary ? (where ? `Salary account · ${where}` : 'Salary account') : where || 'Another account'
  return [r.payeeName, where].filter(Boolean).join(' · ') || 'Supplier'
}

/** Which pool pays: the department's, and any split ("Marketing · Dream Crafter RM 100.00"). */
export function whoPaysWords(r: PaymentRequest): string {
  if (r.shares.length === 0) return r.departmentName
  return [r.departmentName, ...r.shares.map((s) => `${s.party === 'company' ? s.companyName : s.departmentName} ${rmOf(s.amount)}`)].join(' · ')
}

/** What the department's own pool bears: the total, less every share. */
export const ownPart = (r: PaymentRequest): number => Math.round((r.total - r.shares.reduce((t, s) => t + s.amount, 0)) * 100) / 100

/** A share's Bill back, as it stands. */
export function billBackWords(s: RequestShare): string {
  if (s.invoiceNo && s.invoiceStatus !== 'voided') return `Yes · ${s.invoiceNo} (${s.invoiceStatus === 'draft' ? 'draft' : s.invoiceStatus ?? 'draft'})`
  if (s.billBack === false) return 'No — the department pays it'
  // Answered in the Create PV window, with the voucher.
  return 'Decided when the PV is made'
}

/** Where it is, for the requester (the Claim page's chip). */
export function whereItIs(r: PaymentRequest): { text: string; tone: ChipTone } {
  switch (r.status) {
    case 'draft':
      return { text: 'Draft', tone: 'def' }
    case 'pending_approval':
      return { text: 'Waiting for approval', tone: 'wait' }
    case 'with_finance':
      return { text: 'With Finance', tone: 'wait' }
    case 'rejected':
      return { text: 'Rejected — fix and send again', tone: 'danger' }
    case 'in_pv':
      return { text: r.pvStatus === 'approved' ? `${r.pvNo ?? 'PV'} approved — to be paid` : `${r.pvNo ?? 'PV'} · waiting for approval`, tone: 'accent' }
    case 'paid':
      return { text: 'Paid', tone: 'ledger' }
    case 'cancelled':
      return { text: 'Cancelled', tone: 'def' }
  }
}

// ── The Claim page ─────────────────────────────────────────────────────────

export type StaffCard = 'all' | 'draft' | 'finance' | 'rejected' | 'paid'
export const STAFF_ALL: StaffCard = 'all'

/** The card a request is under: a draft, with Finance (sent, or in its voucher), rejected, paid. A cancelled one only under All. */
export function staffCardOf(r: PaymentRequest): StaffCard | null {
  if (r.status === 'draft') return 'draft'
  if (r.status === 'with_finance' || r.status === 'pending_approval' || r.status === 'in_pv') return 'finance'
  if (r.status === 'rejected') return 'rejected'
  if (r.status === 'paid') return 'paid'
  return null
}

const sum = (rows: readonly PaymentRequest[]) => Math.round(rows.reduce((t, r) => t + r.total, 0) * 100) / 100
const count = (k: number) => `${k} ${k === 1 ? 'request' : 'requests'}`

/** The cards beside the list: All · Draft · With Finance · Rejected · Paid, each with what it holds. */
export function staffCards(rows: readonly PaymentRequest[]): HubCardItem[] {
  const card = (key: StaffCard, label: string, tone: CardTone, icon: HrIconName): HubCardItem => {
    const of = rowsOfStaffCard(rows, key)
    return { key, label, tone, icon, sub: count(of.length), value: rmOf(sum(of)) }
  }
  return [
    card('all', 'All requests', 'all', 'receipt'),
    card('draft', 'Draft', 'draft', 'doc'),
    card('finance', 'With Finance', 'pending_approval', 'inbox'),
    card('rejected', 'Rejected', 'peach', 'fileAlert'),
    card('paid', 'Paid', 'paid', 'approve'),
  ]
}

export function rowsOfStaffCard(rows: readonly PaymentRequest[], card: string): PaymentRequest[] {
  return card === STAFF_ALL ? [...rows] : rows.filter((r) => staffCardOf(r) === card)
}

/** The total over the cards: what Finance still owes the reader — sent, not yet paid. */
export function staffHero(rows: readonly PaymentRequest[]): { label: string; value: string } {
  const owed = rows.filter((r) => staffCardOf(r) === 'finance')
  return { label: `Waiting to be paid · ${count(owed.length)}`, value: rmOf(sum(owed)) }
}

/** The requester may still change it (a draft, or one Finance sent back) or withdraw it (no voucher yet). */
export const canEdit = (r: PaymentRequest) => r.mine && (r.status === 'draft' || r.status === 'rejected')
export const canCancel = (r: PaymentRequest) =>
  r.mine && !r.pvId && (r.status === 'draft' || r.status === 'pending_approval' || r.status === 'with_finance' || r.status === 'rejected')

// ── The New request window ─────────────────────────────────────────────────

export interface DraftItem {
  description: string
  amount: string
}

export interface DraftShare {
  party: 'department' | 'company' | ''
  /** The department's or the company's id. */
  partyId: string
  amount: string
}

/** What the window holds. Nothing is chosen until it is picked (the user, 2026-10-27: pre-choose nothing). */
export interface RequestDraft {
  kind: RequestKind | null
  /** A claim: into the salary account HR holds (true), or another this time (false). */
  salary: boolean | null
  /** Another account's, or the supplier's. */
  bank: string
  accountNo: string
  supplier: string
  items: DraftItem[]
  /** The department pays it all (false), or it is split (true). */
  split: boolean | null
  shares: DraftShare[]
}

export const emptyItem = (): DraftItem => ({ description: '', amount: '' })
export const emptyShare = (): DraftShare => ({ party: '', partyId: '', amount: '' })

export function emptyDraft(): RequestDraft {
  return { kind: null, salary: null, bank: '', accountNo: '', supplier: '', items: [emptyItem()], split: null, shares: [] }
}

const amountText = (v: number) => (v > 0 ? v.toFixed(2) : '')

/** A saved request, back in the window to be changed (a draft, or a rejected one being fixed). */
export function draftOf(r: PaymentRequest): RequestDraft {
  const other = r.kind === 'direct_pay' || !r.payToSalary
  return {
    kind: r.kind,
    salary: r.kind === 'claim' ? r.payToSalary : null,
    bank: other ? r.payeeBank ?? '' : '',
    accountNo: other ? r.payeeAccount ?? '' : '',
    supplier: r.kind === 'direct_pay' ? r.payeeName ?? '' : '',
    items: r.items.length > 0 ? r.items.map((i) => ({ description: i.description, amount: amountText(i.amount) })) : [emptyItem()],
    split: r.shares.length > 0 ? true : r.requestNo || r.items.length > 0 ? false : null,
    shares: r.shares.map((s) => ({ party: s.party, partyId: (s.party === 'company' ? s.companyId : s.departmentId) ?? '', amount: amountText(s.amount) })),
  }
}

/** A typed amount, as ringgit — NaN when it is not one (12, 12.5, 1,234.50). */
export function amountOf(text: string): number {
  const t = text.replace(/,/g, '').trim()
  if (t === '') return 0
  return /^\d{1,12}(\.\d{1,2})?$/.test(t) ? Number(t) : NaN
}

const round = (v: number) => Math.round(v * 100) / 100

export const draftTotal = (d: RequestDraft) => round(d.items.reduce((t, i) => t + (Number.isFinite(amountOf(i.amount)) ? amountOf(i.amount) : 0), 0))
export const draftShared = (d: RequestDraft) =>
  d.split ? round(d.shares.reduce((t, s) => t + (Number.isFinite(amountOf(s.amount)) ? amountOf(s.amount) : 0), 0)) : 0

/** A file going up from the window: where it is in the bucket, as payment_request_save files it. */
export interface UploadedFile {
  path: string
  name: string
  contentType: string
  size: number
}

/** What payment_request_save takes. */
export interface SavePayload {
  kind: RequestKind
  payTo?: { salary: true } | { salary: false; bank: string; accountNo: string }
  supplier?: { name: string; bank: string; accountNo: string }
  items: Array<{ description: string; amount: string }>
  shares: Array<{ party: 'department' | 'company'; departmentId?: string; companyId?: string; amount: string }>
  files: UploadedFile[]
  removeFiles: string[]
}

const digits = (s: string) => s.replace(/[\s-]/g, '')

export function draftPayload(d: RequestDraft, files: UploadedFile[], removeFiles: string[]): SavePayload | null {
  if (!d.kind) return null
  return {
    kind: d.kind,
    ...(d.kind === 'claim'
      ? { payTo: d.salary === false ? { salary: false as const, bank: d.bank.trim(), accountNo: digits(d.accountNo) } : { salary: true as const } }
      : { supplier: { name: d.supplier.trim(), bank: d.bank.trim(), accountNo: digits(d.accountNo) } }),
    items: d.items
      .filter((i) => i.description.trim() || i.amount.trim())
      .map((i) => ({ description: i.description.trim(), amount: i.amount.replace(/,/g, '').trim() })),
    shares: d.split
      ? d.shares
          .filter((s) => s.party || s.partyId || s.amount.trim())
          .map((s) => ({
            party: s.party === 'company' ? ('company' as const) : ('department' as const),
            ...(s.party === 'company' ? { companyId: s.partyId } : { departmentId: s.partyId }),
            amount: s.amount.replace(/,/g, '').trim(),
          }))
      : [],
    files,
    removeFiles,
  }
}

/** What stops Save as draft — or null. A draft keeps what was typed; only what it is must be picked. */
export function saveProblem(d: RequestDraft): string | null {
  if (!d.kind) return 'Pick what it is first.'
  const bad = [...d.items.map((i) => i.amount), ...(d.split ? d.shares.map((s) => s.amount) : [])].find((a) => Number.isNaN(amountOf(a)))
  if (bad !== undefined) return `“${bad}” is not an amount — write it like 99.90.`
  if (d.items.length > PR_LIMITS.items) return `Up to ${PR_LIMITS.items} items on one request.`
  return null
}

/** What is still missing before it can be sent, as one sentence — or null (the database asks the same again). */
export function submitProblem(d: RequestDraft, files: number, ctx: RequestContext | null): string | null {
  const saving = saveProblem(d)
  if (saving) return saving
  const need: string[] = []
  if (d.kind === 'claim') {
    if (d.salary === null) need.push('where to pay you')
    else if (d.salary && !ctx?.salaryAccount) return 'HR has no salary account for you — pick “Another account”, or ask HR to add yours.'
  } else if (!d.supplier.trim()) need.push('the supplier’s name')
  const other = d.kind === 'direct_pay' || d.salary === false
  if (other && !d.bank.trim()) need.push('the bank')
  if (other && !/^[0-9A-Za-z]{4,30}$/.test(digits(d.accountNo))) need.push('the account number')
  const items = d.items.filter((i) => i.description.trim() || i.amount.trim())
  if (items.length === 0 || items.some((i) => !i.description.trim() || !(amountOf(i.amount) > 0))) need.push('each item’s words and amount')
  if (files === 0) need.push('the receipts or invoices')
  if (d.split === null) need.push('which pool pays')
  if (d.split) {
    if (d.shares.length === 0 || d.shares.some((s) => !s.party || !s.partyId || !(amountOf(s.amount) > 0))) need.push('each share’s who and amount')
    else if (draftShared(d) >= draftTotal(d)) return `The shares come to ${rmOf(draftShared(d))} — your department pays the rest, so they must be less than the ${rmOf(draftTotal(d))} total.`
  }
  if (need.length === 0) return null
  const last = need.pop()!
  return `Add ${need.length ? `${need.join(', ')} and ${last}` : last}.`
}

// ── Files ──────────────────────────────────────────────────────────────────

/** The kinds a voucher's attachments take (payments/actions — PDF, JPG, PNG, Excel, Word, CSV): a request's receipts carry onto its PV. */
const BY_NAME: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  csv: 'text/csv',
}
export const PR_ACCEPT = '.pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc,.csv'

const extOf = (name: string) => (/\.([A-Za-z0-9]{1,5})$/.exec(name)?.[1] ?? '').toLowerCase()

/** The type a file goes up as — by its name, so the voucher it carries onto takes it; null when it cannot. */
export const prContentType = (name: string): string | null => BY_NAME[extOf(name)] ?? null

/** Why a file cannot go up — or null. */
export function prFileRefusal(file: { name: string; size: number }): string | null {
  const name = file.name || 'That file'
  if (!prContentType(file.name)) return `${name}: a PDF, a photo (JPG, PNG), an Excel, a Word or a CSV file.`
  if (file.size < 1) return `${name} is empty.`
  if (file.size > PR_LIMITS.fileBytes) return `${name} is over 25 MB.`
  return null
}

/** Where a file goes in the bucket: the uploader's own folder, a fresh folder each time, a safe name. */
export function prObjectPath(uid: string, name: string, key: string): string {
  const safe = (name || 'file').normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').replace(/^[_.]+/, '').slice(-80) || 'file'
  return `${uid}/${key}/${safe}`
}

// ── Finance: Create PV from requests ───────────────────────────────────────

/** One payee, into one account: the requests one PV may pay together. */
export const payeeKey = (r: PaymentRequest) => `${(r.payeeName ?? '').trim().toLowerCase()}|${(r.payeeAccount ?? '').replace(/[^0-9A-Za-z•]/g, '')}`

/** The same person's other requests with no PV yet — combined into one PV until Finance makes it ("自动合成认的是我有没有开pv"). */
export function samePayeeOpen(rows: readonly PaymentRequest[], r: PaymentRequest): PaymentRequest[] {
  const key = payeeKey(r)
  return rows.filter((x) => x.status === 'with_finance' && !x.pvId && payeeKey(x) === key)
}

/** A line of the PV a request starts: its item's words, the requester's department's pool, the amount — the category Finance's. */
export interface RequestLine {
  requestId: string
  description: string
  pool: string
  amount: number
}

/**
 * A split of the requests a PV pays, as the Create PV window asks its Bill back? (the user: "我开pv 时就要确定是不是要开单了").
 * One whose invoice is drafted already (a voided one counts as none) is not asked again.
 */
export interface RequestSplit {
  shareId: string
  requestId: string
  requestNo: string
  /** The company or the department it is billed back to. */
  who: string
  amount: number
  /** Its invoice, drafted with an earlier PV of this request — its answer stands. */
  invoiceNo: string | null
}

export interface RequestVoucherStart {
  requestIds: string[]
  payee: string
  /** "Pay into Hong Leong Bank 1234…" under the payee — the account as Finance reads it. */
  payInto: string
  description: string
  lines: RequestLine[]
  notes: string
  /** Each split of the requests, its Bill back? asked in the window. */
  splits: RequestSplit[]
  /** Who pays a split answered No: the requester's department. */
  department: string
  files: Array<{ id: string; name: string; size: number | null }>
}

/** What Create PV fills in from the requests (oldest first), every field Finance's to change. */
export function voucherStart(requests: readonly PaymentRequest[]): RequestVoucherStart {
  const rs = [...requests].sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '') || a.id.localeCompare(b.id))
  const first = rs[0]
  const nos = rs.map((r) => r.requestNo ?? 'request')
  const where = first ? [first.payeeBank, first.payeeAccount].filter(Boolean).join(' ') : ''
  return {
    requestIds: rs.map((r) => r.id),
    payee: first ? (first.kind === 'claim' ? first.requesterName : first.payeeName ?? '') : '',
    payInto: where ? `Pay into ${where}${first?.kind === 'claim' && first.payToSalary ? ' · salary account' : ''}` : '',
    description: rs.length === 1 ? `${first.kind === 'claim' ? 'Claim' : 'Payment'} · ${whatOf(first)}`.slice(0, 200) : `${rs.length} requests · ${first?.requesterName ?? ''}`.slice(0, 200),
    lines: rs.flatMap((r) =>
      r.items.map((i) => ({ requestId: r.id, description: i.description, pool: r.pool ?? '', amount: i.amount })),
    ),
    notes: `From Payment request · ${nos.join(', ')}`.slice(0, 500),
    splits: rs.flatMap((r) =>
      r.shares.map((s) => ({
        shareId: s.id,
        requestId: r.id,
        requestNo: r.requestNo ?? 'Request',
        who: (s.party === 'company' ? s.companyName : s.departmentName) ?? (s.party === 'company' ? 'Company' : 'Department'),
        amount: s.amount,
        invoiceNo: s.invoiceNo && s.invoiceStatus !== 'voided' ? s.invoiceNo : null,
      })),
    ),
    department: first?.departmentName ?? 'The department',
    files: rs.flatMap((r) => r.files.map((f) => ({ id: f.id, name: f.name, size: f.size }))),
  }
}

/** The splits still to answer: every one but those whose invoice is drafted already. */
export const openSplits = (splits: readonly RequestSplit[]) => splits.filter((s) => !s.invoiceNo)

/**
 * What the voucher's save sends for the splits: each open split's answer, and a Yes one's category — the account the
 * first of its request's lines is booked to on the voucher (empty when none is: the window says so first).
 */
export function billBackAnswers(
  splits: readonly RequestSplit[],
  answers: Readonly<Record<string, boolean>>,
  lines: ReadonlyArray<{ requestId?: string; account: string }>,
): Array<{ share: string; billBack: boolean; category?: string }> {
  return openSplits(splits).flatMap((s) => {
    const yes = answers[s.shareId]
    if (yes === undefined) return []
    return [yes ? { share: s.shareId, billBack: true, category: lines.find((l) => l.requestId === s.requestId && l.account)?.account ?? '' } : { share: s.shareId, billBack: false }]
  })
}
