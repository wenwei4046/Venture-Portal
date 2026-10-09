// Bank BA registry (user 2026-08-07, v2 2026-08-11). The BA is HOUZS Century's
// facility with the bank; HV earns the spread: charges the sub 2.5%/mo, owes HC
// 1.5%/mo, both prorated by days. The PRINCIPAL never moves through HV's bank —
// but the interest is real: Generate invoice bills the borrower (5028) and
// Generate PV pays HOUZS Century (6001), both through the normal flows.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import BaView, {
  type BaRow,
  type CompanyOption,
  type BankOption,
  type LimitRow,
} from './_components/BaView'

export const dynamic = 'force-dynamic'

const baRef = (id: string) => `BA-${id.slice(0, 8)}`

export default async function BaPage({
  searchParams,
}: {
  searchParams: Promise<{ calc?: string }>
}) {
  await requirePermission('treasury')
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { calc } = await searchParams

  const [{ data: bas }, { data: companies }, { data: limitRows }, { data: bankRows }] =
    await Promise.all([
      supabase.from('ba_facilities').select('*').order('start_date', { ascending: false }),
      supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('name'),
      supabase.from('ba_limits').select('company_id, limit_amount'),
      supabase
        .from('bank_accounts')
        .select('id, bank_name, account_number, is_primary')
        .eq('status', 'active')
        .order('is_primary', { ascending: false }),
    ])

  const baList = (bas ?? []) as Array<Record<string, unknown>>
  const baIds = baList.map(b => b.id as string)

  // Interest paper trail per BA: the invoice keyed by reference_no, the PV by
  // reference_type/reference_id — plus the filed bank documents.
  const [{ data: invRows }, { data: pvRows }, { data: attRows }] = await Promise.all([
    baIds.length > 0
      ? supabase
          .from('invoices')
          .select('reference_no, invoice_no, status')
          .in('reference_no', baIds.map(baRef))
          .neq('status', 'voided')
      : Promise.resolve({ data: [] }),
    baIds.length > 0
      ? supabase
          .from('payment_vouchers')
          .select('reference_id, voucher_no, status')
          .eq('reference_type', 'ba_interest')
          .in('reference_id', baIds)
          .in('status', ['draft', 'pending_approval', 'approved', 'paid'])
      : Promise.resolve({ data: [] }),
    baIds.length > 0
      ? supabase
          .from('ba_attachments')
          .select('id, ba_id, file_name')
          .in('ba_id', baIds)
          .order('created_at')
      : Promise.resolve({ data: [] }),
  ])

  const invByRef = new Map(
    ((invRows ?? []) as Array<{ reference_no: string; invoice_no: string | null; status: string }>).map(
      r => [r.reference_no, { no: r.invoice_no, status: r.status }],
    ),
  )
  const pvByBa = new Map(
    ((pvRows ?? []) as Array<{ reference_id: string; voucher_no: string | null; status: string }>).map(
      r => [r.reference_id, { no: r.voucher_no, status: r.status }],
    ),
  )
  const attsByBa = new Map<string, Array<{ id: string; name: string }>>()
  for (const a of (attRows ?? []) as Array<{ id: string; ba_id: string; file_name: string }>) {
    const list = attsByBa.get(a.ba_id) ?? []
    list.push({ id: a.id, name: a.file_name })
    attsByBa.set(a.ba_id, list)
  }

  const companyById = new Map(
    (companies ?? []).map((c: { id: string; name: string; short_code: string | null }) => [c.id, c]),
  )

  const rows: BaRow[] = baList.map(b => {
    const co = b.borrower_company_id ? companyById.get(b.borrower_company_id as string) : null
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
      borrower: co ? ((co.short_code as string | null) ?? co.name) : ((b.borrower_name as string | null) ?? '—'),
      borrowerCompanyId: (b.borrower_company_id as string | null) ?? null,
      status: b.status as 'active' | 'settled' | 'cancelled',
      notes: (b.notes as string | null) ?? null,
      interestInvoice: invByRef.get(baRef(b.id as string)) ?? null,
      interestPv: pvByBa.get(b.id as string) ?? null,
      attachments: attsByBa.get(b.id as string) ?? [],
    }
  })

  const companyOptions: CompanyOption[] = (companies ?? []).map(
    (c: { id: string; name: string; short_code: string | null }) => ({
      id: c.id,
      label: c.short_code ? `${c.name} (${c.short_code})` : c.name,
    }),
  )

  // Limits: used = Σ active BA face per borrower company; settled releases.
  const limitByCompany = new Map(
    ((limitRows ?? []) as Array<{ company_id: string; limit_amount: number }>).map(l => [
      l.company_id,
      Number(l.limit_amount),
    ]),
  )
  const usedByCompany = new Map<string, number>()
  for (const b of baList) {
    if (b.status !== 'active' || !b.borrower_company_id) continue
    const key = b.borrower_company_id as string
    usedByCompany.set(key, (usedByCompany.get(key) ?? 0) + Number(b.face_amount))
  }
  const limits: LimitRow[] = companyOptions.map(co => ({
    companyId: co.id,
    label: co.label,
    limit: limitByCompany.get(co.id) ?? 0,
    used: Math.round((usedByCompany.get(co.id) ?? 0) * 100) / 100,
  }))

  const banks: BankOption[] = ((bankRows ?? []) as Array<{
    id: string
    bank_name: string
    account_number: string | null
  }>).map(b => ({ id: b.id, label: `${b.bank_name}${b.account_number ? ` — ${b.account_number}` : ''}` }))

  // The head — Invoice Financing, Calculator, Record financing — belongs to
  // BaView, which holds the form and the calculator (2026-10-09, the handoff).
  return (
    <div>
      <BaView
        rows={rows}
        companies={companyOptions}
        banks={banks}
        limits={limits}
        autoReadAvailable={Boolean(process.env.ANTHROPIC_API_KEY)}
        openCalc={calc === '1'}
      />
    </div>
  )
}
