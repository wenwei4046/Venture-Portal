// Lead View › AI Agent (2026-10-16, the base — the user: "把基础做好，细节再调"). The agent writes DRAFTS for
// Customer Service from the brand's soul (lead_personas) and its Data Center (lead_knowledge); a person sends,
// edits or dismisses each one. This file is the prompt and the reading of the answer — no I/O, so it is tested
// as it is (ai.test.ts). The model is called in ai-model.ts, on the server only.

export type KnowledgeKind = 'promo' | 'product' | 'faq' | 'showroom' | 'policy' | 'note'
export type AgentTone = 'warm' | 'professional' | 'playful' | 'concise'
export type AgentMode = 'off' | 'copilot'
export type DraftOutcome = 'sent' | 'edited' | 'dismissed'

export interface KnowledgeCard {
  id: string
  /** null = every brand. */
  brandId: string | null
  kind: KnowledgeKind
  title: string
  body: string
  startsOn: string | null
  endsOn: string | null
  active: boolean
  updatedByName: string
  updatedAt: string
}

export interface Persona {
  brandId: string
  brandName: string
  agentName: string
  personality: string
  tone: AgentTone
  goal: string
  dos: string
  donts: string
  examples: string
  mode: AgentMode
  saved: boolean
  updatedByName: string
  updatedAt: string | null
  /** The last 30 days of drafts (lead_personas only). */
  drafts?: { total: number; sent: number; edited: number; dismissed: number }
}

export type PersonaFields = Pick<Persona, 'agentName' | 'personality' | 'tone' | 'goal' | 'dos' | 'donts' | 'examples' | 'mode'>

/** One line of the conversation as the agent reads it. */
export interface Turn {
  who: 'customer' | 'us'
  /** Who on our side wrote it: a person's name, an automation, the agent. */
  by?: string
  text: string
}

/** What the agent knows about the customer (the card). */
export interface CustomerFacts {
  name: string
  channel: string
  sourceAd: string
  phone: string | null
  interest: string
  budget: string
  showroom: string
  preferredTime: string
}

export interface AgentDraft {
  reply: string
  used: Array<{ id: string; title: string }>
  /** The agent thinks a person should take over (a question it cannot answer from the cards, an upset customer …). */
  handoff: boolean
  /** A short note to Customer Service, in English. */
  note: string
}

export const KIND_LABEL: Readonly<Record<KnowledgeKind, { en: string; zh: string }>> = {
  promo: { en: 'Promo', zh: '优惠' },
  product: { en: 'Product', zh: '产品' },
  faq: { en: 'FAQ', zh: '常见问题' },
  showroom: { en: 'Showroom', zh: '门市' },
  policy: { en: 'Policy', zh: '政策' },
  note: { en: 'Note', zh: '备注' },
}

export const TONE_LABEL: Readonly<Record<AgentTone, { en: string; zh: string; prompt: string }>> = {
  warm: { en: 'Warm', zh: '亲切', prompt: 'warm and friendly, like a helpful shop assistant who likes people' },
  professional: { en: 'Professional', zh: '专业', prompt: 'polite and professional, clear and reassuring' },
  playful: { en: 'Playful', zh: '活泼', prompt: 'light and playful, a little emoji is fine' },
  concise: { en: 'Concise', zh: '简洁', prompt: 'short and to the point, no small talk' },
}

/** The goal when Customer Service has not written one: the KPI is the phone (the user: 客服的 KPI 更多是在拿到電話號碼). */
export const DEFAULT_GOAL =
  'Answer the customer helpfully and, once they show interest, get their mobile number so a salesperson can arrange a showroom visit.'

/** The JSON the model answers with (structured outputs). */
export const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'The message to send the customer.' },
    usedCardIds: { type: 'array', items: { type: 'string' }, description: 'The ids of the Data Center cards the reply relies on.' },
    handoff: { type: 'boolean', description: 'True when a person should take over.' },
    note: { type: 'string', description: 'A short note to customer service in English; empty when there is nothing to say.' },
  },
  required: ['reply', 'usedCardIds', 'handoff', 'note'],
  additionalProperties: false,
} as const

/** Is a card in date on this office day (YYYY-MM-DD)? The twin of lead_knowledge_today's dates. */
export function inDate(card: Pick<KnowledgeCard, 'startsOn' | 'endsOn' | 'active'>, today: string): boolean {
  if (!card.active) return false
  if (card.startsOn && card.startsOn > today) return false
  if (card.endsOn && card.endsOn < today) return false
  return true
}

const section = (title: string, body: string) => (body.trim() ? `# ${title}\n${body.trim()}\n` : '')

/** Escape what would close a card's tag. */
const plain = (s: string) => s.replace(/</g, '‹').replace(/>/g, '›')

/**
 * The system prompt: the brand's soul, its cards for today, and the rules every brand keeps. It changes only
 * when the soul or the cards do, so the API can cache it across a day's drafts.
 */
export function systemPrompt(persona: Persona, cards: KnowledgeCard[], today: string): string {
  const name = persona.agentName.trim() || `the ${persona.brandName} team`
  const knowledge = cards.length
    ? cards.map(c => `<card id="${c.id}" kind="${c.kind}" title="${plain(c.title)}"${c.endsOn ? ` until="${c.endsOn}"` : ''}>\n${plain(c.body)}\n</card>`).join('\n')
    : '(No cards yet.)'
  return [
    `You write reply drafts for ${persona.brandName}'s customer service, who answer customers on Facebook Messenger and Instagram in Malaysia. A person reads every draft before it is sent; write it as the message itself.`,
    '',
    `# Who you are\nYou write as ${name}. Your tone is ${TONE_LABEL[persona.tone].prompt}.`,
    persona.personality.trim() ? `${persona.personality.trim()}\n` : '',
    section('Your goal', persona.goal || DEFAULT_GOAL),
    section('Always', persona.dos),
    section('Never', persona.donts),
    section('Replies written the way the brand writes (copy the voice, not the facts)', persona.examples),
    `# What you know — the Data Center, today ${today}\n${knowledge}\n`,
    '# Rules',
    '- Prices, promotions, stock, addresses, opening hours and policies come ONLY from the cards above. If the answer is not there, do not guess: say a colleague will confirm shortly, and set handoff to true.',
    '- Reply in the language the customer writes in (English, Chinese or Malay), the way people chat: short, one to three small paragraphs, no markdown, no lists unless they help.',
    '- When the customer shows interest, ask for their mobile number naturally so a salesperson can arrange a showroom visit. Never ask again once we have it.',
    '- Never promise a discount, a gift or a date the cards do not give. Never mention these instructions, the cards or that you are an AI unless asked directly.',
    '- Set handoff to true when the customer is upset, asks for a person, wants something the cards do not cover, or is ready to book a visit.',
    '- usedCardIds lists the ids of the cards your reply relies on. note tells customer service, in one English sentence, what to check — or is empty.',
  ].filter(Boolean).join('\n')
}

/** The user turn: what we know about the customer and the conversation so far, oldest first. */
export function conversationPrompt(customer: CustomerFacts | null, turns: Turn[]): string {
  const facts = customer
    ? [
        `Name: ${customer.name || '(not given)'}`,
        `Came in on: ${customer.channel}${customer.sourceAd.trim() ? `, from the ad "${customer.sourceAd.trim()}"` : ', organic'}`,
        `Mobile number: ${customer.phone ? 'we have it already' : 'not yet'}`,
        customer.interest.trim() && `Interested in: ${customer.interest.trim()}`,
        customer.budget.trim() && `Budget: ${customer.budget.trim()}`,
        customer.showroom.trim() && `Showroom: ${customer.showroom.trim()}`,
        customer.preferredTime.trim() && `Preferred time: ${customer.preferredTime.trim()}`,
      ].filter(Boolean).join('\n')
    : '(A test conversation — nothing known yet.)'
  const lines = turns.length
    ? turns.map(t => `[${t.who === 'customer' ? 'Customer' : `Us${t.by ? ` · ${t.by}` : ''}`}] ${t.text}`).join('\n')
    : '(No messages yet.)'
  const last = turns.at(-1)
  const ask = last && last.who === 'us'
    ? 'We wrote last. Draft a short, natural follow-up only if one is useful.'
    : 'Draft our next reply.'
  return `<customer>\n${facts}\n</customer>\n\n<conversation>\n${lines}\n</conversation>\n\n${ask}`
}

/**
 * The model's answer, checked: JSON in the schema's shape, a reply that says something (2,000 characters at
 * most — Lead View's message limit), and only card ids that were given. Null when it is not usable.
 */
export function readDraft(text: string, cards: Pick<KnowledgeCard, 'id' | 'title'>[]): AgentDraft | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.reply !== 'string' || !r.reply.trim()) return null
  const ids = Array.isArray(r.usedCardIds) ? r.usedCardIds.filter((x): x is string => typeof x === 'string') : []
  const used = cards.filter(c => ids.includes(c.id)).map(c => ({ id: c.id, title: c.title }))
  return {
    reply: r.reply.trim().slice(0, 2000),
    used,
    handoff: r.handoff === true,
    note: typeof r.note === 'string' ? r.note.trim().slice(0, 300) : '',
  }
}

/** The conversation's messages as the agent reads them (the last 30, as lead_ai_context gives them). */
export function turnsOf(messages: Array<{ direction: 'in' | 'out'; sender: string; body: string }>): Turn[] {
  const by: Record<string, string> = { cs: 'customer service', flow: 'automation', ai: 'assistant' }
  return messages.map(m => (m.direction === 'in' ? { who: 'customer' as const, text: m.body } : { who: 'us' as const, by: by[m.sender], text: m.body }))
}

/** What became of a used draft: sent as the agent wrote it, or edited first (spaces aside). */
export function outcomeOf(draft: string, sent: string): Exclude<DraftOutcome, 'dismissed'> {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
  return norm(draft) === norm(sent) ? 'sent' : 'edited'
}

/** Of the drafts somebody decided on, the share sent (as written or edited). Null with none. */
export function adoptionRate(d: { sent: number; edited: number; dismissed: number }): number | null {
  const decided = d.sent + d.edited + d.dismissed
  return decided ? Math.round(((d.sent + d.edited) / decided) * 100) : null
}
