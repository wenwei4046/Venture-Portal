import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { DRAFT_SCHEMA } from './ai'

/**
 * Lead View's AI agent calls Claude here, on the server only (2026-10-16). The key is ANTHROPIC_API_KEY in the
 * environment (Vercel, and .env.local for dev), never in the database or the browser. Without it the agent
 * says it is not connected, as Auto-read on BA does.
 *
 * Model: Claude Opus 5.5 with adaptive thinking at low effort — a chat reply wants speed more than depth.
 * Server-side refusal fallbacks are ON (`fallbacks: 'default'`): if the model declines a request, the API runs
 * it again on its default fallback model inside the same call.
 */

export const AI_MODEL = 'claude-opus-5-5'
export const AI_NOT_CONNECTED =
  'The AI agent is not connected yet — add ANTHROPIC_API_KEY to the Vercel environment (and .env.local for dev), then redeploy.'

export type ModelAnswer = { ok: true; text: string; model: string } | { ok: false; reason: string }

/** A file the agent reads (AI Agent v2, mig 20261023200000): a PDF, a picture or plain text from the Data Center. */
export type AgentDocument =
  | { kind: 'pdf'; title: string; base64: string }
  | { kind: 'image'; title: string; base64: string; mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' }
  | { kind: 'text'; title: string; text: string }

/**
 * Ask the model for a draft. `more` (AI Agent v2) is the settings, fixed answers and playbook — a second system block —
 * and the Data Center files the agent reads, put before the conversation; both are cached with the soul.
 */
export async function askModel(system: string, user: string, more?: { system?: string; documents?: AgentDocument[] }): Promise<ModelAnswer> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, reason: AI_NOT_CONNECTED }
  const client = new Anthropic()
  try {
    const res = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
      // The soul and the cards change rarely: cached across the day's drafts.
      system: [
        { type: 'text', text: system, ...(more?.system ? {} : { cache_control: { type: 'ephemeral' as const } }) },
        ...(more?.system ? [{ type: 'text' as const, text: more.system, cache_control: { type: 'ephemeral' as const } }] : []),
      ],
      messages: [{ role: 'user', content: [...documentBlocks(more?.documents ?? []), { type: 'text' as const, text: user }] }],
    })
    if (res.stop_reason === 'refusal') return { ok: false, reason: 'The AI agent would not draft this one — please reply yourself.' }
    if (res.stop_reason === 'max_tokens') return { ok: false, reason: 'The draft ran too long — please try again.' }
    const text = res.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('')
    return { ok: true, text, model: res.model }
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error('[lead-ai] model call failed', err.status, err.name)
      if (err.status === 401 || err.status === 403) return { ok: false, reason: 'The AI agent’s key was refused — check ANTHROPIC_API_KEY.' }
      if (err.status === 429 || err.status === 529) return { ok: false, reason: 'The AI agent is busy — try again in a moment.' }
    } else {
      console.error('[lead-ai] model call failed', err instanceof Error ? err.name : 'unknown')
    }
    return { ok: false, reason: 'The AI agent could not draft a reply — please try again.' }
  }
}

/** The files as the API takes them: a PDF and a text file as documents (titled, so the agent can name them), a picture as an image; the last one cached. */
function documentBlocks(docs: AgentDocument[]): Anthropic.Beta.Messages.BetaContentBlockParam[] {
  return docs.map((d, i): Anthropic.Beta.Messages.BetaContentBlockParam => {
    const cache = i === docs.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}
    if (d.kind === 'pdf') return { type: 'document', title: d.title, source: { type: 'base64', media_type: 'application/pdf', data: d.base64 }, ...cache }
    if (d.kind === 'text') return { type: 'document', title: d.title, source: { type: 'text', media_type: 'text/plain', data: d.text }, ...cache }
    return { type: 'image', source: { type: 'base64', media_type: d.mediaType, data: d.base64 }, ...cache }
  })
}
