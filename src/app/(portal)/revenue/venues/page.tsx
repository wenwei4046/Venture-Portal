import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { revenuePath } from '@/lib/revenue'
import { loadOrganisers, loadVenueRegister } from '../_lib/venue-register'
import { listSubDepartments } from '../_lib/sub-departments'
import VenueWorkbench from './_components/VenueWorkbench'

/**
 * Revenue → Venues. Every place, every month, and who ran the fair.
 *
 * The ERP names the venue on every sales order and sends NOTHING about the
 * organiser — no promoter, host or organiser field anywhere in the delivery.
 * So the organiser is typed here, and it is typed per (venue, month), because
 * the same hall has a different organiser from month to month.
 *
 * WHY THIS PAGE EXISTS. The organiser used to be typed on the month page's
 * *Sales by venue*, which lists only the venues THAT month has bills at — and
 * Fair's two months barely overlap: 13 venues are August only, 15 September
 * only. So there was no screen that showed the list, and naming them took as
 * many passes as there are months. The user asked for one register (2026-09-17)
 * and this is it: all 44 venues, the fairs held at each, a dropdown of the
 * organiser register beside every one, and the *same place as…* merge that
 * finally has every venue to choose from rather than one month's.
 *
 * It sits at DEPARTMENT level, beside the Product List rather than inside a
 * sub-department: `comm_venues` and `comm_organisers` carry no scheme. One
 * hall is one hall whoever sells in it.
 */
export default async function VenueRegisterPage() {
  await requirePermission('revenue')

  const supabase = (await createClient()) as unknown as SupabaseClient
  // The register first: the organiser rows are only names, and what each one
  // has actually run is counted from these.
  const register = await loadVenueRegister(supabase)
  const [organisers, subDepts] = await Promise.all([
    loadOrganisers(supabase),
    listSubDepartments(),
  ])

  const slugs = Object.fromEntries(subDepts.map(s => [s.id, s.slug]))

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · VENUES
          </div>
          <h1 className="page-title">Venues &amp; organisers</h1>
          <p className="font-serif italic text-graphite text-base mt-3 max-w-2xl">
            Every place the ERP has named, and who ran the fair there each month.{' '}
            <em>The organiser is the one thing the feed never carries</em> — so it is picked here,
            per month, from a register typed once.
          </p>
        </div>
        {subDepts.length > 0 ? (
          <Link
            href={revenuePath(subDepts[0].slug)}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-control transition-colors"
          >
            ← {subDepts[0].name}
          </Link>
        ) : null}
      </div>

      <VenueWorkbench register={register} organisers={organisers} slugs={slugs} />
    </div>
  )
}
