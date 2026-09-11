import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
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
  const [{ data: departments }, { data: titles }, nextCode] = await Promise.all([
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
    // The code the person will get — HV + the largest number on the roster
    // + 1, handed out by the database when the row is saved (trigger
    // `hr_staff_costs_assign_code`, 2026-09-12). Asked here only so the form
    // can say it; the answer is a preview, not a reservation. The function
    // postdates database.types.ts, hence the untyped client, and a refusal
    // costs the preview and nothing else.
    (supabase as unknown as SupabaseClient)
      .rpc('next_staff_code')
      .then(
        r => (typeof r.data === 'string' ? r.data : null),
        () => null,
      ),
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
        nextCode={nextCode}
      />
    </div>
  )
}
