import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { KnowledgeCard, Persona } from './ai'
import type { LeadAd } from './ads'
import type { Campaign, ConsentRow } from './campaign'
import type { InsightMore } from './insight'
import type { LeadFlow } from './flow'
import type { BusinessHours, LeadInfo } from './info'
import type { LibraryItem, ReplyRules } from './template'
import type { AgentMore, Correction, DataFile } from './agent'
import type { QuickReply } from './quick'
import type { AuditChange, AuditTableLine } from '@/lib/audit/changes'
import { AUDIT_TABLES } from './audit'
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

/**
 * Leads v2: everybody who wrote, by the office day of their last update in [from, to) — both null = all time
 * (lead_leads, mig 20261022220000). Before that migration is applied, Leads falls back to lead_list — the conversations
 * STARTED in the period, a year back at most for all time — and says the steps wait (`stagesReady`).
 */
export async function loadLeads(from: string | null, to: string | null, today: string): Promise<Read<{ contacts: LeadContact[]; stagesReady: boolean }>> {
  const r = await rpc<LeadContact[]>('lead_leads', { p_from: from, p_to: to }, 'The leads')
  if (r.ok) return { ok: true, data: { contacts: r.data, stagesReady: true } }
  if (r.reason !== NOT_SET_UP) return r
  const back = new Date(Date.parse(today + 'T00:00:00Z') - 399 * 864e5).toISOString().slice(0, 10)
  const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10)
  const old = await rpc<LeadContact[]>('lead_list', { p_from: from ?? back, p_to: to ?? tomorrow }, 'The leads')
  return old.ok ? { ok: true, data: { contacts: old.data, stagesReady: false } } : old
}

/** General info: its categories and every card (mig 20261022230000). */
export function loadInfo(): Promise<Read<LeadInfo>> {
  return rpc<LeadInfo>('lead_info', undefined, 'General info')
}

/** Business hours: the week and the special dates. */
export function loadHours(): Promise<Read<BusinessHours>> {
  return rpc<BusinessHours>('lead_business_hours', undefined, 'The business hours')
}

/** Reply rules: by ad, and by page and channel (mig 20261023100000). */
export function loadReplyRules(): Promise<Read<ReplyRules>> {
  return rpc<ReplyRules>('lead_reply_rules', undefined, 'The reply rules')
}

/** The Step library, with where each item is used. */
export function loadLibrary(): Promise<Read<LibraryItem[]>> {
  return rpc<LibraryItem[]>('lead_library', undefined, 'The step library')
}

/** A brand's agent beyond its soul: settings, fixed answers, playbook, sources (mig 20261023200000). */
export function loadAiMore(brandId: string): Promise<Read<AgentMore>> {
  return rpc<AgentMore>('lead_ai_more', { p_brand: brandId }, 'The AI agent')
}

/** The Data Center's files and links. */
export function loadDataFiles(): Promise<Read<DataFile[]>> {
  return rpc<DataFile[]>('lead_data_files', undefined, 'The Data Center')
}

/** The Data Center's quick replies (mig 20261023300000). */
export function loadQuickReplies(): Promise<Read<QuickReply[]>> {
  return rpc<QuickReply[]>('lead_quick_replies', undefined, 'The quick replies')
}

/** A brand's AI corrections, the last `days` days (null = all). */
export function loadCorrections(brandId: string, days: number | null): Promise<Read<Correction[]>> {
  return rpc<Correction[]>('lead_ai_corrections', { p_brand: brandId, p_days: days }, 'The corrections')
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

/** Promotions consent per brand (mig 20261023400000). */
export function loadConsent(): Promise<Read<ConsentRow[]>> {
  return rpc<ConsentRow[]>('lead_consent', undefined, 'Promotions consent')
}

/** Insight beyond the funnel: who answered first and how far templates got (mig 20261023400000). */
export function loadInsightMore(from: string | null, to: string | null): Promise<Read<InsightMore>> {
  return rpc<InsightMore>('lead_insight_more', { p_from: from, p_to: to }, 'Insight')
}

/** Every ad conversations came from, with its name, campaign, ad set and link where known. */
export function loadAds(): Promise<Read<LeadAd[]>> {
  return rpc<LeadAd[]>('lead_ads', undefined, 'The ads')
}

/**
 * The Audit log page (2026-10-23, step 6): Lead View's set-up tables' latest changes through the portal's own
 * audit_changes() — it shows a reader only what their permissions open (the tables' read key is `leads`) — with the
 * register's lines so each row names its item. The latest 500, newest first.
 */
export async function loadAudit(): Promise<Read<{ changes: AuditChange[]; lines: AuditTableLine[] }>> {
  const supabase = (await createClient()) as unknown as SupabaseClient
  const [lines, changes] = await Promise.all([
    supabase.from('audit_tables').select('table_name, label, area, mode, label_columns, reason').in('table_name', AUDIT_TABLES).then(r => r),
    supabase.rpc('audit_changes', { p_tables: AUDIT_TABLES, p_limit: 500 }).then(r => r),
  ])
  if (lines.error || changes.error) return { ok: false, reason: 'The audit log could not be read. Please try again.' }
  return { ok: true, data: { changes: (changes.data ?? []) as AuditChange[], lines: (lines.data ?? []) as AuditTableLine[] } }
}
