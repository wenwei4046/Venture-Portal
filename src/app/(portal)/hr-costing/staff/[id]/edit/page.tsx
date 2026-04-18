import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import EditStaffForm from '../../_components/EditStaffForm'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditStaffPage({ params }: PageProps) {
  await requireRole(['principal', 'hr'])
  const { id } = await params
  const supabase = await createClient()

  const { data: staff } = await supabase
    .from('hr_staff_costs')
    .select('*, departments(name)')
    .eq('id', id)
    .maybeSingle()

  if (!staff) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deptName = (staff as any).departments?.name ?? '—'

  return (
    <div>
      <Link
        href="/hr-costing/staff"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Staff Costs
      </Link>

      <div className="mt-6 mb-10">
        <h1 className="font-serif text-3xl text-ink">Edit Staff</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          {staff.employee_name} · <em className="text-muted">{deptName}</em>
        </p>
      </div>

      <EditStaffForm
        staff={{
          id: staff.id,
          employee_name: staff.employee_name,
          department_name: deptName,
          basic_salary: Number(staff.basic_salary),
          allowances: Number(staff.allowances),
          non_statutory_allowance: staff.non_statutory_allowance == null ? null : Number(staff.non_statutory_allowance),
          employee_code: staff.employee_code,
          hire_date: staff.hire_date,
          resignation_date: staff.resignation_date,
          epf_category: staff.epf_category,
          socso_category: staff.socso_category,
          is_epf_exempt: Boolean(staff.is_epf_exempt),
          pcb_category: staff.pcb_category,
          children_count: Number(staff.children_count ?? 0),
          employment_type: staff.employment_type,
          bank_name: staff.bank_name ?? null,
          bank_account_no: staff.bank_account_no ?? null,
          nric: staff.nric ?? null,
          contact_number: staff.contact_number ?? null,
          email: staff.email ?? null,
          address: staff.address ?? null,
          emergency_contact_name: staff.emergency_contact_name ?? null,
          emergency_contact_phone: staff.emergency_contact_phone ?? null,
          emergency_contact_relationship: staff.emergency_contact_relationship ?? null,
        }}
      />
    </div>
  )
}
