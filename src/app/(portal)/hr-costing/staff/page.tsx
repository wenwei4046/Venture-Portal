import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import StaffListClient, { type StaffRow } from './_components/StaffListClient'

export default async function StaffListPage() {
  await requireRole(['principal', 'hr'])
  const supabase = await createClient()

  const { data: staff } = await supabase
    .from('hr_staff_costs')
    .select('*, departments(name)')
    .eq('status', 'active')
    .order('employee_name')

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
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/hr-costing/staff/import"
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-3 py-2 rounded-md transition-colors"
          >
            Import InfoTech
          </Link>
          <Link
            href="/hr-costing/staff/new"
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            + Add Staff
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif italic text-graphite text-lg mb-2">还没有员工记录。</p>
          <p className="font-serif italic text-muted text-sm mb-6">
            Click <em>+ Add Staff</em> above to start tracking HR costs.
          </p>
        </div>
      ) : (
        <StaffListClient staff={rows} />
      )}
    </div>
  )
}
