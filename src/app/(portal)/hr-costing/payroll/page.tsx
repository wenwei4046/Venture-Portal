import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import CreatePeriodButton from './_components/CreatePeriodButton'
import ImportInfotechEntryButton from './_components/ImportInfotechEntryButton'

function currentPeriod(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export default async function PayrollLandingPage() {
  await requireRole(['principal', 'hr'])
  const supabase = await createClient()

  const thisPeriod = currentPeriod()

  const { data: existing } = await supabase
    .from('hr_monthly_payroll')
    .select('id')
    .eq('period_month', thisPeriod)
    .limit(1)

  if (existing && existing.length > 0) {
    redirect(`/hr-costing/payroll/${thisPeriod}`)
  }

  const formattedPeriod = new Date(thisPeriod + 'T00:00:00Z').toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · PAYROLL · {formattedPeriod.toUpperCase()}
          </div>
          <h1 className="page-title">Payroll</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            One snapshot per employee per month. Pro-rata, statutory, PCB auto-computed.
            <em> HR edits drafts; Principal approves.</em>
          </p>
        </div>
      </div>

      <div className="py-16 text-center border border-hairline rounded-md bg-surface">
        <p className="font-serif italic text-accent text-sm mb-2">{formattedPeriod}</p>
        <p className="font-serif text-2xl text-ink mb-3">No payroll for this month yet.</p>
        <p className="font-serif italic text-muted text-sm mb-8 max-w-md mx-auto">
          Create the period to start from draft rows, or import directly from your InfoTech Excel export.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <CreatePeriodButton period={thisPeriod} />
          <ImportInfotechEntryButton period={thisPeriod} />
        </div>
      </div>
    </div>
  )
}
