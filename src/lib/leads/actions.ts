'use server'

import { revalidatePath } from 'next/cache'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { conversationPrompt, readDraft, systemPrompt, turnsOf, type AgentDraft, type DraftOutcome, type KnowledgeCard, type KnowledgeKind, type Persona, type PersonaFields, type Turn } from './ai'
import { askModel, type AgentDocument } from './ai-model'
import { agentCards, agentReads, answersPrompt, readable, settingsOf, settingsPrompt, fileStatus, type AgentMore, type DataFile, type FixedAnswer, type PlaySituation } from './agent'
import { fetchMetaAds } from './ads-server'
import { quickProblem, type QuickReply } from './quick'
import { deliver } from './messenger'
import type { Audience, AudienceCount, CampaignChannel, OptIn } from './campaign'
import type { FlowStep, FlowTrigger } from './flow'
import type { BusinessHours, InfoCard, InfoCat, LeadInfo } from './info'
import type { LibraryItem, ReplyRules, TemplateStep } from './template'
import type { LeadContact, LeadThread, Appt, LeadCardFields, Shown } from './types'

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

/**
 * Customer Service replies: recorded first (lead_reply), then — on a real Messenger conversation — sent through the
 * brand's Page (lib/leads/messenger.ts, mig 20261026110000) and Meta's answer kept (lead_reply_sent). A test
 * conversation is only recorded. The reply is saved whatever Meta says; `notSent` says why it did not go.
 */
export async function replyToLead(contactId: string, body: string): Promise<LeadOutcome<{ id: number; notSent: string | null }>> {
  await requireActionOn('/leads', 'leads', 'create')
  const saved = await call<number>('lead_reply', { p_contact: contactId, p_body: body }, 'The reply was not saved.')
  if (!saved.ok) return saved
  return { ok: true, data: { id: saved.data, notSent: await deliverReply(saved.data) } }
}

/** Send a reply just recorded; null when it went (or is a test's, kept here only), else why not. */
async function deliverReply(messageId: number): Promise<string | null> {
  const target = await quiet<{ isTest: boolean; channel: string; pageId: string | null; psid: string; body: string; lastInAt: string | null } | null>(
    'lead_reply_target', { p_message: messageId }, '')
  // Before mig 20261026110000 (no lead_reply_target), or a test conversation: recorded, as it always was.
  if (!target.ok || !target.data || target.data.isTest) return null
  const t = target.data
  // Messenger and Instagram Direct both go through the brand's Facebook Page (mig 20261027110000 keeps it on an
  // Instagram conversation); the PSID is the Instagram-scoped id there.
  const result = await deliver({ pageId: t.pageId, psid: t.psid, body: t.body, lastInAt: t.lastInAt }, process.env.META_SYSTEM_USER_TOKEN?.trim())
  await quiet<null>('lead_reply_sent', { p_message: messageId, p_mid: 'mid' in result ? result.mid : null, p_error: 'error' in result ? result.error : null }, '')
  revalidatePath('/leads', 'layout')
  return 'error' in result ? result.error : null
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
  await requireActionOn('/leads', 'leads', 'edit')
  return call<null>('lead_set_outcome', { p_contact: contactId, p_appt: appt, p_shown: shown }, 'The outcome was not saved.')
}

/** Leads v2: a step past the hand-over (handed · contacted · appt · came · closed, with the sale in RM). */
export async function setLeadStage(contactId: string, stage: 'handed' | 'contacted' | 'appt' | 'came' | 'closed', saleValue: number | null = null) {
  await requireActionOn('/leads/list', 'leads', 'edit')
  return call<null>('lead_set_stage', { p_contact: contactId, p_stage: stage, p_value: saleValue }, 'The status was not saved.')
}

/** Leads v2: lost, with why. */
export async function markLeadLost(contactId: string, reason: string) {
  await requireActionOn('/leads/list', 'leads', 'edit')
  return call<null>('lead_mark_lost', { p_contact: contactId, p_reason: reason.slice(0, 200) }, 'It was not marked lost.')
}

/** Leads v2: a lost lead open again. */
export async function reopenLead(contactId: string) {
  await requireActionOn('/leads/list', 'leads', 'edit')
  return call<null>('lead_reopen', { p_contact: contactId }, 'It was not reopened.')
}

/** General info's Save: every category and card as the page holds them (a card left out is deleted). */
export async function saveInfo(cats: Array<Pick<InfoCat, 'id' | 'label'>>, cards: InfoCard[]) {
  await requireActionOn('/leads/info', 'leads', 'manage')
  return call<LeadInfo>('lead_save_info', { p_data: { cats, cards } }, 'General info was not saved.')
}

/** Business hours' Save: the week and the special dates. */
export async function saveHours(week: BusinessHours['week'], specials: BusinessHours['specials']) {
  await requireActionOn('/leads/hours', 'leads', 'manage')
  return call<null>('lead_save_hours', { p_week: week, p_specials: specials }, 'The hours were not saved.')
}

/** Reply templates' Save: a template's name, description, closing message and steps (new: id null). Returns its id. */
export async function saveTemplate(templateId: string | null, data: { name: string; description: string; endMsg: string; steps: TemplateStep[] }) {
  await requireActionOn('/leads/flows', 'leads', 'manage')
  return call<string>('lead_save_template', { p_id: templateId, p_data: data }, 'The template was not saved.')
}

/** Reply templates: a template gone (its conversations keep their messages). */
export async function removeTemplate(templateId: string) {
  await requireActionOn('/leads/flows', 'leads', 'manage')
  return call<null>('lead_remove_flow', { p_id: templateId }, 'The template was not removed.')
}

/** Reply rules' Save: every ad rule and every page's two replies. */
export async function saveReplyRules(ads: ReplyRules['ads'], pages: ReplyRules['pages']) {
  await requireActionOn('/leads/rules', 'leads', 'manage')
  return call<null>('lead_save_reply_rules', { p_ads: ads.map(a => ({ id: a.id.startsWith('new-') ? '' : a.id, adId: a.adId, when: a.when, reply: a.reply })), p_pages: pages }, 'The rules were not saved.')
}

/** The Step library: an item, new (version 1) or saved as its next version. Returns its id. */
export async function saveLibraryItem(itemId: string | null, data: Pick<LibraryItem, 'kind' | 'name' | 'description' | 'steps'>) {
  await requireActionOn(['/leads/library', '/leads/flows'], 'leads', 'manage')
  return call<string>('lead_save_library_item', { p_id: itemId, p_data: data }, 'The library item was not saved.')
}

/** The Step library: an item gone; templates keep their copies. */
export async function removeLibraryItem(itemId: string) {
  await requireActionOn('/leads/library', 'leads', 'manage')
  return call<null>('lead_remove_library_item', { p_id: itemId }, 'The library item was not removed.')
}

/** AI Agent's Save for one brand (also AI corrections' "Save as fixed answer"): settings, fixed answers, playbook, sources. */
export async function saveAgent(brandId: string, data: { settings: unknown; answers: FixedAnswer[]; playbook: PlaySituation[]; sources: Array<{ fileId: string; paused: boolean }> }) {
  await requireActionOn(['/leads/ai', '/leads/corrections'], 'leads', 'manage')
  return call<null>('lead_save_ai', {
    p_brand: brandId,
    p_data: {
      settings: data.settings,
      answers: data.answers.map(a => ({ id: a.id.startsWith('new-') ? '' : a.id, question: a.question, answer: a.answer, draftId: a.draftId ?? null })),
      playbook: data.playbook.map(p => ({ ...p, id: p.id.startsWith('new-') ? '' : p.id })),
      sources: data.sources,
    },
  }, 'The AI agent was not saved.')
}

/** The Data Center: a file (uploaded first, by the browser, under files/<uuid>/) or a link, new or changed. Returns its id. */
export async function saveDataFile(fileId: string | null, data: Partial<DataFile> & { kind: 'file' | 'link'; name: string }) {
  await requireActionOn('/leads/knowledge', 'leads', 'manage')
  return call<string>('lead_save_data_file', { p_id: fileId, p_data: data }, 'The file was not saved.')
}

/** The Data Center: a file or link gone, and from every agent. */
export async function removeDataFile(fileId: string) {
  await requireActionOn('/leads/knowledge', 'leads', 'manage')
  return call<null>('lead_remove_data_file', { p_id: fileId }, 'The file was not removed.')
}

/** The Data Center's Quick replies tab: the whole list as it stands. */
export async function saveQuickReplies(rows: Array<Pick<QuickReply, 'id' | 'brandId' | 'shortcut' | 'body'>>) {
  await requireActionOn('/leads/knowledge', 'leads', 'manage')
  const problem = quickProblem(rows)
  if (problem) return { ok: false as const, reason: problem }
  return call<null>('lead_save_quick_replies', { p_rows: rows }, 'The quick replies were not saved.')
}

/** The Inbox: CS put a quick reply in the reply box — counted (quietly: a reply never waits on it). */
export async function quickReplyUsed(id: string) {
  await requireActionOn('/leads', 'leads', 'create')
  return quiet<null>('lead_quick_reply_used', { p_id: id }, '')
}

/** The Data Center: a short-lived link to open a file (the session's own storage access). */
export async function openDataFile(path: string): Promise<LeadOutcome<string>> {
  await requireActionOn('/leads/knowledge', 'leads', 'view')
  if (!/^files\/[0-9a-f-]{36}\//.test(path)) return { ok: false, reason: 'That file is not in the Data Center.' }
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.storage.from('lead-data').createSignedUrl(path, 120)
  return error || !data ? { ok: false, reason: 'The file could not be opened.' } : { ok: true, data: data.signedUrl }
}

// ── Settings ────────────────────────────────────────────────────────────────

/** Settings › Test: a customer's message as if it came from Meta. */
export async function sendTestEnquiry(brandId: string, channel: 'messenger' | 'instagram', name: string, ad: string, body: string, adId = '') {
  await requireActionOn('/leads/settings', 'leads', 'create')
  const sent = await call<string>('lead_simulate', { p_brand: brandId, p_channel: channel, p_name: name, p_ad: ad, p_body: body }, 'The test message was not sent.')
  // An ad id, as Meta's message from an ad would carry it (mig 20261018110000).
  if (sent.ok && adId.trim()) {
    const tagged = await call<null>('lead_test_ad', { p_contact: sent.data, p_ad_id: adId.trim() }, 'The ad id was not kept.')
    if (!tagged.ok) return tagged
  }
  return sent
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

// ── AI Agent (mig 20261016330000) ───────────────────────────────────────────

/** A read or a write that changes no page (a draft and its outcome): no revalidation. */
async function quiet<T>(fn: string, args: Record<string, unknown>, fallback: string): Promise<LeadOutcome<T>> {
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { ok: false, reason: refusal(error, fallback) }
  return { ok: true, data: data as T }
}

export async function saveKnowledgeCard(cardId: string | null, data: {
  brandId: string | null
  kind: KnowledgeKind
  title: string
  body: string
  startsOn: string | null
  endsOn: string | null
  active: boolean
}) {
  await requireActionOn('/leads/knowledge', 'leads', 'manage')
  return call<string>('lead_save_knowledge', { p_id: cardId, p_data: data }, 'The card was not saved.')
}

export async function removeKnowledgeCard(cardId: string) {
  await requireActionOn('/leads/knowledge', 'leads', 'manage')
  return call<null>('lead_remove_knowledge', { p_id: cardId }, 'The card was not removed.')
}

export async function saveAgentPersona(brandId: string, data: PersonaFields) {
  await requireActionOn('/leads/ai', 'leads', 'manage')
  return call<null>('lead_save_persona', { p_brand: brandId, p_data: data }, 'The AI agent was not saved.')
}

export type DraftForInbox = AgentDraft & { id: number }

/** The Inbox's "AI draft": written from the brand's soul, today's cards and the conversation; kept until used. */
export async function draftLeadReply(contactId: string): Promise<LeadOutcome<DraftForInbox>> {
  await requireActionOn('/leads', 'leads', 'create')
  const ctx = await quiet<{
    persona: Persona
    knowledge: KnowledgeCard[]
    contact: LeadContact
    messages: Array<{ direction: 'in' | 'out'; sender: string; body: string }>
    today: string
  }>('lead_ai_context', { p_contact: contactId }, 'The conversation could not be read for a draft.')
  if (!ctx.ok) return ctx
  const { persona, knowledge, contact, messages, today } = ctx.data
  // AI Agent v2 (mig 20261023200000): the settings, fixed answers, playbook, General info and files — when there.
  const more = await agentMore(contact.brandId, today)
  const cards = more ? more.cards(knowledge) : knowledge
  const answer = await askModel(systemPrompt(persona, cards, today), conversationPrompt(contact, turnsOf(messages)), more?.ask)
  if (!answer.ok) return answer
  const draft = readDraft(answer.text, cards)
  if (!draft) return { ok: false, reason: 'The AI agent’s answer was not usable — please try again.' }
  const saved = await quiet<number>('lead_ai_log_draft', {
    p_contact: contactId, p_draft: draft.reply, p_used: draft.used, p_handoff: draft.handoff, p_note: draft.note, p_model: answer.model,
  }, 'The draft was not kept.')
  if (!saved.ok) return saved
  return { ok: true, data: { ...draft, id: saved.data } }
}

/**
 * What became of a draft: sent as written, edited then sent, or dismissed — with what was sent (AI Agent v2: an edited
 * one is an AI correction). Before mig 20261023200000, the outcome alone.
 */
export async function setDraftOutcome(draftId: number, outcome: DraftOutcome, sent = '') {
  await requireActionOn('/leads', 'leads', 'create')
  const kept = await quiet<null>('lead_ai_draft_kept', { p_id: draftId, p_outcome: outcome, p_sent: sent.slice(0, 2000) }, 'The draft’s outcome was not kept.')
  if (kept.ok || !kept.reason.includes('not set up')) return kept
  return quiet<null>('lead_ai_draft_outcome', { p_id: draftId, p_outcome: outcome }, 'The draft’s outcome was not kept.')
}

/**
 * The agent's v2 knowledge for a brand: its settings and answers as a second instruction block, the cards it may cite
 * (General info, fixed answers, files) and the files it reads attached — PDFs, pictures and text, at most six and
 * 24 MB, read with the session's own storage access. Null before mig 20261023200000 (the draft runs as before).
 */
async function agentMore(brandId: string, today: string, override?: Pick<AgentMore, 'settings' | 'answers' | 'playbook'>) {
  const [more, info, dataFiles, quick] = await Promise.all([
    quiet<AgentMore>('lead_ai_more', { p_brand: brandId }, ''),
    quiet<LeadInfo>('lead_info', {}, ''),
    quiet<DataFile[]>('lead_data_files', {}, ''),
    quiet<QuickReply[]>('lead_quick_replies', {}, ''),
  ])
  if (!more.ok) return null
  const m = { ...more.data, ...(override ?? {}) }
  // As drawn: everything in the brand's folder and Shared that is on and in date.
  const files: DataFile[] = agentReads(dataFiles.ok ? dataFiles.data : [], brandId).filter(s => !s.paused && fileStatus(s.file, today).usable).map(s => s.file)
  const documents: AgentDocument[] = []
  const supabase = (await createClient()) as unknown as SupabaseClient
  let total = 0
  for (const f of files) {
    const how = readable(f)
    if (!f.path || !how || how === 'link' || documents.length >= 6 || f.sizeBytes > 10_000_000 || total + f.sizeBytes > 24_000_000) continue
    const { data } = await supabase.storage.from('lead-data').download(f.path)
    if (!data) continue
    total += f.sizeBytes
    const buf = Buffer.from(await data.arrayBuffer())
    if (how === 'pdf') documents.push({ kind: 'pdf', title: f.name, base64: buf.toString('base64') })
    else if (how === 'text') documents.push({ kind: 'text', title: f.name, text: buf.toString('utf8').slice(0, 200_000) })
    else documents.push({ kind: 'image', title: f.name, base64: buf.toString('base64'), mediaType: (f.mime as 'image/png') || 'image/png' })
  }
  const links = files.filter(f => f.kind === 'link').map(f => `- ${f.name}: ${f.url}`)
  // The Data Center's quick replies are CS's own words; the agent may use them as fixed answers (the handoff).
  const quickLines = (quick.ok ? quick.data : []).filter(q => q.brandId === null || q.brandId === brandId).map(q => `- ${q.body}`)
  const system = [
    settingsPrompt(settingsOf(m.settings)),
    answersPrompt(m.answers, m.playbook),
    documents.length ? `# Files you read\nThe documents attached before the conversation are the brand's files; cite one by its card id (file-…).` : '',
    links.length ? `# Web pages (you see the address, not the page)\n${links.join('\n')}` : '',
    quickLines.length ? `# Quick replies Customer Service uses (reuse them word for word when they answer the question)\n${quickLines.join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
  return {
    ask: { system, documents },
    cards: (old: KnowledgeCard[]) => agentCards(old, info.ok ? info.data : null, brandId, today, m.answers, files),
  }
}

/**
 * AI Agent › Try it: a brand's cards for today and the soul as the form holds it (saved or not), on a pretend
 * conversation. Nothing is kept and nothing reaches a customer.
 */
export async function tryAgent(brandId: string, fields: PersonaFields, turns: Turn[], v2?: Pick<AgentMore, 'settings' | 'answers' | 'playbook'>): Promise<LeadOutcome<AgentDraft>> {
  await requireActionOn('/leads/ai', 'leads', 'manage')
  const ctx = await quiet<{ persona: Persona; knowledge: KnowledgeCard[]; today: string }>(
    'lead_ai_try_context', { p_brand: brandId }, 'The brand could not be read.')
  if (!ctx.ok) return ctx
  const { persona, knowledge, today } = ctx.data
  const clean = turns.filter(t => t.text.trim()).slice(-30).map(t => ({ who: t.who, by: t.who === 'us' ? 'customer service' : undefined, text: t.text.slice(0, 2000) }))
  // AI Agent v2: the page's settings, answers and playbook as they stand (saved or not).
  const more = await agentMore(brandId, today, v2)
  const cards = more ? more.cards(knowledge) : knowledge
  const answer = await askModel(systemPrompt({ ...persona, ...fields }, cards, today), conversationPrompt(null, clean), more?.ask)
  if (!answer.ok) return answer
  const draft = readDraft(answer.text, cards)
  return draft ? { ok: true, data: draft } : { ok: false, reason: 'The AI agent’s answer was not usable — please try again.' }
}

// ── Campaigns (mig 20261016340000) ──────────────────────────────────────────

/** The editor's count before sending: who may get it, who is left out and why. */
export async function countAudience(brandId: string, channel: CampaignChannel, audience: Audience) {
  await requireActionOn('/leads/campaigns', 'leads', 'view')
  return quiet<AudienceCount>('lead_campaign_audience', { p_brand: brandId, p_channel: channel, p_audience: audience }, 'The audience could not be counted.')
}

/** A draft (no time) or a scheduled campaign (a time to come). */
export async function saveCampaign(campaignId: string | null, data: {
  brandId: string
  name: string
  channel: CampaignChannel
  audience: Audience
  body: string
  buttons: string[]
  scheduledAt: string | null
}) {
  await requireActionOn('/leads/campaigns', 'leads', 'manage')
  return call<string>('lead_save_campaign', { p_id: campaignId, p_data: data }, 'The campaign was not saved.')
}

/** Send now — recorded on each conversation until Meta is connected. Answers how many it reached. */
export async function sendCampaign(campaignId: string) {
  await requireActionOn('/leads/campaigns', 'leads', 'manage')
  return call<number>('lead_send_campaign', { p_id: campaignId }, 'The campaign was not sent.')
}

export async function removeCampaign(campaignId: string) {
  await requireActionOn('/leads/campaigns', 'leads', 'manage')
  return call<null>('lead_remove_campaign', { p_id: campaignId }, 'The campaign was not removed.')
}

/** A test conversation's promotions consent (a real customer's comes from Meta). */
export async function setOptIn(contactId: string, state: OptIn) {
  await requireActionOn('/leads', 'leads', 'edit')
  return call<null>('lead_set_opt_in', { p_contact: contactId, p_state: state }, 'The consent was not saved.')
}

// ── Ads: name, source, link (mig 20261018110000) ────────────────────────────

/** Settings › Ads: name an ad by hand (all empty takes the hand's name away). */
export async function nameAd(adId: string, data: { name: string; campaign: string; adset: string; link: string }) {
  await requireActionOn('/leads/settings', 'leads', 'manage')
  return call<null>('lead_name_ad', { p_ad_id: adId, p_data: data }, 'The ad was not named.')
}

/** Settings › Ads: ask Ads Manager for these ads' names, campaigns, ad sets and posts (needs ads_read). */
export async function fetchAdNames(adIds: string[]): Promise<LeadOutcome<number>> {
  await requireActionOn('/leads/settings', 'leads', 'manage')
  const meta = await fetchMetaAds(adIds)
  if (!meta.ok) return meta
  if (meta.ads.length === 0) return { ok: true, data: 0 }
  return call<number>('lead_save_meta_ads', { p_rows: meta.ads }, 'What Meta said was not kept.')
}
