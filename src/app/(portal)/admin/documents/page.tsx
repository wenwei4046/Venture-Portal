import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { loginIsPersonal } from '@/lib/account/personal-login'
import { loadMyDocuments } from '@/lib/documentation/my-docs'
import { HvPage, PageHead } from '@/components/hrv/kit'
import MyDocumentsView from './_components/MyDocumentsView'

export const dynamic = 'force-dynamic'

/**
 * Admin › My documents (2026-10-14 — the user: "现在的 documentation 我要分成两种：一个是 company，一个是 personal";
 * a person sees what HR opens to them "用自己的 user 账号 login"). The portal's place for one's own documents — the
 * Revenue app has them in Profile › Documentation, the HR app in More — beside Change password: Company (what HR
 * shares with their department) and Personal (what of their own Data center folder HR shares with them, and their
 * letters). Read under their own session (`my_documents()`); nothing here is a permission's.
 *
 * A login of their own only — a shared one (principal@, finance@, hr@, marketing@) is no person and has none — and
 * never while viewing as somebody, whose screen it would seem to be: both are sent to the Overview. No tab closes it
 * (OPEN_PAGES).
 */
export default async function MyDocumentsPage() {
  const user = await requireAuth()
  if (user.viewingAs || !(await loginIsPersonal())) redirect('/dashboard')
  const read = await loadMyDocuments()
  return (
    <HvPage>
      <PageHead eyebrow="Admin · Account" title="My documents" />
      {read.ok ? <MyDocumentsView docs={read.data} /> : <div className="sheet-danger">{read.reason}</div>}
    </HvPage>
  )
}
