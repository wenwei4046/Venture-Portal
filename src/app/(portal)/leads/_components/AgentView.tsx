'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { saveAgent, saveAgentPersona, tryAgent } from '@/lib/leads/actions'
import type { Persona } from '@/lib/leads/ai'
import {
  APPROACHES, AVOIDS, BLOCK_PRESETS, GOALS, INSTRUCTIONS, LENGTHS, PHONE_WORDS, SALES_HABITS, TONES, fileStatus, settingsOf, sourcesSummary,
  type AgentMore, type AgentSettings, type DataFile, type FixedAnswer, type PlaySituation,
} from '@/lib/leads/agent'
import { LeadIcon } from '@/components/layout/lead-icons'
import s from './replies.module.css'

/**
 * Lead View › AI Agent v2 (2026-10-23, the redesign v2 handoff `Auto Reply.dc.html?view=ai`): one brand's agent at a
 * time — How it replies (nine settings: goal, tone, instructions, sales approach, what it avoids, what it does not
 * answer, length, the mobile number, limits), Sources (Data Center files and links it reads, on or paused), Fixed
 * answers, Sales playbook and Memory — saved together (lead_save_ai), and TEST THE AGENT on the right, which runs the
 * page as it stands. "AI drafts in the Inbox" is the soul's mode (copilot / off), saved at once. Memory is drawn and
 * held: the agent learns once it answers on its own.
 */

type Draft = { settings: AgentSettings; answers: FixedAnswer[]; playbook: PlaySituation[]; sources: Array<{ fileId: string; paused: boolean }> }
type Tab = 'how' | 'sources' | 'answers' | 'playbook' | 'memory'
const draftOf = (m: AgentMore | undefined, p: Persona | undefined): Draft => ({
  settings: settingsOf(m?.settings, p?.goal ?? ''),
  answers: m?.answers ?? [],
  playbook: m?.playbook ?? [],
  sources: (m?.sources ?? []).map(x => ({ fileId: x.fileId, paused: x.paused })),
})
let seq = 0
const newId = () => `new-${Date.now().toString(36)}${(seq++).toString(36)}`
const SAMPLES = ['太贵了，可以便宜一点吗？', '可以分期付款吗？', 'How much is the L-shape sofa?', 'Is your sofa cheaper than IKEA?', 'Do you deliver to Penang?']

export default function AgentView({ personas, more, files, today, connected, ready, canManage }: {
  personas: Persona[]
  /** Each brand's settings, answers, playbook and sources (empty before mig 20261023200000). */
  more: Record<string, AgentMore>
  files: DataFile[]
  today: string
  connected: boolean
  ready: boolean
  canManage: boolean
}) {
  const router = useRouter()
  const [brandId, setBrandId] = useState(personas[0]?.brandId ?? '')
  const persona = personas.find(p => p.brandId === brandId)
  const [saved, setSaved] = useState<Record<string, Draft>>(() => Object.fromEntries(personas.map(p => [p.brandId, draftOf(more[p.brandId], p)])))
  const [drafts, setDrafts] = useState(saved)
  const d = drafts[brandId] ?? draftOf(undefined, persona)
  const dirty = JSON.stringify(d) !== JSON.stringify(saved[brandId])
  const [tab, setTab] = useState<Tab>('how')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, start] = useTransition()
  const [testOpen, setTestOpen] = useState(true)
  useEffect(() => {
    const anyDirty = Object.keys(drafts).some(k => JSON.stringify(drafts[k]) !== JSON.stringify(saved[k]))
    if (!anyDirty) return
    const ask = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [drafts, saved])

  const set = (fn: (x: Draft) => Draft) => { setDrafts(all => ({ ...all, [brandId]: fn(all[brandId] ?? d) })); setNote(''); setError('') }
  const setS = (o: Partial<AgentSettings>) => set(x => ({ ...x, settings: { ...x.settings, ...o } }))
  const setPhone = (o: Partial<AgentSettings['phone']>) => set(x => ({ ...x, settings: { ...x.settings, phone: { ...x.settings.phone, ...o } } }))
  const brandName = persona?.brandName ?? '—'
  const other = personas.find(p => p.brandId !== brandId)
  const dis = !canManage
  const save = () => start(async () => {
    const r = await saveAgent(brandId, d)
    if (!r.ok) { setError(r.reason); return }
    setSaved(x => ({ ...x, [brandId]: d }))
    setNote('Saved · just now')
    router.refresh()
  })
  const setMode = (on: boolean) => start(async () => {
    if (!persona) return
    const r = await saveAgentPersona(brandId, { agentName: persona.agentName, personality: persona.personality, tone: persona.tone, goal: persona.goal, dos: persona.dos, donts: persona.donts, examples: persona.examples, mode: on ? 'copilot' : 'off' })
    if (!r.ok) setError(r.reason)
    else router.refresh()
  })

  const fileById = useMemo(() => new Map(files.map(f => [f.id, f])), [files])
  const mySources = d.sources.map(x => ({ ...x, file: fileById.get(x.fileId) })).filter((x): x is { fileId: string; paused: boolean; file: DataFile } => !!x.file)
  const summary = sourcesSummary(mySources, brandName, today)
  const tabs: Array<{ id: Tab; label: string; count?: string }> = [
    { id: 'how', label: 'How it replies' },
    { id: 'sources', label: 'Sources', count: String(mySources.filter(x => !x.paused).length) },
    { id: 'answers', label: 'Fixed answers', count: String(d.answers.length) },
    { id: 'playbook', label: 'Sales playbook', count: String(d.playbook.length) },
    { id: 'memory', label: 'Memory' },
  ]

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div className={s.titles}>
          <span className={s.eyebrow}>REPLIES</span>
          <h1 className={s.title}>AI Agent</h1>
        </div>
        <span className={s.status}><span className={s.dot} aria-hidden="true" />{connected ? 'Copilot · it drafts, CS sends' : 'AI not connected (no API key)'} · Meta not connected</span>
      </div>
      <div className={s.panel}>
        <div className={s.agentSplit} data-closed={testOpen ? undefined : ''}>
          <section className={s.agentMain}>
            <div className={s.agentHead}>
              <span className={s.agentTitle}>AI Agent · {brandName}</span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <span className={s.brandSeg} role="group" aria-label="Brand">
                  {personas.map(p => <button key={p.brandId} type="button" aria-pressed={p.brandId === brandId} onClick={() => setBrandId(p.brandId)}>{p.brandName}</button>)}
                </span>
                {canManage && other ? (
                  <button type="button" className={s.link} onClick={() => { if (window.confirm(`Copy ${other.brandName}’s settings into ${brandName}? Fixed answers, playbook and sources stay.`)) set(x => ({ ...x, settings: drafts[other.brandId]?.settings ?? x.settings })) }}>Copy settings from {other.brandName}</button>
                ) : null}
              </span>
            </div>
            <div className={s.tabsRow} role="group" aria-label="Agent">
              {tabs.map(t => <button key={t.id} type="button" className={s.pillTab} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.label}{t.count ? <span className={s.count}>{t.count}</span> : null}</button>)}
            </div>
            <div className={s.scroll} style={{ paddingTop: 0 }}>
              {!ready ? <div className={s.note}>Waiting for the database update — you can try the page, but nothing is saved yet.</div> : null}
              <div className={s.banner}>
                <span className={s.toggleLine} style={{ flex: 1 }}>
                  <button type="button" role="switch" aria-checked={persona?.mode === 'copilot'} className={s.switch} disabled={dis || busy || !persona} onClick={() => setMode(persona?.mode !== 'copilot')} aria-label="AI drafts in the Inbox" />
                  <span>AI drafts in the Inbox <span className={s.small}>· {persona?.mode === 'copilot' ? 'on — CS asks for a draft, reads and sends it' : 'off'}</span></span>
                </span>
              </div>

              {tab === 'how' ? (
                <>
                  <div className={s.banner}>
                    <LeadIcon name="library" size={14} />
                    <span style={{ flex: 1 }}>{summary.main}{summary.warn ? <span className={s.warn}> · {summary.warn}</span> : null}</span>
                    <Link className={s.link} href="/leads/knowledge">Manage in Data Center ↗</Link>
                  </div>
                  <Setting n={1} name="END GOAL">
                    <textarea className={s.textarea} rows={2} value={d.settings.goal} maxLength={1000} disabled={dis} onChange={e => setS({ goal: e.target.value })} placeholder="e.g. Get the customer’s mobile number and book a showroom visit this week" aria-label="End goal" />
                    <span className={s.chipRow}><span className={s.small}>Start from</span>{GOALS.map(([l, t]) => <button key={l} type="button" className={s.choice} data-preset="" disabled={dis} onClick={() => setS({ goal: t })}>{l}</button>)}</span>
                  </Setting>
                  <Setting n={2} name="TONE">
                    <span className={s.chipRow}>{TONES.map(([l, t]) => <button key={l} type="button" className={s.choice} title={t} aria-pressed={d.settings.tone === l} disabled={dis} onClick={() => setS({ tone: l })}>{l}</button>)}</span>
                    <textarea className={s.textarea} rows={2} value={d.settings.toneNote} maxLength={600} disabled={dis} onChange={e => setS({ toneNote: e.target.value })} placeholder="Describe the tone in your own words, e.g. Warm like a friendly shop assistant, light humour" aria-label="Tone in your words" />
                  </Setting>
                  <Setting n={3} name="INSTRUCTIONS">
                    <Picker title="Choose instructions" table={INSTRUCTIONS} chosen={d.settings.rules} disabled={dis} onChange={v => setS({ rules: v })} />
                    <textarea className={s.textarea} rows={3} value={d.settings.instr} maxLength={2000} disabled={dis} onChange={e => setS({ instr: e.target.value })} placeholder="Anything else the agent should know or do, in your own words" aria-label="Other instructions" />
                  </Setting>
                  <Setting n={4} name="SALES APPROACH">
                    <Picker title="Choose sales habits" table={SALES_HABITS} chosen={d.settings.habits} disabled={dis} onChange={v => setS({ habits: v })} />
                    <textarea className={s.textarea} rows={2} value={d.settings.sellNote} maxLength={600} disabled={dis} onChange={e => setS({ sellNote: e.target.value })} placeholder="Other sales habits in your own words, e.g. Mention free delivery in the Klang Valley" aria-label="Other sales habits" />
                  </Setting>
                  <Setting n={5} name="WHAT IT AVOIDS">
                    <Picker title="Choose what it avoids" table={AVOIDS} chosen={d.settings.avoid} disabled={dis} onChange={v => setS({ avoid: v })} />
                    <textarea className={s.textarea} rows={2} value={d.settings.avoidNote} maxLength={1000} disabled={dis} onChange={e => setS({ avoidNote: e.target.value })} placeholder="Anything else the agent must not say or do, in your own words" aria-label="Other things it avoids" />
                  </Setting>
                  <Setting n={6} name="DON’T ANSWER" sub="Hand the chat to a person">
                    <Picker title="Choose topics" table={BLOCK_PRESETS.map(b => [b, ''] as [string, string])} chosen={d.settings.blocked} disabled={dis} onChange={v => setS({ blocked: v })} allowNew />
                  </Setting>
                  <Setting n={7} name="REPLY LENGTH">
                    <span className={s.chipRow}>{LENGTHS.map(([l]) => <button key={l} type="button" className={s.choice} aria-pressed={d.settings.length === l} disabled={dis} onClick={() => setS({ length: l })}>{l}</button>)}</span>
                    <span className={s.small}>{LENGTHS.find(l => l[0] === d.settings.length)?.[1]}</span>
                  </Setting>
                  <Setting n={8} name="STRATEGIC">
                    <Toggle on={d.settings.phone.on} disabled={dis} onChange={on => setPhone({ on })} label="Ask for the mobile number" />
                    {d.settings.phone.on ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 44 }}>
                        <span className={s.label}>WHEN TO ASK</span>
                        <span className={s.toggleLine}>
                          <button type="button" role="switch" aria-checked={d.settings.phone.afterOn} className={s.switch} disabled={dis} onClick={() => setPhone({ afterOn: !d.settings.phone.afterOn })} aria-label="After a number of replies" />
                          After <input type="number" min={1} max={20} className={s.numIn} value={d.settings.phone.after} disabled={dis || !d.settings.phone.afterOn} onChange={e => setPhone({ after: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} aria-label="Replies before asking" /> agent replies
                        </span>
                        {d.settings.phone.afterOn ? <label className={s.field}>How to ask<textarea className={s.textarea} rows={2} value={d.settings.phone.ask} maxLength={600} disabled={dis} onChange={e => setPhone({ ask: e.target.value })} /></label> : null}
                        <span className={s.toggleLine}>
                          <button type="button" role="switch" aria-checked={d.settings.phone.wordsOn} className={s.switch} disabled={dis} onClick={() => setPhone({ wordsOn: !d.settings.phone.wordsOn })} aria-label="Straight away on words" />
                          Straight away when the customer mentions
                        </span>
                        {d.settings.phone.wordsOn ? (
                          <>
                            <Words words={d.settings.phone.words} disabled={dis} onChange={words => setPhone({ words })} suggest={[...PHONE_WORDS]} />
                            <label className={s.field}>How to ask<textarea className={s.textarea} rows={2} value={d.settings.phone.wordsAsk} maxLength={600} disabled={dis} placeholder="e.g. Our salesperson can help with this on WhatsApp. May I have your mobile number?" onChange={e => setPhone({ wordsAsk: e.target.value })} /></label>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </Setting>
                  <Setting n={9} name="LIMITS" sub="When to stop and hand to a person">
                    <Toggle on={d.settings.unsure} disabled={dis} onChange={unsure => setS({ unsure })} label="When unsure" hint="Its draft says a person should take over." />
                    <Toggle on={d.settings.upset} disabled={dis} onChange={upset => setS({ upset })} label="When the customer is upset or complains" hint="Stops at once and moves the chat to Waiting." />
                    <span className={s.toggleLine}>
                      <button type="button" role="switch" aria-checked={d.settings.maxOn} className={s.switch} disabled={dis} onClick={() => setS({ maxOn: !d.settings.maxOn })} aria-label="After a number of replies" />
                      After <input type="number" min={1} max={50} className={s.numIn} value={d.settings.maxReplies} disabled={dis || !d.settings.maxOn} onChange={e => setS({ maxReplies: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} aria-label="Replies at most" /> agent replies in one conversation
                    </span>
                  </Setting>
                </>
              ) : null}

              {tab === 'sources' ? (
                <Sources brandId={brandId} brandName={brandName} files={files} sources={d.sources} today={today} disabled={dis}
                  onChange={sources => set(x => ({ ...x, sources }))} />
              ) : null}

              {tab === 'answers' ? (
                <>
                  <span className={s.kicker}>FIXED ANSWERS <span className={s.small} style={{ fontWeight: 400, letterSpacing: 0 }}>· Sent word for word when a customer asks something like this.</span></span>
                  <div className={s.faq}><span className={s.label}>CUSTOMER ASKS</span><span className={s.label}>AGENT REPLIES</span><span /></div>
                  {d.answers.map((a, i) => (
                    <div key={a.id} className={s.faq}>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <textarea className={s.faqIn} rows={1} value={a.question} maxLength={500} disabled={dis} placeholder="e.g. Do you deliver to Penang?" aria-label="Customer asks" onChange={e => set(x => ({ ...x, answers: x.answers.map((y, j) => (j === i ? { ...y, question: e.target.value } : y)) }))} />
                        {a.source ? <span className={s.small} style={{ paddingLeft: 8 }}>{a.source}{a.editedAt ? ' · edited since' : ''}</span> : null}
                      </span>
                      <textarea className={s.faqIn} rows={1} value={a.answer} maxLength={2000} disabled={dis} placeholder="Write the exact reply" aria-label="Agent replies" onChange={e => set(x => ({ ...x, answers: x.answers.map((y, j) => (j === i ? { ...y, answer: e.target.value } : y)) }))} />
                      {canManage ? <button type="button" className={s.cardIcon} title="Delete" onClick={() => set(x => ({ ...x, answers: x.answers.filter((_, j) => j !== i) }))}><LeadIcon name="trash" size={12} /></button> : <span />}
                    </div>
                  ))}
                  {canManage ? <button type="button" className={s.link} style={{ alignSelf: 'flex-start' }} onClick={() => set(x => ({ ...x, answers: [...x.answers, { id: newId(), question: '', answer: '' }] }))}>+ Add fixed answer</button> : null}
                  <span className={s.small}>Corrections from the Inbox become fixed answers on <Link className={s.link} href="/leads/corrections">AI corrections</Link>.</span>
                </>
              ) : null}

              {tab === 'playbook' ? (
                <>
                  <span className={s.small}>Teach the agent how your best salesperson handles common situations. When a customer says something similar, the agent follows the approach and uses the example reply as a guide, not word for word.</span>
                  {d.playbook.map((p, i) => {
                    const setP = (o: Partial<PlaySituation>) => set(x => ({ ...x, playbook: x.playbook.map((y, j) => (j === i ? { ...y, ...o } : y)) }))
                    return (
                      <div key={p.id} className={s.play}>
                        <span className={s.toggleLine} style={{ alignItems: 'center' }}>
                          <button type="button" role="switch" aria-checked={p.active} className={s.switch} disabled={dis} onClick={() => setP({ active: !p.active })} aria-label="On" />
                          <input className={s.input} style={{ flex: 1 }} value={p.name} maxLength={80} disabled={dis} placeholder="Situation, e.g. Too expensive" aria-label="Situation" onChange={e => setP({ name: e.target.value })} />
                          <button type="button" className={s.btn} onClick={() => { setTestOpen(true); window.dispatchEvent(new CustomEvent('lead-agent-try', { detail: (p.words.split(',')[0] || p.name).trim() })) }}>Try it</button>
                          {canManage ? <button type="button" className={s.x} title="Remove" onClick={() => set(x => ({ ...x, playbook: x.playbook.filter((_, j) => j !== i) }))}>×</button> : null}
                        </span>
                        <span className={s.playRow}>Customer says<span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><input className={s.input} value={p.words} maxLength={300} disabled={dis} placeholder="e.g. expensive, mahal, 太贵" onChange={e => setP({ words: e.target.value })} /><span className={s.small}>Words or phrases, separated by commas. Any language.</span></span></span>
                        <span className={s.playRow}>How to handle it<Picker title="Choose how to handle it" table={APPROACHES.map(a => [a, ''] as [string, string])} chosen={p.approaches} disabled={dis} onChange={v => setP({ approaches: v })} /></span>
                        <span className={s.playRow}>Example reply<textarea className={s.textarea} rows={2} value={p.reply} maxLength={2000} disabled={dis} placeholder="How your best salesperson would answer" onChange={e => setP({ reply: e.target.value })} /></span>
                      </div>
                    )
                  })}
                  {canManage ? <button type="button" className={s.link} style={{ alignSelf: 'flex-start' }} onClick={() => set(x => ({ ...x, playbook: [...x.playbook, { id: newId(), active: true, name: '', words: '', approaches: [], reply: '' }] }))}>+ Add a situation</button> : null}
                </>
              ) : null}

              {tab === 'memory' ? (
                <>
                  <div className={s.banner}><span style={{ flex: 1 }}><span className={s.small}>A chat counts as a success when</span><br />{d.settings.goal}</span><button type="button" className={s.link} onClick={() => setTab('how')}>Edit</button></div>
                  <Toggle on={false} disabled onChange={() => {}} label="Learn from its own chats" hint="Comes once the agent answers on its own — today it drafts and CS sends." />
                  <Toggle on={false} disabled onChange={() => {}} label="Learn from templates and CS" hint="Will read chats that reached the goal and suggest lessons for you to review." />
                  <span className={s.small}>Nothing waiting for review. Lessons you approve become Sales playbook situations.</span>
                </>
              ) : null}
              {error ? <div className={s.error} role="alert">{error}</div> : null}
            </div>
            {canManage ? (
              <div className={s.foot}>
                <span className={s.hint} data-dirty={dirty || undefined}>{dirty ? 'Unsaved changes' : note || 'No changes yet'}</span>
                <span className={s.fill} />
                <button type="button" className={s.btn} data-quiet="" disabled={!dirty || busy} onClick={() => setDrafts(x => ({ ...x, [brandId]: saved[brandId] }))}>Discard</button>
                <button type="button" className={s.btn} data-strong="" disabled={!dirty || busy || !ready} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
              </div>
            ) : null}
          </section>
          {testOpen ? (
            <TestAgent key={brandId} brandId={brandId} brandName={brandName} persona={persona} draft={d} connected={connected} canManage={canManage} onClose={() => setTestOpen(false)} />
          ) : (
            <div className={s.sideClosed}><button type="button" className={s.cardIcon} title="Show test panel" onClick={() => setTestOpen(true)}>«</button><button type="button" className={s.vertical} onClick={() => setTestOpen(true)}>TEST THE AGENT</button></div>
          )}
        </div>
      </div>
    </div>
  )
}

function Setting({ n, name, sub, children }: { n: number; name: string; sub?: string; children: ReactNode }) {
  return (
    <div className={s.setting}>
      <div><span className={s.settingName}><span className={s.settingNum}>{n}</span>{name}</span>{sub ? <div className={s.settingSub}>{sub}</div> : null}</div>
      <div className={s.settingBody}>{children}</div>
    </div>
  )
}

function Toggle({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; hint?: string; disabled: boolean }) {
  return (
    <span className={s.toggleLine}>
      <button type="button" role="switch" aria-checked={on} className={s.switch} disabled={disabled} onClick={() => onChange(!on)} aria-label={label} />
      <span>{label}{hint ? <span className={s.ddHint} style={{ display: 'block' }}>{hint}</span> : null}</span>
    </span>
  )
}

/** A dropdown of presets ticked on and off, shown as chips; `allowNew` takes a typed one too. */
function Picker({ title, table, chosen, onChange, disabled, allowNew }: { title: string; table: ReadonlyArray<readonly [string, string]>; chosen: string[]; onChange: (v: string[]) => void; disabled: boolean; allowNew?: boolean }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const toggle = (l: string) => onChange(chosen.includes(l) ? chosen.filter(x => x !== l) : [...chosen, l])
  const extra = chosen.filter(c => !table.some(t => t[0] === c))
  return (
    <>
      <span style={{ position: 'relative', alignSelf: 'flex-start' }}>
        <button type="button" className={s.ddBtn} disabled={disabled} onClick={() => setOpen(o => !o)} aria-expanded={open}><span>{title}</span><span className={s.small}>{chosen.length ? `${chosen.length} selected` : ''} ▾</span></button>
        {open ? (
          <>
            <div className={s.scrim} onClick={() => setOpen(false)} aria-hidden="true" />
            <div className={s.menu} style={{ top: 34, left: 0, width: 340, maxHeight: 360, overflowY: 'auto' }} role="menu">
              {[...table, ...extra.map(e => [e, ''] as const)].map(([l, t]) => (
                <button key={l} type="button" role="menuitemcheckbox" aria-checked={chosen.includes(l)} className={s.ddItem} onClick={() => toggle(l)}>
                  <span className={s.tick} data-on={chosen.includes(l) || undefined}>{chosen.includes(l) ? '✓' : ''}</span>
                  <span className={s.ddText}>{l}{t ? <span className={s.ddHint}>{t}</span> : null}</span>
                </button>
              ))}
              {allowNew ? (
                <input className={s.input} style={{ margin: 6 }} value={typed} placeholder="+ Add a topic, press Enter" onChange={e => setTyped(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && typed.trim()) { e.preventDefault(); if (!chosen.includes(typed.trim())) onChange([...chosen, typed.trim().slice(0, 80)]); setTyped('') } }} />
              ) : null}
            </div>
          </>
        ) : null}
      </span>
      {chosen.length ? (
        <span className={s.chipRow}>{chosen.map(c => <span key={c} className={s.tag} title={table.find(t => t[0] === c)?.[1]}>{c}{disabled ? null : <button type="button" className={s.x} style={{ fontSize: 12 }} title="Remove" onClick={() => toggle(c)}>×</button>}</span>)}</span>
      ) : null}
    </>
  )
}

function Words({ words, onChange, suggest, disabled }: { words: string[]; onChange: (w: string[]) => void; suggest: string[]; disabled: boolean }) {
  const [typed, setTyped] = useState('')
  const add = (w: string) => { const t = w.trim(); if (t && !words.includes(t)) onChange([...words, t.slice(0, 80)]) }
  return (
    <span className={s.chipRow}>
      {words.map(w => <span key={w} className={s.tag}>{w}{disabled ? null : <button type="button" className={s.x} style={{ fontSize: 12 }} onClick={() => onChange(words.filter(x => x !== w))}>×</button>}</span>)}
      {disabled ? null : <input className={s.input} style={{ width: 200 }} value={typed} placeholder="+ Add a word, press Enter" onChange={e => setTyped(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(typed); setTyped('') } }} />}
      {disabled ? null : suggest.filter(x => !words.includes(x)).map(x => <button key={x} type="button" className={s.choice} data-preset="" onClick={() => add(x)}>+ {x}</button>)}
    </span>
  )
}

function Sources({ brandId, brandName, files, sources, today, onChange, disabled }: {
  brandId: string
  brandName: string
  files: DataFile[]
  sources: Array<{ fileId: string; paused: boolean }>
  today: string
  onChange: (s: Array<{ fileId: string; paused: boolean }>) => void
  disabled: boolean
}) {
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [view, setView] = useState<'all' | 'on' | 'paused'>('all')
  const mine = files.filter(f => f.brandId === null || f.brandId === brandId)
  const notYet = mine.filter(f => !sources.some(x => x.fileId === f.id))
  const rows = sources.map(x => ({ ...x, file: files.find(f => f.id === x.fileId) })).filter(x => x.file && (view === 'all' || (view === 'on') !== x.paused))
  return (
    <>
      <div className={s.banner}><LeadIcon name="library" size={14} /><span style={{ flex: 1 }}>Files and links are uploaded and updated in Data Center. Here you choose which ones this agent reads. Pause or resume here; Data Center shows the same.</span><Link className={s.link} href="/leads/knowledge">Open Data Center ↗</Link></div>
      <span className={s.chipRow}>
        <span className={s.kicker}>SOURCES</span>
        {(['all', 'on', 'paused'] as const).map(v => <button key={v} type="button" className={s.choice} aria-pressed={view === v} onClick={() => setView(v)}>{v === 'all' ? 'All' : v === 'on' ? 'Reading' : 'Paused'} <span className={s.count}>{v === 'all' ? sources.length : sources.filter(x => (v === 'on') !== x.paused).length}</span></button>)}
        <span className={s.fill} />
        {disabled ? null : <button type="button" className={s.toolBtn} onClick={() => { setPicking(p => !p); setPicked([]) }}><LeadIcon name="plus" size={12} />Add from Data Center</button>}
      </span>
      {picking ? (
        <div className={s.box} style={{ maxWidth: 'none', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className={s.small}>In Data Center · {brandName} and Shared folders</span>
          {notYet.map(f => {
            const on = picked.includes(f.id)
            const st = fileStatus(f, today)
            return (
              <button key={f.id} type="button" className={s.ddItem} onClick={() => setPicked(p => (on ? p.filter(x => x !== f.id) : [...p, f.id]))}>
                <span className={s.tick} data-on={on || undefined}>{on ? '✓' : ''}</span>
                <span className={s.ext}>{f.kind === 'link' ? 'URL' : (f.name.split('.').pop() ?? 'FILE').slice(0, 4).toUpperCase()}</span>
                <span className={s.ddText} style={{ flex: 1 }}>{f.name}<span className={s.ddHint}>{f.brandId ? brandName : 'Shared'} · {st.label}</span></span>
              </button>
            )
          })}
          {notYet.length === 0 ? <span className={s.small}>Everything in these folders is already added. Upload new files in <Link className={s.link} href="/leads/knowledge">Data Center</Link>.</span> : null}
          <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className={s.btn} data-quiet="" onClick={() => setPicking(false)}>Cancel</button>
            <button type="button" className={s.btn} data-strong="" disabled={picked.length === 0} onClick={() => { onChange([...sources, ...picked.map(fileId => ({ fileId, paused: false }))]); setPicking(false) }}>{picked.length ? `Add ${picked.length}` : 'Add'}</button>
          </span>
        </div>
      ) : null}
      <div className={s.box} style={{ maxWidth: 'none' }}>
        <div className={s.srcRow}><span /><span className={s.ruleHead}>SOURCE</span><span className={s.ruleHead}>FOLDER</span><span className={s.ruleHead}>VALID UNTIL</span><span className={s.ruleHead}>STATUS</span><span className={s.ruleHead}>IN THIS AGENT</span></div>
        {rows.map(x => {
          const f = x.file!
          const st = fileStatus(f, today)
          return (
            <div key={x.fileId} className={s.srcRow}>
              <span className={s.ext}>{f.kind === 'link' ? 'URL' : (f.name.split('.').pop() ?? 'FILE').slice(0, 4).toUpperCase()}</span>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.kind === 'link' ? <a className={s.link} href={f.url ?? '#'} target="_blank" rel="noopener noreferrer">{f.name}</a> : f.name}</span>
              <span className={s.small}>{f.brandId ? brandName : 'Shared'}</span>
              <span className={s.small}>{f.validUntil ?? '—'}</span>
              <span className={s.status} data-tone={st.tone}>{st.label}</span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button type="button" className={s.choice} aria-pressed={!x.paused} disabled={disabled} title={x.paused ? 'Resume reading it' : 'Pause: it stays in the list'} onClick={() => onChange(sources.map(y => (y.fileId === x.fileId ? { ...y, paused: !y.paused } : y)))}>{x.paused ? 'Paused' : 'Reading'}</button>
                {x.paused && !disabled ? <button type="button" className={s.x} title="Remove from this agent. The file stays in Data Center." onClick={() => onChange(sources.filter(y => y.fileId !== x.fileId))}>×</button> : null}
              </span>
            </div>
          )
        })}
        {rows.length === 0 ? <div className={s.srcRow}><span /><span className={s.small} style={{ gridColumn: '2 / -1' }}>{sources.length ? 'Nothing here with this filter.' : 'This agent reads no files yet — add them from Data Center.'}</span></div> : null}
      </div>
      <span className={s.small}>Pause stops this agent from reading a source but keeps it in the list. × removes a paused source from this agent. Nothing is deleted from Data Center. The agent reads PDFs, pictures and text files itself; for a link it sees the address.</span>
    </>
  )
}

type Line = { who: 'customer' | 'us'; text: string; flag?: string; meta?: string }

function TestAgent({ brandId, brandName, persona, draft, connected, canManage, onClose }: {
  brandId: string
  brandName: string
  persona: Persona | undefined
  draft: Draft
  connected: boolean
  canManage: boolean
  onClose: () => void
}) {
  const [chat, setChat] = useState<Line[]>([])
  const [typed, setTyped] = useState('')
  const [thinking, start] = useTransition()
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [chat.length, thinking])
  const ask = (text: string) => {
    const t = text.trim()
    if (!t || !persona || thinking) return
    const next: Line[] = [...chat, { who: 'customer', text: t }]
    setChat(next)
    setTyped('')
    start(async () => {
      const r = await tryAgent(brandId, { agentName: persona.agentName, personality: persona.personality, tone: persona.tone, goal: draft.settings.goal, dos: persona.dos, donts: persona.donts, examples: persona.examples, mode: persona.mode },
        next.map(l => ({ who: l.who, text: l.text })), { settings: draft.settings, answers: draft.answers, playbook: draft.playbook })
      setChat(c => [...c, r.ok
        ? { who: 'us', text: r.data.reply, flag: r.data.handoff ? `A person should take over${r.data.note ? ` · ${r.data.note}` : ''}` : r.data.note || undefined, meta: r.data.used.length ? `Used: ${r.data.used.map(u => u.title).join(', ')}` : undefined }
        : { who: 'us', text: r.reason, flag: 'Not an answer' }])
    })
  }
  useEffect(() => {
    const onTry = (e: Event) => ask(String((e as CustomEvent).detail ?? ''))
    window.addEventListener('lead-agent-try', onTry)
    return () => window.removeEventListener('lead-agent-try', onTry)
  })
  const can = connected && canManage
  return (
    <aside className={s.test} aria-label="Test the agent">
      <div className={s.testHead}>
        <span className={s.kicker} style={{ flex: 1 }}>TEST THE AGENT · {brandName}</span>
        <button type="button" className={s.btn} style={{ padding: '2px 10px' }} onClick={() => setChat([])}>Clear</button>
        <button type="button" className={s.cardIcon} title="Collapse panel" onClick={onClose}>»</button>
      </div>
      <div className={s.chat}>
        {chat.length === 0 ? (
          <>
            <span className={s.small}>{can ? 'Works now, before going live. Type as a customer to see how the agent answers with the settings on the left. Try one of these:' : !connected ? 'The AI is not connected yet (no API key) — the test needs it.' : 'Testing needs Lead View · Manage.'}</span>
            {can ? SAMPLES.map(x => <button key={x} type="button" className={s.sample} onClick={() => ask(x)}>{x}</button>) : null}
          </>
        ) : chat.map((l, i) => (
          <div key={i} style={{ display: 'contents' }}>
            <div className={s.bubble} data-from={l.who === 'customer' ? 'customer' : 'bot'}>{l.text}</div>
            {l.flag ? <div className={s.flag}>{l.flag}</div> : null}
            {l.meta ? <span className={s.small} style={{ alignSelf: 'flex-start' }}>{l.meta}</span> : null}
          </div>
        ))}
        {thinking ? <span className={s.small}>✦ Reading your files…</span> : null}
        <div ref={end} />
      </div>
      <form className={s.chatInput} style={{ flexDirection: 'column' }} onSubmit={e => { e.preventDefault(); ask(typed) }}>
        <span style={{ display: 'flex', gap: 6 }}>
          <input className={s.input} style={{ flex: 1 }} value={typed} onChange={e => setTyped(e.target.value)} placeholder="Ask as a customer…" disabled={!can} aria-label="Ask as a customer" />
          <button type="submit" className={s.btn} data-dark="" disabled={!can || !typed.trim() || thinking}>Send</button>
        </span>
        <span className={s.small}>Test only. Nothing is sent to customers.</span>
      </form>
    </aside>
  )
}
