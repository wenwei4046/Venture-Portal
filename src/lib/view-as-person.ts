import 'server-only'
import { cookies } from 'next/headers'
import { VIEW_AS_PERSON_COOKIE } from '@/lib/view-as'
import { READ_ONLY_MESSAGE } from '@/lib/supabase/read-only'

/**
 * Viewing the portal as somebody (2026-10-11) writes nothing. The session's
 * own client reads only while the cookie is set (lib/supabase/read-only.ts);
 * these are for the few writes that go around it, through the service role —
 * minting a login, keeping the ERP's feed key.
 */
export async function viewingAsSomebody(): Promise<boolean> {
  return !!(await cookies()).get(VIEW_AS_PERSON_COOKIE)?.value
}

/** Throws the read-only refusal while viewing as somebody. */
export async function refuseWhileViewingAs(): Promise<void> {
  if (await viewingAsSomebody()) throw new Error(READ_ONLY_MESSAGE)
}
