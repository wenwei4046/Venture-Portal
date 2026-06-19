import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'

interface PageProps {
  params: Promise<{ id: string }>
}

const EPF_LABELS: Record<string, string> = {
  A: 'Part A (Citizen, under 60)',
  C: 'Part C (Citizen, 60+)',
  E: 'Part E (Non-citizen, under 60)',
  F: 'Part F (Non-citizen, 60+)',
}

const PCB_LABELS: Record<string, string> = {
  KA1: 'KA1 (Single)',
  KA2: 'KA2 (Married, spouse not working)',
  KA3: 'KA3 (Married, spouse working)',
}

export default async function StaffDetailPage({ params }: PageProps) {
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
        ← Back to Staff
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · STAFF · {(deptName ?? '—').toUpperCase()}
          </div>
          <h1 className="page-title">{staff.employee_name}</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            {staff.employee_code && (
              <span className="font-mono text-sm text-muted mr-2">{staff.employee_code}</span>
            )}
            {staff.designation && <em className="mr-2">{staff.designation}</em>}
            {staff.resignation_date && (
              <em className="text-danger">Resigned {staff.resignation_date}</em>
            )}
            {!staff.employee_code && !staff.designation && !staff.resignation_date && (
              <em>Active employee.</em>
            )}
          </p>
        </div>
        <Link
          href={`/hr-costing/staff/${staff.id}/edit`}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors shrink-0"
        >
          Edit
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl">
        <Section title="Identity">
          <Field label="NRIC" value={staff.nric} mono />
          <Field label="Employee Code" value={staff.employee_code} mono />
          <Field
            label="Employment Type"
            value={staff.employment_type === 'commission_eligible' ? 'Commission-eligible' : 'Salaried'}
          />
          <Field label="Hire Date" value={staff.hire_date} />
          <Field label="Resignation Date" value={staff.resignation_date} />
        </Section>

        <Section title="Contact">
          <Field label="Phone" value={staff.contact_number} mono />
          <Field label="Email" value={staff.email} />
          <Field label="Address" value={staff.address} multiline />
        </Section>

        <Section title="Emergency Contact">
          <Field label="Name" value={staff.emergency_contact_name} />
          <Field label="Relationship" value={staff.emergency_contact_relationship} />
          <Field label="Phone" value={staff.emergency_contact_phone} mono />
        </Section>

        <Section title="Bank Account">
          <Field label="Bank" value={staff.bank_name} />
          <Field label="Account No" value={staff.bank_account_no} mono />
        </Section>

        <Section title="Salary">
          <Field label="Basic" value={formatMoney(Number(staff.basic_salary))} mono />
          <Field label="Statutory Allowance" value={formatMoney(Number(staff.allowances))} mono />
          <Field
            label="Non-Statutory Allowance"
            value={formatMoney(Number(staff.non_statutory_allowance ?? 0))}
            mono
          />
        </Section>

        <Section title="Statutory">
          <Field
            label="EPF"
            value={staff.is_epf_exempt ? 'Exempt' : (EPF_LABELS[staff.epf_category] ?? staff.epf_category)}
          />
          <Field label="SOCSO" value={staff.socso_category === 'second' ? 'Second' : 'First'} />
          <Field label="PCB" value={PCB_LABELS[staff.pcb_category] ?? staff.pcb_category} />
          <Field label="Children" value={String(staff.children_count ?? 0)} mono />
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-serif italic text-ink text-md mb-4 pb-2 border-b border-hairline">{title}</h2>
      <dl className="space-y-3">{children}</dl>
    </section>
  )
}

function Field({
  label,
  value,
  mono,
  multiline,
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
  multiline?: boolean
}) {
  const isEmpty = value == null || value === ''
  return (
    <div className="grid grid-cols-[140px_1fr] gap-4 items-baseline">
      <dt className="font-sans text-xs uppercase tracking-wide text-graphite">{label}</dt>
      <dd
        className={[
          mono ? 'font-mono tabular text-sm' : 'font-serif text-sm',
          isEmpty ? 'text-muted italic' : 'text-ink',
          multiline ? 'whitespace-pre-line' : '',
        ].join(' ')}
      >
        {isEmpty ? '—' : value}
      </dd>
    </div>
  )
}
