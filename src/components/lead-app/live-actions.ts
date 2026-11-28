import { handLeadToGroup, leadMediaLinks, markUnread, readThread, replyToLead, saveLeadCard, sendLeadMedia, setContactOutlet, type LeadOutcome } from '@/lib/leads/actions'
import type { LeadCardFields, LeadThread } from '@/lib/leads/types'
import { createClient } from '@/lib/supabase/client'

/**
 * What Lead View's phone face reads and writes — the desktop Inbox's own Server Actions (gated on /leads), and the
 * upload into `lead-media` the desktop does from the browser. Handed in whole, so the local preview and the tests can
 * hand in their own (the HR app's `actions`, the Revenue app's source).
 */
export interface LeadAppActions {
  readThread: (contactId: string) => Promise<LeadOutcome<LeadThread | null>>
  replyToLead: (contactId: string, body: string) => Promise<LeadOutcome<{ id: number; notSent: string | null }>>
  sendLeadMedia: (contactId: string, path: string, mime: string, caption: string) => Promise<LeadOutcome<{ id: number; notSent: string | null }>>
  leadMediaLinks: (paths: string[]) => Promise<LeadOutcome<Record<string, string>>>
  markUnread: (contactId: string) => Promise<LeadOutcome<null>>
  saveLeadCard: (contactId: string, fields: LeadCardFields) => Promise<LeadOutcome<unknown>>
  setContactOutlet: (contactId: string, choice: string) => Promise<LeadOutcome<unknown>>
  handLeadToGroup: (contactId: string) => Promise<LeadOutcome<unknown>>
  /** A file into the chat's folder of `lead-media`; why not, or null once it is there. */
  upload: (path: string, file: File, mime: string) => Promise<string | null>
}

export const LIVE_ACTIONS: LeadAppActions = {
  readThread, replyToLead, sendLeadMedia, leadMediaLinks, markUnread, saveLeadCard, setContactOutlet, handLeadToGroup,
  upload: async (path, file, mime) => {
    const up = await createClient().storage.from('lead-media').upload(path, file, { contentType: mime, upsert: false })
    return up.error ? 'The file could not be uploaded — 25 MB at most.' : null
  },
}
