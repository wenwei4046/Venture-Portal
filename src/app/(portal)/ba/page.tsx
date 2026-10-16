// Bank BA registry (user 2026-08-07, v2 2026-08-11). The BA is HOUZS Century's
// facility with the bank; HV earns the spread: charges the sub 2.5%/mo, owes HC
// 1.5%/mo, both prorated by days. The PRINCIPAL never moves through HV's bank —
// but the interest is real: Generate invoice bills the borrower (5028) and
// Generate PV pays HOUZS Century (6001), both through the normal flows.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import BaView from './_components/BaView'
import { readBaRegister } from './_lib/ba-read'

export const dynamic = 'force-dynamic'

export default async function BaPage({
  searchParams,
}: {
  searchParams: Promise<{ calc?: string }>
}) {
  await requirePage('/ba')
  const user = await requirePermission('treasury')
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { calc } = await searchParams

  // The register, its companies, limits and banks — as the Finance phone app reads them (`_lib/ba-read`).
  const { rows, companies: companyOptions, limits, banks } = await readBaRegister(supabase)

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
        // The register's arrangement as everyone's default — whoever records
        // financing, as on Fund IN / Fund OUT (2026-10-10, the handoff).
        canSetDefault={canDo(user, 'treasury', 'create')}
        // Record financing for whoever may record it — its action asks Treasury · Create (2026-10-16).
        canRecord={canDo(user, 'treasury', 'create')}
      />
    </div>
  )
}
