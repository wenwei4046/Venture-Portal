// Lead View v2 › Reply templates' List and Flow map, the Step library's types (2026-11-02, the v2 handoff
// `docs/design_handoff_lead_view_v2` §7.6–7.7, its reference `Lead View App.dc.html` — STYPE, TCOL, tmRows, nodeH,
// buildNodes and the edges' curve). Pure, tested in template-map.test.ts.

import type { StepKind, TemplateStep } from './template'
import type { LeadIconName } from '@/components/layout/lead-icons'

/** The reference's six step types, in its order, by the runner's kinds: its words, its glyph, its tile's colours. */
export const STEP_TYPES: ReadonlyArray<{ kind: StepKind; label: string; icon: LeadIconName; tint: string; fg: string }> = [
  { kind: 'question', label: 'Buttons', icon: 'list', tint: '--lv-accent-tint', fg: '--lv-accent' },
  { kind: 'text', label: 'Types an answer', icon: 'text-cursor-input', tint: '--lv-page', fg: '--lv-fg-2' },
  { kind: 'phone', label: 'Gives a phone', icon: 'phone', tint: '--lv-phone-tint', fg: '--lv-pos' },
  { kind: 'message', label: 'Send a file', icon: 'paperclip', tint: '--lv-page', fg: '--lv-fg-2' },
  { kind: 'handoff', label: 'Hand to a person', icon: 'headset', tint: '--lv-sel', fg: '--lv-fg-2' },
  { kind: 'ai', label: 'AI Agent', icon: 'sparkles', tint: '--lv-ai-tint', fg: '--lv-accent' },
]
export const typeOf = (k: StepKind) => STEP_TYPES.find(t => t.kind === k) ?? STEP_TYPES[0]

/** A step's rows on the map and in the editor (tmRows): a Buttons step's options; none for a person or the AI; else Then. */
export interface MapRow { slot: number | 'next'; label: string; to: string; edit: boolean }
export function mapRows(s: TemplateStep): MapRow[] {
  if (s.kind === 'question') return (s.buttons ?? []).map((b, i) => ({ slot: i, label: b.label, to: b.next ?? '', edit: true }))
  if (s.kind === 'handoff' || s.kind === 'ai') return []
  return [{ slot: 'next', label: 'Then', to: s.next ?? '', edit: false }]
}

/** The reference's node: 240 wide; a 40px head, a 62px message, 30px rows, a Buttons step's "Add button" row. */
export const NODE = { w: 240, head: 40, text: 62, row: 30, colStep: 320, gap: 40, start: 40 } as const
export function nodeHeight(s: TemplateStep): number {
  return 2 + NODE.head + NODE.text + mapRows(s).length * NODE.row + (s.kind === 'question' ? NODE.row : 0) + 6
}

/**
 * buildNodes: straight columns, no crossing lines — a step's column is its longest way from the first step, and each
 * column stacks its steps 40px apart from the top. A step nothing reaches sits in the first column.
 */
export function layoutColumns(steps: TemplateStep[]): Record<string, { x: number; y: number }> {
  const depth: Record<string, number> = {}
  if (steps[0]) depth[steps[0].id] = 0
  for (let k = 0; k < steps.length; k++) {
    for (const s of steps) {
      if (depth[s.id] === undefined) continue
      for (const r of mapRows(s)) if (r.to && steps.some(x => x.id === r.to)) depth[r.to] = Math.max(depth[r.to] ?? -1, depth[s.id] + 1)
    }
  }
  const colY: Record<number, number> = {}
  const out: Record<string, { x: number; y: number }> = {}
  for (const s of steps) {
    const c = Math.min(depth[s.id] ?? 0, steps.length)
    const y = colY[c] ?? NODE.start
    out[s.id] = { x: NODE.start + c * NODE.colStep, y }
    colY[c] = y + nodeHeight(s) + NODE.gap
  }
  return out
}

/** Whether the steps' kept places can be drawn as they are: every step placed, no two nodes overlapping. */
export function placesHold(steps: TemplateStep[]): boolean {
  if (!steps.every(s => s.pos)) return false
  return steps.every((a, i) => steps.slice(i + 1).every(b => {
    const ax = a.pos!.x, ay = a.pos!.y, bx = b.pos!.x, by = b.pos!.y
    return ax + NODE.w <= bx || bx + NODE.w <= ax || ay + nodeHeight(a) <= by || by + nodeHeight(b) <= ay
  }))
}

/** The steps placed for the map: their kept places when those hold, else laid out in columns. */
export function mapPlaced(steps: TemplateStep[]): TemplateStep[] {
  if (placesHold(steps)) return steps
  const at = layoutColumns(steps)
  return steps.map(s => ({ ...s, pos: at[s.id] }))
}

/**
 * Every step with a place, the kept ones untouched (2026-11-03 — a new template's Welcome had none, and Flow map read
 * `pos.x` of nothing: "This page didn't load"). A step without one goes under everything drawn, in the first column.
 */
export function placeMissing(steps: TemplateStep[]): TemplateStep[] {
  if (steps.every(s => s.pos)) return steps
  let y = Math.max(NODE.start - NODE.gap, ...steps.filter(s => s.pos).map(s => s.pos!.y + nodeHeight(s))) + NODE.gap
  return steps.map(s => {
    if (s.pos) return s
    const at = { x: NODE.start, y }
    y += nodeHeight(s) + NODE.gap
    return { ...s, pos: at }
  })
}

/** Where a row's line leaves its node (its right edge, the row's middle) and where it reaches a node (its left, 20 down). */
export const rowPort = (s: TemplateStep, i: number) => ({ x: s.pos!.x + NODE.w, y: s.pos!.y + 1 + NODE.head + NODE.text + i * NODE.row + NODE.row / 2 })
export const inPort = (s: TemplateStep) => ({ x: s.pos!.x - 1, y: s.pos!.y + 20 })

/** The reference's line: out 28px, down or up, in — corners rounded 8px; around the back when the target is behind. */
export function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const tx = x1 + 28
  const pts: Array<[number, number]> = x2 - 20 >= tx
    ? [[x1, y1], [tx, y1], [tx, y2], [x2, y2]]
    : (() => { const my = (y1 + y2) / 2, bx = x2 - 20; return [[x1, y1], [tx, y1], [tx, my], [bx, my], [bx, y2], [x2, y2]] as Array<[number, number]> })()
  const P = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1])
  let d = `M${P[0][0]},${P[0][1]}`
  for (let i = 1; i < P.length - 1; i++) {
    const [ax, ay] = P[i - 1], [bx, by] = P[i], [cx, cy] = P[i + 1]
    const r = Math.min(8, Math.abs(bx - ax || by - ay) / 2, Math.abs(cx - bx || cy - by) / 2)
    const ux = Math.sign(bx - ax), uy = Math.sign(by - ay), vx = Math.sign(cx - bx), vy = Math.sign(cy - by)
    d += ` L${bx - ux * r},${by - uy * r} Q${bx},${by} ${bx + vx * r},${by + vy * r}`
  }
  return `${d} L${P[P.length - 1][0]},${P[P.length - 1][1]}`
}

/** The file's short type, as the reference's tile writes it ("PDF", "XLSX"). */
export const extOf = (name: string) => (name.split('.').pop() ?? '').toUpperCase().slice(0, 4)
export const isImage = (mime: string) => mime.startsWith('image/')
export const sizeLabel = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)
/** What the attach input takes: the reference's list. */
export const ATTACH_ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx'
