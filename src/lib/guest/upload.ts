import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { withBrowserFileStorage } from '@/lib/storage/browser'
import { attachable } from './model'

/**
 * A guest's job description (2026-10-11, mig 20261011092000): the guest's own
 * browser puts it in the private `hiring-files` bucket under guest/<code>/ —
 * as a stranger (the publishable key, no session, even for somebody signed in
 * to the portal), which one storage policy lets in only while the link is on
 * with Request manpower open. Too big for a Server Action (10 MB); nobody
 * outside reads it back — Hiring opens it by a signed link.
 */
let stranger: SupabaseClient | null = null

function client(): SupabaseClient {
  // Once its bucket is in R2 the file's link is made on the server as this same stranger (lib/storage/browser.ts).
  stranger ??= withBrowserFileStorage(createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }), { stranger: true })
  return stranger
}

export async function uploadGuestFile(code: string, file: File): Promise<{ ok: true; path: string; name: string } | { ok: false; reason: string }> {
  const check = attachable(file.name, file.size)
  if ('reason' in check) return { ok: false, reason: check.reason }
  const path = `guest/${code}/${crypto.randomUUID()}.${check.ext}`
  const { error } = await client().storage.from('hiring-files').upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (error) return { ok: false, reason: 'That file could not be attached. Please try again.' }
  return { ok: true, path, name: file.name.slice(0, 200) }
}
