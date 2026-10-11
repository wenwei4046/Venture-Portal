import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { loginIsPersonal } from '@/lib/account/personal-login'
import { changeMyPassword } from '@/lib/account/actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import ChangePasswordForm from './_components/ChangePasswordForm'

export const dynamic = 'force-dynamic'

/**
 * Admin › Change password (2026-10-12 — the user: "i want every user, have a change password
 * function … in their profile tab. or admin category": the current password, then the new one,
 * then the new one again; and "just for that personal acc"). The portal's place for it — the HR
 * app has it in More, the Revenue app in Profile.
 *
 * A login of their own only: a shared one (principal@, finance@, hr@, marketing@) is several
 * people's, and changing it here would lock the others out, so it is sent to the Overview — as is
 * the portal viewed as somebody, whose screen it would seem to be. No tab closes it (OPEN_PAGES).
 */
export default async function ChangePasswordPage() {
  const user = await requireAuth()
  if (user.viewingAs || !(await loginIsPersonal())) redirect('/dashboard')
  return (
    <HvPage>
      <PageHead eyebrow="Admin · Account" title="Change password" subtitle={`Signed in as ${user.email}`} />
      <ChangePasswordForm email={user.email} change={changeMyPassword} />
    </HvPage>
  )
}
