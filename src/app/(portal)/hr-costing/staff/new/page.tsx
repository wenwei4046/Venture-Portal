import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import AddStaffForm from '../_components/AddStaffForm'

export default async function NewStaffPage() {
  await requireRole(['principal', 'hr'])
  const supabase = await createClient()

  const { data: departments } = await supabase
    .from('departments')
    .select('id, name')
    .order('name')

  return (
    <div>
      <Link
        href="/hr-costing/staff"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Staff
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · STAFF · NEW
          </div>
          <h1 className="page-title">Add Staff</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            New employee. Statutory ER auto-calculated on basic salary. Non-statutory allowances (transport, benefits) don&apos;t attract EPF/SOCSO/EIS.
          </p>
        </div>
      </div>

      <AddStaffForm departments={departments ?? []} />
    </div>
  )
}
