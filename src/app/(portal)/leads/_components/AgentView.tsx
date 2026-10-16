'use client'

import { useState, useTransition } from 'react'
import { HvPage, PageHead, SectHead, btn } from '@/components/hrv/kit'
import { saveAgentPersona, tryAgent } from '@/lib/leads/actions'
import { DEFAULT_GOAL, TONE_LABEL, adoptionRate, type AgentDraft, type AgentTone, type Persona, type PersonaFields, type Turn } from '@/lib/leads/ai'
import { Bi, BrandChip } from './bits'
import DraftBox from './DraftBox'
import s from './lead.module.css'

/**
 * Lead View › AI Agent (2026-10-16, the base — the user's brief 2.1: "也能設定 AI 講話的靈魂、方式，更好地回應客戶").
 * Each brand's agent: its name, personality and tone, goal, do's and don'ts, example replies — its soul — and
 * its mode. Copilot: the Inbox offers an AI draft on that brand's conversations, which a person sends, edits or
 * dismisses. "Try it" runs the soul on the form (saved or not) against a pretend customer; nothing is kept.
 * Answering on its own comes later.
 */

const TONES = Object.keys(TONE_LABEL) as AgentTone[]
const fieldsOf = (p: Persona): PersonaFields => ({
  agentName: p.agentName, personality: p.personality, tone: p.tone, goal: p.goal, dos: p.dos, donts: p.donts, examples: p.examples, mode: p.mode,
})

export default function AgentView({ personas, cardCounts, connected, canManage }: {
  personas: Persona[]
  /** Cards in use today for each brand (its own and every brand's). */
  cardCounts: Record<string, number>
  /** ANTHROPIC_API_KEY is set. */
  connected: boolean
  canManage: boolean
}) {
  const [brandId, setBrandId] = useState(personas[0]?.brandId ?? '')
  const persona = personas.find(p => p.brandId === brandId)
  return (
    <HvPage>
      <PageHead eyebrow="Lead View" title="AI Agent" right={
        <div className={s.tabs} role="group" aria-label="Brand">
          {personas.map(p => (
            <button key={p.brandId} type="button" className={s.tab} aria-pressed={p.brandId === brandId} onClick={() => setBrandId(p.brandId)}>
              {p.brandName}{p.mode === 'copilot' ? ' ●' : ''}
            </button>
          ))}
        </div>
      } />
      {!connected ? (
        <div className={s.error} role="status" style={{ marginBottom: 14 }}>
          <Bi block en="The AI agent is not connected yet: add ANTHROPIC_API_KEY to the Vercel environment (and .env.local for dev), then redeploy. You can set the soul and the Data Center now."
            zh="AI 还没接上：请在 Vercel（和本地 .env.local）加入 ANTHROPIC_API_KEY 再重新部署。灵魂和资料库现在就可以先设定。" />
        </div>
      ) : null}
      {persona ? <BrandAgent key={persona.brandId} persona={persona} cards={cardCounts[persona.brandId] ?? 0} canManage={canManage} /> : (
        <div className={s.empty}><Bi block en="No brands yet — add one in Settings." zh="还没有品牌，请先到 Settings 新增。" /></div>
      )}
    </HvPage>
  )
}

function BrandAgent({ persona, cards, canManage }: { persona: Persona; cards: number; canManage: boolean }) {
  const [form, setForm] = useState<PersonaFields>(fieldsOf(persona))
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const set = (patch: Partial<PersonaFields>) => { setForm(f => ({ ...f, ...patch })); setSaved(false) }
  const changed = JSON.stringify(form) !== JSON.stringify(fieldsOf(persona))
  const save = () => start(async () => {
    setError(null)
    const r = await saveAgentPersona(persona.brandId, form)
    if (!r.ok) setError(r.reason)
    else setSaved(true)
  })
  const d = persona.drafts ?? { total: 0, sent: 0, edited: 0, dismissed: 0 }
  const rate = adoptionRate(d)
  const ro = !canManage

  return (
    <div className={s.twoCol}>
      <section className={s.panel} aria-label="The soul">
        <div className={s.panelHead}>
          <BrandChip brand={{ name: persona.brandName, tone: 'ink' }} />
          <span className={s.spacer} />
          <div className={s.segment} role="group" aria-label="Mode">
            <button type="button" className={s.tab} aria-pressed={form.mode === 'off'} onClick={() => set({ mode: 'off' })} disabled={ro}><Bi en="Off" zh="关闭" /></button>
            <button type="button" className={s.tab} aria-pressed={form.mode === 'copilot'} onClick={() => set({ mode: 'copilot' })} disabled={ro}><Bi en="Copilot" zh="草稿助手" /></button>
          </div>
        </div>
        <div className={s.hint}>
          {form.mode === 'copilot'
            ? <Bi block en="The Inbox offers an AI draft on this brand's conversations. A person sends, edits or dismisses it — nothing reaches a customer by itself." zh="收件箱会为这个品牌的对话提供 AI 草稿，由客服发送、修改或放弃；AI 不会自己回复客户。" />
            : <Bi block en="No drafts for this brand. Set the soul and try it first, then switch Copilot on." zh="这个品牌暂不提供草稿。可以先设定灵魂、试一试，再开启。" />}
        </div>
        <div className={s.fieldGrid}>
          <label className={s.field}><Bi en="Agent name" zh="名字" />
            <input value={form.agentName} onChange={e => set({ agentName: e.target.value })} maxLength={40} placeholder={`e.g. Mia from ${persona.brandName}`} readOnly={ro} />
          </label>
          <label className={s.field}><Bi en="Tone" zh="语气" />
            <select value={form.tone} onChange={e => set({ tone: e.target.value as AgentTone })} disabled={ro}>
              {TONES.map(t => <option key={t} value={t}>{TONE_LABEL[t].en} · {TONE_LABEL[t].zh}</option>)}
            </select>
          </label>
          <label className={`${s.field} ${s.wide}`}><Bi en="Personality — who the agent is" zh="灵魂 / 个性：AI 是谁" />
            <textarea value={form.personality} onChange={e => set({ personality: e.target.value })} maxLength={2000} rows={4} readOnly={ro}
              placeholder={'e.g. A young interior lover who knows every sofa in the showroom; cheerful, never pushy.\n例：熟悉店里每张沙发的年轻家居达人，开朗、不推销。'} />
          </label>
          <label className={`${s.field} ${s.wide}`}><Bi en="Goal" zh="目标" />
            <textarea value={form.goal} onChange={e => set({ goal: e.target.value })} maxLength={1000} rows={2} placeholder={DEFAULT_GOAL} readOnly={ro} />
          </label>
          <label className={s.field}><Bi en="Always" zh="一定要" />
            <textarea value={form.dos} onChange={e => set({ dos: e.target.value })} maxLength={2000} rows={4} readOnly={ro}
              placeholder={'e.g. Mention free delivery in the Klang Valley.\n例：提到巴生谷免运费。'} />
          </label>
          <label className={s.field}><Bi en="Never" zh="绝对不要" />
            <textarea value={form.donts} onChange={e => set({ donts: e.target.value })} maxLength={2000} rows={4} readOnly={ro}
              placeholder={'e.g. Never talk about competitors.\n例：不提竞争对手。'} />
          </label>
          <label className={`${s.field} ${s.wide}`}><Bi en="Example replies — the brand's voice" zh="回复范例：品牌的说话方式" />
            <textarea value={form.examples} onChange={e => set({ examples: e.target.value })} maxLength={4000} rows={5} readOnly={ro}
              placeholder={'Paste two or three replies you like. The agent copies the voice, not the facts.\n贴上两三则满意的回复，AI 会学语气，不会照抄内容。'} />
          </label>
          {error ? <div className={`${s.error} ${s.wide}`} role="alert">{error}</div> : null}
          {saved && !changed ? <div className={`${s.ok} ${s.wide}`} role="status"><Bi en="Saved." zh="已保存" /></div> : null}
          {canManage ? (
            <div className={`${s.actions} ${s.wide}`}>
              <button type="button" className={btn('primary')} onClick={save} disabled={busy || !changed}>{busy ? 'Saving…' : <Bi en="Save" zh="保存" />}</button>
              {changed ? <button type="button" className={btn('outline')} onClick={() => setForm(fieldsOf(persona))} disabled={busy}><Bi en="Undo changes" zh="还原" /></button> : null}
            </div>
          ) : null}
        </div>
        <SectHead title="Last 30 days · 近30天" />
        <div className={s.inline}>
          <div className={s.stat}><span className={s.label}>Drafts · 草稿</span><span className={s.statValue}>{d.total}</span></div>
          <div className={s.stat}><span className={s.label}>Sent as is · 直接发</span><span className={s.statValue}>{d.sent}</span></div>
          <div className={s.stat}><span className={s.label}>Edited · 修改后发</span><span className={s.statValue}>{d.edited}</span></div>
          <div className={s.stat}><span className={s.label}>Used · 采用率</span><span className={s.statValue}>{rate === null ? '—' : `${rate}%`}</span></div>
        </div>
        <div className={s.hint}><Bi block en={`${cards} Data Center card${cards === 1 ? '' : 's'} in use for this brand today.`} zh={`今天这个品牌可用的资料：${cards} 张。`} /></div>
      </section>
      <TryIt brandId={persona.brandId} fields={form} canTry={canManage} />
    </div>
  )
}

/** A pretend customer, against the soul on the form. Nothing is kept or sent. */
function TryIt({ brandId, fields, canTry }: { brandId: string; fields: PersonaFields; canTry: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<AgentDraft | null>(null)
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const ask = (next: Turn[]) => start(async () => {
    setError(null)
    setDraft(null)
    const r = await tryAgent(brandId, fields, next)
    if (!r.ok) setError(r.reason)
    else setDraft(r.data)
  })
  const say = () => {
    const body = text.trim()
    if (!body || busy) return
    const next = [...turns, { who: 'customer' as const, text: body }]
    setTurns(next)
    setText('')
    ask(next)
  }
  const use = () => {
    if (!draft) return
    setTurns(t => [...t, { who: 'us', text: draft.reply }])
    setDraft(null)
  }
  return (
    <section className={s.panel} aria-label="Try it">
      <div className={s.panelHead}>
        <span className={s.cardTitle}><Bi en="Try it" zh="试一试" /></span>
        <span className={s.spacer} />
        {turns.length ? <button type="button" className={btn('outline')} onClick={() => { setTurns([]); setDraft(null); setError(null) }} disabled={busy}><Bi en="Start over" zh="重来" /></button> : null}
      </div>
      <div className={s.hint}><Bi block en="Write as a customer. The agent answers with the soul on the left (saved or not) and today's cards. Nothing is kept or sent." zh="用客户的身份输入。AI 会用左边的设定（不必先保存）和今天的资料回答，不会记录也不会发出。" /></div>
      <div className={s.tryChat}>
        {turns.length === 0 ? <div className={s.empty}><Bi block en="e.g. “Hi, how much is the L-shape sofa?”" zh="例：“你好，L型沙发多少钱？”" /></div> : null}
        {turns.map((t, i) => t.who === 'customer'
          ? <div key={i} className={s.msgIn}><div className={s.bubbleIn}>{t.text}</div></div>
          : <div key={i} className={s.msgOut}><div className={s.bubbleOut} data-sender="ai">{t.text}</div></div>)}
        {busy ? <div className={s.msgOut}><div className={s.bubbleOut} data-sender="ai">…</div></div> : null}
        {draft ? <DraftBox draft={draft} actions={
          <>
            <button type="button" className={btn('primary')} onClick={use}><Bi en="Use as our reply" zh="当作回复" /></button>
            <button type="button" className={btn('outline')} onClick={() => ask(turns)}><Bi en="Another" zh="换一个" /></button>
          </>
        } /> : null}
      </div>
      {error ? <div className={s.error} role="alert">{error}</div> : null}
      {canTry ? (
        <div className={s.inline}>
          <label style={{ flex: 1, display: 'flex' }}>
            <span className="sr-only">Customer message</span>
            <textarea className={s.textarea} rows={2} value={text} onChange={e => setText(e.target.value)} maxLength={2000}
              placeholder="As the customer… (Ctrl + Enter) · 以客户身份输入"
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); say() } }} />
          </label>
          <button type="button" className={btn('primary')} onClick={say} disabled={busy || !text.trim()}><Bi en="Send" zh="发送" /></button>
        </div>
      ) : <div className={s.hint}><Bi en="Trying the agent needs Lead View · Manage." zh="需要 Lead View · Manage 权限" /></div>}
    </section>
  )
}
