import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { formatDate, formatMoney } from '@/lib/utils'
import { officeToday } from '@/lib/office-time'
import { canAccessAuditLog, canInviteUsers, canManagePermissions } from '@/lib/roles'
import { hasTab } from '@/lib/page-tabs'
import { fullAccessTemplate } from '@/lib/invite'
import { keptParts } from '@/lib/person-name'
import { addressLines, addressOf } from '@/lib/address/address'
import { EPF_LABELS, PCB_LABELS, SOCSO_LABELS, loginEmailHeld, payModeOf, tenureLabel } from '@/lib/person-record'
import { STAFF_ROW_COLUMNS } from '@/lib/private-columns'
import { readStaffPrivate } from '@/lib/private-fields'
import { MASKED, sees } from '@/lib/sensitive'
import { readDirectory, readOrgChart, readsStaffTable } from '@/lib/team-directory'
import ActivityLog from '../../_components/ActivityLog'
import PersonAccess from '../../_components/PersonAccess'
import PersonWell from '../../_components/PersonWell'
import w from '../../_components/person-well.module.css'
import { loadPersonAccess, type PersonAccessData } from '../../_lib/person-permissions'
import { loadUplineChoices } from '../../_lib/upline-choices'
import PersonChanges from '../_components/PersonChanges'
import PersonRecord, { type PersonRecordView } from '../_components/PersonRecord'
import { getPersonCard } from '../card-actions'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string }>
}

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Who they report to, as this viewer may name them: the roster's own read —
 * with a link to their page — or, for a directory reader, the org chart,
 * which names everybody active (a Department head's line runs up out of
 * their reach).
 */
async function uplineOf(supabase: Supabase, direct: boolean, managerId: string | null): Promise<PersonRecordView['reportsTo']> {
  if (!managerId) return null
  if (direct) {
    const { data } = await supabase.from('hr_staff_costs').select('id, employee_name, status, titles(name)').eq('id', managerId).maybeSingle()
    const m = data as { id: string; employee_name: string; status: string | null; titles: { name: string } | null } | null
    return m ? { name: m.employee_name, title: m.titles?.name ?? null, href: `/team/people/${m.id}`, active: m.status === 'active' } : null
  }
  const m = (await readOrgChart(supabase)).people.find(p => p.id === managerId)
  return m ? { name: m.employee_name, title: m.titles?.name ?? null, href: null, active: true } : null
}

/**
 * A login that can do everything (2026-10-22) — a Principal-kind template, one that ticks Manage permissions, or a
 * Principal login on no template — with its template's name; null for any other. The database asks the same before
 * their login's email moves (`person_login_email_move`).
 */
function fullAccessOf(access: PersonAccessData, role: string): { template: string | null } | null {
  if (access.kind === 'template') {
    return fullAccessTemplate(access.template.baseRole, !!access.template.grants.accounts?.manage) ? { template: access.template.name } : null
  }
  return role === 'principal' ? { template: null } : null
}

export default async function StaffDetailPage({ params, searchParams }: PageProps) {
  await requirePage('/team/people/[id]')
  // The roster's own key — or Team · View without the Salary tick, which reads
  // this person through the directory, and only inside its reach (2026-10-10,
  // PR4b: a Department head opens their own department's people).
  const viewer = await requirePermission('team', 'team_directory')
  const [{ id }, { edit }] = await Promise.all([params, searchParams])
  const supabase = await createClient()
  const direct = readsStaffTable(viewer)
  // Editing, promoting and ending or restoring their employment live here since
  // the HR revamp's window only reads (2026-10-10) — read beside the page's own,
  // Team · Edit. The card says what the viewer may do and carries the record
  // the edit fields start from (2026-10-14: edited where it stands).
  const mayEdit = canDo(viewer, 'team', 'edit')
  const changes = mayEdit ? getPersonCard(id).catch(() => null) : Promise.resolve(null)
  // …and the uplines Reports to offers them (2026-10-16), on the roster's own read.
  // A failed read leaves the row as it reads; the line is still set on Hierarchy.
  const uplines = mayEdit && direct
    ? loadUplineChoices(supabase, id).catch(err => {
        console.error('[person page] uplines', err)
        return null
      })
    : Promise.resolve(null)

  // The row without its NRIC and account numbers, which come through the
  // reader beside it — the table no longer hands them out (2026-10-09, PR4).
  const [{ data: tableRow }, privateFields] = direct
    ? await Promise.all([
        supabase
          .from('hr_staff_costs')
          .select(
            `${STAFF_ROW_COLUMNS}, departments(name, payroll_source), titles(name, template_id, level_id), users!hr_staff_costs_user_id_fkey(id, role, email, is_active)` as const,
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
  // Their login, if they have one: who its access log and permissions are
  // for, and the email they sign in with — their Contact email, which follows it.
  const account = row.users as { id: string; role: string; email: string; is_active: boolean } | null
  // access_log is Principal-or-self; a reader without the audit permission
  // would only ever see an empty panel, so it is not rendered for them at all.
  const canSeeActivity = canAccessAuditLog(viewer) && !!account

  // Where their title stands on the ladder, and who they report to.
  const levelId: string | null = row.titles?.level_id ?? null
  const [level, upline] = await Promise.all([
    levelId
      ? supabase.from('title_levels').select('name').eq('id', levelId).maybeSingle().then(r => (r.data as { name: string } | null)?.name ?? null)
      : Promise.resolve(null),
    uplineOf(supabase, direct, row.reports_to ?? null),
  ])

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

  const [card, uplineChoices] = await Promise.all([changes, uplines])
  const active = staff.status !== 'inactive'
  // Their login's email is HR's to change here since 2026-10-22 — a full-access title's only whoever manages
  // permissions' (the editor would choose where that login's mail goes), as Invite user keeps it.
  const fullAccess = account && access && !canDo(viewer, 'accounts', 'manage') ? fullAccessOf(access, account.role) : null
  const emailHeld = fullAccess ? loginEmailHeld(titleName, fullAccess.template) : null

  // Paid 100% on commission (no basic, no allowances, statutory at 0) or
  // variable pay (the Director department's month, keyed on payroll) — the
  // record words its salary and statutory by how they are paid.
  const parts = keptParts(row)
  const view: PersonRecordView = {
    name: staff.employee_name,
    firstName: parts.first,
    lastName: parts.last,
    department: deptName,
    code: staff.employee_code,
    title: titleName,
    level,
    active,
    login: account ? (account.is_active ? 'active' : 'disabled') : null,
    reportsTo: upline,
    hireDate: staff.hire_date ? formatDate(staff.hire_date) : null,
    tenure: tenureLabel(staff.hire_date, officeToday()),
    resignationDate: staff.resignation_date ? formatDate(staff.resignation_date) : null,
    nric: priv.nric,
    infotechCode: staff.infotech_code,
    // The address a line each from its six parts (2026-10-20); an older record without them, its one box.
    contact: { phone: staff.contact_number, email: account?.email ?? staff.email, address: addressLines(addressOf(row)).join('\n') || staff.address },
    emergency: {
      name: staff.emergency_contact_name,
      relationship: staff.emergency_contact_relationship,
      phone: staff.emergency_contact_phone,
    },
    bank: { name1: staff.bank_name, no1: priv.bank_account_no, name2: staff.bank_name_2, no2: priv.bank_account_no_2 },
    payMode: payModeOf({ employment_type: staff.employment_type, commission_dept: row.departments?.payroll_source === 'commission' }),
    commissionDept: row.departments?.payroll_source === 'commission',
    pay: {
      basic: pay(Number(staff.basic_salary)),
      allowances: pay(Number(staff.allowances)),
      nonStatutory: pay(Number(staff.non_statutory_allowance ?? 0)),
    },
    statutory: {
      epf: staff.is_epf_exempt ? 'Exempt' : (EPF_LABELS[staff.epf_category] ?? staff.epf_category),
      socso: SOCSO_LABELS[staff.socso_category] ?? staff.socso_category,
      pcb: PCB_LABELS[staff.pcb_category] ?? staff.pcb_category,
      children: String(staff.children_count ?? 0),
    },
  }

  return (
    <div>
      <Link href="/team/people" className="inline-block mb-3 text-sm hover:text-accent transition-colors">
        ← Back to People
      </Link>

      <PersonRecord
        view={view}
        // Team · Edit with the Salary tick (the save writes pay), on the
        // roster's own read — the card's own answer. Reports to is offered
        // only on the active roster, which the line's writer asks.
        editor={
          card?.can.edit
            ? {
                staff: card.staff,
                titles: card.titles,
                canSee: { nric: card.canSee.nric, bank: card.canSee.bank },
                reportsTo: row.reports_to ?? null,
                uplines: active ? uplineChoices : null,
                emailHeld,
              }
            : null
        }
        // One person, one login — so Invite is offered only while they have
        // none, and only to whoever may mint one.
        inviteHref={
          canInviteUsers(viewer) && hasTab(viewer.tabs, 'hr.permissions', 'create') && !account && active
            ? `/team/people?invite=${staff.id}`
            : null
        }
        startEditing={edit === '1'}
      />

      {/* The page goes on in the same wells, full width (2026-10-16, the user:
          "the promotion, permissions and activity go with new as well"). */}
      <div className={w.lower}>
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
          <PersonWell title="Permissions" icon="lock">
            <PersonAccess
              bare
              access={access}
              canEdit={canManagePermissions(viewer) && hasTab(viewer.tabs, 'hr.permissions', 'edit')}
              personName={staff.employee_name}
            />
          </PersonWell>
        ) : null}

        {canSeeActivity ? <ActivityLog userId={account!.id} /> : null}
      </div>
    </div>
  )
}
