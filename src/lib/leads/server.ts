import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { KnowledgeCard, Persona } from './ai'
import type { Campaign } from './campaign'
import type { LeadFlow } from './flow'
import type { LeadConfig, LeadContact, LeadThread } from './types'

/**
 * Lead View's readers (2026-10-16): each is one of the module's own functions (mig 20261016300200), which asks
 * Lead View · View itself. A refusal comes back as words, never a throw — the page still draws. Before the
 * migrations are applied the functions are not there, and the page says so.
 */
export type Read<T> = { ok: true; data: T } | { ok: false; reason: string }

const NO_VIEW = 'Lead View needs Lead View · View.'
export const NOT_SET_UP = 'Lead View’s database is not set up yet — its migrations are waiting to be applied.'

async function rpc<T>(fn: string, args: Record<string, unknown> | undefined, what: string): Promise<Read<T>> {
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    if (error.code === '42501') return { ok: false, reason: NO_VIEW }
    if (error.code === 'PGRST202' || error.code === '42883') return { ok: false, reason: NOT_SET_UP }
    return { ok: false, reason: `${what} could not be read. Please try again.` }
  }
  return { ok: true, data: data as T }
}

/** The brands, their salespeople, and the sidebar's counts. */
export function loadLeadConfig(): Promise<Read<LeadConfig>> {
  return rpc<LeadConfig>('lead_config', undefined, 'Lead View')
}

/** The Inbox's list, latest first. */
export function loadInbox(): Promise<Read<LeadContact[]>> {
  return rpc<LeadContact[]>('lead_inbox', undefined, 'The inbox')
}

/** One conversation (null when it is gone). */
export function loadThread(contactId: string): Promise<Read<LeadThread | null>> {
  return rpc<LeadThread | null>('lead_thread', { p_contact: contactId }, 'The conversation')
}

/** Every conversation started in [from, to) — YYYY-MM-DD, the office's days. */
export function loadLeadList(from: string, to: string): Promise<Read<LeadContact[]>> {
  return rpc<LeadContact[]>('lead_list', { p_from: from, p_to: to }, 'The leads')
}

/** Every flow, with what each started this week. */
export function loadFlows(): Promise<Read<LeadFlow[]>> {
  return rpc<LeadFlow[]>('lead_flows', undefined, 'The flows')
}

export interface AutoCategory { id: string; name: string; tone: 'ink' | 'clay' | 'blue' | 'olive' | 'plum'; sortOrder: number }

/** The categories Customer Service made for their automations. */
export function loadAutoCategories(): Promise<Read<AutoCategory[]>> {
  return rpc<AutoCategory[]>('lead_auto_categories', undefined, 'The categories')
}

/** The Data Center's cards, every brand's. */
export function loadKnowledge(): Promise<Read<KnowledgeCard[]>> {
  return rpc<KnowledgeCard[]>('lead_knowledge', undefined, 'The Data Center')
}

/** Every brand's AI agent, with its last 30 days of drafts. */
export function loadPersonas(): Promise<Read<Persona[]>> {
  return rpc<Persona[]>('lead_personas', undefined, 'The AI agent')
}

/** Every campaign, newest first, with what came of the sent ones. */
export function loadCampaigns(): Promise<Read<Campaign[]>> {
  return rpc<Campaign[]>('lead_campaigns', undefined, 'The campaigns')
}
