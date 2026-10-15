import type { SupabaseClient } from '@supabase/supabase-js'
import type { BankOption, BaRow, CompanyOption, LimitRow } from '../_components/BaView'

// What Invoice Financing reads (2026-10-15, lifted out of its two pages so the
// Finance phone app reads the very same): the register — every financing with
// its interest paper trail (the borrower's invoice, keyed by reference_no; the
// PV to HC, by reference_type/reference_id) and its filed documents — the
// active companies, their limits and what each has in use, the banks a PV pays
// from; and one financing as its own page reads it, with its borrower's facility.

export const baRef = (id: string) => `BA-${id.slice(0, 8)}`

type Raw = Record<string, unknown>

function rowOf(b: Raw, borrower: string, trail: { invoice: BaRow['interestInvoice']; pv: BaRow['interestPv']; attachments: BaRow['attachments'] }): BaRow {
  return {
    id: b.id as string,
    baNo: (b.ba_no as string | null) ?? null,
    bankName: (b.bank_name as string | null) ?? null,
    faceAmount: Number(b.face_amount),
    bankAnnualRate: Number(b.bank_annual_rate),
    startDate: b.start_date as string,
    tenorDays: Number(b.tenor_days),
    maturityDate: b.maturity_date as string,
    chargeRateMonthly: Number(b.charge_rate_monthly),
    hcRateMonthly: Number(b.hc_rate_monthly),
    borrower,
    borrowerCompanyId: (b.borrower_company_id as string | null) ?? null,
    status: b.status as BaRow['status'],
    notes: (b.notes as string | null) ?? null,
    interestInvoice: trail.invoice,
    interestPv: trail.pv,
    attachments: trail.attachments,
  }
}

const bankOptions = (rows: unknown): BankOption[] =>
  ((rows ?? []) as Array<{ id: string; bank_name: string; account_number: string | null }>).map((b) => ({
    id: b.id,
    label: `${b.bank_name}${b.account_number ? ` — ${b.account_number}` : ''}`,
  }))

const activeBanks = (supabase: SupabaseClient) =>
  supabase.from('bank_accounts').select('id, bank_name, account_number, is_primary').eq('status', 'active').order('is_primary', { ascending: false })

export interface BaRegister {
  rows: BaRow[]
  companies: CompanyOption[]
  limits: LimitRow[]
  banks: BankOption[]
}

export async function readBaRegister(supabase: SupabaseClient): Promise<BaRegister> {
  const [{ data: bas }, { data: companies }, { data: limitRows }, { data: bankRows }] = await Promise.all([
    supabase.from('ba_facilities').select('*').order('start_date', { ascending: false }),
    supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('name'),
    supabase.from('ba_limits').select('company_id, limit_amount'),
    activeBanks(supabase),
  ])

  const baList = (bas ?? []) as Raw[]
  const baIds = baList.map((b) => b.id as string)

  // Interest paper trail per BA: the invoice keyed by reference_no, the PV by
  // reference_type/reference_id — plus the filed bank documents.
  const [{ data: invRows }, { data: pvRows }, { data: attRows }] = await Promise.all([
    baIds.length > 0
      ? supabase.from('invoices').select('reference_no, invoice_no, status').in('reference_no', baIds.map(baRef)).neq('status', 'voided')
      : Promise.resolve({ data: [] }),
    baIds.length > 0
      ? supabase
          .from('payment_vouchers')
          .select('reference_id, voucher_no, status')
          .eq('reference_type', 'ba_interest')
          .in('reference_id', baIds)
          .in('status', ['draft', 'pending_approval', 'approved', 'paid'])
      : Promise.resolve({ data: [] }),
    baIds.length > 0 ? supabase.from('ba_attachments').select('id, ba_id, file_name').in('ba_id', baIds).order('created_at') : Promise.resolve({ data: [] }),
  ])

  const invByRef = new Map(((invRows ?? []) as Array<{ reference_no: string; invoice_no: string | null; status: string }>).map((r) => [r.reference_no, { no: r.invoice_no, status: r.status }]))
  const pvByBa = new Map(((pvRows ?? []) as Array<{ reference_id: string; voucher_no: string | null; status: string }>).map((r) => [r.reference_id, { no: r.voucher_no, status: r.status }]))
  const attsByBa = new Map<string, Array<{ id: string; name: string }>>()
  for (const a of (attRows ?? []) as Array<{ id: string; ba_id: string; file_name: string }>) {
    const list = attsByBa.get(a.ba_id) ?? []
    list.push({ id: a.id, name: a.file_name })
    attsByBa.set(a.ba_id, list)
  }

  const companyList = (companies ?? []) as Array<{ id: string; name: string; short_code: string | null }>
  const companyById = new Map(companyList.map((c) => [c.id, c]))

  const rows: BaRow[] = baList.map((b) => {
    const co = b.borrower_company_id ? companyById.get(b.borrower_company_id as string) : null
    return rowOf(b, co ? (co.short_code ?? co.name) : ((b.borrower_name as string | null) ?? '—'), {
      invoice: invByRef.get(baRef(b.id as string)) ?? null,
      pv: pvByBa.get(b.id as string) ?? null,
      attachments: attsByBa.get(b.id as string) ?? [],
    })
  })

  const companyOptions: CompanyOption[] = companyList.map((c) => ({ id: c.id, label: c.short_code ? `${c.name} (${c.short_code})` : c.name }))

  // Limits: used = Σ active BA face per borrower company; settled releases.
  const limitByCompany = new Map(((limitRows ?? []) as Array<{ company_id: string; limit_amount: number }>).map((l) => [l.company_id, Number(l.limit_amount)]))
  const usedByCompany = new Map<string, number>()
  for (const b of baList) {
    if (b.status !== 'active' || !b.borrower_company_id) continue
    const key = b.borrower_company_id as string
    usedByCompany.set(key, (usedByCompany.get(key) ?? 0) + Number(b.face_amount))
  }
  const limits: LimitRow[] = companyOptions.map((co) => ({
    companyId: co.id,
    label: co.label,
    limit: limitByCompany.get(co.id) ?? 0,
    used: Math.round((usedByCompany.get(co.id) ?? 0) * 100) / 100,
  }))

  return { rows, companies: companyOptions, limits, banks: bankOptions(bankRows) }
}

export interface BaFacility {
  row: BaRow
  /** The company's short code, for the facility's title; null for a borrower by name. */
  shortCode: string | null
  /** The borrower's BA limit (0: none set) and the face of its active financings. */
  limit: number
  used: number
  banks: BankOption[]
}

/** One financing as its own page reads it; null when there is none. */
export async function readBaFacility(supabase: SupabaseClient, id: string): Promise<BaFacility | null> {
  const { data: b } = await supabase.from('ba_facilities').select('*').eq('id', id).maybeSingle()
  if (!b) return null
  const ba = b as Raw
  const companyId = (ba.borrower_company_id as string | null) ?? null

  const [{ data: company }, { data: limit }, { data: siblings }, { data: invoice }, { data: pv }, { data: attachments }, { data: bankRows }] = await Promise.all([
    companyId ? supabase.from('companies').select('name, short_code').eq('id', companyId).maybeSingle() : Promise.resolve({ data: null }),
    companyId ? supabase.from('ba_limits').select('limit_amount').eq('company_id', companyId).maybeSingle() : Promise.resolve({ data: null }),
    // The borrower's active financings: what its limit has in use.
    companyId ? supabase.from('ba_facilities').select('id, face_amount').eq('borrower_company_id', companyId).eq('status', 'active') : Promise.resolve({ data: [] }),
    supabase.from('invoices').select('invoice_no, status').eq('reference_no', baRef(id)).neq('status', 'voided').maybeSingle(),
    supabase
      .from('payment_vouchers')
      .select('voucher_no, status')
      .eq('reference_type', 'ba_interest')
      .eq('reference_id', id)
      .in('status', ['draft', 'pending_approval', 'approved', 'paid'])
      .maybeSingle(),
    supabase.from('ba_attachments').select('id, ba_id, file_name').eq('ba_id', id).order('created_at'),
    activeBanks(supabase),
  ])

  const co = company as { name: string; short_code: string | null } | null
  const borrower = co ? (co.short_code ? `${co.name} (${co.short_code})` : co.name) : ((ba.borrower_name as string | null) ?? '—')
  const inv = invoice as { invoice_no: string | null; status: string } | null
  const voucher = pv as { voucher_no: string | null; status: string } | null
  return {
    row: rowOf({ ...ba, id }, borrower, {
      invoice: inv ? { no: inv.invoice_no, status: inv.status } : null,
      pv: voucher ? { no: voucher.voucher_no, status: voucher.status } : null,
      attachments: ((attachments ?? []) as Array<{ id: string; file_name: string }>).map((a) => ({ id: a.id, name: a.file_name })),
    }),
    shortCode: co?.short_code ?? null,
    limit: Number((limit as { limit_amount: number } | null)?.limit_amount ?? 0),
    used: ((siblings ?? []) as Array<{ face_amount: number }>).reduce((s, x) => s + Number(x.face_amount), 0),
    banks: bankOptions(bankRows),
  }
}
