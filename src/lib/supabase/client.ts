import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'
import { VIEW_AS_PERSON_MARK } from '@/lib/view-as'
import { readOnly } from './read-only'

/** Is this browser viewing the portal as somebody? The readable mark set beside the httpOnly cookie. */
function viewingAsSomebody(): boolean {
  return typeof document !== 'undefined' && document.cookie.split('; ').some(part => part.startsWith(`${VIEW_AS_PERSON_MARK}=`) && part.length > VIEW_AS_PERSON_MARK.length + 1)
}

export function createClient() {
  const client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  // Viewing as somebody writes nothing from the browser either (2026-10-11): a
  // table's column layout, its shared default, an upload — read-only like the
  // server's client (lib/supabase/read-only.ts). The mark can only take writes
  // away from its own session, never give any.
  return viewingAsSomebody() ? readOnly(client) : client
}
