'use server'

import { revalidatePath } from 'next/cache'
import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { validateInvite } from '@/lib/invite'
import { boundaryRefusal } from '@/lib/hierarchy-boundary'

/** The two department facts a boundary decision turns on. */
type DeptFacts = { name: string; payroll_source: string } | null

/**
 * Giving somebody an account.
 *
 * Three rows have to line up, in this order, because each depends on the last:
 *
 *   auth.users        the credential. Only the service role may create one, so
 *                     this is the one place adminClient is used — it had been
 *                     dormant since Phase 1.
 *   public.users      the portal identity: name, role, department. Its primary
 *                     key IS the auth id (FK, ON DELETE CASCADE).
 *   hr_staff_costs    the person. The master list, so an invite either attaches
 *                     to somebody already on it or puts them on it.
 *
 * If a later step fails the auth user is deleted again rather than left
 * orphaned — an account that can sign in but has no portal identity would land
 * the person on a redirect loop with nothing to show them.
 *
 * The table writes deliberately go through the CALLER's client, not the
 * service role: the RLS that governs them is the same RLS everything else
 * obeys, and `created_by` stays honest. Only the credential needs more.
 */

const str = (formData: FormData, key: string): string | null =>
  typeof formData.get(key) === 'string' ? (formData.get(key) as string) : null

export async function inviteUser(formData: FormData): Promise<void> {
  // Minting a login is the Principal's, not HR's: HR runs the roster, but an
  // account is access to the money pages.
  const actor = await requirePermission('team_invite')
  const supabase = await createClient()

  // Shape and rules live in lib/invite.ts, where they are unit-tested. staffId
  // is blank when this is a new hire nobody has filed yet.
  const { name, email, password, role, departmentId, titleId, reportsTo, phone, staffId } =
    validateInvite({
      name: str(formData, 'name'),
      email: str(formData, 'email'),
      password: str(formData, 'password'),
      role: str(formData, 'role'),
      departmentId: str(formData, 'department_id'),
      titleId: str(formData, 'title_id'),
      reportsTo: str(formData, 'reports_to'),
      phone: str(formData, 'phone'),
      staffId: str(formData, 'staff_id'),
    })

  // Fail before creating a credential we would only have to delete again.
  const { data: emailTaken } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (emailTaken) throw new Error('That email already has an account')

  let existingDeptId: string | null = null
  let existingTitleId: string | null = null
  if (staffId) {
    const { data: person } = await supabase
      .from('hr_staff_costs')
      .select('id, employee_name, user_id, department_id, title_id')
      .eq('id', staffId)
      .maybeSingle()
    if (!person) throw new Error('That person is no longer on the roster')
    if (person.user_id) throw new Error(`${person.employee_name} already has an account`)
    existingDeptId = person.department_id
    existingTitleId = person.title_id
  }

  // The department boundary — `lib/hierarchy-boundary.ts`. Checked here for two
  // reasons. This path writes `reports_to` and `department_id` in ONE statement
  // and has never gone through `setReportsTo`, so it is the other place a
  // reporting line can be drawn; and it must fail BEFORE the credential exists,
  // beside the other pre-flight checks, or a refusal costs an auth user that
  // then has to be deleted again.
  if (reportsTo) {
    const { data: managerRow } = await supabase
      .from('hr_staff_costs')
      .select('employee_name, departments (name, payroll_source)')
      .eq('id', reportsTo)
      .maybeSingle()
    if (!managerRow) throw new Error('That manager is no longer on the roster')

    // Where the invitee ENDS UP, which is not always where they are now: the
    // form's department wins when it set one, and an existing person keeps
    // theirs when it did not.
    const deptId = departmentId ?? existingDeptId
    let ownDept: DeptFacts = null
    if (deptId) {
      const { data } = await supabase
        .from('departments')
        .select('name, payroll_source')
        .eq('id', deptId)
        .maybeSingle()
      ownDept = data as DeptFacts
    }

    const embed = (managerRow as unknown as { employee_name: string; departments: DeptFacts | DeptFacts[] })
      .departments
    const managerDept: DeptFacts = Array.isArray(embed) ? (embed[0] ?? null) : embed

    // The submitted title wins; an existing person keeps theirs when it is
    // blank. Read the head flag from the authorised database, never the form:
    // a Revenue Director's own line is company reporting, not an override.
    const effectiveTitleId = titleId ?? existingTitleId
    let isDepartmentHead = false
    if (ownDept?.payroll_source === 'commission' && effectiveTitleId) {
      const { data: title, error: titleError } = await supabase
        .from('titles')
        .select('is_department_head')
        .eq('id', effectiveTitleId)
        .maybeSingle()
      if (titleError) throw new Error('Could not check their reporting title. Try again.')
      if (!title) throw new Error('That title is no longer available.')
      isDepartmentHead = title.is_department_head === true
    }

    const crossing = boundaryRefusal(
      {
        name,
        department: ownDept?.name ?? null,
        commissionDept: ownDept?.payroll_source === 'commission',
        isDepartmentHead,
      },
      {
        name: (managerRow as { employee_name: string }).employee_name,
        department: managerDept?.name ?? null,
        commissionDept: managerDept?.payroll_source === 'commission',
      },
    )
    if (crossing) throw new Error(crossing)
  }

  const { data: created, error: authError } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  })

  if (authError || !created?.user) {
    throw new Error(authError?.message ?? 'Could not create the login')
  }

  const userId = created.user.id

  try {
    const { error: userError } = await supabase.from('users').insert({
      id: userId,
      email,
      name,
      role,
      department_id: departmentId,
    })
    if (userError) throw new Error(`Could not create the portal user: ${userError.message}`)

    if (staffId) {
      const { error: linkError } = await supabase
        .from('hr_staff_costs')
        .update({
          user_id: userId,
          email,
          ...(phone ? { contact_number: phone } : {}),
          ...(titleId ? { title_id: titleId } : {}),
          ...(departmentId ? { department_id: departmentId } : {}),
          reports_to: reportsTo,
        })
        .eq('id', staffId)
      if (linkError) throw new Error(`Could not attach the account: ${linkError.message}`)
    } else {
      const { error: staffError } = await supabase.from('hr_staff_costs').insert({
        employee_name: name,
        // validateInvite has already refused a new person with no department.
        department_id: departmentId!,
        title_id: titleId,
        reports_to: reportsTo,
        email,
        contact_number: phone,
        user_id: userId,
        // NOT NULL with no default. A new hire's pay is set on their own page,
        // where the statutory categories that go with it live too.
        basic_salary: 0,
        created_by: actor.id,
      })
      if (staffError) throw new Error(`Could not add them to the roster: ${staffError.message}`)
    }
  } catch (err) {
    // Roll the credential back so a retry is not blocked by a half-made
    // account, and so nothing can sign in without a portal identity.
    await adminClient().auth.admin.deleteUser(userId)
    throw err
  }

  revalidatePath('/team', 'layout')
}
