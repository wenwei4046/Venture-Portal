import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAction } from '@/lib/auth'
import { offersVariablePay, type TitleRow } from '@/lib/staff-form'
import { STAFF_ROW_COLUMNS } from '@/lib/private-columns'
import { readStaffPrivate } from '@/lib/private-fields'
import { sees } from '@/lib/sensitive'
import EditStaffForm from '../../_components/EditStaffForm'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditStaffPage({ params }: PageProps) {
  const viewer = await requireAction('team', 'edit')
  const { id } = await params
  const supabase = await createClient()

  const [{ data: staff }, { data: titles }, privateFields] = await Promise.all([
    supabase
      .from('hr_staff_costs')
      .select(`${STAFF_ROW_COLUMNS}, departments(name, payroll_source, segment_key)` as const)
      .eq('id', id)
      .maybeSingle(),
    supabase.from('titles').select('id, name, department_id, is_active').order('name'),
    // NRIC and the account numbers: •••• to an editor without the tick, and
    // the form then leaves them as they are (2026-10-09, PR4).
    readStaffPrivate(supabase, viewer, [id]),
  ])

  if (!staff) notFound()
  // The form saves pay: an editor whose title does not tick Salary amounts is
  // sent back to the record rather than shown figures it may not see.
  if (!sees(viewer, 'salary')) redirect(`/team/people/${id}`)
  const priv = privateFields.get(id) ?? { nric: null, bank_account_no: null, bank_account_no_2: null }

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
        className="text-sm hover:text-accent transition-colors"
      >
        ← Back to Staff Costs
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> PEOPLE · EDIT PERSON
          </div>
          <h1 className="page-title">Edit Staff</h1>
          <p className="text-sm mt-3">
            <span className="font-medium">{staff.employee_name}</span> · {deptName}
          </p>
        </div>
      </div>

      <EditStaffForm
        canSee={{ nric: sees(viewer, 'nric'), bank: sees(viewer, 'bank') }}
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
          bank_account_no: priv.bank_account_no,
          bank_name_2: staff.bank_name_2 ?? null,
          bank_account_no_2: priv.bank_account_no_2,
          nric: priv.nric,
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
