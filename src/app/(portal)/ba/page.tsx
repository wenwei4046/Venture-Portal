// Bank BA registry (user 2026-08-07). The BA is HOUZS Century's facility with
// the bank; HV earns the spread: charges the sub 2.5%/mo, owes HC 1.5%/mo,
// both prorated by days. Bank interest (annual, days/365) shows for reference.
// Registry only — real money books through Fund In / Fund Out as usual.

import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import BaView, { type BaRow, type CompanyOption } from './_components/BaView'

export const dynamic = 'force-dynamic'

export default async function BaPage({
  searchParams,
}: {
  searchParams: Promise<{ calc?: string }>
}) {
  await requireRole(['finance', 'principal'])
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { calc } = await searchParams

  const [{ data: bas }, { data: companies }] = await Promise.all([
    supabase.from('ba_facilities').select('*').order('start_date', { ascending: false }),
    supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('name'),
  ])

  const companyById = new Map(
    (companies ?? []).map((c: { id: string; name: string; short_code: string | null }) => [c.id, c]),
  )

  const rows: BaRow[] = (bas ?? []).map((b: Record<string, unknown>) => {
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
      status: b.status as 'active' | 'settled' | 'cancelled',
      notes: (b.notes as string | null) ?? null,
    }
  })

  const companyOptions: CompanyOption[] = (companies ?? []).map(
    (c: { id: string; name: string; short_code: string | null }) => ({
      id: c.id,
      label: c.short_code ? `${c.name} (${c.short_code})` : c.name,
    }),
  )

  return (
    <div>
      <Link
        href="/fund-in"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Fund In
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · BANKER&apos;S ACCEPTANCE
          </div>
          <h1 className="page-title">Bank BA</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            HC&apos;s facility with the bank — HV owes HC and charges the borrower, both
            prorated by days. Bank interest is reference only (HC&apos;s cost). Real money
            still books through Fund In / Fund Out; this page is the registry and
            calculator.
          </p>
        </div>
      </div>

      <BaView rows={rows} companies={companyOptions} openCalc={calc === '1'} />
    </div>
  )
}
