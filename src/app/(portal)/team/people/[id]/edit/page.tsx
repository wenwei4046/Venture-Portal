import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { offersVariablePay, type TitleRow } from '@/lib/staff-form'
import EditStaffForm from '../../_components/EditStaffForm'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditStaffPage({ params }: PageProps) {
  await requirePermission('team')
  const { id } = await params
  const supabase = await createClient()

  const [{ data: staff }, { data: titles }] = await Promise.all([
    supabase
      .from('hr_staff_costs')
      .select('*, departments(name, payroll_source, segment_key)')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('titles').select('id, name, department_id, is_active').order('name'),
  ])

  if (!staff) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deptName = (staff as any).departments?.name ?? '—'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commissionDept = (staff as any).departments?.payroll_source === 'commission'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const directorDept = offersVariablePay((staff as any).departments)

  return (
    <div>
      <Link
        href="/team/people"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Staff Costs
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> PEOPLE · EDIT PERSON
          </div>
          <h1 className="page-title">Edit Staff</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            {staff.employee_name} · <em className="text-muted">{deptName}</em>
          </p>
        </div>
      </div>

      <EditStaffForm
        titles={(titles ?? []) as TitleRow[]}
        staff={{
          id: staff.id,
          employee_name: staff.employee_name,
          designation: staff.designation ?? null,
          department_id: staff.department_id,
          department_name: deptName,
          commission_dept: commissionDept,
          director_dept: directorDept,
          title_id: staff.title_id ?? null,
          basic_salary: Number(staff.basic_salary),
          allowances: Number(staff.allowances),
          non_statutory_allowance: staff.non_statutory_allowance == null ? null : Number(staff.non_statutory_allowance),
          employee_code: staff.employee_code,
          infotech_code: staff.infotech_code,
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
          bank_name_2: staff.bank_name_2 ?? null,
          bank_account_no_2: staff.bank_account_no_2 ?? null,
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
