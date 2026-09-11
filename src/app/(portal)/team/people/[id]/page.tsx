import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { canAccessAuditLog, canManagePermissions } from '@/lib/roles'
import { isFullyCommissionBased, isVariablePay } from '@/lib/staff-form'
import ActivityLog from '../../_components/ActivityLog'
import PersonPermissions, {
  type PersonPermissionRow,
} from '../../_components/PersonPermissions'
import { resolvePersonPermissions } from '../../_lib/person-permissions'

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
  const viewer = await requirePermission('team')
  const { id } = await params
  const supabase = await createClient()

  const { data: staff } = await supabase
    .from('hr_staff_costs')
    .select(
      '*, departments(name, payroll_source), titles(name), users!hr_staff_costs_user_id_fkey(id, name, email, role, is_active)',
    )
    .eq('id', id)
    .maybeSingle()

  if (!staff) notFound()

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const row = staff as any
  const deptName: string = row.departments?.name ?? '—'
  const titleName: string | null = row.titles?.name ?? row.designation ?? null
  // Paid 100% on commission: no basic, no allowances, statutory at 0 — so the
  // salary and statutory sections have nothing to say and are not shown.
  const fullCommission = isFullyCommissionBased({
    employment_type: row.employment_type,
    commission_dept: row.departments?.payroll_source === 'commission',
  })
  // Variable pay (Director department): no fixed figure on the record — the
  // month's is keyed on payroll — but the statutory categories still apply.
  const variablePay = isVariablePay(row)
  const account = row.users as
    | { id: string; name: string; email: string; role: string; is_active: boolean }
    | null
  // access_log is Principal-or-self; a reader without the audit permission
  // would only ever see an empty panel, so it is not rendered for them at all.
  const canSeeActivity = canAccessAuditLog(viewer) && !!account

  // What this person's account actually resolves to. Shared with the floating
  // person card since 2026-09-01 — two copies of this would drift, and it is
  // the answer an audit reads.
  let permissionRows: PersonPermissionRow[] = []
  let permissionSource = ''
  if (account) {
    const resolved = await resolvePersonPermissions(
      supabase,
      { id: account.id, role: account.role },
      { id: row.title_id ?? null, name: titleName },
    )
    permissionRows = resolved.rows
    permissionSource = resolved.source
  }

  return (
    <div>
      <Link
        href="/team/people"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to People
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> PEOPLE · {deptName.toUpperCase()}
          </div>
          <h1 className="page-title">{staff.employee_name}</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            {staff.employee_code && (
              <span className="font-mono text-sm text-muted mr-2">{staff.employee_code}</span>
            )}
            {titleName && <em className="mr-2">{titleName}</em>}
            {staff.resignation_date && (
              <em className="text-danger">Resigned {staff.resignation_date}</em>
            )}
            {!staff.employee_code && !titleName && !staff.resignation_date && (
              <em>Active employee.</em>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* One person, one login — so this is offered only while they have
              none, and only to the role that may mint one. */}
          {viewer.role === 'principal' && !account ? (
            <Link
              href={`/team/people/invite?staff=${staff.id}`}
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-3 py-2 rounded-md transition-colors"
            >
              Invite
            </Link>
          ) : null}
          <Link
            href={`/team/people/${staff.id}/edit`}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            Edit
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl">
        <Section title="Assignment">
          <Field label="Title" value={titleName} />
          <Field label="Department" value={deptName} />
          <Field
            label="Account"
            value={account ? account.email : null}
            mono={!!account}
          />
          <Field label="Role" value={account ? account.role : null} />
        </Section>

        <Section title="Identity">
          <Field label="NRIC" value={staff.nric} mono />
          <Field label="Employee Code" value={staff.employee_code} mono />
          <Field
            label="Employment Type"
            value={
              fullCommission
                ? 'Fully commission based'
                : variablePay
                  ? 'Variable pay'
                  : staff.employment_type === 'commission_eligible'
                    ? 'Commission-eligible'
                    : 'Salaried'
            }
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

        <Section title="Bank Accounts">
          <Field label="Account 1 bank" value={staff.bank_name} />
          <Field label="Account 1 number" value={staff.bank_account_no} mono />
          <Field label="Account 2 bank" value={staff.bank_name_2} />
          <Field label="Account 2 number" value={staff.bank_account_no_2} mono />
        </Section>

        {fullCommission ? (
          <Section title="Salary">
            <Field label="Pay basis" value="Fully commission based" />
            <Field label="Basic" value="None — 100% of pay is commission" />
          </Section>
        ) : (
          <>
            <Section title="Salary">
              {variablePay ? (
                <>
                  <Field label="Pay basis" value="Variable pay — keyed monthly" />
                  <Field
                    label="Basic"
                    value="None — worked out each month by the Director Salary engine"
                  />
                </>
              ) : (
                <>
                  <Field label="Basic" value={formatMoney(Number(staff.basic_salary))} mono />
                  <Field label="Statutory Allowance" value={formatMoney(Number(staff.allowances))} mono />
                  <Field
                    label="Non-Statutory Allowance"
                    value={formatMoney(Number(staff.non_statutory_allowance ?? 0))}
                    mono
                  />
                </>
              )}
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
          </>
        )}
      </div>

      {account ? (
        <PersonPermissions
          userId={account.id}
          rows={permissionRows}
          source={permissionSource}
          canEdit={canManagePermissions(viewer)}
        />
      ) : null}

      {canSeeActivity ? <ActivityLog userId={account!.id} /> : null}
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
