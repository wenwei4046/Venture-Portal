import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import AddStaffForm from './_components/AddStaffForm'
import StaffListClient, { type StaffRow } from './_components/StaffListClient'

export default async function StaffListPage() {
  await requireRole(['principal', 'hr'])
  const supabase = await createClient()

  const [
    { data: staff },
    { data: departments },
  ] = await Promise.all([
    supabase.from('hr_staff_costs')
      .select('*, departments(name)')
      .eq('status', 'active')
      .order('employee_name'),
    supabase.from('departments').select('id, name').order('name'),
  ])

  void supabase.rpc('log_data_access', {
    p_resource_type: 'hr_staff_costs',
    p_action: 'view',
    p_metadata: { staff_count: staff?.length ?? 0 },
  })

  const rows: StaffRow[] = (staff ?? []).map(s => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dept = (s as any).departments
    return {
      id: s.id,
      employee_name: s.employee_name,
      basic_salary: Number(s.basic_salary ?? 0),
      allowances: Number(s.allowances ?? 0),
      non_statutory_allowance: s.non_statutory_allowance != null ? Number(s.non_statutory_allowance) : null,
      dept_name: dept?.name ?? null,
    }
  })

  return (
    <div>
      <div className="flex items-baseline justify-between mt-2 mb-10 gap-4">
        <div>
          <h1 className="font-serif text-3xl text-ink">Staff</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            Individual employee records. Salary is adjustable. <em>Finance cannot see this page.</em>
          </p>
        </div>
        <a
          href="#add-staff"
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors shrink-0"
        >
          + Add Staff
        </a>
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center border border-hairline rounded-md bg-surface mb-12">
          <p className="font-serif italic text-graphite text-lg mb-2">还没有员工记录。</p>
          <p className="font-serif italic text-muted text-sm">
            Add employees below to start tracking HR costs.
          </p>
        </div>
      ) : (
        <StaffListClient staff={rows} />
      )}

      <section id="add-staff" className="mb-12 scroll-mt-6">
        <h2 className="font-serif text-2xl text-ink mb-1">Add Staff</h2>
        <p className="font-serif italic text-graphite text-sm mb-6">
          New employee. Statutory ER auto-calculated on basic salary. Non-statutory allowances (transport, benefits) don&apos;t attract EPF/SOCSO/EIS.
        </p>
        <AddStaffForm departments={departments ?? []} />
      </section>
    </div>
  )
}
