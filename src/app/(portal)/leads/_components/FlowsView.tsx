'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { HvPage, PageHead, SectHead, btn } from '@/components/hrv/kit'
import { removeLeadFlow, saveLeadFlow } from '@/lib/leads/actions'
import {
  STEP_KIND_LABEL,
  TRIGGER_LABEL,
  answerStep,
  flowProblem,
  newStepId,
  sendFrom,
  starterSteps,
  type FlowStep,
  type FlowStepKind,
  type FlowTrigger,
  type LeadFlow,
} from '@/lib/leads/flow'
import type { LeadBrand } from '@/lib/leads/types'
import s from './lead.module.css'

/**
 * Lead View › Flows (2026-10-16, phase 2 — the design canvas's "Flows" board): the button flows. The list on the
 * left (what starts each, on or off, what it did this week), the steps in the middle, and a phone on the right
 * that runs the flow being edited — tap its buttons as a customer would, nothing is sent or saved.
 */

type Draft = Omit<LeadFlow, 'id' | 'sortOrder' | 'updatedAt' | 'started' | 'phones'> & { id: string | null }

const blank = (): Draft => ({ id: null, brandId: null, name: '新 Flow', triggerKind: 'first', triggerValue: '', active: false, steps: starterSteps() })
const toDraft = (f: LeadFlow): Draft => ({ id: f.id, brandId: f.brandId, name: f.name, triggerKind: f.triggerKind, triggerValue: f.triggerValue, active: f.active, steps: f.steps })

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
  const editStep = (i: number, next: Partial<FlowStep>) => edit({ steps: draft.steps.map((x, j) => (j === i ? { ...x, ...next } : x)) })

  const problem = flowProblem(draft.steps)
  const save = () => start(async () => {
    setError(null)
    const r = await saveLeadFlow(draft.id, {
      brandId: draft.brandId, name: draft.name, triggerKind: draft.triggerKind, triggerValue: draft.triggerValue, active: draft.active, steps: draft.steps,
    })
    if (!r.ok) { setError(r.reason); return }
    setDraft(d => ({ ...d, id: r.data }))
    setPicked(r.data)
    setDirty(false)
    setSaved(true)
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

  return (
    <HvPage>
      <PageHead eyebrow="Lead View" title="Flows" right={canManage ? <button type="button" className={btn('outline')} onClick={() => pick(null)}>+ 新 Flow</button> : undefined} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
        {/* ── The flows ── */}
        <div style={{ flex: '0 1 240px', minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {flows.length === 0 ? <div className={s.hint}>還沒有 Flow。右上角「+ 新 Flow」會從一個範本開始。</div> : null}
          {flows.map(f => (
            <button key={f.id} type="button" className={s.salesRow} aria-pressed={picked === f.id} onClick={() => pick(f)}
              style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <span className={s.salesName}>{f.name}</span>
              <span className={s.hint}>{brandName(f.brandId)} · {triggerLine(f)}</span>
              <span className={s.salesMeta}>
                {f.active ? <span style={{ color: 'rgb(var(--hv-ledger))' }}>開啟</span> : '關閉'} · 本週 {f.started} 人 · {f.phones} 個電話
              </span>
            </button>
          ))}
          {picked === null ? <div className={s.salesRow} aria-pressed="true" style={{ cursor: 'default' }}><span className={s.salesName}>{draft.name}（未儲存）</span></div> : null}
        </div>

        {/* ── The steps ── */}
        <div style={{ flex: '3 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section className={s.panel} aria-label="Flow">
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
              <label className={`${s.field} ${s.wide}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={draft.active} onChange={e => edit({ active: e.target.checked })} disabled={!canManage} style={{ minHeight: 0, width: 16, height: 16 }} />
                開啟 On — 符合條件的新對話會自動跑這個 Flow
              </label>
            </div>
            <p className={s.hint} style={{ margin: 0 }}>
              客戶按了按鈕就走下一步；客戶自己打字、或客服手動回覆，Flow 就停下來交給客服。一個對話只在第一則訊息時開始 Flow；
              廣告的 Flow 先於關鍵字，關鍵字先於「任何第一則訊息」。
            </p>
          </section>

          <SectHead title="步驟 Steps" count={String(draft.steps.length)} />
          {draft.steps.map((st, i) => (
            <StepCard key={st.id} step={st} index={i} steps={draft.steps} canManage={canManage}
              onChange={next => editStep(i, next)}
              onRemove={() => edit({ steps: draft.steps.filter((_, j) => j !== i) })}
              onMove={d => {
                const j = i + d
                if (j < 0 || j >= draft.steps.length) return
                const steps = [...draft.steps]
                ;[steps[i], steps[j]] = [steps[j], steps[i]]
                edit({ steps })
              }} />
          ))}
          {canManage ? (
            <button type="button" className={btn('dashed')} onClick={() => edit({ steps: [...draft.steps, { id: newStepId(draft.steps), kind: 'message', text: '', next: null }] })}>
              + 加一步 Add step
            </button>
          ) : null}

          {problem ? <div className={s.note} style={{ margin: 0 }}>{problem}</div> : null}
          {error ? <div className={s.error} role="alert">{error}</div> : null}
          {canManage ? (
            <div className={s.actions}>
              <button type="button" className={btn('primary')} onClick={save} disabled={busy || !!problem || !draft.name.trim()}>{busy ? '儲存中…' : '儲存 Save'}</button>
              {draft.id ? <button type="button" className={btn('outline')} onClick={remove} disabled={busy}>刪除 Delete</button> : null}
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

function StepCard({ step, index, steps, canManage, onChange, onRemove, onMove }: {
  step: FlowStep
  index: number
  steps: FlowStep[]
  canManage: boolean
  onChange: (next: Partial<FlowStep>) => void
  onRemove: () => void
  onMove: (d: -1 | 1) => void
}) {
  const others = steps.filter(x => x.id !== step.id)
  const label = (id: string) => {
    const at = steps.findIndex(x => x.id === id)
    return at < 0 ? id : `第 ${at + 1} 步：${(steps[at].text || '').slice(0, 16) || STEP_KIND_LABEL[steps[at].kind]}`
  }
  const setKind = (kind: FlowStepKind) =>
    onChange(kind === 'question'
      ? { kind, buttons: step.buttons?.length ? step.buttons : [{ label: '是', next: others[0]?.id ?? step.id }], next: null }
      : { kind, buttons: undefined, next: kind === 'handoff' ? null : step.next ?? null })

  return (
    <section className={s.panel} aria-label={`Step ${index + 1}`}>
      <div className={s.panelHead}>
        <span className={s.brand} data-tone={step.kind === 'question' ? 'clay' : step.kind === 'phone' ? 'olive' : step.kind === 'handoff' ? 'plum' : 'blue'}>
          第 {index + 1} 步
        </span>
        <select className={s.select} value={step.kind} onChange={e => setKind(e.target.value as FlowStepKind)} disabled={!canManage} aria-label="Step kind">
          {(Object.keys(STEP_KIND_LABEL) as FlowStepKind[]).map(k => <option key={k} value={k}>{STEP_KIND_LABEL[k]}</option>)}
        </select>
        <span className={s.spacer} />
        {canManage ? (
          <>
            <button type="button" className={btn('outline')} onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up">↑</button>
            <button type="button" className={btn('outline')} onClick={() => onMove(1)} disabled={index === steps.length - 1} aria-label="Move down">↓</button>
            <button type="button" className={btn('outline')} onClick={onRemove} disabled={steps.length === 1}>刪除</button>
          </>
        ) : null}
      </div>
      <label className={s.field}>
        {step.kind === 'question' ? '問客戶 Ask' : step.kind === 'phone' ? '問電話 Ask for the phone' : step.kind === 'handoff' ? '交給客服前說 Say, then hand to Customer Service' : '說 Say'}
        <textarea value={step.text} onChange={e => onChange({ text: e.target.value })} maxLength={1000} disabled={!canManage} />
      </label>
      {step.kind === 'question' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className={s.hint}>按鈕 Buttons（最多 13 個，每個 20 字內）</span>
          {(step.buttons ?? []).map((b, bi) => (
            <div key={bi} className={s.inline} style={{ alignItems: 'center' }}>
              <input className={s.search} style={{ flex: '1 1 120px' }} value={b.label} maxLength={20} disabled={!canManage} aria-label="Button"
                onChange={e => onChange({ buttons: (step.buttons ?? []).map((x, j) => (j === bi ? { ...x, label: e.target.value } : x)) })} />
              <span className={s.hint}>→</span>
              <select className={s.select} style={{ flex: '1 1 160px' }} value={b.next} disabled={!canManage} aria-label="Leads to"
                onChange={e => onChange({ buttons: (step.buttons ?? []).map((x, j) => (j === bi ? { ...x, next: e.target.value } : x)) })}>
                {steps.map(x => <option key={x.id} value={x.id}>{label(x.id)}</option>)}
              </select>
              {canManage ? <button type="button" className={btn('outline')} disabled={(step.buttons ?? []).length === 1}
                onClick={() => onChange({ buttons: (step.buttons ?? []).filter((_, j) => j !== bi) })}>✕</button> : null}
            </div>
          ))}
          {canManage && (step.buttons ?? []).length < 13 ? (
            <button type="button" className={btn('outline')} style={{ alignSelf: 'flex-start' }}
              onClick={() => onChange({ buttons: [...(step.buttons ?? []), { label: '', next: others[0]?.id ?? step.id }] })}>+ 按鈕</button>
          ) : null}
        </div>
      ) : step.kind !== 'handoff' ? (
        <label className={s.field}>{step.kind === 'phone' ? '拿到電話之後 After the phone' : '然後 Then'}
          <select value={step.next ?? ''} onChange={e => onChange({ next: e.target.value || null })} disabled={!canManage}>
            <option value="">結束 Flow End</option>
            {others.map(x => <option key={x.id} value={x.id}>{label(x.id)}</option>)}
          </select>
        </label>
      ) : null}
    </section>
  )
}

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
        {!ok ? <span className={s.hint}>先把步驟填好，就可以試跑。</span> : null}
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
