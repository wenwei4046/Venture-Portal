// Lead View › Flows (2026-10-16, phase 2): a flow's steps and how they run.
//
// The database runs flows (lead_flow_on_message / lead_flow_send, mig 20261016310000) and checks what is saved
// (lead_flow_problem); this is their twin — the editor says what is wrong before saving, and the editor's
// try-it phone walks a flow the same way a customer would. The tests hold both to the same rules.

import { findPhone } from './phone'

export type FlowStepKind = 'question' | 'message' | 'phone' | 'handoff'
export type FlowTrigger = 'ad' | 'keyword' | 'first' | 'away'

export interface FlowButton {
  label: string
  next: string
}

export interface FlowStep {
  id: string
  kind: FlowStepKind
  text: string
  buttons?: FlowButton[]
  next?: string | null
  /** A question's tapped answer goes into the customer card (mig 20261016320000). */
  saveAs?: 'interest' | 'budget' | 'showroom' | 'preferredTime' | null
}

export interface LeadFlow {
  id: string
  brandId: string | null
  name: string
  triggerKind: FlowTrigger
  triggerValue: string
  active: boolean
  steps: FlowStep[]
  /** Automations (mig 20261016320000): its category, the template it was made from, and that template's form. */
  categoryId?: string | null
  template?: 'faq' | 'welcome' | 'away' | 'keyword' | 'ad' | 'custom'
  config?: Record<string, unknown>
  sortOrder: number
  updatedAt: string
  /** Conversations it started in the last seven days, and how many of them left a phone. */
  started: number
  phones: number
}

export const STEP_KIND_LABEL: Readonly<Record<FlowStepKind, string>> = {
  question: 'Question + buttons · 问题',
  message: 'Message · 发消息',
  phone: 'Ask for phone · 问电话',
  handoff: 'Hand to CS · 交给客服',
}

export const TRIGGER_LABEL: Readonly<Record<FlowTrigger, string>> = {
  ad: 'From an ad · 从广告进来',
  keyword: 'Keyword · 关键词',
  first: 'Any first message · 第一则消息',
  away: 'Outside opening hours · 下班时间',
}

/** What is wrong with these steps, or null. Twin of lead_flow_problem. */
export function flowProblem(steps: FlowStep[]): string | null {
  if (!Array.isArray(steps) || steps.length === 0) return 'A flow needs at least one step.'
  if (steps.length > 30) return 'A flow has 30 steps at most.'
  const ids: string[] = []
  for (const s of steps) {
    if (!s.id || !/^[a-z0-9_-]{1,20}$/.test(s.id)) return 'Every step needs an id.'
    if (ids.includes(s.id)) return `Two steps share the id ${s.id}.`
    ids.push(s.id)
  }
  for (const s of steps) {
    if (!['question', 'message', 'phone', 'handoff'].includes(s.kind)) return 'A step is a question, a message, a phone question or a hand-over.'
    if (!s.text?.trim() || s.text.length > 1000) return 'Every step says something (1,000 characters at most).'
    if (s.saveAs != null && !['interest', 'budget', 'showroom', 'preferredTime'].includes(s.saveAs)) return 'An answer is kept as interest, budget, showroom or time.'
    if (s.kind === 'question') {
      const buttons = s.buttons ?? []
      if (buttons.length === 0) return 'A question needs at least one button.'
      if (buttons.length > 13) return 'Messenger shows 13 buttons at most.'
      for (const b of buttons) {
        if (!b.label?.trim() || b.label.length > 20) return 'A button says 1 to 20 characters.'
        if (!b.next || !ids.includes(b.next)) return 'Every button leads to a step of this flow.'
      }
    } else if (s.next != null && !ids.includes(s.next)) {
      return 'A step leads to a step of this flow.'
    }
  }
  return null
}

export interface FlowSent {
  text: string
  buttons: string[] | null
}

export type FlowEnd = 'waiting' | 'done' | 'handoff'

/** Send a step and the message steps after it: what the customer sees, and where it stops. Twin of lead_flow_send. */
export function sendFrom(steps: FlowStep[], from: string): { sent: FlowSent[]; waiting: string | null; end: FlowEnd } {
  const sent: FlowSent[] = []
  let at: string | null | undefined = from
  for (let hops = 0; hops < 30; hops++) {
    const s = steps.find(x => x.id === at)
    if (!s) return { sent, waiting: null, end: 'done' }
    sent.push({ text: s.text, buttons: s.kind === 'question' ? (s.buttons ?? []).map(b => b.label) : null })
    if (s.kind === 'question' || s.kind === 'phone') return { sent, waiting: s.id, end: 'waiting' }
    if (s.kind === 'handoff') return { sent, waiting: null, end: 'handoff' }
    if (!s.next) return { sent, waiting: null, end: 'done' }
    at = s.next
  }
  return { sent, waiting: null, end: 'done' }
}

/**
 * The customer answered the step they were waiting on: the step it leads to, '' (the flow is done), or null
 * (they typed something else — the flow stops for Customer Service). Twin of lead_flow_on_message.
 */
export function answerStep(steps: FlowStep[], waiting: string, answer: string): string | null {
  const s = steps.find(x => x.id === waiting)
  if (!s) return null
  if (s.kind === 'question') {
    const want = answer.trim().toLowerCase()
    return s.buttons?.find(b => b.label.trim().toLowerCase() === want)?.next ?? null
  }
  if (s.kind === 'phone') return findPhone(answer) ? s.next ?? '' : null
  return null
}

/** A fresh step id not yet in the flow. */
export function newStepId(steps: FlowStep[]): string {
  for (let n = steps.length + 1; ; n++) {
    const id = `s${n}`
    if (!steps.some(s => s.id === id)) return id
  }
}

/** A starter flow: a welcome question, its answer, the phone, and the hand-over. */
export function starterSteps(): FlowStep[] {
  return [
    { id: 's1', kind: 'question', text: 'Hi! Thanks for your message 🙌 What are you looking for?', buttons: [{ label: 'Sofa', next: 's2' }, { label: 'Mattress', next: 's2' }, { label: 'Other', next: 's4' }] },
    { id: 's2', kind: 'message', text: 'Great! Here are our most popular picks 👇', next: 's3' },
    { id: 's3', kind: 'phone', text: "Want to see it in person? Leave your phone and we'll book you a time 😊", next: 's4' },
    { id: 's4', kind: 'handoff', text: "Got it — we'll call you soon 🙏" },
  ]
}

// ── The editor's tree (2026-10-16, the user: "flow 更像系統要我怎麼做，但我不能編輯和編排") ─────────────────────
// The steps are drawn as a tree from the first step: each button's reply sits under the button, each message's
// next step under the message. A step reached from two places is drawn once, where it is first reached, and is a
// "go to" link everywhere else.

/** Where a button or a message leads: `${stepId}:b${i}` for a button, `${stepId}:next` for a message / phone. */
export type FlowSlot = string

/** Each reachable step's place, in the order a customer could meet them (depth first from the first step). */
export function flowHomes(steps: FlowStep[]): { order: string[]; home: Map<string, FlowSlot | 'root'> } {
  const order: string[] = []
  const home = new Map<string, FlowSlot | 'root'>()
  const visit = (id: string | null | undefined, slot: FlowSlot | 'root') => {
    if (!id || home.has(id)) return
    const st = steps.find(x => x.id === id)
    if (!st) return
    home.set(id, slot)
    order.push(id)
    if (st.kind === 'question') (st.buttons ?? []).forEach((b, i) => visit(b.next, `${id}:b${i}`))
    else if (st.kind !== 'handoff') visit(st.next, `${id}:next`)
  }
  visit(steps[0]?.id, 'root')
  return { order, home }
}

/** Steps nothing leads to (left over after an edit). */
export function strayStepIds(steps: FlowStep[]): string[] {
  const { home } = flowHomes(steps)
  return steps.filter(x => !home.has(x.id)).map(x => x.id)
}

/**
 * Take a step away with everything that only it led to. What pointed at a removed step is left unset — a
 * button with no reply yet (`next: ''`, which flowProblem asks to fill), a message that then ends.
 */
export function removeBranch(steps: FlowStep[], id: string): FlowStep[] {
  if (steps[0]?.id === id) return steps
  const before = new Set(flowHomes(steps).home.keys())
  const cleared = clearRefs(steps.filter(x => x.id !== id), new Set([id]))
  const after = new Set(flowHomes(cleared).home.keys())
  const gone = new Set([...before].filter(x => x !== id && !after.has(x)))
  return clearRefs(cleared.filter(x => !gone.has(x.id)), gone)
}

function clearRefs(steps: FlowStep[], gone: Set<string>): FlowStep[] {
  return steps.map(x => ({
    ...x,
    buttons: x.buttons?.map(b => (gone.has(b.next) ? { ...b, next: '' } : b)),
    next: x.next && gone.has(x.next) ? null : x.next,
  }))
}
