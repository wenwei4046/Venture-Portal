'use server'

import { revalidatePath } from 'next/cache'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { FlowStep, FlowTrigger } from './flow'
import type { LeadThread, Appt, LeadCardFields, Shown } from './types'

/**
 * Lead View's writes (2026-10-16). Each stands behind the Lead View cell it is (mig 20261016300000), named on
 * the pages whose screens offer it, and calls one of the module's own functions (mig 20261016300200), which
 * asks again. Refusals come back as `{ ok: false, reason }`: a thrown message reaches production's browser
 * only as a digest.
 */

export type LeadOutcome<T = unknown> = { ok: true; data: T } | { ok: false; reason: string }

const NO_ACCESS = 'Lead View needs the right permission for that.'

function refusal(error: PostgrestError, fallback: string): string {
  if (error.code === '42501') return error.message || NO_ACCESS
  if (error.code === 'PGRST202' || error.code === '42883') return 'Lead View’s database is not set up yet.'
  if (error.code === 'P0001' || error.code === 'P0002' || error.code === '22023' || error.code === '23505') return error.message
  if (error.code === '23514') return 'Something is not in the right shape.'
  return fallback
}

async function call<T>(fn: string, args: Record<string, unknown>, fallback: string): Promise<LeadOutcome<T>> {
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { ok: false, reason: refusal(error, fallback) }
  revalidatePath('/leads', 'layout')
  return { ok: true, data: data as T }
}

// ── Inbox ───────────────────────────────────────────────────────────────────

/** One conversation, read again after a write (the Inbox swaps it in place). */
export async function readThread(contactId: string): Promise<LeadOutcome<LeadThread | null>> {
  await requireActionOn('/leads', 'leads', 'view')
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('lead_thread', { p_contact: contactId })
  if (error) return { ok: false, reason: refusal(error, 'The conversation could not be read.') }
  return { ok: true, data: data as LeadThread | null }
}

/** Customer Service replies (recorded only until Meta is connected). */
export async function replyToLead(contactId: string, body: string) {
  await requireActionOn('/leads', 'leads', 'create')
  return call<number>('lead_reply', { p_contact: contactId, p_body: body }, 'The reply was not saved.')
}

/** The customer card: name, phone, interest, budget, showroom, time, note. */
export async function saveLeadCard(contactId: string, fields: LeadCardFields) {
  await requireActionOn('/leads', 'leads', 'edit')
  return call<null>('lead_save_card', { p_contact: contactId, p_fields: fields }, 'The card was not saved.')
}

/** Hand the lead to one of the brand's salespeople; answers who, for the WhatsApp link. */
export async function handLeadOver(contactId: string, salesId: string) {
  await requireActionOn('/leads', 'leads', 'edit')
  return call<{ id: string; name: string; phone: string }>('lead_handoff', { p_contact: contactId, p_sales: salesId }, 'The lead was not handed over.')
}

/** What came of a handed lead. */
export async function setLeadOutcome(contactId: string, appt: Appt, shown: Shown) {
  await requireActionOn(['/leads', '/leads/list'], 'leads', 'edit')
  return call<null>('lead_set_outcome', { p_contact: contactId, p_appt: appt, p_shown: shown }, 'The outcome was not saved.')
}

// ── Settings ────────────────────────────────────────────────────────────────

/** Settings › Test: a customer's message as if it came from Meta. */
export async function sendTestEnquiry(brandId: string, channel: 'messenger' | 'instagram', name: string, ad: string, body: string) {
  await requireActionOn('/leads/settings', 'leads', 'create')
  return call<string>('lead_simulate', { p_brand: brandId, p_channel: channel, p_name: name, p_ad: ad, p_body: body }, 'The test message was not sent.')
}

export async function saveLeadBrand(brandId: string | null, data: { name: string; tone?: string; fbPageId?: string; igAccountId?: string; handoffMode?: 'rotate' | 'pick' }) {
  await requireActionOn('/leads/settings', 'leads', 'manage')
  return call<string>('lead_save_brand', { p_id: brandId, p_data: data }, 'The brand was not saved.')
}

export async function saveLeadSales(salesId: string | null, brandId: string, data: { name: string; phone: string; showroom: string }) {
  await requireActionOn('/leads/settings', 'leads', 'manage')
  return call<string>('lead_save_sales', { p_id: salesId, p_brand: brandId, p_data: data }, 'The salesperson was not saved.')
}

export async function removeLeadSales(salesId: string) {
  await requireActionOn('/leads/settings', 'leads', 'manage')
  return call<null>('lead_remove_sales', { p_id: salesId }, 'The salesperson was not removed.')
}

// ── Flows ───────────────────────────────────────────────────────────────────

export async function saveLeadFlow(flowId: string | null, data: {
  brandId: string | null
  name: string
  triggerKind: FlowTrigger
  triggerValue: string
  active: boolean
  steps: FlowStep[]
  categoryId?: string | null
  template?: string
  config?: Record<string, unknown>
}) {
  await requireActionOn('/leads/flows', 'leads', 'manage')
  return call<string>('lead_save_flow', { p_id: flowId, p_data: data }, 'The flow was not saved.')
}

export async function removeLeadFlow(flowId: string) {
  await requireActionOn('/leads/flows', 'leads', 'manage')
  return call<null>('lead_remove_flow', { p_id: flowId }, 'The flow was not removed.')
}

export async function saveAutoCategory(categoryId: string | null, name: string, tone: string | null = null) {
  await requireActionOn('/leads/flows', 'leads', 'manage')
  return call<string>('lead_save_auto_category', { p_id: categoryId, p_name: name, p_tone: tone }, 'The category was not saved.')
}

export async function removeAutoCategory(categoryId: string) {
  await requireActionOn('/leads/flows', 'leads', 'manage')
  return call<null>('lead_remove_auto_category', { p_id: categoryId }, 'The category was not removed.')
}
