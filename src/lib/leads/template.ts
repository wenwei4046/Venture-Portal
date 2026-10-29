// Lead View › Reply templates and the Step library (2026-10-23, the redesign v2 handoff `Auto Reply.dc.html`;
// mig 20261023100010): a template's steps as the canvas draws them, the twin of lead_template_problem, the canvas's
// lines and "Tidy up", the Test-as-customer walk (twin of lead_flow_send / lead_flow_on_message), and copying to and
// from the library. Pure, tested in template.test.ts.

import { findPhone } from './phone'

export type StepKind = 'question' | 'text' | 'phone' | 'message' | 'handoff' | 'ai'
export type SaveAs = 'interest' | 'budget' | 'showroom' | 'preferredTime' | 'note'

export interface StepOption {
  label: string
  /** A step's id, or '' — End here. */
  next: string
  endMsg?: string
}

export interface TemplateStep {
  id: string
  kind: StepKind
  name?: string
  text: string
  buttons?: StepOption[]
  next?: string | null
  endMsg?: string
  saveAs?: SaveAs | null
  retryText?: string
  /** '1'…'5'; null = no limit. */
  retryMax?: string | null
  /** 'person' | '' (end) | a step's id. */
  failNext?: string | null
  pos?: { x: number; y: number }
  lib?: { id: string; ver: number }
}

export interface ReplyTemplate {
  id: string
  name: string
  description: string
  endMsg: string
  steps: TemplateStep[]
  brandId: string | null
  triggerKind: string
  triggerValue: string
  active: boolean
  updatedAt: string
}

export interface LibraryItem {
  id: string
  kind: 'step' | 'flow'
  name: string
  description: string
  ver: number
  steps: TemplateStep[]
  usedIn: Array<{ flowId: string; flowName: string; steps: string[]; outdated: number }>
  updatedByName?: string
  updatedAt?: string
}

export type Reply = 'cs' | 'ai' | string

export interface ReplyRules {
  ads: Array<{ id: string; adId: string; when: 'any' | 'open' | 'closed'; reply: Reply }>
  pages: Array<{ brandId: string; channel: 'messenger' | 'instagram'; work: Reply; after: Reply }>
}

/** The handoff's six step types: its words, its short tag, and its colour token (globals.css `--lv-k-*`). */
export const KINDS: ReadonlyArray<{ kind: StepKind; label: string; hint: string; short: string; tone: string }> = [
  { kind: 'question', label: 'Taps an option', hint: 'Up to 13 choices', short: 'Options', tone: '--lv-accent-text' },
  { kind: 'text', label: 'Types an answer', hint: 'Saved to the card', short: 'Text', tone: '--lv-k-text' },
  { kind: 'phone', label: 'Gives a phone', hint: 'Fills the Phone card', short: 'Phone', tone: '--lv-green' },
  { kind: 'message', label: 'Send a message', hint: 'No reply needed · then ends here, or goes on to another step', short: 'Message', tone: '--lv-k-msg' },
  { kind: 'handoff', label: 'Goes to a person', hint: 'Waits in the Inbox · can still send a message', short: 'Person', tone: '--lv-ink' },
  { kind: 'ai', label: 'Goes to AI Agent', hint: 'AI drafts from here (copilot)', short: 'AI', tone: '--lv-k-ai' },
]
export const kindOf = (k: StepKind) => KINDS.find(x => x.kind === k) ?? KINDS[0]

export const SAVE_AS: ReadonlyArray<{ v: SaveAs; l: string }> = [
  { v: 'interest', l: 'Interest' }, { v: 'budget', l: 'Budget' }, { v: 'showroom', l: 'Showroom' }, { v: 'preferredTime', l: 'Date' }, { v: 'note', l: 'Note' },
]

export const RETRY_PHONE = 'Sorry, that doesn’t look like a phone number. Please reply with numbers only, for example 012-345 6789.'

/** What is wrong with these steps, or null. Twin of lead_template_problem. */
export function templateProblem(steps: TemplateStep[]): string | null {
  if (!Array.isArray(steps) || steps.length === 0) return 'A template needs at least one step.'
  if (steps.length > 40) return 'A template has 40 steps at most.'
  const ids: string[] = []
  for (const s of steps) {
    if (!s.id || !/^[a-z0-9_-]{1,20}$/.test(s.id)) return 'Every step needs an id.'
    if (ids.includes(s.id)) return `Two steps share the id ${s.id}.`
    ids.push(s.id)
  }
  for (const s of steps) {
    const n = s.name || `Step ${ids.indexOf(s.id) + 1}`
    if (!KINDS.some(k => k.kind === s.kind)) return 'A step is an option, an answer, a phone, a message, a person or the AI Agent.'
    if ((s.name ?? '').length > 40) return `${n}: a name is 40 characters at most.`
    if ((s.text ?? '').length > 1000 || (!['handoff', 'ai'].includes(s.kind) && !s.text?.trim())) return `${n} says nothing yet — write its message.`
    if ((s.endMsg ?? '').length > 1000 || (s.retryText ?? '').length > 1000) return `${n}: a message is 1,000 characters at most.`
    if (s.retryMax != null && !/^[1-5]$/.test(s.retryMax)) return `${n}: ask again 1 to 5 times, or without a limit.`
    if (s.failNext != null && !['', 'person'].includes(s.failNext) && !ids.includes(s.failNext)) return `${n}: still wrong goes to a person, the end or a step.`
    if (s.kind === 'question') {
      const b = s.buttons ?? []
      if (b.length === 0) return `${n} needs at least one option.`
      if (b.length > 13) return `${n}: Messenger shows 13 options at most.`
      for (const o of b) {
        if (!o.label.trim() || o.label.length > OPTION_MAX) return `${n}: an option says 1 to ${OPTION_MAX} characters.`
        if (o.next !== '' && !ids.includes(o.next)) return `${n}: every option goes to a step, or ends.`
      }
    } else if (s.next && !ids.includes(s.next)) return `${n} goes to a step that is not there.`
  }
  return null
}

export interface StepRow {
  /** The option's index, or -1 for a step's one way on. */
  i: number
  label: string
  next: string
}

/** A card's rows: each option, or one line saying what the customer does, with where it goes. */
export function rowsOf(s: TemplateStep): StepRow[] {
  if (s.kind === 'question') return (s.buttons ?? []).map((b, i) => ({ i, label: b.label, next: b.next }))
  if (s.kind === 'handoff' || s.kind === 'ai') return []
  const label = s.kind === 'text' ? 'Types an answer…' : s.kind === 'phone' ? 'Gives a phone number' : 'Moves on, no reply'
  return [{ i: -1, label, next: s.next ?? '' }]
}

export const CARD_W = 230
const COL_GAP = 70
const ROW_GAP = 30

/** How many lines words take in a column about this many characters wide (each line of the text, wrapped). */
function wrapped(text: string, perLine: number): number {
  return Math.max(1, text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil([...l].length / perLine)), 0))
}

/**
 * A card's height on the canvas, roughly as drawn: head, the whole message, every option wrapped — the card grows with
 * its words (2026-10-29 — the user: "mind map 图，如果文字太多，它随之变大"). Tidy up spaces the cards by it.
 */
export function cardHeight(s: TemplateStep): number {
  const lines = s.text?.trim() ? wrapped(s.text.trim(), 32) : 1
  const rows = rowsOf(s)
  const rowsH = rows.length ? rows.reduce((h, r) => h + Math.max(22, 6 + wrapped(r.label || '—', 24) * 16) + 4, 0) : 26
  return 36 + lines * 17 + 14 + rowsH + 12
}

/** A list with one item moved from one place to another (an option dragged by its grip). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** "Tidy up": each step in the column of its first path from the start, top to bottom in the order they are reached. */
export function tidy(steps: TemplateStep[]): TemplateStep[] {
  if (steps.length === 0) return steps
  const col = new Map<string, number>()
  const order: string[] = []
  const queue = [steps[0].id]
  col.set(steps[0].id, 0)
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    const s = steps.find(x => x.id === id)
    if (!s) continue
    const outs = [...rowsOf(s).map(r => r.next), s.kind === 'phone' && s.failNext && s.failNext !== 'person' ? s.failNext : '']
    for (const n of outs) if (n && !col.has(n) && steps.some(x => x.id === n)) { col.set(n, col.get(id)! + 1); queue.push(n) }
  }
  let last = Math.max(0, ...col.values())
  for (const s of steps) if (!col.has(s.id)) { col.set(s.id, ++last); order.push(s.id) }
  const y = new Map<number, number>()
  const pos = new Map<string, { x: number; y: number }>()
  for (const id of order) {
    const s = steps.find(x => x.id === id)!
    const c = col.get(id)!
    const top = y.get(c) ?? 0
    pos.set(id, { x: 40 + c * (CARD_W + COL_GAP), y: 40 + top })
    y.set(c, top + cardHeight(s) + ROW_GAP)
  }
  return steps.map(s => ({ ...s, pos: pos.get(s.id) }))
}

/** Every step placed: those without a place are tidied in with the rest. */
export function placed(steps: TemplateStep[]): TemplateStep[] {
  return steps.every(s => s.pos) ? steps : tidy(steps)
}

/** A fresh id not yet in the template. */
export function freshId(steps: Array<Pick<TemplateStep, 'id'>>): string {
  for (let n = steps.length + 1; ; n++) if (!steps.some(s => s.id === `s${n}`)) return `s${n}`
}

/** A new step as "+" on an End row makes it: a message named after the option, placed right of the card. */
export function stepAfter(steps: TemplateStep[], from: TemplateStep, label: string): TemplateStep {
  const p = from.pos ?? { x: 40, y: 40 }
  return { id: freshId(steps), kind: 'message', name: label.slice(0, 40), text: '', next: '', pos: { x: p.x + CARD_W + COL_GAP, y: p.y } }
}

// ── Test as customer (twin of the runner) ──

const CN: Readonly<Record<string, string>> = { 零: '0', 〇: '0', 一: '1', 幺: '1', 二: '2', 两: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9' }
/** Full-width digits and Chinese numerals as digits, so 〇一二三四五六七八九 and ０１２ read as a number. */
export function normDigits(v: string): string {
  return v.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[零〇一幺二两三四五六七八九]/g, c => CN[c] ?? c)
}

export interface Said { from: 'bot' | 'customer' | 'system'; text: string; buttons?: string[] }

export interface Walk {
  said: Said[]
  /** The step waiting on the customer, or null when it ended. */
  waiting: string | null
  tries: number
  ended: 'done' | 'person' | 'ai' | 'stopped' | null
}

function endWith(t: { endMsg: string }, own: string | undefined, said: Said[]) {
  const msg = own?.trim() || t.endMsg.trim()
  if (msg) said.push({ from: 'bot', text: msg })
  said.push({ from: 'system', text: own?.trim() ? 'End · closing message (step)' : msg ? 'End · closing message (template)' : 'End' })
}

/** Send from a step on. Twin of lead_flow_send. */
export function walkFrom(t: Pick<ReplyTemplate, 'steps' | 'endMsg'>, from: string, before: Said[] = []): Walk {
  const said = [...before]
  let at: string | null | undefined = from
  for (let hops = 0; hops < 40; hops++) {
    const s = t.steps.find(x => x.id === at)
    if (!s) return { said, waiting: null, tries: 0, ended: 'done' }
    if (s.text?.trim()) said.push({ from: 'bot', text: s.text, buttons: s.kind === 'question' ? (s.buttons ?? []).map(b => b.label) : undefined })
    if (s.kind === 'question' || s.kind === 'phone' || s.kind === 'text') return { said, waiting: s.id, tries: 0, ended: null }
    if (s.kind === 'handoff' || s.kind === 'ai') {
      said.push({ from: 'system', text: s.kind === 'ai' ? 'Goes to the AI Agent · waits for CS with a draft' : 'Goes to a person · waits in the Inbox' })
      return { said, waiting: null, tries: 0, ended: s.kind === 'ai' ? 'ai' : 'person' }
    }
    if (!s.next) { endWith(t, s.endMsg, said); return { said, waiting: null, tries: 0, ended: 'done' } }
    at = s.next
  }
  return { said, waiting: null, tries: 0, ended: 'done' }
}

/** The customer answered. Twin of lead_flow_on_message. */
export function walkAnswer(t: Pick<ReplyTemplate, 'steps' | 'endMsg'>, w: Walk, answer: string): Walk {
  const said: Said[] = [...w.said, { from: 'customer', text: answer }]
  const s = t.steps.find(x => x.id === w.waiting)
  if (!s) return { said, waiting: null, tries: 0, ended: 'stopped' }
  let next: string | null = null
  let end: string | undefined
  if (s.kind === 'question') {
    const o = s.buttons?.find(b => b.label.trim().toLowerCase() === answer.trim().toLowerCase())
    if (o) { next = o.next; end = o.endMsg }
  } else if (s.kind === 'text') {
    next = s.next ?? ''
    end = s.endMsg
    if (s.saveAs) said.push({ from: 'system', text: `Saved to ${SAVE_AS.find(x => x.v === s.saveAs)?.l ?? s.saveAs}` })
  } else if (s.kind === 'phone') {
    const phone = findPhone(normDigits(answer))
    if (phone) { next = s.next ?? ''; end = s.endMsg; said.push({ from: 'system', text: 'Phone saved to the card' }) }
    else if (s.retryText?.trim()) {
      if (s.retryMax == null || w.tries < Number(s.retryMax)) {
        said.push({ from: 'bot', text: s.retryText })
        return { said, waiting: s.id, tries: w.tries + 1, ended: null }
      }
      if ((s.failNext ?? 'person') === 'person') { said.push({ from: 'system', text: 'Still not a phone · goes to a person' }); return { said, waiting: null, tries: 0, ended: 'person' } }
      next = s.failNext ?? ''
    }
  }
  if (next === null) { said.push({ from: 'system', text: 'Typed their own answer · the template stops for CS' }); return { said, waiting: null, tries: 0, ended: 'stopped' } }
  if (next === '') { endWith(t, end, said); return { said, waiting: null, tries: 0, ended: 'done' } }
  return walkFrom(t, next, said)
}

// ── The library ──

/** What "Save to library" keeps of a step — or, with the steps after it, the chain it starts — as the library's own s1, s2 … */
export function toLibrary(steps: TemplateStep[], from: string, withAfter: boolean): TemplateStep[] {
  const chain: TemplateStep[] = []
  const seen = new Set<string>()
  const walk = (id: string) => {
    if (seen.has(id) || chain.length >= 40) return
    const s = steps.find(x => x.id === id)
    if (!s) return
    seen.add(id)
    chain.push(s)
    if (withAfter) for (const r of rowsOf(s)) if (r.next) walk(r.next)
  }
  walk(from)
  const ids = new Map(chain.map((s, i) => [s.id, `s${i + 1}`]))
  const to = (n: string | null | undefined) => (n && ids.has(n) ? ids.get(n)! : '')
  return chain.map(s => {
    const rest: TemplateStep = { ...s }
    delete rest.pos
    delete rest.lib
    return {
      ...rest,
      id: ids.get(s.id)!,
      ...(s.kind === 'question' ? { buttons: (s.buttons ?? []).map(b => ({ ...b, next: to(b.next) })) } : { next: to(s.next) }),
      ...(s.failNext && s.failNext !== 'person' ? { failNext: to(s.failNext) } : {}),
    }
  })
}

/** An item's steps copied into a template: fresh ids, linked to the item, placed from `at` down. */
export function fromLibrary(steps: TemplateStep[], item: Pick<LibraryItem, 'id' | 'ver' | 'steps'>, at: { x: number; y: number }): TemplateStep[] {
  const taken: Array<Pick<TemplateStep, 'id'>> = [...steps]
  const ids = new Map<string, string>()
  for (const s of item.steps) { const id = freshId(taken); ids.set(s.id, id); taken.push({ id }) }
  const to = (n: string | null | undefined) => (n && ids.has(n) ? ids.get(n)! : '')
  let y = at.y
  return item.steps.map(s => {
    const copy: TemplateStep = {
      ...s,
      id: ids.get(s.id)!,
      ...(s.kind === 'question' ? { buttons: (s.buttons ?? []).map(b => ({ ...b, next: to(b.next) })) } : { next: to(s.next) }),
      ...(s.failNext && s.failNext !== 'person' ? { failNext: to(s.failNext) } : {}),
      pos: { x: at.x, y },
      lib: { id: item.id, ver: item.ver },
    }
    y += cardHeight(copy) + ROW_GAP
    return copy
  })
}

/** A linked step brought up to the library's version: its words and type, its place and its ways on kept. */
export function updateFromLibrary(step: TemplateStep, item: Pick<LibraryItem, 'id' | 'ver' | 'steps'>): TemplateStep {
  const src = item.steps[0]
  if (!src) return step
  const buttons = src.kind === 'question'
    ? (src.buttons ?? []).map((b, i) => ({ ...b, next: step.buttons?.[i]?.next ?? '' }))
    : undefined
  return { ...step, kind: src.kind, name: src.name, text: src.text, buttons, endMsg: src.endMsg, saveAs: src.saveAs, retryText: src.retryText, retryMax: src.retryMax, lib: { id: item.id, ver: item.ver } }
}

/** "Runs on …": where the reply rules start a template, in words. */
export function runsOn(templateId: string, rules: ReplyRules, brandName: (id: string) => string, adName: (id: string) => string): string {
  const where: string[] = []
  for (const p of rules.pages) {
    const ch = p.channel === 'instagram' ? 'Instagram' : 'Messenger'
    if (p.work === templateId && p.after === templateId) where.push(`${brandName(p.brandId)} ${ch}`)
    else if (p.work === templateId) where.push(`${brandName(p.brandId)} ${ch} · working hours`)
    else if (p.after === templateId) where.push(`${brandName(p.brandId)} ${ch} · after hours`)
  }
  for (const a of rules.ads) if (a.reply === templateId) where.push(`ad “${adName(a.adId)}”${a.when === 'open' ? ' · working hours' : a.when === 'closed' ? ' · after hours' : ''}`)
  return where.length ? `Runs on ${where.join(', ')}` : 'Not used by any reply rule yet'
}

/** Reply templates' right panel (Edit step / Test as customer): its width, dragged by its left edge (2026-10-28). */
/**
 * An option's words, at most (mig 20261029100010 — the user: "button 不要限制字数"). Messenger's button shows 20 of them;
 * a longer option is written in full in the message too (lib/leads/messenger.ts `messageOf`).
 */
export const OPTION_MAX = 200

export const SIDE_W = { start: 360, min: 300, max: 720 }
export function clampSide(w: number): number {
  return Number.isFinite(w) ? Math.round(Math.min(SIDE_W.max, Math.max(SIDE_W.min, w))) : SIDE_W.start
}
