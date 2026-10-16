'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { HvPage, PageHead, btn } from '@/components/hrv/kit'
import { removeLeadFlow, saveLeadFlow } from '@/lib/leads/actions'
import {
  STEP_KIND_LABEL,
  TRIGGER_LABEL,
  answerStep,
  flowHomes,
  flowProblem,
  newStepId,
  removeBranch,
  sendFrom,
  starterSteps,
  strayStepIds,
  type FlowSlot,
  type FlowStep,
  type FlowStepKind,
  type FlowTrigger,
  type LeadFlow,
} from '@/lib/leads/flow'
import type { LeadBrand } from '@/lib/leads/types'
import s from './lead.module.css'

/**
 * Lead View › Flows (2026-10-16, phase 2 — the design canvas's "Flows" board): the button flows. The list on the
 * left with each flow's on / off switch, the flow as a tree in the middle — under each button, what the customer
 * gets when they tap it (the user: "flow 更像系統要我怎麼做，但我不能編輯和編排"), and a phone on the right that
 * runs the flow being edited — tap its buttons as a customer would, nothing is sent or saved.
 */

type Draft = Omit<LeadFlow, 'id' | 'sortOrder' | 'updatedAt' | 'started' | 'phones'> & { id: string | null }

const blank = (): Draft => ({ id: null, brandId: null, name: '新 Flow', triggerKind: 'first', triggerValue: '', active: false, steps: starterSteps() })
const toDraft = (f: LeadFlow): Draft => ({ id: f.id, brandId: f.brandId, name: f.name, triggerKind: f.triggerKind, triggerValue: f.triggerValue, active: f.active, steps: f.steps })
const payload = (d: Draft) => ({ brandId: d.brandId, name: d.name, triggerKind: d.triggerKind, triggerValue: d.triggerValue, active: d.active, steps: d.steps })

export default function FlowsView({ flows, brands, canManage }: { flows: LeadFlow[]; brands: LeadBrand[]; canManage: boolean }) {
  const [picked, setPicked] = useState<string | null>(flows[0]?.id ?? null)
  const [draft, setDraft] = useState<Draft>(() => (flows[0] ? toDraft(flows[0]) : blank()))
  const [dirty, setDirty] = useState(false)
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const pick = (f: LeadFlow | null) => {
    if (dirty && !window.confirm('這個 Flow 還沒儲存，要放棄修改嗎？')) return
    setPicked(f?.id ?? null)
    setDraft(f ? toDraft(f) : blank())
    setDirty(false)
    setError(null)
    setSaved(false)
  }
  const edit = (next: Partial<Draft>) => { setDraft(d => ({ ...d, ...next })); setDirty(true); setSaved(false) }
  const setSteps = (steps: FlowStep[]) => edit({ steps })

  const problem = flowProblem(draft.steps)
  const save = () => start(async () => {
    setError(null)
    const r = await saveLeadFlow(draft.id, payload(draft))
    if (!r.ok) { setError(r.reason); return }
    setDraft(d => ({ ...d, id: r.data }))
    setPicked(r.data)
    setDirty(false)
    setSaved(true)
  })
  // The switch saves at once: on the list for any flow, above the editor for this one (with its other edits only if it is saved and unchanged).
  const toggle = (f: LeadFlow) => start(async () => {
    setError(null)
    const r = await saveLeadFlow(f.id, { ...payload(toDraft(f)), active: !f.active })
    if (!r.ok) { setError(r.reason); return }
    if (picked === f.id && !dirty) setDraft(d => ({ ...d, active: !f.active }))
  })
  const remove = () => {
    if (!draft.id || !window.confirm(`刪除「${draft.name}」？正在跑這個 Flow 的對話會交給客服。`)) return
    start(async () => {
      const r = await removeLeadFlow(draft.id!)
      if (!r.ok) { setError(r.reason); return }
      setDirty(false)
      const rest = flows.filter(f => f.id !== draft.id)
      setPicked(rest[0]?.id ?? null)
      setDraft(rest[0] ? toDraft(rest[0]) : blank())
    })
  }

  const brandName = (id: string | null) => (id ? brands.find(b => b.id === id)?.name ?? '—' : '全部品牌')
  const triggerLine = (f: Pick<LeadFlow, 'triggerKind' | 'triggerValue'>) =>
    f.triggerKind === 'ad' ? `廣告：${f.triggerValue}` : f.triggerKind === 'keyword' ? `關鍵字：${f.triggerValue}` : '任何第一則訊息'
  const current = flows.find(f => f.id === picked)

  return (
    <HvPage>
      <PageHead eyebrow="Lead View" title="Flows" right={canManage ? <button type="button" className={btn('outline')} onClick={() => pick(null)}>+ 新 Flow</button> : undefined} />
      {error ? <div className={s.error} role="alert" style={{ marginBottom: 12 }}>{error}</div> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
        {/* ── The flows, each with its switch ── */}
        <div style={{ flex: '0 1 250px', minWidth: 230, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {flows.length === 0 ? <div className={s.hint}>還沒有 Flow。右上角「+ 新 Flow」會從一個範本開始。</div> : null}
          {flows.map(f => (
            <div key={f.id} className={s.salesRow} aria-pressed={picked === f.id} style={{ alignItems: 'flex-start', cursor: 'default' }}>
              <button type="button" onClick={() => pick(f)} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left', background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}>
                <span className={s.salesName}>{f.name}</span>
                <span className={s.hint}>{brandName(f.brandId)} · {triggerLine(f)}</span>
                <span className={s.salesMeta}>本週 {f.started} 人 · {f.phones} 個電話</span>
              </button>
              <Switch on={f.active} disabled={!canManage || busy} label={`${f.name} 開關`} onClick={() => toggle(f)} />
            </div>
          ))}
          {picked === null ? <div className={s.salesRow} aria-pressed="true" style={{ cursor: 'default' }}><span className={s.salesName}>{draft.name}（未儲存）</span></div> : null}
        </div>

        {/* ── The flow ── */}
        <div style={{ flex: '3 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section className={s.panel} aria-label="Flow">
            <div className={s.panelHead}>
              <span className={s.label}>Flow</span>
              <span className={s.spacer} />
              {current && !dirty ? (
                <>
                  <span className={s.hint}>{current.active ? '開啟中：符合條件的新對話會自動跑' : '關閉中：不會自動跑'}</span>
                  <Switch on={current.active} disabled={!canManage || busy} label="這個 Flow 的開關" onClick={() => toggle(current)} />
                </>
              ) : (
                <>
                  <span className={s.hint}>{draft.active ? '儲存後開啟' : '儲存後先關閉'}</span>
                  <Switch on={draft.active} disabled={!canManage} label="這個 Flow 的開關" onClick={() => edit({ active: !draft.active })} />
                </>
              )}
            </div>
            <div className={s.fieldGrid}>
              <label className={s.field}>名字 Name<input value={draft.name} onChange={e => edit({ name: e.target.value })} maxLength={60} disabled={!canManage} /></label>
              <label className={s.field}>品牌 Brand
                <select value={draft.brandId ?? ''} onChange={e => edit({ brandId: e.target.value || null })} disabled={!canManage}>
                  <option value="">全部品牌 Every brand</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label className={s.field}>什麼時候開始 Starts when
                <select value={draft.triggerKind} onChange={e => edit({ triggerKind: e.target.value as FlowTrigger })} disabled={!canManage}>
                  {(Object.keys(TRIGGER_LABEL) as FlowTrigger[]).map(k => <option key={k} value={k}>{TRIGGER_LABEL[k]}</option>)}
                </select>
              </label>
              {draft.triggerKind !== 'first' ? (
                <label className={s.field}>{draft.triggerKind === 'ad' ? '廣告名稱包含 Ad name contains' : '訊息包含 Message contains'}
                  <input value={draft.triggerValue} onChange={e => edit({ triggerValue: e.target.value })} maxLength={120} disabled={!canManage}
                    placeholder={draft.triggerKind === 'ad' ? 'Sofa Week' : '試睡'} />
                </label>
              ) : <span />}
            </div>
            <p className={s.hint} style={{ margin: 0 }}>
              客戶按了按鈕，就收到那個按鈕下面寫的回覆；客戶自己打字、或客服手動回覆，Flow 就停下來交給客服。
            </p>
          </section>

          <FlowTree steps={draft.steps} canManage={canManage} onChange={setSteps} />

          {problem ? <div className={s.note} style={{ margin: 0 }}>還不能儲存：{PROBLEM_ZH(problem)}</div> : null}
          {canManage ? (
            <div className={s.actions}>
              <button type="button" className={btn('primary')} onClick={save} disabled={busy || !!problem || !draft.name.trim() || !dirty}>{busy ? '儲存中…' : '儲存 Save'}</button>
              {draft.id ? <button type="button" className={btn('outline')} onClick={remove} disabled={busy}>刪除這個 Flow</button> : null}
              {saved && !dirty ? <span className={s.hint} style={{ alignSelf: 'center' }}>已儲存</span> : null}
              {dirty ? <span className={s.hint} style={{ alignSelf: 'center' }}>有修改還沒儲存</span> : null}
            </div>
          ) : null}
        </div>

        {/* ── Try it ── */}
        <div style={{ flex: '2 1 300px', minWidth: 0, position: 'sticky', top: 0 }}>
          <TryIt key={JSON.stringify(draft.steps)} steps={draft.steps} ok={!problem} />
        </div>
      </div>
    </HvPage>
  )
}

/** The checks' words, for the editor (the database answers in English). */
function PROBLEM_ZH(p: string): string {
  if (/leads to a step/.test(p)) return '有按鈕還沒設定「按下後的回覆」。'
  if (/says something/.test(p)) return '有一步還沒寫內容。'
  if (/at least one button/.test(p)) return '有一個問題還沒有按鈕。'
  if (/1 to 20/.test(p)) return '按鈕文字要 1 到 20 個字。'
  if (/13 buttons/.test(p)) return '一個問題最多 13 個按鈕。'
  return p
}

function Switch({ on, disabled, label, onClick }: { on: boolean; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick}
      style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 0, padding: 4, cursor: disabled ? 'default' : 'pointer', font: 'inherit', fontSize: 12, color: on ? 'rgb(var(--hv-ledger))' : 'rgb(var(--hv-note))' }}>
      <span aria-hidden="true" style={{ position: 'relative', width: 34, height: 20, borderRadius: 99, background: on ? 'rgb(var(--hv-ledger))' : 'rgb(var(--hv-frame))', transition: 'background .15s' }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: 99, background: 'rgb(255 255 255)', transition: 'left .15s', boxShadow: '0 1px 2px rgb(0 0 0 / .2)' }} />
      </span>
      {on ? '開' : '關'}
    </button>
  )
}

// ── The tree ────────────────────────────────────────────────────────────────

function FlowTree({ steps, canManage, onChange }: { steps: FlowStep[]; canManage: boolean; onChange: (steps: FlowStep[]) => void }) {
  const { order, home } = useMemo(() => flowHomes(steps), [steps])
  const stray = useMemo(() => strayStepIds(steps), [steps])
  const num = (id: string) => order.indexOf(id) + 1
  const update = (id: string, next: Partial<FlowStep>) => onChange(steps.map(x => (x.id === id ? { ...x, ...next } : x)))
  const ctx: TreeCtx = { steps, home, num, canManage, update, onChange }
  return (
    <section aria-label="Steps" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span className={s.label}>客戶會收到的對話 The conversation</span>
      {steps[0] ? <StepNode id={steps[0].id} ctx={ctx} /> : null}
      {stray.length ? (
        <div className={s.panel} style={{ gap: 8 }}>
          <span className={s.hint}>沒有連到的步驟（客戶不會收到）</span>
          {stray.map(id => (
            <div key={id} className={s.inline} style={{ alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{steps.find(x => x.id === id)?.text || '（空白）'}</span>
              {canManage ? <button type="button" className={btn('outline')} onClick={() => onChange(steps.filter(x => x.id !== id))}>刪除</button> : null}
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
        <span className={s.brand} data-tone={KIND_TONE[st.kind]}>第 {ctx.num(id)} 步</span>
        <select className={s.select} value={st.kind} onChange={e => setKind(e.target.value as FlowStepKind)} disabled={!ctx.canManage} aria-label="這一步做什麼">
          {(Object.keys(STEP_KIND_LABEL) as FlowStepKind[]).map(k => <option key={k} value={k}>{STEP_KIND_LABEL[k]}</option>)}
        </select>
        <span className={s.spacer} />
        {ctx.canManage && !root ? (
          <button type="button" className={btn('outline')} onClick={() => {
            if (window.confirm('刪除這一步，以及只有它接著的後續步驟？')) ctx.onChange(removeBranch(ctx.steps, id))
          }}>刪除這一步</button>
        ) : null}
      </div>
      <label className={s.field}>
        {st.kind === 'question' ? '問客戶' : st.kind === 'phone' ? '問電話' : st.kind === 'handoff' ? '交給客服前說' : '回覆客戶'}
        <textarea value={st.text} onChange={e => ctx.update(id, { text: e.target.value })} maxLength={1000} disabled={!ctx.canManage}
          placeholder={st.kind === 'question' ? '例如：你想看哪一種？' : '要跟客戶說什麼…'} />
      </label>

      {st.kind === 'question' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(st.buttons ?? []).map((b, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={s.flowButton} style={{ height: 'auto', padding: 0, border: 0 }}>
                  <input value={b.label} maxLength={20} disabled={!ctx.canManage} aria-label="按鈕文字" placeholder="按鈕文字"
                    onChange={e => ctx.update(id, { buttons: (st.buttons ?? []).map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                    style={{ height: 30, padding: '0 12px', borderRadius: 99, border: '1px solid rgb(var(--hv-blue))', color: 'rgb(var(--hv-blue))', font: 'inherit', fontSize: 13, minWidth: 0, width: 160 }} />
                </span>
                <span className={s.hint}>客戶按了之後 ↓</span>
                <span className={s.spacer} />
                {ctx.canManage && (st.buttons ?? []).length > 1 ? (
                  <button type="button" className={btn('outline')} aria-label="刪除按鈕"
                    onClick={() => ctx.onChange(removeButton(ctx.steps, id, i))}>刪除按鈕</button>
                ) : null}
              </div>
              <Branch slot={`${id}:b${i}`} target={b.next} ctx={ctx} button
                onPoint={next => ctx.update(id, { buttons: (st.buttons ?? []).map((x, j) => (j === i ? { ...x, next } : x)) })} />
            </div>
          ))}
          {ctx.canManage && (st.buttons ?? []).length < 13 ? (
            <button type="button" className={btn('dashed')} style={{ alignSelf: 'flex-start' }}
              onClick={() => ctx.update(id, { buttons: [...(st.buttons ?? []), { label: '', next: '' }] })}>+ 加一個按鈕</button>
          ) : null}
        </div>
      ) : st.kind !== 'handoff' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className={s.hint}>{st.kind === 'phone' ? '客戶留了電話之後 ↓' : '然後 ↓'}</span>
          <Branch slot={`${id}:next`} target={st.next ?? ''} ctx={ctx} onPoint={next => ctx.update(id, { next: next || null })} />
        </div>
      ) : (
        <span className={s.hint}>Flow 在這裡結束，對話出現在 Inbox「要回覆」，由客服接手。</span>
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
        <span className={s.hint}>→ 接到 第 {ctx.num(linked.id)} 步：{Array.from(linked.text || '').slice(0, 18).join('')}</span>
      ) : (
        <span className={s.hint} style={{ color: button ? 'rgb(var(--hv-alert))' : undefined }}>{button ? '還沒設定按下後的回覆' : '結束 Flow'}</span>
      )}
      {ctx.canManage ? (
        <>
          <span className={s.spacer} />
          <select className={s.select} value="" aria-label="新增回覆" onChange={e => { if (e.target.value) addNew(e.target.value as FlowStepKind) }}>
            <option value="">+ 新的回覆…</option>
            {(Object.keys(STEP_KIND_LABEL) as FlowStepKind[]).map(k => <option key={k} value={k}>{STEP_KIND_LABEL[k]}</option>)}
          </select>
          <select className={s.select} value={linked ? linked.id : ''} aria-label="接到已有的步驟" onChange={e => onPoint(e.target.value)}>
            <option value="">{button ? '接到已有的步驟…' : '結束 Flow'}</option>
            {others.map(x => <option key={x.id} value={x.id}>第 {ctx.num(x.id)} 步：{Array.from(x.text || '').slice(0, 14).join('') || STEP_KIND_LABEL[x.kind]}</option>)}
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
function TryIt({ steps, ok }: { steps: FlowStep[]; ok: boolean }) {
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
      out.push({ who: 'note', text: 'Flow 停了 → 這個對話交給客服回覆' })
      setWaiting(null)
    } else if (next === '') {
      out.push({ who: 'note', text: 'Flow 結束' })
      setWaiting(null)
    } else {
      const r = sendFrom(steps, next)
      out.push(...r.sent.map(m => ({ who: 'flow' as const, text: m.text, buttons: m.buttons })))
      if (r.end === 'handoff') out.push({ who: 'note', text: '交給客服 → 對話出現在 Inbox「要回覆」' })
      if (r.end === 'done') out.push({ who: 'note', text: 'Flow 結束' })
      setWaiting(r.waiting)
    }
    setLines(l => [...l, ...out])
    setTyped('')
  }
  const lastButtons = waiting ? [...lines].reverse().find(l => l.who === 'flow')?.buttons ?? null : null

  return (
    <section className={s.panel} aria-label="Try it">
      <div className={s.panelHead}>
        <span className={s.label}>試跑 Try it</span>
        <span className={s.spacer} />
        <button type="button" className={btn('outline')} onClick={restart}>重來</button>
      </div>
      <span className={s.hint}>客戶看到的樣子 — 點按鈕或打字試試，不會發送也不會儲存。</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 18, border: '1px solid rgb(var(--hv-hairline))', background: 'rgb(var(--hv-zebra))', minHeight: 320, maxHeight: 520, overflowY: 'auto' }}>
        {!ok ? <span className={s.hint}>先把每一步都填好，就可以試跑。</span> : null}
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
          <input className={s.search} style={{ flex: 1 }} value={typed} onChange={e => setTyped(e.target.value)} placeholder="或自己打字…（例如電話號碼）"
            onKeyDown={e => { if (e.key === 'Enter') say(typed) }} aria-label="Type as the customer" />
          <button type="button" className={btn('outline')} onClick={() => say(typed)} disabled={!typed.trim()}>送出</button>
        </div>
      ) : null}
    </section>
  )
}
