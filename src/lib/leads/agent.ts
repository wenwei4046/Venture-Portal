// Lead View › AI Agent v2, AI corrections and the Data Center's files (2026-10-23, the redesign v2 handoff
// `Auto Reply.dc.html` ?view=ai | corrections, `Data Center.dc.html`; mig 20261023200000): the agent's settings and the
// handoff's presets, what they add to the prompt, the files' status, and the corrections' topics. Pure, tested in
// agent.test.ts. The soul (lib/leads/ai.ts) and the model call (ai-model.ts) stay; this is what step 5 adds to them.

import type { KnowledgeCard } from './ai'
import { isLive, type LeadInfo } from './info'

export const TONES: ReadonlyArray<[string, string]> = [
  ['Professional', 'Polite and precise. No emoji.'], ['Friendly', 'Warm and casual, like a helpful shop assistant.'],
  ['Concise', 'Straight to the answer, one or two lines.'], ['Enthusiastic', 'Upbeat and energetic, shows excitement about the products.'],
  ['Empathetic', 'Patient and understanding, acknowledges the customer’s concerns first.'], ['Playful', 'Light and fun, with a bit of humour.'],
]
export const LENGTHS: ReadonlyArray<[string, string]> = [['Short', 'One or two sentences.'], ['Medium', 'Up to four sentences.'], ['Detailed', 'A full answer with details when useful.']]
export const GOALS: ReadonlyArray<[string, string]> = [
  ['Get mobile number', 'Get the customer’s mobile number so our salesperson can follow up on WhatsApp.'],
  ['Book showroom visit', 'Book a showroom visit with a date and time.'],
  ['Close the sale', 'Help the customer choose a product and confirm the order.'],
  ['Answer and hand over', 'Answer the question clearly, then hand the chat to a person.'],
]
export const INSTRUCTIONS: ReadonlyArray<[string, string]> = [
  ['Customer’s language', 'Reply in the customer’s language: English, Malay or Chinese.'],
  ['Use first name', 'Use the customer’s first name when you know it.'],
  ['One question at a time', 'Ask only one question per message.'],
  ['End with a question', 'End each reply with a short question to keep the chat going.'],
  ['No emoji', 'Do not use emoji.'],
  ['Say it’s an assistant', 'If asked, say you are the brand’s automated assistant and a person can take over any time.'],
]
export const SALES_HABITS: ReadonlyArray<[string, string]> = [
  ['Suggest a visit', 'When the customer is interested, suggest visiting the nearest showroom.'],
  ['Mention the promo', 'When talking about price, mention the current promotion.'],
  ['Max 3 products', 'Recommend at most 3 products at a time.'],
  ['Ask room size', 'For sofas and tables, ask the room size or number of people before recommending.'],
  ['Ask budget', 'Ask the customer’s budget politely before suggesting products.'],
  ['Send photos via sales', 'When the customer wants more photos, say the salesperson will WhatsApp them.'],
]
export const AVOIDS: ReadonlyArray<[string, string]> = [
  ['No stock promises', 'Never promise stock or delivery dates. Say the salesperson will confirm.'],
  ['No extra discounts', 'Never offer discounts beyond the current promotion.'],
  ['No other brands', 'Do not talk about other furniture brands or compare prices.'],
  ['Price from the files only', 'Only quote prices that are in the knowledge files. Otherwise say the salesperson will confirm.'],
  ['No personal data', 'Do not ask for IC number, address or payment details in chat.'],
]
export const BLOCK_PRESETS = ['Competitor prices', 'Delivery date of an existing order', 'Discounts beyond the promo', 'Refunds and returns', 'Warranty claims', 'Complaints about a salesperson'] as const
export const APPROACHES = ['Agree first, then explain value', 'Mention instalments', 'Mention the current promo', 'Mention the 100-night trial', 'Never lower the price', 'Don’t push', 'Ask what is holding them back', 'Ask one simple question', 'Ask how they sleep', 'Recommend at most 2 options', 'Send the catalogue', 'Invite to the showroom', 'Ask for phone so sales can follow up', 'Be honest, no promises', 'Hand to sales to check stock'] as const
export const PHONE_WORDS = ['Price', 'Showroom', 'Instalment', 'Delivery', 'Promo', 'Appointment'] as const

export interface AgentSettings {
  goal: string
  tone: string
  toneNote: string
  rules: string[]
  instr: string
  habits: string[]
  sellNote: string
  avoid: string[]
  avoidNote: string
  blocked: string[]
  length: string
  phone: { on: boolean; afterOn: boolean; after: number; ask: string; wordsOn: boolean; words: string[]; wordsAsk: string }
  unsure: boolean
  upset: boolean
  maxOn: boolean
  maxReplies: number
}

export const DEFAULT_SETTINGS: AgentSettings = {
  goal: GOALS[0][1], tone: 'Friendly', toneNote: '', rules: ['Customer’s language', 'One question at a time'], instr: '',
  habits: [], sellNote: '', avoid: ['No stock promises'], avoidNote: '', blocked: [], length: 'Short',
  phone: { on: true, afterOn: true, after: 2, ask: 'May I have your mobile number? Our salesperson will WhatsApp you the details.', wordsOn: false, words: [], wordsAsk: '' },
  unsure: true, upset: true, maxOn: false, maxReplies: 6,
}

const str = (v: unknown, max: number, fallback: string) => (typeof v === 'string' ? v.slice(0, max) : fallback)
const list = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.slice(0, 80)))].slice(0, max) : [])
const num = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : fallback)
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)

/** The saved settings read safely, the defaults where something is missing; the soul's goal when settings have none. */
export function settingsOf(raw: unknown, soulGoal = ''): AgentSettings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const p = r.phone && typeof r.phone === 'object' ? (r.phone as Record<string, unknown>) : {}
  const d = DEFAULT_SETTINGS
  return {
    goal: str(r.goal, 1000, soulGoal || d.goal),
    tone: TONES.some(t => t[0] === r.tone) ? (r.tone as string) : d.tone,
    toneNote: str(r.toneNote, 600, ''),
    rules: Array.isArray(r.rules) ? list(r.rules, 20) : d.rules,
    instr: str(r.instr, 2000, ''),
    habits: list(r.habits, 20),
    sellNote: str(r.sellNote, 600, ''),
    avoid: Array.isArray(r.avoid) ? list(r.avoid, 20) : d.avoid,
    avoidNote: str(r.avoidNote, 1000, ''),
    blocked: list(r.blocked, 30),
    length: LENGTHS.some(t => t[0] === r.length) ? (r.length as string) : d.length,
    phone: {
      on: bool(p.on, d.phone.on), afterOn: bool(p.afterOn, d.phone.afterOn), after: num(p.after, 1, 20, d.phone.after),
      ask: str(p.ask, 600, d.phone.ask), wordsOn: bool(p.wordsOn, false), words: list(p.words, 20), wordsAsk: str(p.wordsAsk, 600, ''),
    },
    unsure: bool(r.unsure, d.unsure), upset: bool(r.upset, d.upset), maxOn: bool(r.maxOn, false), maxReplies: num(r.maxReplies, 1, 50, d.maxReplies),
  }
}

export interface FixedAnswer { id: string; question: string; answer: string; source?: string; draftId?: number | string | null; editedAt?: string | null }
export interface PlaySituation { id: string; active: boolean; name: string; words: string; approaches: string[]; reply: string }

export interface DataFile {
  id: string
  /** null = Shared. */
  brandId: string | null
  category: string
  kind: 'file' | 'link'
  name: string
  path: string | null
  url: string | null
  mime: string
  sizeBytes: number
  ver: number
  validFrom: string | null
  validUntil: string | null
  status: 'active' | 'paused'
  updatedByName: string
  updatedAt: string
  usedBy: Array<{ brandId: string; paused: boolean }>
}

export interface AgentSource { fileId: string; paused: boolean; addedAt?: string; addedByName?: string; file: DataFile }

export interface AgentMore {
  brandId: string
  settings: unknown
  answers: FixedAnswer[]
  playbook: PlaySituation[]
  sources: AgentSource[]
}

/** The Data Center's categories (the handoff's six); CS may type others. */
export const DATA_CATEGORIES = ['Products & prices', 'Product details', 'Photos & videos', 'Promotions', 'Catalogues', 'After-sales'] as const

/** A file's or link's status: paused, expired, starts later, ending within 14 days, or in use. */
export function fileStatus(f: Pick<DataFile, 'status' | 'validFrom' | 'validUntil'>, today: string): { label: string; tone: 'green' | 'amber' | 'red' | 'none'; usable: boolean } {
  if (f.status === 'paused') return { label: 'Paused', tone: 'none', usable: false }
  if (f.validUntil && f.validUntil < today) return { label: 'Expired', tone: 'red', usable: false }
  if (f.validFrom && f.validFrom > today) return { label: `Starts ${f.validFrom.slice(8)}/${f.validFrom.slice(5, 7)}`, tone: 'none', usable: false }
  if (f.validUntil) {
    const n = Math.round((Date.parse(f.validUntil + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5)
    if (n <= 14) return { label: n === 0 ? 'Ends today' : `Ends in ${n} day${n === 1 ? '' : 's'}`, tone: 'amber', usable: true }
  }
  return { label: f.validUntil ? `Until ${f.validUntil.slice(8)}/${f.validUntil.slice(5, 7)}` : 'No end date', tone: 'green', usable: true }
}

/** Can the agent read this kind of file itself? PDFs, pictures and plain text yes; Office files not yet. */
export function readable(f: Pick<DataFile, 'kind' | 'mime' | 'name'>): 'pdf' | 'image' | 'text' | 'link' | null {
  if (f.kind === 'link') return 'link'
  if (f.mime === 'application/pdf' || /\.pdf$/i.test(f.name)) return 'pdf'
  if (/^image\/(png|jpeg|gif|webp)$/.test(f.mime)) return 'image'
  if (/^text\//.test(f.mime) || /\.(txt|csv|md)$/i.test(f.name)) return 'text'
  return null
}

/** "Reads 5 sources from the 2990s and Shared folders · 1 expired · 1 ending soon". */
export function sourcesSummary(sources: AgentSource[], brandName: string, today: string): { main: string; warn: string } {
  const on = sources.filter(s => !s.paused)
  const st = on.map(s => fileStatus(s.file, today))
  const expired = st.filter(x => x.label === 'Expired').length
  const ending = st.filter(x => x.tone === 'amber').length
  return {
    main: `Reads ${on.length} source${on.length === 1 ? '' : 's'} from the ${brandName} and Shared folders`,
    warn: [expired ? `${expired} expired` : '', ending ? `${ending} ending soon` : ''].filter(Boolean).join(' · '),
  }
}

const pick = (table: ReadonlyArray<[string, string]>, chosen: string[]) => chosen.map(c => table.find(t => t[0] === c)?.[1]).filter(Boolean) as string[]

/** What the settings add to the agent's instructions — the second block of its system prompt. */
export function settingsPrompt(s: AgentSettings): string {
  const lines: string[] = []
  const tone = TONES.find(t => t[0] === s.tone)?.[1]
  lines.push(`# How you reply\nTone: ${s.tone}${tone ? ` — ${tone}` : ''}${s.toneNote.trim() ? ` ${s.toneNote.trim()}` : ''}`)
  lines.push(`Length: ${LENGTHS.find(l => l[0] === s.length)?.[1] ?? s.length}`)
  const rules = [...pick(INSTRUCTIONS, s.rules), ...(s.instr.trim() ? [s.instr.trim()] : [])]
  if (rules.length) lines.push(`# Instructions\n${rules.map(r => `- ${r}`).join('\n')}`)
  const sell = [...pick(SALES_HABITS, s.habits), ...(s.sellNote.trim() ? [s.sellNote.trim()] : [])]
  if (sell.length) lines.push(`# Sales approach\n${sell.map(r => `- ${r}`).join('\n')}`)
  const avoid = [...pick(AVOIDS, s.avoid), ...(s.avoidNote.trim() ? [s.avoidNote.trim()] : [])]
  if (avoid.length) lines.push(`# What you avoid\n${avoid.map(r => `- ${r}`).join('\n')}`)
  if (s.blocked.length) lines.push(`# Do not answer — set handoff to true and say a colleague will help\n${s.blocked.map(b => `- ${b}`).join('\n')}`)
  if (s.phone.on) {
    const when = [s.phone.afterOn ? `after ${s.phone.after} of your replies` : '', s.phone.wordsOn && s.phone.words.length ? `straight away when the customer mentions ${s.phone.words.join(', ')}` : ''].filter(Boolean)
    lines.push(`# The mobile number\nAsk for it ${when.join(', or ') || 'when the customer shows interest'}${s.phone.ask.trim() ? `, for example: "${s.phone.ask.trim()}"` : ''}. Never ask again once we have it.`)
  } else {
    lines.push('# The mobile number\nDo not ask for it.')
  }
  const limits = [s.unsure ? 'when you are unsure of the answer' : '', s.upset ? 'when the customer is upset or complains' : '', s.maxOn ? `after ${s.maxReplies} of your replies in one conversation` : ''].filter(Boolean)
  if (limits.length) lines.push(`# When to hand to a person (set handoff to true)\n${limits.map(l => `- ${l}`).join('\n')}`)
  return lines.join('\n\n')
}

/** The fixed answers and the playbook, worded for the prompt. */
export function answersPrompt(answers: FixedAnswer[], playbook: PlaySituation[]): string {
  const parts: string[] = []
  if (answers.length) parts.push(`# Fixed answers — when the customer asks something like this, reply with the answer word for word\n${answers.map(a => `<fixed id="answer-${a.id}">\nAsks: ${a.question}\nReply: ${a.answer}\n</fixed>`).join('\n')}`)
  const on = playbook.filter(p => p.active)
  if (on.length) parts.push(`# Sales playbook — how our best salesperson handles these\n${on.map(p => `<situation name="${p.name.replace(/"/g, "'")}">\nCustomer says: ${p.words || '(anything like it)'}\nHow: ${p.approaches.join('; ') || '-'}\nExample reply (a guide, not the words): ${p.reply || '-'}\n</situation>`).join('\n')}`)
  return parts.join('\n\n')
}

/**
 * Everything the agent may cite as a card: the old Data Center cards, the brand's live General info, the fixed answers
 * and the files it reads — so `usedCardIds` names one of them and the Inbox shows what a draft relied on.
 */
export function agentCards(old: KnowledgeCard[], info: LeadInfo | null, brandId: string, today: string, answers: FixedAnswer[], files: DataFile[]): KnowledgeCard[] {
  const infoCards: KnowledgeCard[] = info ? info.cards
    .filter(c => isLive(c, today) && (c.brandId === null || c.brandId === brandId))
    .map(c => ({
      id: `info-${c.id}`, brandId: c.brandId, kind: 'note', title: c.name || c.code,
      body: [...c.fields.filter(f => f.value.trim()).map(f => `${f.label}: ${f.value}`), c.note.trim()].filter(Boolean).join('\n').slice(0, 4000) || '-',
      startsOn: c.validFrom, endsOn: c.validUntil, active: true, updatedByName: '', updatedAt: '',
    } as KnowledgeCard)) : []
  const answerCards = answers.map(a => ({ id: `answer-${a.id}`, brandId, kind: 'faq', title: a.question.slice(0, 80), body: a.answer, startsOn: null, endsOn: null, active: true, updatedByName: '', updatedAt: '' } as KnowledgeCard))
  const fileCards = files.map(f => ({ id: `file-${f.id}`, brandId: f.brandId, kind: 'note', title: f.name.slice(0, 80), body: f.kind === 'link' ? `Web page: ${f.url}` : '(attached document)', startsOn: f.validFrom, endsOn: f.validUntil, active: true, updatedByName: '', updatedAt: '' } as KnowledgeCard))
  return [...old, ...infoCards, ...answerCards, ...fileCards]
}

/** The corrections' topics for the Summary view, by the customer's question. */
export const CORRECTION_TOPICS: ReadonlyArray<[string, RegExp]> = [
  ['Delivery', /(deliver|送货|送貨|penang|area|hantar)/i], ['Product details', /(colou?r|size|sofa bed|mattress|颜色|顏色|尺寸)/i],
  ['Payment', /(instal|paylater|pay|refund|分期|ansur)/i], ['Promo and price', /(price|promo|discount|rm\s?\d|价|價|harga)/i], ['Other', /./],
]
export function topicOf(question: string): string {
  return CORRECTION_TOPICS.find(([, re]) => re.test(question))?.[0] ?? 'Other'
}

export interface Correction { id: number; at: string; by: string; wrong: string; right: string; contactId: string; conversation: string; question: string | null; answerId: string | null }
