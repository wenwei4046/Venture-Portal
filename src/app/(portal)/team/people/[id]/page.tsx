import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { formatMoney } from '@/lib/utils'
import { canAccessAuditLog, canInviteUsers, canManagePermissions } from '@/lib/roles'
import { hasTab } from '@/lib/page-tabs'
import { isFullyCommissionBased, isVariablePay } from '@/lib/staff-form'
import { STAFF_ROW_COLUMNS } from '@/lib/private-columns'
import { readStaffPrivate } from '@/lib/private-fields'
import { MASKED, sees } from '@/lib/sensitive'
import { readDirectory, readsStaffTable } from '@/lib/team-directory'
import ActivityLog from '../../_components/ActivityLog'
import PersonAccess from '../../_components/PersonAccess'
import { loadPersonAccess } from '../../_lib/person-permissions'
import PersonChanges from '../_components/PersonChanges'
import { getPersonCard } from '../card-actions'

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
  await requirePage('/team/people/[id]')
  // The roster's own key — or Team · View without the Salary tick, which reads
  // this person through the directory, and only inside its reach (2026-10-10,
  // PR4b: a Department head opens their own department's people).
  const viewer = await requirePermission('team', 'team_directory')
  const { id } = await params
  const supabase = await createClient()
  const direct = readsStaffTable(viewer)
  // Promote and end / restore their employment live here since the HR revamp's
  // window only reads (2026-10-10) — read beside the page's own, Team · Edit.
  const changes = canDo(viewer, 'team', 'edit') ? getPersonCard(id).catch(() => null) : Promise.resolve(null)

  // The row without its NRIC and account numbers, which come through the
  // reader beside it — the table no longer hands them out (2026-10-09, PR4).
  const [{ data: tableRow }, privateFields] = direct
    ? await Promise.all([
        supabase
          .from('hr_staff_costs')
          .select(
            `${STAFF_ROW_COLUMNS}, departments(name, payroll_source), titles(name, template_id), users!hr_staff_costs_user_id_fkey(id, name, email, role, is_active)` as const,
          )
          .eq('id', id)
          .maybeSingle(),
        readStaffPrivate(supabase, viewer, [id]),
      ])
    : [{ data: null }, new Map<string, { nric: string | null; bank_account_no: string | null; bank_account_no_2: string | null }>()]
  // The directory's row carries its own NRIC / accounts, masked as the ticks say.
  const directoryRow = direct ? null : ((await readDirectory(supabase, viewer, [id]))[0] ?? null)
  const staff = (tableRow ?? directoryRow) as NonNullable<typeof tableRow> | null

  if (!staff) notFound()
  const priv = directoryRow
    ? { nric: directoryRow.nric, bank_account_no: directoryRow.bank_account_no, bank_account_no_2: directoryRow.bank_account_no_2 }
    : (privateFields.get(id) ?? { nric: null, bank_account_no: null, bank_account_no_2: null })
  // A pay figure as this viewer may see it (Salary amounts, the template's tick).
  const pay = (amount: number) => (sees(viewer, 'salary') ? formatMoney(amount) : MASKED)

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
  // What their login may do is read beside the roster's own key only — the
  // directory opens a person, not their permissions.
  const access = account && direct
    ? await loadPersonAccess(
        supabase,
        { id: account.id, role: account.role },
        { id: row.title_id ?? null, name: titleName, templateId: row.titles?.template_id ?? null },
      )
    : null

  const card = await changes

  return (
    <div>
      <Link href="/team/people" className="inline-block mb-3 text-sm hover:text-accent transition-colors">
        ← Back to People
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> PEOPLE · {deptName.toUpperCase()}
          </div>
          <h1 className="page-title">{staff.employee_name}</h1>
          <p className="text-sm mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            {staff.employee_code && <span className="font-mono">{staff.employee_code}</span>}
            {staff.employee_code && titleName ? <span aria-hidden>·</span> : null}
            {titleName && <span>{titleName}</span>}
            {/* Resigned is a state, so it is a word on the red wash. */}
            {staff.resignation_date && (
              <span className="chip danger">
                <span className="dot" aria-hidden />
                Resigned {staff.resignation_date}
              </span>
            )}
            {!staff.employee_code && !titleName && !staff.resignation_date && (
              <span>Active employee.</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* One person, one login — so this is offered only while they have
              none, and only to the role that may mint one. */}
          {canInviteUsers(viewer) && hasTab(viewer.tabs, 'hr.permissions', 'create') && !account && staff.status !== 'inactive' ? (
            <Link
              href={`/team/people?invite=${staff.id}`}
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
            >
              Invite
            </Link>
          ) : null}
          {canDo(viewer, 'team', 'edit') && sees(viewer, 'salary') ? (
            <Link
              href={`/team/people/${staff.id}/edit`}
              className="bg-accent hover:bg-accent-hover text-ink text-sm px-4 py-2 rounded-control transition-colors"
            >
              Edit
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-2 max-w-5xl">
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
          <Field label="NRIC" value={priv.nric} mono />
          <Field label="Employee Code" value={staff.employee_code} mono />
          <Field label="InfoTech No" value={staff.infotech_code} mono />
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
          <Field label="Account 1 number" value={priv.bank_account_no} mono />
          <Field label="Account 2 bank" value={staff.bank_name_2} />
          <Field label="Account 2 number" value={priv.bank_account_no_2} mono />
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
                  <Field label="Basic" value={pay(Number(staff.basic_salary))} mono />
                  <Field label="Statutory Allowance" value={pay(Number(staff.allowances))} mono />
                  <Field
                    label="Non-Statutory Allowance"
                    value={pay(Number(staff.non_statutory_allowance ?? 0))}
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

      {card?.can.promote ? (
        <PersonChanges
          personId={card.staff.id}
          personName={card.staff.employee_name}
          title={card.title}
          department={card.department}
          ladder={card.ladder}
          active={card.active}
        />
      ) : null}

      {access ? (
        <PersonAccess access={access} canEdit={canManagePermissions(viewer) && hasTab(viewer.tabs, 'hr.permissions', 'edit')} personName={staff.employee_name} />
      ) : null}

      {canSeeActivity ? <ActivityLog userId={account!.id} /> : null}
    </div>
  )
}

// A section is the sheet's section head — the title over its rule — and a
// label/value list under it.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="sect-head">
        <h2>{title}</h2>
        <span className="rule" aria-hidden />
      </div>
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
      <dt className="text-[10px] font-medium uppercase tracking-[0.06em]">{label}</dt>
      <dd
        className={[
          mono && !isEmpty ? 'font-mono tabular text-[12.5px]' : 'text-sm',
          multiline ? 'whitespace-pre-line' : '',
        ].join(' ')}
      >
        {isEmpty ? '—' : value}
      </dd>
    </div>
  )
}
