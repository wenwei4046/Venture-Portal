import Link from 'next/link'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import InviteUserForm, {
  type InviteDepartment,
  type InvitePerson,
  type InviteTitle,
} from '../_components/InviteUserForm'

interface PageProps {
  searchParams: Promise<{ staff?: string }>
}

/**
 * Invite User.
 *
 * Reached two ways, and the difference is only whether `?staff=` is set:
 * from a person who has no account yet (their details are prefilled and the
 * invite attaches to them), or from the roster header for somebody nobody has
 * filed yet (a roster row is created alongside the account).
 */
export default async function InviteUserPage({ searchParams }: PageProps) {
  await requirePermission('team_invite')
  const { staff: staffId } = await searchParams
  const supabase = await createClient()

  const [{ data: departments }, { data: titles }, { data: roster }] = await Promise.all([
    supabase.from('departments').select('id, name').order('name'),
    supabase.from('titles').select('id, name, department_id').eq('is_active', true).order('name'),
    supabase
      .from('hr_staff_costs')
      .select('id, employee_name, employee_code, department_id, title_id, contact_number, email, user_id')
      .eq('status', 'active')
      .order('employee_name'),
  ])

  const people = (roster ?? []) as Array<{
    id: string
    employee_name: string
    employee_code: string | null
    department_id: string
    title_id: string | null
    contact_number: string | null
    email: string | null
    user_id: string | null
  }>

  const target = staffId ? people.find(p => p.id === staffId) : undefined

  const prefill = target
    ? {
        staffId: target.id,
        name: target.employee_name,
        email: target.email ?? '',
        phone: target.contact_number ?? '',
        departmentId: target.department_id,
        titleId: target.title_id ?? '',
        alreadyHasAccount: !!target.user_id,
      }
    : null

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
            <em>I.</em> PEOPLE · INVITE USER
          </div>
          <h1 className="page-title">{target ? `Invite ${target.employee_name}` : 'Invite user'}</h1>
          <p className="font-serif italic text-graphite text-base mt-3 max-w-2xl">
            Creates a login they can sign in with straight away — there is no
            email step, so tell them the password yourself.
          </p>
        </div>
      </div>

      <InviteUserForm
        prefill={prefill}
        departments={(departments ?? []) as InviteDepartment[]}
        titles={(titles ?? []) as InviteTitle[]}
        people={
          people.map(p => ({
            id: p.id,
            name: p.employee_name,
            code: p.employee_code,
            departmentId: p.department_id,
            hasAccount: !!p.user_id,
          })) as InvitePerson[]
        }
      />
    </div>
  )
}
