import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import type { TitleOption } from '@/lib/staff-form'
import AddStaffForm, { type AddStaffDepartment } from '../_components/AddStaffForm'

export default async function NewStaffPage() {
  await requirePermission('team')
  const supabase = await createClient()

  // is_internal=false excludes the hidden 'Venture Office' pseudo-department —
  // staff can't be assigned to it. payroll_source says which department the
  // commission engine pays, and so which one offers "Full commission";
  // segment_key 'director' is the one the Director Salary engine pays, and so
  // the one that offers "Variable pay".
  // Titles are rows since 2026-09-01; only the active ones are on offer.
  const [{ data: departments }, { data: titles }] = await Promise.all([
    supabase
      .from('departments')
      .select('id, name, payroll_source, segment_key')
      .eq('is_internal', false)
      .order('name'),
    supabase
      .from('titles')
      .select('id, name, department_id')
      .eq('is_active', true)
      .order('name'),
  ])

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
            <em>I.</em> PEOPLE · NEW PERSON
          </div>
          <h1 className="page-title">Add Staff</h1>
        </div>
      </div>

      <AddStaffForm
        departments={(departments ?? []) as AddStaffDepartment[]}
        titles={(titles ?? []) as TitleOption[]}
      />
    </div>
  )
}
