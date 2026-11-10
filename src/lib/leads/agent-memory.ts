// Lead View v3 § 5 › AI Agent's Memory and its reading order (2026-11-10, docs/design_handoff_lead_view_v3; mig
// 20261110230000). Fixed memory, Collected lessons, From goal results' lines and Knowledge › Outlets' lines are rows of
// `lead_ai_memory`; How it learns (the reading order, its switches, the brand's own sources and the learning settings)
// lives in the brand's settings. Pure, tested in agent-memory.test.ts.

export type MemoryKind = 'fixed' | 'collected' | 'goal' | 'outlet'

export interface MemoryLine {
  id: string
  kind: MemoryKind
  outletId: string | null
  body: string
  /** Collected: to review, in use or off; every other kind is on. */
  status: 'review' | 'on' | 'off'
  /** Collected in use: 👍 More like this / 👎 Less like this. */
  dir: 'up' | 'down' | null
  /** Where a collected lesson came from ("Its own chats", "Template “Sofa enquiry”", "Jia Hui (CS)"). */
  source: string
  /** Collected: the chats it was learned from. */
  cases: number
  addedByName: string
  createdAt: string
  /** Chats counted (reached the goal, or 7 days over) and those that reached it. */
  chats: number
  reached: number
}

export interface FileQuestion { kind: 'file' | 'folder'; ref: string; question: string; instruction: string; custom: boolean }

export interface MemorySuggestion { id: string; kind: 'edit' | 'add' | 'outlet'; memoryId: string | null; outletId: string | null; body: string; why: string; chats: number }

/** What lead_ai_more adds since mig 20261110230000 (all empty before it). */
export interface AgentMemory {
  memory: MemoryLine[]
  fileQs: FileQuestion[]
  suggestions: MemorySuggestion[]
  /** What customers asked when the AI used a file, by file id (the last 30 days, three each). */
  asked: Record<string, string[]>
}

export const NO_MEMORY: AgentMemory = { memory: [], fileQs: [], suggestions: [], asked: {} }

export function memoryOf(raw: Partial<AgentMemory> | null | undefined): AgentMemory {
  return {
    memory: Array.isArray(raw?.memory) ? raw!.memory : [],
    fileQs: Array.isArray(raw?.fileQs) ? raw!.fileQs : [],
    suggestions: Array.isArray(raw?.suggestions) ? raw!.suggestions : [],
    asked: raw?.asked && typeof raw.asked === 'object' ? raw.asked : {},
  }
}

// ── How it learns ────────────────────────────────────────────────────────────

export interface CustomSource { id: string; name: string; text: string }

export interface LearnSettings {
  /** The reading order: source ids, the brand's own sources among them. */
  order: string[]
  /** Sources switched off (Fixed memory never is). */
  off: Record<string, boolean>
  custom: CustomSource[]
  from: 'goal' | 'all'
  newL: 'ask' | 'auto' | 'off'
  min: number
  forget: 'never' | '30' | '90'
  share: boolean
}

/** The sources read before each reply, as drawn: id → [title, what it is]. */
export const READ_SOURCES: Readonly<Record<string, readonly [string, string]>> = {
  fixed: ['Fixed memory', 'Rules you wrote that never change'],
  how: ['How to reach the goal', 'Your instructions in How it replies'],
  faq: ['Fixed answers', 'Exact replies to common questions'],
  cust: ['This customer', 'Name, phone, interest and notes from the customer panel'],
  hist: ['Earlier chats with this customer', 'Past conversations, including other pages and brands'],
  outlet: ['Outlet info', 'Address, parking, hours for the customer’s outlet'],
  play: ['Sales playbook', 'What to say when they hesitate or object'],
  know: ['Knowledge files and links', 'Catalogues, price lists, web pages'],
  gen: ['General info', 'Showrooms, opening hours, contact details'],
  promo: ['Current promotions', 'Promos that are running today'],
  col: ['Collected memory', 'What it learned from chats'],
}
export const DEFAULT_ORDER = ['fixed', 'how', 'faq', 'cust', 'hist', 'outlet', 'play', 'know', 'gen', 'promo', 'col']

export const DEFAULT_LEARN: LearnSettings = { order: DEFAULT_ORDER, off: {}, custom: [], from: 'goal', newL: 'ask', min: 5, forget: 'never', share: true }

/** The saved How it learns read safely: every built-in source once, the brand's own after them unless placed. */
export function learnOf(raw: unknown): LearnSettings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const custom: CustomSource[] = Array.isArray(r.custom)
    ? r.custom.filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && typeof (c as { id?: unknown }).id === 'string')
      .slice(0, 20).map(c => ({ id: String(c.id).slice(0, 40), name: typeof c.name === 'string' ? c.name.slice(0, 80) : '', text: typeof c.text === 'string' ? c.text.slice(0, 2000) : '' }))
    : []
  const known = new Set([...DEFAULT_ORDER, ...custom.map(c => c.id)])
  const saved = Array.isArray(r.order) ? [...new Set(r.order.filter((x): x is string => typeof x === 'string' && known.has(x)))] : []
  const order = [...saved, ...DEFAULT_ORDER.filter(k => !saved.includes(k)), ...custom.map(c => c.id).filter(k => !saved.includes(k))]
  const offRaw = r.off && typeof r.off === 'object' ? (r.off as Record<string, unknown>) : {}
  const off = Object.fromEntries(Object.entries(offRaw).filter(([k, v]) => known.has(k) && k !== 'fixed' && v === true).map(([k]) => [k, true]))
  const min = typeof r.min === 'number' && Number.isFinite(r.min) ? Math.max(1, Math.min(999, Math.round(r.min))) : DEFAULT_LEARN.min
  return {
    order, off, custom,
    from: r.from === 'all' ? 'all' : 'goal',
    newL: r.newL === 'auto' || r.newL === 'off' ? r.newL : 'ask',
    min,
    forget: r.forget === '30' || r.forget === '90' ? r.forget : 'never',
    share: r.share !== false,
  }
}

export interface ReadEntry { id: string; title: string; desc: string; on: boolean; mine: boolean; text: string }

/** The reading order as drawn: each source with its title and on/off; a source of the brand's own says "Yours". */
export function readEntries(l: LearnSettings): ReadEntry[] {
  return l.order.map(id => {
    const mine = l.custom.find(c => c.id === id)
    const on = id === 'fixed' || !l.off[id]
    return {
      id, on, mine: !!mine, text: mine?.text ?? '',
      title: mine ? mine.name : READ_SOURCES[id]?.[0] ?? id,
      desc: mine ? (mine.text || 'Click edit to write what it should read') : READ_SOURCES[id]?.[1] ?? '',
    }
  })
}

/** Move a source one place up or down. */
export function moveSource(l: LearnSettings, id: string, by: -1 | 1): LearnSettings {
  const o = [...l.order], i = o.indexOf(id), j = i + by
  if (i < 0 || j < 0 || j >= o.length) return l
  ;[o[i], o[j]] = [o[j], o[i]]
  return { ...l, order: o }
}

// ── The figures ──────────────────────────────────────────────────────────────

/** "58% reached · 212 chats" — green from 45%, rust under 30%; "New · measuring" under the Minimum chats. */
export function rateOf(line: Pick<MemoryLine, 'chats' | 'reached'>, min: number): { text: string; tone: 'pos' | 'mid' | 'low' | 'new' } {
  if (line.chats < Math.max(1, min)) return { text: 'New · measuring', tone: 'new' }
  const p = Math.round((line.reached / line.chats) * 100)
  return { text: `${p}% reached · ${line.chats} chats`, tone: p >= 45 ? 'pos' : p >= 30 ? 'mid' : 'low' }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2 Oct" from an ISO time (office day). */
export function dayOf(iso: string): string {
  const d = new Date(Date.parse(iso) + 8 * 3600_000)
  return Number.isFinite(d.getTime()) ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : ''
}

/** A fixed line's "Added by Mei Ling · 2 Oct"; a collected lesson's "Its own chats · based on 12 chats that reached the goal · 18 Oct". */
export function memoryMeta(m: Pick<MemoryLine, 'kind' | 'addedByName' | 'createdAt' | 'source' | 'cases'>): string {
  if (m.kind === 'collected') return `${m.source || 'Its own chats'} · based on ${m.cases} chats that reached the goal · ${dayOf(m.createdAt)}`
  return [m.addedByName ? `Added by ${m.addedByName}` : '', dayOf(m.createdAt)].filter(Boolean).join(' · ')
}

// ── What the AI is given ─────────────────────────────────────────────────────

const rule = (m: MemoryLine) => `<rule id="mem-${m.id}">${m.body.replace(/\s+/g, ' ').trim()}</rule>`

/** The lines the AI reads for a chat: fixed always, goal lines, the chat's outlet's lines, collected lessons in use. */
export function linesFor(memory: MemoryLine[], outletId: string | null | undefined): MemoryLine[] {
  return memory.filter(m => m.body.trim() && (
    m.kind === 'fixed' || m.kind === 'goal' || (m.kind === 'outlet' && !!outletId && m.outletId === outletId) || (m.kind === 'collected' && m.status === 'on')))
}

export interface PromptParts {
  howGoal: string
  memory: MemoryLine[]
  outletId?: string | null
  outletName?: string
  /** The fixed answers block (answersPrompt's first part). */
  answers?: string
  playbook?: string
  /** "Files you read" with each file's question instructions, and the web pages. */
  knowledge?: string
  earlier?: string
  promotions?: string
  /** General info and This customer are elsewhere (the cards, the conversation); these say whether they are read. */
}

/**
 * Every source in the brand's order, each under its heading, after one line saying the order wins when two disagree.
 * Sources switched off are left out; General info and This customer are only named (their words are the cards and the
 * conversation's <customer>). Memory lines carry ids (`mem-…`) the reply names in usedCardIds, for the figures.
 */
export function orderedPrompt(l: LearnSettings, p: PromptParts): string {
  const lines = linesFor(p.memory, p.outletId)
  const of = (k: MemoryKind) => lines.filter(m => m.kind === k)
  const body: Record<string, string> = {
    fixed: of('fixed').length ? `Always follow these. They never change.\n${of('fixed').map(rule).join('\n')}` : '',
    how: [p.howGoal.trim(), of('goal').length ? `What worked in chats that reached the goal:\n${of('goal').map(rule).join('\n')}` : ''].filter(Boolean).join('\n\n'),
    faq: p.answers ?? '',
    cust: 'What we know about this customer is in <customer> with the conversation.',
    hist: p.earlier ?? '',
    outlet: of('outlet').length ? `${p.outletName ? `This chat is from ${p.outletName}. ` : ''}Use these only for this outlet:\n${of('outlet').map(rule).join('\n')}` : '',
    play: p.playbook ?? '',
    know: p.knowledge ?? '',
    gen: 'The General info cards are in "What you know" above.',
    promo: p.promotions ?? '',
    col: of('collected').length
      ? `Lessons from earlier chats (a guide; anything above wins):\n${of('collected').map(m => `${rule(m)}${m.dir === 'up' ? ' (works well — lean on it)' : m.dir === 'down' ? ' (use sparingly)' : ''}`).join('\n')}`
      : '',
  }
  for (const c of l.custom) body[c.id] = c.text.trim()
  const on = readEntries(l).filter(e => e.on && body[e.id]?.trim())
  if (!on.length) return ''
  return [
    `# What you read before each reply, in order — when two disagree, the one higher in this list wins\n${on.map((e, i) => `${i + 1}. ${e.title}`).join('\n')}`,
    ...on.map((e, i) => `## ${i + 1}. ${e.title}\n${body[e.id].trim()}`),
    lines.length ? 'When your reply follows one of the <rule> lines, add its id (mem-…) to usedCardIds.' : '',
  ].filter(Boolean).join('\n\n')
}

/** The pretend cards for the memory lines, so readDraft keeps their ids in `used` (never shown as knowledge). */
export function memoryCards(memory: MemoryLine[], outletId: string | null | undefined) {
  return linesFor(memory, outletId).map(m => ({
    id: `mem-${m.id}`, brandId: null, kind: 'note' as const, title: m.body.slice(0, 80), body: m.body,
    startsOn: null, endsOn: null, active: true, updatedByName: '', updatedAt: '',
  }))
}

/** A file's question instructions for the prompt: the file's own, then its folders' (the line above it). */
export function questionNotes(qs: FileQuestion[], refs: string[]): string[] {
  return qs.filter(q => refs.includes(q.ref) && q.instruction.trim()).map(q => `When asked "${q.question}": ${q.instruction.trim()}`)
}
