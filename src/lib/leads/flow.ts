// Lead View › Flows (2026-10-16, phase 2): a flow's steps and how they run.
//
// The database runs flows (lead_flow_on_message / lead_flow_send, mig 20261016310000) and checks what is saved
// (lead_flow_problem); this is their twin — the editor says what is wrong before saving, and the editor's
// try-it phone walks a flow the same way a customer would. The tests hold both to the same rules.

import { findPhone } from './phone'

export type FlowStepKind = 'question' | 'message' | 'phone' | 'handoff'
export type FlowTrigger = 'ad' | 'keyword' | 'first'

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
}

export interface LeadFlow {
  id: string
  brandId: string | null
  name: string
  triggerKind: FlowTrigger
  triggerValue: string
  active: boolean
  steps: FlowStep[]
  sortOrder: number
  updatedAt: string
  /** Conversations it started in the last seven days, and how many of them left a phone. */
  started: number
  phones: number
}

export const STEP_KIND_LABEL: Readonly<Record<FlowStepKind, string>> = {
  question: '問題 + 按鈕 Question',
  message: '發一段訊息 Message',
  phone: '問電話 Ask phone',
  handoff: '交給客服 Hand to CS',
}

export const TRIGGER_LABEL: Readonly<Record<FlowTrigger, string>> = {
  ad: '從廣告進來 From an ad',
  keyword: '訊息有關鍵字 Keyword',
  first: '任何第一則訊息 Any first message',
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
    { id: 's1', kind: 'question', text: 'Hi！謝謝你的訊息 🙌 你想看哪一種？', buttons: [{ label: '沙發', next: 's2' }, { label: '床褥', next: 's2' }, { label: '其他', next: 's4' }] },
    { id: 's2', kind: 'message', text: '好的！這是我們最受歡迎的款式 👇', next: 's3' },
    { id: 's3', kind: 'phone', text: '想親自來看看嗎？留個電話，我請門市同事幫你安排時間 😊', next: 's4' },
    { id: 's4', kind: 'handoff', text: '收到！同事會盡快聯絡你 🙏' },
  ]
}
