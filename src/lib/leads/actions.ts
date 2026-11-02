'use server'

import { revalidatePath } from 'next/cache'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { conversationPrompt, readDraft, systemPrompt, turnsOf, type AgentDraft, type DraftOutcome, type KnowledgeCard, type KnowledgeKind, type Persona, type PersonaFields, type Turn } from './ai'
import { askModel } from './ai-model'
import { agentMore as readAgent } from './agent-read'
import { answerLeads } from './ai-answer'
import type { RuleOf } from './rule-of'
import { type AgentMore, type DataFile, type FixedAnswer, type KnowledgePick, type PlaySituation } from './agent'
import { fetchMetaAds } from './ads-server'
import { managedPages, subscribePage } from './pages-server'
import type { ManagedPage, PageChannel, StaffLeave } from './pages'
import { quickProblem, type QuickReply } from './quick'
import type { FolderColor } from './data-center'
import { readLink } from './link-read'
import { deliver, deliverFile, sendReaction } from './messenger'
import { markSeen } from './meta-sync'
import { KEEP_LIMIT, metaCdnUrl } from './media-keep'
import { forwardName, isMediaPlaceholder } from './inbox'
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
  // Read = seen, for this person: the list's unread count clears (mig 20261027170000). A refusal (View as a person —
  // read-only — or the migration not applied) changes nothing on the screen.
  const thread = data as LeadThread | null
  if (thread) {
    const seen = await supabase.rpc('lead_mark_seen', { p_contact: contactId })
    // …and in Messenger, as opening it in Business Suite (mig 20261028100000 — the user: "我需要跟msg 一摸一样"): the
    // customer sees "Seen". Only a real Messenger conversation, only when the read was this person's (not View as).
    const c = thread.contact
    if (!seen.error && !c.isTest && c.channel === 'messenger') await markSeen({ pageId: c.pageId ?? null, psid: c.psid ?? null }, process.env.META_SYSTEM_USER_TOKEN?.trim())
  }
  return { ok: true, data: thread }
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

/**
 * Answer one message of the conversation (mig 20261027220000 — the user: "能回复特定的内容"): recorded as a reply that
 * quotes it, then sent with Meta's `reply_to`, so the customer sees the quote above it as in Messenger.
 */
export async function replyToMessage(contactId: string, body: string, messageId: number): Promise<LeadOutcome<{ id: number; notSent: string | null }>> {
  await requireActionOn('/leads', 'leads', 'create')
  const saved = await call<{ id: number; replyToMid: string }>('lead_reply_to', { p_contact: contactId, p_body: body, p_message: messageId }, 'The reply was not saved.')
  if (!saved.ok) return saved
  return { ok: true, data: { id: saved.data.id, notSent: await deliverReply(saved.data.id, saved.data.replyToMid) } }
}

/**
 * The Page's emoji on a customer's message (mig 20261027220000 — the user: "和emoji"); null takes it away. Kept first,
 * then sent as Meta's react / unreact; when Meta refuses, the reaction before is put back and the refusal said.
 */
export async function reactToMessage(messageId: number, emoji: string | null): Promise<LeadOutcome<null>> {
  await requireActionOn('/leads', 'leads', 'create')
  const kept = await call<{ mid: string | null; pageId: string | null; psid: string; channel: string; isTest: boolean; before: string | null }>(
    'lead_react', { p_message: messageId, p_emoji: emoji }, 'The reaction was not saved.')
  if (!kept.ok) return kept
  const t = kept.data
  // A test conversation, or a message Meta never gave an id: kept here only.
  if (t.isTest || !t.mid) return { ok: true, data: null }
  const refused = await sendReaction({ pageId: t.pageId, psid: t.psid, mid: t.mid }, emoji, process.env.META_SYSTEM_USER_TOKEN?.trim())
  if (refused) {
    await quiet<unknown>('lead_react', { p_message: messageId, p_emoji: t.before }, '')
    return { ok: false, reason: refused }
  }
  revalidatePath('/leads', 'layout')
  return { ok: true, data: null }
}

/** Send a reply just recorded; null when it went (or is a test's, kept here only), else why not. */
async function deliverReply(messageId: number, replyToMid: string | null = null): Promise<string | null> {
  const target = await quiet<{ isTest: boolean; channel: string; pageId: string | null; psid: string; body: string; lastInAt: string | null } | null>(
    'lead_reply_target', { p_message: messageId }, '')
  // Before mig 20261026110000 (no lead_reply_target), or a test conversation: recorded, as it always was.
  if (!target.ok || !target.data || target.data.isTest) return null
  const t = target.data
  // Messenger and Instagram Direct both go through the brand's Facebook Page (mig 20261027110010 keeps it on an
  // Instagram conversation); the PSID is the Instagram-scoped id there.
  const result = await deliver({ pageId: t.pageId, psid: t.psid, body: t.body, lastInAt: t.lastInAt, replyToMid }, process.env.META_SYSTEM_USER_TOKEN?.trim())
  await quiet<null>('lead_reply_sent', { p_message: messageId, p_mid: 'mid' in result ? result.mid : null, p_error: 'error' in result ? result.error : null }, '')
  revalidatePath('/leads', 'layout')
  return 'error' in result ? result.error : null
}

/**
 * A photo or file Customer Service sends (mig 20261027140000): the browser has put it in the bucket lead-media under
 * chat/<conversation>/; lead_reply_media records it as a reply (the caption, else "[Photo]" / "[File] name"), then — on
 * a real Messenger conversation — it goes through the brand's Page as an attachment and Meta's answer is kept, as a
 * text reply's is.
 */
export async function sendLeadMedia(contactId: string, path: string, mime: string, caption: string): Promise<LeadOutcome<{ id: number; notSent: string | null }>> {
  await requireActionOn('/leads', 'leads', 'create')
  const saved = await call<number>('lead_reply_media', { p_contact: contactId, p_path: path, p_mime: mime, p_caption: caption }, 'The file was not saved.')
  if (!saved.ok) return saved
  return { ok: true, data: { id: saved.data, notSent: await deliverMedia(saved.data, path, mime) } }
}

/** Send a photo or file just recorded; null when it went (or is a test's), else why not. */
async function deliverMedia(messageId: number, path: string, mime: string): Promise<string | null> {
  const target = await quiet<{ isTest: boolean; channel: string; pageId: string | null; psid: string; lastInAt: string | null } | null>(
    'lead_reply_target', { p_message: messageId }, '')
  if (!target.ok || !target.data || target.data.isTest) return null
  const t = target.data
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data: file, error } = await supabase.storage.from('lead-media').download(path)
  const filename = path.replace(/^.*\//, '').replace(/^[0-9a-f-]{36}-/, '')
  const result = error || !file
    ? { error: 'The file could not be read back to send it.' }
    : await deliverFile({ pageId: t.pageId, psid: t.psid, lastInAt: t.lastInAt }, file, filename, mime, process.env.META_SYSTEM_USER_TOKEN?.trim())
  await quiet<null>('lead_reply_sent', { p_message: messageId, p_mid: 'mid' in result ? result.mid : null, p_error: 'error' in result ? result.error : null }, '')
  revalidatePath('/leads', 'layout')
  return 'error' in result ? result.error : null
}

/**
 * Mark a chat unread for oneself, to answer later (mig 20261028110000 — the user: "把讯息unread 来提醒自己稍后回复").
 * Lead View's alone: Meta lets no app mark a Messenger chat unread. Opening the chat again clears it.
 */
/** Block a customer, or unblock (mig 20261102270000): no template or AI answers them; their chat leaves the Inbox's list. */
export async function blockLead(contactId: string, on: boolean) {
  await requireActionOn('/leads', 'leads', 'edit')
  return call<null>('lead_block', { p_contact: contactId, p_on: on }, on ? 'The customer was not blocked.' : 'The customer was not unblocked.')
}

/** Settings › Team: the brands one CS handles (none = every brand; mig 20261102270000). */
export async function saveAgentBrands(userId: string, brandIds: string[]) {
  await requireActionOn('/leads/settings', 'leads', 'manage')
  return call<null>('lead_save_agent_brands', { p_user: userId, p_brands: brandIds }, 'Their brands were not saved.')
}

/** Which reply rule the chat follows now (mig 20261102240000): the chat header's Rule chip. */
export async function readRuleOf(contactId: string): Promise<LeadOutcome<RuleOf>> {
  await requireActionOn('/leads', 'leads', 'view')
  return quiet<RuleOf>('lead_rule_of', { p_contact: contactId }, 'The chat’s rule could not be read.')
}

export async function markUnread(contactId: string): Promise<LeadOutcome<null>> {
  await requireActionOn('/leads', 'leads', 'view')
  return call<null>('lead_mark_unread', { p_contact: contactId }, 'The chat could not be marked unread.')
}

/**
 * Start over (mig 20261102200000): the conversation's next message runs the reply rules as a first message does — a
 * template waiting stops, the AI Agent steps aside. Nothing is sent to the customer.
 */
export async function startOver(contactId: string): Promise<LeadOutcome<null>> {
  await requireActionOn('/leads', 'leads', 'create')
  return call<null>('lead_start_over', { p_contact: contactId }, 'The chat could not be started over.')
}

/**
 * Forward a message to another conversation (2026-10-28 — the user: "转发就好，不需要删除"): Meta has no forward for an
 * app, so it is sent there as a new reply from this person — words through replyToLead; a photo, video or file copied
 * into that conversation's folder (ours, else fetched from Meta's address) and sent through sendLeadMedia, its words
 * as the caption. The same 24-hour window holds there.
 */
export async function forwardMessage(toContactId: string, m: { body: string; mediaPath: string | null; mediaMime: string | null; mediaUrl: string | null }): Promise<LeadOutcome<{ id: number; notSent: string | null }>> {
  await requireActionOn('/leads', 'leads', 'create')
  if (!/^[0-9a-f-]{36}$/.test(toContactId)) return { ok: false, reason: 'Pick a conversation to forward to.' }
  const body = (m.body ?? '').trim()
  if (!m.mediaPath && !m.mediaUrl) {
    if (!body) return { ok: false, reason: 'There is nothing to forward.' }
    return replyToLead(toContactId, body)
  }
  const supabase = (await createClient()) as unknown as SupabaseClient
  const mime = m.mediaMime || 'application/octet-stream'
  const path = `chat/${toContactId}/${crypto.randomUUID()}-${forwardName(m)}`
  if (m.mediaPath) {
    if (!/^chat\/[0-9a-f-]{36}\/[^/]{1,200}$/.test(m.mediaPath)) return { ok: false, reason: 'That file cannot be forwarded.' }
    const copied = await supabase.storage.from('lead-media').copy(m.mediaPath, path)
    if (copied.error) return { ok: false, reason: 'The file could not be copied to that conversation.' }
  } else {
    const url = metaCdnUrl(m.mediaUrl)
    if (!url) return { ok: false, reason: 'That file cannot be forwarded.' }
    let blob: Blob
    let type = mime
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) return { ok: false, reason: 'Meta no longer has that file.' }
      blob = await res.blob()
      type = (res.headers.get('content-type') ?? '').split(';')[0].trim() || mime
    } catch {
      return { ok: false, reason: 'Could not reach Meta for that file. Try again.' }
    }
    if (blob.size > KEEP_LIMIT) return { ok: false, reason: 'Messenger takes a photo or file up to 25 MB.' }
    const up = await supabase.storage.from('lead-media').upload(path, blob, { contentType: type, upsert: false })
    if (up.error) return { ok: false, reason: 'The file could not be copied to that conversation.' }
    return sendLeadMedia(toContactId, path, type, isMediaPlaceholder(body) ? '' : body)
  }
  return sendLeadMedia(toContactId, path, mime, isMediaPlaceholder(body) ? '' : body)
}

/** Short-lived links (an hour) to the photos and files sent in a conversation, by their paths. */
export async function leadMediaLinks(paths: string[]): Promise<LeadOutcome<Record<string, string>>> {
  await requireActionOn(['/leads', '/leads/flows', '/leads/library'], 'leads', 'view')
  // A chat's files, and a template's (chat/tpl/<uuid>/<name>, mig 20261102120000).
  const wanted = [...new Set(paths)].filter(p => /^chat\/(tpl\/)?[0-9a-f-]{36}\/[^/]{1,200}$/.test(p)).slice(0, 100)
  if (!wanted.length) return { ok: true, data: {} }
  const supabase = (await createClient()) as unknown as SupabaseClient
  const links: Record<string, string> = {}
  await Promise.all(wanted.map(async p => {
    const { data } = await supabase.storage.from('lead-media').createSignedUrl(p, 3600)
    if (data?.signedUrl) links[p] = data.signedUrl
  }))
  return { ok: true, data: links }
}

/** Who a conversation may be given to (mig 20261027150000): logins whose permissions give Lead View › Inbox's Create. */
export async function leadAgents(): Promise<LeadOutcome<Array<{ id: string; name: string }>>> {
  await requireActionOn('/leads', 'leads', 'manage')
  return quiet<Array<{ id: string; name: string }>>('lead_agents', {}, 'The list of CS could not be read.')
}

/** Give a conversation to a CS, or back to nobody (null) — Lead View · Manage. */
/** A customer's labels, set whole (mig 20261027190000). */
export async function setLeadLabels(contactId: string, labelIds: string[]) {
  await requireActionOn('/leads', 'leads', 'edit')
  return call<null>('lead_set_labels', { p_contact: contactId, p_labels: labelIds }, 'The labels were not saved.')
}

/** Customer Service's list of labels, saved whole: renamed, recoloured, reordered; one left out is deleted. */
export async function saveLeadLabels(labels: Array<{ id?: string; name: string; tone: string }>) {
  await requireActionOn('/leads', 'leads', 'manage')
  return call<null>('lead_save_labels', { p_labels: labels }, 'The labels were not saved.')
}

export async function assignLead(contactId: string, userId: string | null) {
  await requireActionOn('/leads', 'leads', 'manage')
  return call<null>('lead_assign', { p_contact: contactId, p_user: userId }, 'The conversation was not given.')
}

/**
 * The chat's CS menu › ✦ AI Agent (mig 20261102210000): the chat goes to the AI Agent, which answers at once — the
 * webhook's own path (lib/leads/ai-answer.ts) run with this person's session. Off: the chat comes back to people.
 * Answers how many replies the AI sent now (0 when it could not: outside Meta's 24 hours, the agent not set up …).
 */
export async function giveToAi(contactId: string, on: boolean): Promise<LeadOutcome<{ answered: number }>> {
  await requireActionOn('/leads', 'leads', 'manage')
  const given = await call<null>('lead_give_to_ai', { p_contact: contactId, p_on: on }, 'The chat was not given to the AI Agent.')
  if (!given.ok) return given
  if (!on) return { ok: true, data: { answered: 0 } }
  const supabase = (await createClient()) as unknown as SupabaseClient
  const answered = await answerLeads(supabase, [contactId], process.env.META_SYSTEM_USER_TOKEN?.trim())
  revalidatePath('/leads', 'layout')
  return { ok: true, data: { answered } }
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

/** Hand the lead to the brand's sales group (CS pastes the message into the WhatsApp group; nobody named). */
export async function handLeadToGroup(contactId: string) {
  // The Inbox's hand-over window, and Leads' bulk *Hand over to sales* (Lead View v2).
  await requireActionOn(['/leads', '/leads/list'], 'leads', 'edit')
  return call<null>('lead_handoff_group', { p_contact: contactId }, 'The lead was not handed over.')
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
export async function saveInfo(cats: Array<Pick<InfoCat, 'id' | 'label' | 'icon'>>, cards: InfoCard[]) {
  await requireActionOn('/leads/info', 'leads', 'manage')
  return call<LeadInfo>('lead_save_info', { p_data: { cats, cards } }, 'General info was not saved.')
}

/** AI corrections: Dismiss (on) or Move back to review (mig 20261102130000). */
export async function dismissCorrection(draftId: number, on: boolean) {
  await requireActionOn('/leads/corrections', 'leads', 'manage')
  return call<null>('lead_ai_dismiss', { p_draft: draftId, p_on: on }, 'The correction was not changed.')
}

/** Working hours' Save: the week and the public holidays. */
export async function saveHours(week: BusinessHours['week'], specials: BusinessHours['specials']) {
  await requireActionOn('/leads/hours', 'leads', 'manage')
  return call<null>('lead_save_hours', { p_week: week, p_specials: specials }, 'The hours were not saved.')
}

/** Working hours › On Leave, as it stands (left out = removed). */
export async function saveLeave(rows: Array<Pick<StaffLeave, 'id' | 'userId' | 'name' | 'from' | 'to'>>) {
  await requireActionOn('/leads/hours', 'leads', 'manage')
  return call<null>('lead_save_leave', { p_rows: rows }, 'The leave was not saved.')
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

/**
 * AI Agent's Save for one brand (also AI corrections' "Save as fixed answer"): settings, fixed answers, playbook and —
 * from AI Agent only — Knowledge (mig 20261102140000); a save without it leaves Knowledge as it is.
 */
export async function saveAgent(brandId: string, data: { settings: unknown; answers: FixedAnswer[]; playbook: PlaySituation[]; knowledge?: KnowledgePick[] }) {
  await requireActionOn(['/leads/ai', '/leads/corrections'], 'leads', 'manage')
  return call<null>('lead_save_ai', {
    p_brand: brandId,
    p_data: {
      settings: data.settings,
      answers: data.answers.map(a => ({ id: a.id.startsWith('new-') ? '' : a.id, question: a.question, answer: a.answer, draftId: a.draftId ?? null })),
      playbook: data.playbook.map(p => ({ ...p, id: p.id.startsWith('new-') ? '' : p.id })),
      ...(data.knowledge ? { knowledge: data.knowledge.map(k => ({ kind: k.kind, ref: k.ref, paused: k.paused })) } : {}),
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

/** The Data Center: a folder added (id null), renamed, coloured or moved. Returns its id. */
export async function saveDataFolder(folderId: string | null, data: { brandId: string | null; parentId: string | null; name: string; color: FolderColor | null }) {
  await requireActionOn('/leads/knowledge', 'leads', 'manage')
  return call<string>('lead_save_data_folder', { p_id: folderId, p_data: data }, 'The folder was not saved.')
}

/** The Data Center: a folder gone, with its folders and their files. */
export async function removeDataFolder(folderId: string) {
  await requireActionOn('/leads/knowledge', 'leads', 'manage')
  return call<null>('lead_remove_data_folder', { p_id: folderId }, 'The folder was not deleted.')
}

/** A file's end date — the Data Center, or AI Agent › Knowledge › History's Restore (it also turns the file back on). */
export async function setDataFileUntil(fileId: string, until: string | null) {
  await requireActionOn(['/leads/knowledge', '/leads/ai'], 'leads', 'manage')
  return call<null>('lead_data_file_until', { p_id: fileId, p_until: until }, 'The end date was not saved.')
}

/**
 * AI Agent › Knowledge › Add links: a web address the Data Center does not have yet — kept there, read by this brand
 * and checked every day — so the agent can pick it. Returns its id.
 */
export async function addAgentLink(brandId: string, url: string) {
  await requireActionOn('/leads/ai', 'leads', 'manage')
  const u = url.trim()
  const name = u.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 160)
  return call<string>('lead_save_data_file', { p_id: null, p_data: { kind: 'link', name, url: u, brandId, checkEvery: 'day', category: '', status: 'active' } }, 'The link was not added.')
}

/** Web links › Check now: the page read by the server and what it said kept for the agent (or why it could not be). */
export async function checkLink(fileId: string): Promise<LeadOutcome<{ error: string }>> {
  await requireActionOn('/leads/knowledge', 'leads', 'manage')
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('lead_link_text', { p_ids: [fileId] })
  if (error) return { ok: false, reason: refusal(error, 'The link could not be read.') }
  const url = (data as Array<{ url: string }> | null)?.[0]?.url
  if (!url) return { ok: false, reason: 'That link is gone.' }
  const read = await readLink(url)
  const kept = await call<null>('lead_link_checked', { p_id: fileId, p_content: 'text' in read ? read.text : '', p_pages: 1, p_error: 'error' in read ? read.error : '' }, 'What the page said was not kept.')
  return kept.ok ? { ok: true, data: { error: 'error' in read ? read.error : '' } } : kept
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
  await requireActionOn(['/leads/ai', '/leads/knowledge'], 'leads', 'view')
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

/** Settings › Connect page: the system user's Pages (and their Instagram accounts), asked of Meta now. */
export async function listManagedPages(): Promise<LeadOutcome<ManagedPage[]>> {
  await requireActionOn('/leads/settings', 'leads', 'manage')
  const pages = await managedPages(true)
  return pages ? { ok: true, data: pages } : { ok: false, reason: 'Meta did not list the system user’s Pages — check META_SYSTEM_USER_TOKEN and that the Pages are assigned to the system user.' }
}

/** Settings › Connect page: the Page's webhook subscribed at Meta first (idempotent), then kept with its brand and first reply. */
export async function connectPage(data: { channel: PageChannel; externalId: string; pageId: string | null; name: string; brandId: string | null; newBrand: string; reply: 'cs' | 'ai' }) {
  await requireActionOn('/leads/settings', 'leads', 'manage')
  const subscribe = data.channel === 'messenger' ? data.externalId : data.pageId
  if (!subscribe) return { ok: false as const, reason: 'That Instagram account is not linked to a Facebook Page.' }
  const refused = await subscribePage(subscribe)
  if (refused) return { ok: false as const, reason: refused }
  return call<string>('lead_connect_page', { p_data: data }, 'The page was not connected.')
}

/** Settings › a page: pause / resume receiving, or move it to another brand. */
export async function setPage(pageId: string, data: { paused?: boolean; brandId?: string; name?: string }) {
  await requireActionOn('/leads/settings', 'leads', 'manage')
  return call<null>('lead_set_page', { p_id: pageId, p_data: data }, 'The page was not changed.')
}

/** Settings › Disconnect page: new messages stop; past chats stay in the Inbox. */
export async function disconnectPage(pageId: string) {
  await requireActionOn('/leads/settings', 'leads', 'manage')
  return call<null>('lead_disconnect_page', { p_id: pageId }, 'The page was not disconnected.')
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

/** The agent's reading (lib/leads/agent-read.ts), under the caller's own session. */
async function agentMore(brandId: string, today: string, override?: Pick<AgentMore, 'settings' | 'answers' | 'playbook' | 'knowledge'>) {
  return readAgent((await createClient()) as unknown as SupabaseClient, brandId, today, override)
}

/**
 * AI Agent › Try it: a brand's cards for today and the soul as the form holds it (saved or not), on a pretend
 * conversation. Nothing is kept and nothing reaches a customer.
 */
export async function tryAgent(brandId: string, fields: PersonaFields, turns: Turn[], v2?: Pick<AgentMore, 'settings' | 'answers' | 'playbook' | 'knowledge'>): Promise<LeadOutcome<AgentDraft>> {
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
export async function fetchAdNames(adIds: string[]): Promise<LeadOutcome<{ named: number; refused: number }>> {
  await requireActionOn('/leads/settings', 'leads', 'manage')
  const meta = await fetchMetaAds(adIds)
  if (!meta.ok) return meta
  if (meta.ads.length === 0) return { ok: true, data: { named: 0, refused: meta.refused } }
  const kept = await call<number>('lead_save_meta_ads', { p_rows: meta.ads }, 'What Meta said was not kept.')
  return kept.ok ? { ok: true, data: { named: kept.data, refused: meta.refused } } : kept
}
