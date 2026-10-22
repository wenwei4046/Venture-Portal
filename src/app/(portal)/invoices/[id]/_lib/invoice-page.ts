import type { SupabaseClient } from '@supabase/supabase-js'
import type { createClient } from '@/lib/supabase/server'
import { officeTime } from '@/lib/office-time'
import { billingModeLabel } from '@/lib/invoice-labels'
import { extraBillingModeOptions, primedRegistryRows } from '@/lib/dept-registry'
import { invoiceChangeLine, invoiceTrail, type DatedInvoiceChange, type InvoiceChange, type InvoiceTrailStep } from '@/lib/invoice-audit'
import type { AccountType } from '@/lib/coa'
import { toHubInvoice, type HubCreditNoteLine, type HubInvoice, type InvoiceContext, type InvoiceRowIn } from '@/app/(portal)/statements/_lib/invoice-model'

// An invoice's page, read (2026-10-15 — moved out of `/invoices/[id]/page.tsx`
// word for word, so the Finance phone app's record screen reads the same): the
// invoice as the hub reads it (`toHubInvoice`), who made it, the trail and the
// audit log off its own changes and its credit notes' (what the reader's
// permissions open), and what its dialogs offer — every company it may be
// billed to (its own kept though gone inactive), the departments, the chart,
// the banks.

const INVOICE_COLUMNS =
  'id, invoice_no, company_id, period_month, billing_mode, total_amount, status, billable_to_type, billable_to_department_id, billable_to_freetext_name, billable_to_freetext_address, billable_to_freetext_address_parts, billable_to_freetext_phone, billable_to_freetext_email, description, invoice_date, due_date, reference_no, category_code, settlement_voucher_id, contract_id, created_by, created_at'

const stamp = (at: string) => officeTime(at).format('DD MMM YYYY · HH:mm')

type Audited = InvoiceChange & { id: number; occurred_at: string; actor_id: string | null; actor_name: string | null }
type Client = Awaited<ReturnType<typeof createClient>>

export interface InvoicePageData {
  invoice: HubInvoice
  /** Who made it, and when (`DD MMM YYYY · HH:mm`). */
  createdBy: string | null
  createdAt: string
  trail: InvoiceTrailStep[]
  audit: Array<{ at: string; who: string; what: string }>
  /** The description, when it says more than the lines already do. */
  said: string | null
  /** Someone else's address and phone · email, as billed. */
  address: string | null
  contact: string
  /** Its invoice date falls outside the month it bills. */
  offMonth: boolean
  // What its dialogs offer.
  banks: Array<{ id: string; label: string }>
  companies: Array<{ id: string; name: string; short_code: string }>
  departments: Array<{ id: string; name: string }>
  categories: Array<{ code: string; label: string; type: AccountType; parent_code: string | null }>
  extraModes: Array<{ value: string; label: string }>
}

/** The invoice's page, or null when the reader may not see it (or it is not there). */
export async function loadInvoicePage(supabase: Client, id: string): Promise<InvoicePageData | null> {
  const { data: row, error } = await supabase.from('invoices').select(INVOICE_COLUMNS).eq('id', id).single()
  if (error || !row) return null
  const inv = row as unknown as InvoiceRowIn & { created_by: string | null; created_at: string }

  // audit_changes postdates database.types.ts — asked through the untyped client.
  const db = supabase as unknown as SupabaseClient
  const [
    { data: lineRows },
    { data: receiptRows },
    { data: cnRows },
    { data: cos },
    { data: depts },
    { data: coa },
    { data: banks },
    { data: batchVoucher },
    { data: creator },
    ownAudit,
  ] = await Promise.all([
    supabase.from('invoice_lines').select('description, amount, category_code').eq('invoice_id', id).order('line_no'),
    // Receipts recorded against it (a part payment, a single settle).
    supabase
      .from('payment_vouchers')
      .select('voucher_no, payment_date, amount')
      .eq('invoice_id', id)
      .eq('direction', 'credit')
      .neq('status', 'voided')
      .order('payment_date'),
    supabase.from('credit_notes').select('id, credit_note_no, amount, reason, status, created_at').eq('invoice_id', id).order('created_at', { ascending: false }),
    // Every company and department: an invoice keeps its party's name after it goes inactive (or internal).
    supabase.from('companies').select('id, name, short_code, is_active').order('short_code'),
    supabase.from('departments').select('id, name, is_internal').order('name'),
    supabase.from('chart_of_accounts').select('code, name, type, parent_code').eq('is_active', true).order('code'),
    supabase.from('bank_accounts').select('id, bank_name, account_number, is_primary').eq('status', 'active').order('is_primary', { ascending: false }),
    // A consolidated receipt that settled it with others points no invoice_id back; the invoice points at it.
    inv.settlement_voucher_id
      ? supabase.from('payment_vouchers').select('voucher_no, payment_date, amount').eq('id', inv.settlement_voucher_id).maybeSingle()
      : Promise.resolve({ data: null as { voucher_no: string | null; payment_date: string | null; amount: number } | null }),
    inv.created_by ? supabase.from('users').select('name').eq('id', inv.created_by).maybeSingle() : Promise.resolve({ data: null as { name: string | null } | null }),
    // The audit log: the invoice's own changes (what this reader's permissions open).
    db.rpc('audit_changes', { p_tables: ['invoices'], p_row: id, p_limit: 60 }).then((r) => r),
  ])
  const creditNoteRows = ((cnRows ?? []) as Array<{ id: string; credit_note_no: string | null; amount: number; reason: string | null; status: string }>).map(
    (c): HubCreditNoteLine => ({ id: c.id, no: c.credit_note_no, amount: Number(c.amount), status: c.status, reason: c.reason }),
  )
  // …and its credit notes' (up to twelve).
  const cnAudit = await Promise.all(
    creditNoteRows.slice(0, 12).map((c) => db.rpc('audit_changes', { p_tables: ['credit_notes'], p_row: c.id, p_limit: 5 }).then((r) => r)),
  )

  // ── The invoice as the hub reads it ──
  const companyRows = (cos ?? []) as Array<{ id: string; name: string; short_code: string | null; is_active: boolean | null }>
  const departmentRows = (depts ?? []) as Array<{ id: string; name: string; is_internal: boolean | null }>
  const accountRows = (coa ?? []) as Array<{ code: string; name: string; type: string; parent_code: string | null }>
  const extraModes = extraBillingModeOptions(primedRegistryRows())
  const ctx: InvoiceContext = {
    companies: new Map(companyRows.map((c) => [c.id, { name: c.name, code: c.short_code }])),
    departments: new Map(departmentRows.map((d) => [d.id, d.name])),
    accounts: new Map(accountRows.map((a) => [a.code, a.name])),
    extraModes,
    lines: new Map([[id, ((lineRows ?? []) as Array<{ description: string | null; amount: number; category_code: string | null }>).map((l) => ({ ...l, amount: Number(l.amount) }))]]),
    receipts: new Map([[id, (receiptRows ?? []) as Array<{ voucher_no: string | null; payment_date: string | null; amount: number }>]]),
    settlements: new Map(batchVoucher && inv.settlement_voucher_id ? [[inv.settlement_voucher_id, { ...batchVoucher, amount: Number(batchVoucher.amount) }]] : []),
    creditNotes: new Map([[id, creditNoteRows]]),
  }
  const h = toHubInvoice(inv, ctx)

  // ── The trail and the audit log, read off the same changes ──
  const changes = [ownAudit, ...cnAudit]
    .flatMap((r) => (r.error ? [] : ((r.data ?? []) as unknown as Audited[])))
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : b.id - a.id))
  const who = (c: Audited) => c.actor_name ?? (c.actor_id ? 'Removed account' : 'System')
  const mode = (m: string) => billingModeLabel(m, extraModes)
  const audit = changes.map((c) => ({ at: stamp(c.occurred_at), who: who(c), what: invoiceChangeLine(c, mode) }))
  const trail = invoiceTrail(
    {
      status: h.status,
      createdBy: creator?.name ?? null,
      createdAt: inv.created_at,
      invoiceDate: h.date,
      lastReceipt: h.receipts.reduce<string | null>((last, r) => (r.date && (!last || r.date > last) ? r.date : last), null),
    },
    changes.map((c): DatedInvoiceChange => ({ ...c, at: c.occurred_at, who: c.actor_name ?? null })),
    stamp,
  )

  return {
    invoice: h,
    createdBy: creator?.name ?? null,
    createdAt: stamp(inv.created_at),
    trail,
    audit,
    said: h.description && !(h.lines.length === 1 && h.lines[0].description === h.description) ? h.description : null,
    address: inv.billable_to_freetext_address ?? null,
    contact: [inv.billable_to_freetext_phone, inv.billable_to_freetext_email].filter(Boolean).join(' · '),
    offMonth: !h.date || h.date.slice(0, 7) !== h.periodMonth.slice(0, 7),
    banks: ((banks ?? []) as Array<{ id: string; bank_name: string; account_number: string | null }>).map((b) => ({
      id: b.id,
      label: b.account_number ? `${b.bank_name} — ${b.account_number}` : b.bank_name,
    })),
    // An invoice keeps its company in Edit's list though the company has since gone inactive.
    companies: companyRows
      .filter((c) => c.is_active !== false || c.id === inv.company_id)
      .map((c) => ({ id: c.id, name: c.name, short_code: c.short_code ?? '' })),
    departments: departmentRows.filter((d) => !d.is_internal).map((d) => ({ id: d.id, name: d.name })),
    categories: accountRows.map((a) => ({ code: a.code, label: a.name, type: a.type as AccountType, parent_code: a.parent_code ?? null })),
    extraModes,
  }
}
