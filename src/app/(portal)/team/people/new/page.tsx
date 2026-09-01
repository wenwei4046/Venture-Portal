import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import AddStaffForm from '../_components/AddStaffForm'

export default async function NewStaffPage() {
  await requireRole(['principal', 'hr'])
  const supabase = await createClient()

  // is_internal=false excludes the hidden 'Venture Office' pseudo-department —
  // staff can't be assigned to it.
  const { data: departments } = await supabase
    .from('departments')
    .select('id, name')
    .eq('is_internal', false)
    .order('name')

  return (
    <div>
      <Link
        href="/team/people"
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
        </div>
      </div>

      <AddStaffForm departments={departments ?? []} />
    </div>
  )
}
