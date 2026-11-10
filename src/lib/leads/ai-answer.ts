import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { conversationPrompt, readDraft, systemPrompt, turnsOf, type KnowledgeCard, type Persona } from './ai'
import { AI_NOT_CONNECTED, askModel } from './ai-model'
import { agentMore, usedMemory } from './agent-read'
import { sendLeadOutbox } from './messenger-outbox'
import type { LeadContact } from './types'

type Context = {
  persona: Persona
  knowledge: KnowledgeCard[]
  contact: LeadContact
  messages: Array<{ direction: 'in' | 'out'; sender: string; body: string }>
  today: string
}

/** Why the AI Agent cannot answer, said on the timeline when it hands the customer to Customer Service. */
export function lastingFailure(reason: string): string | null {
  if (reason === AI_NOT_CONNECTED) return 'the AI is not connected (no API key)'
  if (/off for this brand/i.test(reason)) return 'the AI Agent is not set up for this brand'
  if (/conversation is gone/i.test(reason)) return 'the conversation is gone'
  return null
}

/**
 * The AI Agent answering by itself (mig 20261102170000): after a webhook delivery, the conversations in its hands whose
 * customer wrote last (or that were just handed to it) are claimed (`lead_ai_claim`), each read as a draft is — the
 * brand's agent, its Knowledge, General info, fixed answers and the last 30 messages — and its reply kept
 * (`lead_ai_answered`, which hands the customer to CS when the model asks or at How it replies' "after N replies"), then sent by the outbox.
 * A lasting failure (no API key, the brand's agent not set up) hands the customer to CS; a passing one lets the claim go
 * for the next message. Handed the webhook's client (the service role). Never throws.
 */
export async function answerLeads(client: SupabaseClient, contacts: string[], systemToken: string | undefined): Promise<number> {
  if (!contacts.length) return 0
  const claimed = await client.rpc('lead_ai_claim', { p_contacts: contacts })
  if (claimed.error) {
    console.error('lead_ai_claim failed:', claimed.error.message)
    return 0
  }
  const ids = Array.isArray(claimed.data) ? (claimed.data as string[]) : []
  const answered: string[] = []
  for (const id of ids) {
    try {
      const why = await answerOne(client, id)
      if (why === null) answered.push(id)
      else await stop(client, id, why)
    } catch (e) {
      console.error('AI Agent answer failed:', e instanceof Error ? e.message : e)
      await stop(client, id, { keep: true })
    }
  }
  if (answered.length) await sendLeadOutbox(client, answered, systemToken)
  return answered.length
}

type Stop = { keep: true } | { keep: false; why: string }

async function stop(client: SupabaseClient, id: string, s: Stop) {
  const r = await client.rpc('lead_ai_stop', { p_contact: id, p_why: s.keep ? '' : s.why, p_keep: s.keep })
  if (r.error) console.error('lead_ai_stop failed:', r.error.message)
}

/** One conversation: null when its reply was kept, else why it stopped. */
async function answerOne(client: SupabaseClient, id: string): Promise<Stop | null> {
  const ctx = await client.rpc('lead_ai_context', { p_contact: id })
  if (ctx.error) {
    const lasting = lastingFailure(ctx.error.message)
    return lasting ? { keep: false, why: lasting } : { keep: true }
  }
  const { persona, knowledge, contact, messages, today } = ctx.data as Context
  const more = await agentMore(client, contact.brandId, today, undefined, { contactId: id, outletId: contact.outletId ?? null })
  const cards = more ? more.cards(knowledge) : knowledge
  const answer = await askModel(systemPrompt(persona, cards, today, true), conversationPrompt(contact, turnsOf(messages), more?.factsOff), more?.ask)
  if (!answer.ok) {
    const lasting = lastingFailure(answer.reason)
    return lasting ? { keep: false, why: lasting } : { keep: true }
  }
  const draft = readDraft(answer.text, cards)
  if (!draft) return { keep: true }
  const kept = await client.rpc('lead_ai_answered', {
    p_contact: id, p_body: draft.reply, p_name: persona.agentName, p_handoff: draft.handoff, p_note: draft.note,
    p_max: more?.settings.maxOn ? more.settings.maxReplies : null,
  })
  if (kept.error) {
    console.error('lead_ai_answered failed:', kept.error.message)
    return { keep: true }
  }
  // The memory lines it followed, for From goal results' figures (mig 20261110230000; a failure only warns).
  const mem = usedMemory(draft.used)
  if (mem.length) {
    const u = await client.rpc('lead_ai_memory_used', { p_contact: id, p_ids: mem })
    if (u.error) console.warn('lead_ai_memory_used failed:', u.error.message)
  }
  return null
}
