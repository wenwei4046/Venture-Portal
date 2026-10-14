import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { HUB_HREF, tabHubs } from '@/lib/fin-app/routes'
import { finAppRows } from '@/lib/fin-app/server'

/** `/fin-app/daily` — the tab's first top tab this reader opens (the tab bar itself goes to the last one used). */
export default async function FinAppDaily() {
  const user = await requireAuth()
  const first = tabHubs('daily', new Set(finAppRows(user)))[0]
  redirect(first ? HUB_HREF[first] : '/fin-app')
}
