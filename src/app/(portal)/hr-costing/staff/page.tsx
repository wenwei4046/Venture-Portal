import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import Link from 'next/link'
import AddStaffForm from './_components/AddStaffForm'
import StaffActions from './_components/StaffActions'

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

  return (
    <div>
      <Link href="/hr-costing" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to HR Costing
      </Link>

      <div className="flex items-baseline justify-between mt-6 mb-10">
        <div>
          <h1 className="font-serif text-3xl text-ink">Staff Costs</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            Individual employee records. Salary is adjustable. <em>Finance cannot see this page.</em>
          </p>
        </div>
      </div>

      {(!staff || staff.length === 0) ? (
        <div className="py-16 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif italic text-graphite text-lg mb-4">还没有员工记录。</p>
          <p className="font-serif italic text-muted text-sm mb-6">Add employees below to start tracking HR costs.</p>
        </div>
      ) : (
        <div className="overflow-x-auto mb-12">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                <th className="text-left py-3 pr-4 font-medium">Name</th>
                <th className="text-left py-3 pr-4 font-medium">Department</th>
                <th className="text-right py-3 pr-4 font-medium">Basic</th>
                <th className="text-right py-3 pr-4 font-medium">Statutory Allow.</th>
                <th className="text-right py-3 pr-4 font-medium">Non-Stat. Allow.</th>
                <th className="text-right py-3 pr-4 font-medium">EPF ER</th>
                <th className="text-right py-3 pr-4 font-medium">Total CTC</th>
                <th className="text-left py-3 pr-4 font-medium">Type</th>
                <th className="text-right py-3 pr-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map(s => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const dept = (s as any).departments
                return (
                  <tr key={s.id} className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors">
                    <td className="py-4 pr-4">
                      <div className="font-serif text-md text-ink">{s.employee_name}</div>
                    </td>
                    <td className="py-4 pr-4 font-serif italic text-graphite">{dept?.name ?? '—'}</td>
                    <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ink">{formatMoney(s.basic_salary)}</td>
                    <td className="py-4 pr-4 text-right font-mono tabular font-medium text-graphite">{formatMoney(s.allowances)}</td>
                    <td className="py-4 pr-4 text-right font-mono tabular font-medium text-graphite">{formatMoney(s.non_statutory_allowance ?? 0)}</td>
                    <td className="py-4 pr-4 text-right font-mono tabular font-medium text-graphite">{formatMoney(s.epf_er ?? 0)}</td>
                    <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ink font-semibold">{formatMoney(s.total_ctc ?? 0)}</td>
                    <td className="py-4 pr-4">
                      <em className={`font-serif text-sm ${s.is_mgmt_fee ? 'text-accent' : 'text-graphite'}`}>
                        {s.is_mgmt_fee ? 'Mgmt Fee' : 'Attribution'}
                      </em>
                    </td>
                    <td className="py-4 pr-4 text-right">
                      <StaffActions staffId={s.id} staffName={s.employee_name} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <section className="mb-12">
        <h2 className="font-serif text-2xl text-ink mb-1">Add Staff</h2>
        <p className="font-serif italic text-graphite text-sm mb-6">
          New employee. Statutory ER auto-calculated on basic salary. Non-statutory allowances (transport, benefits) don&apos;t attract EPF/SOCSO/EIS.
        </p>
        <AddStaffForm departments={departments ?? []} />
      </section>
    </div>
  )
}
