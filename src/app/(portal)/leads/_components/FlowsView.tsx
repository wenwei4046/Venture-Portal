'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { btn } from '@/components/hrv/kit'
import {
  STEP_KIND_LABEL,
  answerStep,
  flowHomes,
  newStepId,
  removeBranch,
  sendFrom,
  strayStepIds,
  type FlowSlot,
  type FlowStep,
  type FlowStepKind,
} from '@/lib/leads/flow'
import s from './lead.module.css'

/**
 * Lead View › Automations' step editor (2026-10-16): "Start from scratch" builds a conversation as a tree — each
 * button's reply under it — and the phone that runs any automation's steps. The switch every card wears.
 */

export function Switch({ on, disabled, label, onClick }: { on: boolean; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick}
      style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 0, padding: 4, cursor: disabled ? 'default' : 'pointer', font: 'inherit', fontSize: 12, color: on ? 'rgb(var(--hv-ledger))' : 'rgb(var(--hv-note))' }}>
      <span aria-hidden="true" style={{ position: 'relative', width: 34, height: 20, borderRadius: 99, background: on ? 'rgb(var(--hv-ledger))' : 'rgb(var(--hv-frame))', transition: 'background .15s' }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: 99, background: 'rgb(255 255 255)', transition: 'left .15s', boxShadow: '0 1px 2px rgb(0 0 0 / .2)' }} />
      </span>
      {on ? 'On' : 'Off'}
    </button>
  )
}

// ── The tree ────────────────────────────────────────────────────────────────

export function FlowTree({ steps, canManage, onChange }: { steps: FlowStep[]; canManage: boolean; onChange: (steps: FlowStep[]) => void }) {
  const { order, home } = useMemo(() => flowHomes(steps), [steps])
  const stray = useMemo(() => strayStepIds(steps), [steps])
  const num = (id: string) => order.indexOf(id) + 1
  const update = (id: string, next: Partial<FlowStep>) => onChange(steps.map(x => (x.id === id ? { ...x, ...next } : x)))
  const ctx: TreeCtx = { steps, home, num, canManage, update, onChange }
  return (
    <section aria-label="Steps" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span className={s.label}>The conversation</span>
      {steps[0] ? <StepNode id={steps[0].id} ctx={ctx} /> : null}
      {stray.length ? (
        <div className={s.panel} style={{ gap: 8 }}>
          <span className={s.hint}>Steps nothing leads to (never sent)</span>
          {stray.map(id => (
            <div key={id} className={s.inline} style={{ alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{steps.find(x => x.id === id)?.text || '(empty)'}</span>
              {canManage ? <button type="button" className={btn('outline')} onClick={() => onChange(steps.filter(x => x.id !== id))}>Delete</button> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

interface TreeCtx {
  steps: FlowStep[]
  home: Map<string, FlowSlot | 'root'>
  num: (id: string) => number
  canManage: boolean
  update: (id: string, next: Partial<FlowStep>) => void
  onChange: (steps: FlowStep[]) => void
}

const KIND_TONE: Readonly<Record<FlowStepKind, string>> = { question: 'clay', message: 'blue', phone: 'olive', handoff: 'plum' }

/** One step, and under it what each of its buttons (or its "then") leads to. */
function StepNode({ id, ctx }: { id: string; ctx: TreeCtx }) {
  const st = ctx.steps.find(x => x.id === id)
  if (!st) return null
  const root = ctx.steps[0]?.id === id
  const setKind = (kind: FlowStepKind) =>
    ctx.update(id, kind === 'question'
      ? { kind, buttons: st.buttons?.length ? st.buttons : [{ label: '', next: '' }], next: null }
      : { kind, buttons: undefined, next: kind === 'handoff' ? null : st.next ?? null })
  return (
    <div className={s.panel} style={{ gap: 10 }}>
      <div className={s.panelHead} style={{ flexWrap: 'wrap' }}>
        <span className={s.brand} data-tone={KIND_TONE[st.kind]}>Step {ctx.num(id)}</span>
        <select className={s.select} value={st.kind} onChange={e => setKind(e.target.value as FlowStepKind)} disabled={!ctx.canManage} aria-label="What this step does">
          {(Object.keys(STEP_KIND_LABEL) as FlowStepKind[]).map(k => <option key={k} value={k}>{STEP_KIND_LABEL[k]}</option>)}
        </select>
        <span className={s.spacer} />
        {ctx.canManage && !root ? (
          <button type="button" className={btn('outline')} onClick={() => {
            if (window.confirm('Delete this step and what only it leads to?')) ctx.onChange(removeBranch(ctx.steps, id))
          }}>Delete step</button>
        ) : null}
      </div>
      <label className={s.field}>
        {st.kind === 'question' ? 'Ask' : st.kind === 'phone' ? 'Ask for the phone' : st.kind === 'handoff' ? 'Say, then hand to CS' : 'Reply'}
        <textarea value={st.text} onChange={e => ctx.update(id, { text: e.target.value })} maxLength={1000} disabled={!ctx.canManage}
          placeholder={st.kind === 'question' ? 'e.g. Which one are you looking for?' : 'What to say…'} />
      </label>

      {st.kind === 'question' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(st.buttons ?? []).map((b, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={s.flowButton} style={{ height: 'auto', padding: 0, border: 0 }}>
                  <input value={b.label} maxLength={20} disabled={!ctx.canManage} aria-label="Button text" placeholder="Button text"
                    onChange={e => ctx.update(id, { buttons: (st.buttons ?? []).map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                    style={{ height: 30, padding: '0 12px', borderRadius: 99, border: '1px solid rgb(var(--hv-blue))', color: 'rgb(var(--hv-blue))', font: 'inherit', fontSize: 13, minWidth: 0, width: 160 }} />
                </span>
                <span className={s.hint}>When tapped ↓</span>
                <span className={s.spacer} />
                {ctx.canManage && (st.buttons ?? []).length > 1 ? (
                  <button type="button" className={btn('outline')} aria-label="Remove button"
                    onClick={() => ctx.onChange(removeButton(ctx.steps, id, i))}>Remove</button>
                ) : null}
              </div>
              <Branch slot={`${id}:b${i}`} target={b.next} ctx={ctx} button
                onPoint={next => ctx.update(id, { buttons: (st.buttons ?? []).map((x, j) => (j === i ? { ...x, next } : x)) })} />
            </div>
          ))}
          {ctx.canManage && (st.buttons ?? []).length < 13 ? (
            <button type="button" className={btn('dashed')} style={{ alignSelf: 'flex-start' }}
              onClick={() => ctx.update(id, { buttons: [...(st.buttons ?? []), { label: '', next: '' }] })}>+ Add a button</button>
          ) : null}
        </div>
      ) : st.kind !== 'handoff' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className={s.hint}>{st.kind === 'phone' ? 'After the phone ↓' : 'Then ↓'}</span>
          <Branch slot={`${id}:next`} target={st.next ?? ''} ctx={ctx} onPoint={next => ctx.update(id, { next: next || null })} />
        </div>
      ) : (
        <span className={s.hint}>Ends here: the conversation shows as Waiting in the Inbox for Customer Service.</span>
      )}
    </div>
  )
}

/** Take a button away; a reply only it led to goes with it. */
function removeButton(steps: FlowStep[], id: string, i: number): FlowStep[] {
  const st = steps.find(x => x.id === id)
  const target = st?.buttons?.[i]?.next
  const without = steps.map(x => (x.id === id ? { ...x, buttons: (x.buttons ?? []).filter((_, j) => j !== i) } : x))
  if (!target || flowHomes(steps).home.get(target) !== `${id}:b${i}`) return without
  return removeBranch(without, target)
}

/** Where a button (or a message) leads: its own reply drawn here, a link to a step drawn elsewhere, or not set yet. */
function Branch({ slot, target, ctx, button = false, onPoint }: {
  slot: FlowSlot
  target: string
  ctx: TreeCtx
  button?: boolean
  onPoint: (next: string) => void
}) {
  const indent = (child: ReactNode) => (
    <div style={{ marginLeft: 18, paddingLeft: 14, borderLeft: '2px solid rgb(var(--hv-hairline))' }}>{child}</div>
  )
  const addNew = (kind: FlowStepKind) => {
    const id = newStepId(ctx.steps)
    const step: FlowStep = kind === 'question' ? { id, kind, text: '', buttons: [{ label: '', next: '' }] } : { id, kind, text: '', next: null }
    // Set the pointer and add the step in one change.
    const steps = ctx.steps.map(x => x)
    ctx.onChange(pointAt([...steps, step], slot, id))
  }
  const here = target && ctx.home.get(target) === slot
  if (here) return indent(<StepNode id={target} ctx={ctx} />)

  const others = ctx.steps.filter(x => ctx.home.has(x.id))
  const linked = target ? ctx.steps.find(x => x.id === target) : null
  return indent(
    <div className={s.inline} style={{ alignItems: 'center', padding: '6px 0' }}>
      {linked ? (
        <span className={s.hint}>→ Goes to step {ctx.num(linked.id)}: {Array.from(linked.text || '').slice(0, 18).join('')}</span>
      ) : (
        <span className={s.hint} style={{ color: button ? 'rgb(var(--hv-alert))' : undefined }}>{button ? 'No reply set yet' : 'Ends'}</span>
      )}
      {ctx.canManage ? (
        <>
          <span className={s.spacer} />
          <select className={s.select} value="" aria-label="New reply" onChange={e => { if (e.target.value) addNew(e.target.value as FlowStepKind) }}>
            <option value="">+ New reply…</option>
            {(Object.keys(STEP_KIND_LABEL) as FlowStepKind[]).map(k => <option key={k} value={k}>{STEP_KIND_LABEL[k]}</option>)}
          </select>
          <select className={s.select} value={linked ? linked.id : ''} aria-label="Go to a step" onChange={e => onPoint(e.target.value)}>
            <option value="">{button ? 'Go to a step…' : 'Ends'}</option>
            {others.map(x => <option key={x.id} value={x.id}>Step {ctx.num(x.id)}: {Array.from(x.text || '').slice(0, 14).join('') || STEP_KIND_LABEL[x.kind]}</option>)}
          </select>
        </>
      ) : null}
    </div>,
  )
}

/** Point a slot (`step:bN` / `step:next`) at a step. */
function pointAt(steps: FlowStep[], slot: FlowSlot, to: string): FlowStep[] {
  const [id, which] = slot.split(':')
  return steps.map(x => {
    if (x.id !== id) return x
    if (which === 'next') return { ...x, next: to }
    const i = Number(which.slice(1))
    return { ...x, buttons: (x.buttons ?? []).map((b, j) => (j === i ? { ...b, next: to } : b)) }
  })
}

// ── Try it ──────────────────────────────────────────────────────────────────

type Line = { who: 'flow' | 'me' | 'note'; text: string; buttons?: string[] | null }

/** The phone: runs the steps as the database would. Nothing is sent or saved. */
export function TryIt({ steps, ok }: { steps: FlowStep[]; ok: boolean }) {
  const first = useMemo(() => (ok && steps[0] ? sendFrom(steps, steps[0].id) : null), [steps, ok])
  const startLines = (): Line[] => (first ? first.sent.map(m => ({ who: 'flow', text: m.text, buttons: m.buttons })) : [])
  const [lines, setLines] = useState<Line[]>(startLines)
  const [waiting, setWaiting] = useState<string | null>(first?.waiting ?? null)
  const [typed, setTyped] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [lines.length])

  const restart = () => { setLines(startLines()); setWaiting(first?.waiting ?? null); setTyped('') }
  const say = (text: string) => {
    if (!waiting || !text.trim()) return
    const next = answerStep(steps, waiting, text)
    const out: Line[] = [{ who: 'me', text }]
    if (next === null) {
      out.push({ who: 'note', text: 'Stopped → Customer Service replies' })
      setWaiting(null)
    } else if (next === '') {
      out.push({ who: 'note', text: 'Done' })
      setWaiting(null)
    } else {
      const r = sendFrom(steps, next)
      out.push(...r.sent.map(m => ({ who: 'flow' as const, text: m.text, buttons: m.buttons })))
      if (r.end === 'handoff') out.push({ who: 'note', text: 'Handed to Customer Service → Waiting in the Inbox' })
      if (r.end === 'done') out.push({ who: 'note', text: 'Done' })
      setWaiting(r.waiting)
    }
    setLines(l => [...l, ...out])
    setTyped('')
  }
  const lastButtons = waiting ? [...lines].reverse().find(l => l.who === 'flow')?.buttons ?? null : null

  return (
    <section className={s.panel} aria-label="Try it">
      <div className={s.panelHead}>
        <span className={s.label}>Try it</span>
        <span className={s.spacer} />
        <button type="button" className={btn('outline')} onClick={restart}>Restart</button>
      </div>
      <span className={s.hint}>What the customer sees — tap or type; nothing is sent or saved.</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 18, border: '1px solid rgb(var(--hv-hairline))', background: 'rgb(var(--hv-zebra))', minHeight: 320, maxHeight: 520, overflowY: 'auto' }}>
        {!ok ? <span className={s.hint}>Finish the form to try it.</span> : null}
        {lines.map((l, i) => l.who === 'note' ? (
          <span key={i} className={s.hint} style={{ alignSelf: 'center', textAlign: 'center' }}>{l.text}</span>
        ) : l.who === 'me' ? (
          <div key={i} className={s.bubbleOut} style={{ alignSelf: 'flex-end', maxWidth: '80%' }}>{l.text}</div>
        ) : (
          <div key={i} className={s.bubbleIn} style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>{l.text}</div>
        ))}
        <div ref={end} />
      </div>
      {lastButtons?.length ? (
        <div className={s.tabs}>
          {lastButtons.map(b => <button key={b} type="button" className={btn('outline')} onClick={() => say(b)}>{b}</button>)}
        </div>
      ) : null}
      {waiting ? (
        <div className={s.inline}>
          <input className={s.search} style={{ flex: 1 }} value={typed} onChange={e => setTyped(e.target.value)} placeholder="Or type… (e.g. a phone number)"
            onKeyDown={e => { if (e.key === 'Enter') say(typed) }} aria-label="Type as the customer" />
          <button type="button" className={btn('outline')} onClick={() => say(typed)} disabled={!typed.trim()}>Send</button>
        </div>
      ) : null}
    </section>
  )
}
