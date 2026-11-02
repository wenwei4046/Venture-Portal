'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { addAgentLink, openDataFile, saveAgent, saveAgentPersona, setDataFileUntil, tryAgent } from '@/lib/leads/actions'
import type { Persona } from '@/lib/leads/ai'
import {
  APPROACHES, AVOIDS, BLOCK_PRESETS, GOALS, INSTRUCTIONS, LENGTHS, PHONE_WORDS, SALES_HABITS, TONES, agentReads, settingsOf,
  type AgentMore, type AgentSettings, type DataFile, type FixedAnswer, type KnowledgePick, type PlaySituation,
} from '@/lib/leads/agent'
import { FAQ_CATS, PLAY_CATS, endsWarn, faqCat, knowledgeLog, pbCat, type LogRow } from '@/lib/leads/agent-page'
import { dayMon, dcState, dcTree, extOf, hostOf, placeOf, type DataFolder, type Place } from '@/lib/leads/data-center'
import { INFO_KIND_LABEL, forBrand, infoKind, type LeadInfo } from '@/lib/leads/info'
import type { AuditChange } from '@/lib/audit/changes'
import { LeadIcon, type LeadIconName } from '@/components/layout/lead-icons'
import a from './agent.module.css'

/**
 * Lead View v2 › AI Agent (2026-11-02, the v2 handoff §7.12 — mig 20261102140000). One brand at a time (the dropdown),
 * five tabs, Copy from another brand, Discard, Save; the Test chat folds to a rail on the right.
 * - **How it replies**: How it talks (goal, tone, rules, sales habits, reply length) · What it avoids · When to hand over.
 * - **Knowledge**: Files (Data Center folders and files picked for this brand; a folder brings everything in it),
 *   Web links (the brand's and Shared's, or a new address — kept in the Data Center), General info (each card on or off
 *   for this agent), History (the picks' audit, and files that ended — Restore gives a new end date).
 * - **Fixed answers** and **Sales playbook**, each by the drawn three lists. **Memory**: To review · In use · Settings —
 *   learning itself is not built, so the lists stay empty; the two switches are kept.
 * Everything saves together (lead_save_ai), and a brand whose agent is saved drafts in the Inbox (copilot). Kept from
 * before though not drawn: a figure the portal has no source for reads "—" (uses, share, replied after).
 */

type Draft = { settings: AgentSettings; answers: FixedAnswer[]; playbook: PlaySituation[]; knowledge: KnowledgePick[] }
type Tab = 'how' | 'know' | 'answers' | 'play' | 'mem'
type KnowCat = 'files' | 'links' | 'info' | 'log'
const TAB_OF: Record<string, Tab> = { how: 'how', behaviour: 'how', know: 'know', knowledge: 'know', answers: 'answers', ans: 'answers', playbook: 'play', play: 'play', memory: 'mem', mem: 'mem' }
const draftOf = (m: AgentMore | undefined, p: Persona | undefined, files: DataFile[], brandId: string): Draft => ({
  settings: settingsOf(m?.settings, p?.goal ?? ''),
  answers: m?.answers ?? [],
  playbook: m?.playbook ?? [],
  // Before mig 20261102140000 there are no picks: show what the agent reads (its folder and Shared) as files picked.
  knowledge: m?.knowledge ?? agentReads(files, brandId).map(s => ({ kind: s.file.kind === 'link' ? 'link' : 'file', ref: s.file.id, paused: s.paused })),
})
let seq = 0
const newId = () => `new-${Date.now().toString(36)}${(seq++).toString(36)}`
const SAMPLES: Record<string, string[]> = {
  carress: ['Which mattress is good for back pain?', 'What is the 100-night trial?', 'Too expensive', 'Can I try it in the showroom?'],
  default: ['L 型沙發多少錢?', 'Can I pay by instalments?', 'Too expensive lah', 'Where is your showroom?'],
}

export default function AgentView({ personas, more, files, folders, foldersReady, info, history, today, connected, ready, canManage, initialBrand, initialTab }: {
  personas: Persona[]
  more: Record<string, AgentMore>
  files: DataFile[]
  folders: DataFolder[]
  foldersReady: boolean
  info: LeadInfo | null
  history: AuditChange[]
  today: string
  connected: boolean
  ready: boolean
  canManage: boolean
  initialBrand?: string
  initialTab?: string
}) {
  const router = useRouter()
  const [brandId, setBrandId] = useState(personas.some(p => p.brandId === initialBrand) ? initialBrand! : personas[0]?.brandId ?? '')
  const persona = personas.find(p => p.brandId === brandId)
  const [saved, setSaved] = useState<Record<string, Draft>>(() => Object.fromEntries(personas.map(p => [p.brandId, draftOf(more[p.brandId], p, files, p.brandId)])))
  const [drafts, setDrafts] = useState(saved)
  const d = drafts[brandId] ?? draftOf(undefined, persona, files, brandId)
  const dirty = JSON.stringify(d) !== JSON.stringify(saved[brandId])
  const [tab, setTab] = useState<Tab>(TAB_OF[initialTab ?? ''] ?? 'how')
  const [brandOpen, setBrandOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copied, setCopied] = useState('')
  const [testOpen, setTestOpen] = useState(false)
  const [error, setError] = useState('')
  const [busy, start] = useTransition()
  const dis = !canManage
  useEffect(() => {
    const anyDirty = Object.keys(drafts).some(k => JSON.stringify(drafts[k]) !== JSON.stringify(saved[k]))
    if (!anyDirty) return
    const ask = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [drafts, saved])

  const set = (fn: (x: Draft) => Draft) => { setDrafts(all => ({ ...all, [brandId]: fn(all[brandId] ?? d) })); setError('') }
  const setS = (o: Partial<AgentSettings>) => set(x => ({ ...x, settings: { ...x.settings, ...o } }))
  const setPhone = (o: Partial<AgentSettings['phone']>) => set(x => ({ ...x, settings: { ...x.settings, phone: { ...x.settings.phone, ...o } } }))
  const others = personas.filter(p => p.brandId !== brandId)
  const copyFrom = (p: Persona) => {
    const o = drafts[p.brandId]?.settings
    if (!o) return
    setS({ tone: o.tone, length: o.length, phone: { ...o.phone }, unsure: o.unsure, upset: o.upset, maxOn: o.maxOn, maxReplies: o.maxReplies })
    setCopyOpen(false); setCopied(p.brandName)
    setTimeout(() => setCopied(''), 2500)
  }
  const save = () => start(async () => {
    const r = await saveAgent(brandId, { settings: d.settings, answers: d.answers, playbook: d.playbook, ...(foldersReady ? { knowledge: d.knowledge } : {}) })
    if (!r.ok) { setError(r.reason); return }
    // A brand whose agent is set up drafts in the Inbox (copilot).
    if (persona && persona.mode !== 'copilot') {
      const m = await saveAgentPersona(brandId, { agentName: persona.agentName, personality: persona.personality, tone: persona.tone, goal: d.settings.goal, dos: persona.dos, donts: persona.donts, examples: persona.examples, mode: 'copilot' })
      if (!m.ok) { setError(m.reason); return }
    }
    setSaved(x => ({ ...x, [brandId]: d }))
    router.refresh()
  })

  const review = 0
  const t = useMemo(() => dcTree(personas.map(p => ({ id: p.brandId, name: p.brandName })), folders, files), [personas, folders, files])
  const fileOf = (id: string) => files.find(f => f.id === id)
  const liveFile = (k: KnowledgePick) => { const f = k.kind === 'file' ? fileOf(k.ref) : null; return !f || !dcState(f, today).expired }
  const knownFiles = d.knowledge.filter(k => (k.kind === 'file' && fileOf(k.ref)) || (k.kind === 'folder' && t.get(k.ref)))
  const knownLinks = d.knowledge.filter(k => k.kind === 'link' && fileOf(k.ref))
  const infoCards = (info?.cards ?? []).filter(c => forBrand(c, brandId))
  const infoOnCount = infoCards.filter(c => !d.settings.infoOff.includes(c.id) && infoKind(c, today).kind !== 'expired').length
  const tabs: Array<{ id: Tab; label: string; count: string; rust?: boolean }> = [
    { id: 'how', label: 'How it replies', count: '' },
    { id: 'know', label: 'Knowledge', count: String(knownFiles.filter(k => liveFile(k) && !k.paused).length + knownLinks.filter(k => !k.paused).length) },
    { id: 'answers', label: 'Fixed answers', count: String(d.answers.length) },
    { id: 'play', label: 'Sales playbook', count: String(d.playbook.filter(p => p.active).length) },
    { id: 'mem', label: 'Memory', count: review ? `${review} new` : '', rust: review > 0 },
  ]

  return (
    <div className={a.wrap}>
      <section className={a.card}>
        <div className={a.bar}>
          <div className={a.brandBox}>
            <button type="button" className={a.brandBtn} aria-haspopup="listbox" aria-expanded={brandOpen} onClick={() => setBrandOpen(o => !o)}>
              <LeadIcon name="store" size={15} /><span>{persona?.brandName ?? '—'}</span><LeadIcon name="chevron-down" size={14} />
            </button>
            {brandOpen ? (
              <>
                <div className={a.catch} onClick={() => setBrandOpen(false)} aria-hidden="true" />
                <div className={a.brandMenu} role="listbox" aria-label="Brand">
                  {personas.map(p => <button key={p.brandId} type="button" role="option" className={a.brandItem} aria-selected={p.brandId === brandId} onClick={() => { setBrandId(p.brandId); setBrandOpen(false) }}>{p.brandName}</button>)}
                </div>
              </>
            ) : null}
          </div>
          <div className={a.tabs} role="tablist" aria-label="AI Agent">
            {tabs.map(x => (
              <button key={x.id} type="button" role="tab" className={a.tab} aria-selected={tab === x.id} onClick={() => setTab(x.id)}>
                {x.label}{x.count ? <span className={a.tabN} data-rust={x.rust || undefined}>{x.count}</span> : null}
              </button>
            ))}
          </div>
          <div className={a.gap} />
          {canManage && others.length ? (
            <span style={{ position: 'relative' }}>
              <button type="button" className={a.ghost} data-copy="" onClick={() => (others.length === 1 ? copyFrom(others[0]) : setCopyOpen(o => !o))}
                title={copied ? `Copied from ${copied}` : others.length === 1 ? `Copy from ${others[0].brandName}` : 'Copy from another brand'}>
                <LeadIcon name="copy" size={14} />{copied ? `Copied from ${copied}` : others.length === 1 ? `Copy from ${others[0].brandName}` : 'Copy from…'}
              </button>
              {copyOpen ? (
                <>
                  <div className={a.catch} onClick={() => setCopyOpen(false)} aria-hidden="true" />
                  <div className={a.brandMenu} style={{ width: 180, right: 0, left: 'auto' }} role="menu">
                    {others.map(p => <button key={p.brandId} type="button" role="menuitem" className={a.brandItem} onClick={() => copyFrom(p)}>{p.brandName}</button>)}
                  </div>
                </>
              ) : null}
            </span>
          ) : null}
          {dirty && canManage ? <button type="button" className={a.ghost} onClick={() => set(() => saved[brandId] ?? d)}>Discard</button> : null}
          {canManage ? <button type="button" className={a.save} data-dirty={dirty || undefined} disabled={!dirty || busy || !ready} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save' : 'Saved'}</button> : null}
        </div>
        <div className={a.body}>
          {error ? <div className={a.error} role="alert">{error}</div> : null}
          {!ready ? <div className={a.error} style={{ color: 'rgb(var(--lv-fg-3))' }}>Waiting for the database update — you can try the page, but nothing is saved yet.</div> : null}
          {tab === 'how' ? <HowTab d={d} dis={dis} setS={setS} setPhone={setPhone} /> : null}
          {tab === 'know' ? (
            <KnowTab key={brandId} brandId={brandId} brandName={persona?.brandName ?? ''} d={d} set={set} dis={dis} t={t} files={files} folders={folders} foldersReady={foldersReady}
              info={info} infoCards={infoCards} infoOnCount={infoOnCount} history={history} today={today} personas={personas} setS={setS} setError={setError} />
          ) : null}
          {tab === 'answers' ? <AnswersTab key={brandId} d={d} set={set} dis={dis} /> : null}
          {tab === 'play' ? <PlayTab key={brandId} d={d} set={set} dis={dis} onTry={text => { setTestOpen(true); setTimeout(() => window.dispatchEvent(new CustomEvent('lead-agent-try', { detail: text })), 0) }} /> : null}
          {tab === 'mem' ? <MemTab d={d} dis={dis} setS={setS} /> : null}
        </div>
      </section>
      {testOpen ? (
        <TestChat key={brandId} brandId={brandId} brandName={persona?.brandName ?? ''} persona={persona} draft={d} connected={connected} canManage={canManage} onClose={() => setTestOpen(false)} />
      ) : (
        <div className={a.rail}><button type="button" className={a.railBtn} title="Test" aria-label="Test" onClick={() => setTestOpen(true)}><LeadIcon name="message-circle" size={16} /></button></div>
      )}
    </div>
  )
}

// ── Shared pieces ──

function Nav<K extends string>({ items, cur, onPick }: { items: Array<{ k: K; l: string; icon: LeadIconName; n?: string; rust?: boolean }>; cur: K; onPick: (k: K) => void }) {
  return (
    <div className={a.nav}>
      {items.map(i => (
        <button key={i.k} type="button" className={a.navBtn} aria-current={cur === i.k} onClick={() => onPick(i.k)}>
          <LeadIcon name={i.icon} size={15} /><span className={a.navL}>{i.l}</span>{i.n !== undefined ? <span className={a.navN} data-rust={i.rust || undefined}>{i.n}</span> : null}
        </button>
      ))}
    </div>
  )
}
function Head({ icon, title, children }: { icon: LeadIconName; title: string; children?: ReactNode }) {
  return <div className={a.head}><span className={a.ico}><LeadIcon name={icon} size={14} /></span><span className={a.h}>{title}</span>{children}</div>
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className={a.field}><span className={a.label}>{label}</span><div className={a.fieldBody}>{children}</div></div>
}
function Tog({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={a.tog} disabled={disabled} onClick={() => onChange(!on)} />
}
function Chips({ table, chosen, disabled, onChange }: { table: ReadonlyArray<readonly [string, string]> | ReadonlyArray<string>; chosen: string[]; disabled: boolean; onChange: (v: string[]) => void }) {
  return (
    <div className={a.chips}>
      {table.map(row => {
        const [l, text] = typeof row === 'string' ? [row, ''] : row
        const on = chosen.includes(l)
        return <button key={l} type="button" className={a.chip} title={text || undefined} aria-pressed={on} disabled={disabled} onClick={() => onChange(on ? chosen.filter(x => x !== l) : [...chosen, l])}>{on ? `✓ ${l}` : l}</button>
      })}
    </div>
  )
}
function Seg({ options, value, disabled, onChange }: { options: ReadonlyArray<readonly [string, string]>; value: string; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <div className={a.seg} role="group">
      {options.map(([l, hint]) => <button key={l} type="button" className={a.segBtn} title={hint} aria-pressed={value === l} disabled={disabled} onClick={() => onChange(l)}>{l}</button>)}
    </div>
  )
}
function Note({ value, placeholder, disabled, onChange }: { value: string; placeholder: string; disabled: boolean; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(!!value)
  if (!open && !value) return disabled ? null : <button type="button" className={a.more} onClick={() => setOpen(true)}>+ Add in your own words</button>
  return <textarea className={a.area} rows={2} value={value} maxLength={1000} placeholder={placeholder} disabled={disabled} autoFocus={!value} onChange={e => onChange(e.target.value)} />
}
/**
 * A number box typed freely (2026-11-02 — the user: "这不能设定任意数字"): the words are the box's own while it is typed in,
 * so it can be emptied and retyped; each whole number from 1 up is kept as it is typed, and leaving the box shows the
 * number kept.
 */
function NumBox({ value, onChange, label, disabled, sm }: { value: number; onChange: (n: number) => void; label: string; disabled: boolean; sm?: boolean }) {
  const [text, setText] = useState<string | null>(null)
  return (
    <input className={`${a.input} ${a.num}`} data-sm={sm ? '' : undefined} inputMode="numeric" value={text ?? String(value)} disabled={disabled} aria-label={label}
      onFocus={e => { setText(String(value)); e.target.select() }}
      onChange={e => { const t = e.target.value.replace(/\D/g, '').slice(0, 3); setText(t); const n = Number(t); if (t && n >= 1) onChange(n) }}
      onBlur={() => setText(null)} />
  )
}

// ── How it replies ──

function HowTab({ d, dis, setS, setPhone }: { d: Draft; dis: boolean; setS: (o: Partial<AgentSettings>) => void; setPhone: (o: Partial<AgentSettings['phone']>) => void }) {
  const [sec, setSec] = useState<'voice' | 'limits' | 'hand'>('voice')
  const [topic, setTopic] = useState('')
  const [trig, setTrig] = useState('')
  const s = d.settings, ph = s.phone
  const blockAll = [...new Set([...BLOCK_PRESETS, ...s.blocked])]
  return (
    <div className={a.split} data-narrow="">
      <Nav items={[{ k: 'voice', l: 'How it talks', icon: 'message-circle' }, { k: 'limits', l: 'What it avoids', icon: 'shield-off' }, { k: 'hand', l: 'When to hand over', icon: 'hand' }]} cur={sec} onPick={setSec} />
      <div className={a.col} data-w="640">
        {sec === 'voice' ? (
          <>
            <Head icon="message-circle" title="How it talks" />
            <Field label="Goal">
              <textarea className={a.area} rows={2} value={s.goal} maxLength={1000} disabled={dis} aria-label="Goal" onChange={e => setS({ goal: e.target.value })} />
              <div className={a.goals}>{GOALS.map(([l, text]) => <button key={l} type="button" className={a.goal} aria-pressed={s.goal === text} disabled={dis} onClick={() => setS({ goal: text })}>{l}</button>)}</div>
            </Field>
            <Field label="Tone">
              <Seg options={TONES} value={s.tone} disabled={dis} onChange={tone => setS({ tone })} />
              <Note value={s.toneNote} placeholder="Describe the tone in your own words" disabled={dis} onChange={toneNote => setS({ toneNote })} />
            </Field>
            <Field label="How it talks">
              <Chips table={INSTRUCTIONS} chosen={s.rules} disabled={dis} onChange={rules => setS({ rules })} />
              <textarea className={a.area} rows={2} value={s.instr} maxLength={2000} disabled={dis} placeholder="Anything else the agent should know or do" aria-label="Anything else the agent should know or do" onChange={e => setS({ instr: e.target.value })} />
            </Field>
            <Field label="How it sells">
              <Chips table={SALES_HABITS} chosen={s.habits} disabled={dis} onChange={habits => setS({ habits })} />
              <Note value={s.sellNote} placeholder="Other sales habits" disabled={dis} onChange={sellNote => setS({ sellNote })} />
            </Field>
            <Field label="Reply length"><Seg options={LENGTHS} value={s.length} disabled={dis} onChange={length => setS({ length })} /></Field>
          </>
        ) : null}
        {sec === 'limits' ? (
          <>
            <Head icon="shield-off" title="What it avoids" />
            <Field label="Avoid">
              <Chips table={AVOIDS} chosen={s.avoid} disabled={dis} onChange={avoid => setS({ avoid })} />
              <Note value={s.avoidNote} placeholder="Anything else the agent must not say or do" disabled={dis} onChange={avoidNote => setS({ avoidNote })} />
            </Field>
            <Field label="Don’t answer">
              <Chips table={blockAll} chosen={s.blocked} disabled={dis} onChange={blocked => setS({ blocked })} />
              {!dis ? (
                <input className={`${a.input} ${a.topic}`} value={topic} placeholder="+ Add a topic, press Enter" aria-label="Add a topic" maxLength={80}
                  onChange={e => setTopic(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && topic.trim()) { setS({ blocked: [...new Set([...s.blocked, topic.trim()])] }); setTopic('') } }} />
              ) : null}
            </Field>
          </>
        ) : null}
        {sec === 'hand' ? (
          <>
            <Head icon="hand" title="When to hand over" />
            <Field label="Phone number">
              <div className={a.togRow}><Tog on={ph.on} disabled={dis} label="Ask for the mobile number" onChange={on => setPhone({ on })} /><span>Ask for the mobile number</span></div>
              {ph.on ? (
                <div className={a.nest}>
                  <div className={a.togLine}>
                    <Tog on={ph.afterOn} disabled={dis} label="After agent replies" onChange={afterOn => setPhone({ afterOn })} /><span>After</span>
                    <NumBox value={ph.after} disabled={dis} label="Agent replies" onChange={after => setPhone({ after })} />
                    <span>agent replies</span>
                  </div>
                  {ph.afterOn ? <textarea className={a.area} rows={2} value={ph.ask} maxLength={600} disabled={dis} aria-label="How it asks" onChange={e => setPhone({ ask: e.target.value })} /> : null}
                  <div className={a.togLine}><Tog on={ph.wordsOn} disabled={dis} label="When the customer mentions" onChange={wordsOn => setPhone({ wordsOn })} /><span>When the customer mentions</span></div>
                  {ph.wordsOn ? (
                    <>
                      <div className={a.trigs}>
                        {ph.words.map(w => <span key={w} className={a.trig}>{w}{!dis ? <button type="button" className={a.x} title="Remove" aria-label={`Remove ${w}`} onClick={() => setPhone({ words: ph.words.filter(x => x !== w) })}>×</button> : null}</span>)}
                        {!dis ? PHONE_WORDS.filter(w => !ph.words.includes(w)).map(w => <button key={w} type="button" className={a.sug} onClick={() => setPhone({ words: [...ph.words, w] })}>+ {w}</button>) : null}
                        {!dis ? <input className={`${a.input} ${a.other}`} value={trig} placeholder="Other word…" aria-label="Other word" maxLength={80} onChange={e => setTrig(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && trig.trim()) { setPhone({ words: [...new Set([...ph.words, trig.trim()])] }); setTrig('') } }} /> : null}
                      </div>
                      <textarea className={a.area} rows={2} value={ph.wordsAsk} maxLength={600} disabled={dis} aria-label="How it asks then" onChange={e => setPhone({ wordsAsk: e.target.value })} />
                    </>
                  ) : null}
                </div>
              ) : null}
            </Field>
            <Field label="Hand to a person">
              <div className={a.togRow}><Tog on={s.unsure} disabled={dis} label="When unsure" onChange={unsure => setS({ unsure })} /><span>When unsure</span></div>
              <div className={a.togRow}><Tog on={s.upset} disabled={dis} label="When the customer is upset" onChange={upset => setS({ upset })} /><span>When the customer is upset</span></div>
              <div className={a.togRow}>
                <Tog on={s.maxOn} disabled={dis} label="After agent replies" onChange={maxOn => setS({ maxOn })} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>After
                  <NumBox sm value={s.maxReplies} disabled={dis} label="Agent replies before a person" onChange={maxReplies => setS({ maxReplies })} />
                  agent replies</span>
              </div>
            </Field>
          </>
        ) : null}
      </div>
    </div>
  )
}

// ── Knowledge ──

function KnowTab({ brandId, brandName, d, set, dis, t, files, folders, foldersReady, info, infoCards, infoOnCount, history, today, personas, setS, setError }: {
  brandId: string
  brandName: string
  d: Draft
  set: (fn: (x: Draft) => Draft) => void
  dis: boolean
  t: ReturnType<typeof dcTree>
  files: DataFile[]
  folders: DataFolder[]
  foldersReady: boolean
  info: LeadInfo | null
  infoCards: LeadInfo['cards']
  infoOnCount: number
  history: AuditChange[]
  today: string
  personas: Persona[]
  setS: (o: Partial<AgentSettings>) => void
  setError: (e: string) => void
}) {
  const router = useRouter()
  const [cat, setCat] = useState<KnowCat>('files')
  const [sel, setSel] = useState<string | null>(null)
  const [hSel, setHSel] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const [busy, start] = useTransition()
  const fileOf = (id: string) => files.find(f => f.id === id)
  const brandFor = (id: string | null) => (id ? personas.find(p => p.brandId === id)?.brandName ?? '—' : 'Shared')
  const pickKey = (k: { kind: string; ref: string }) => `${k.kind}:${k.ref}`
  const expired = (f: DataFile) => dcState(f, today).expired
  const fileRows = d.knowledge.filter(k => (k.kind === 'file' && fileOf(k.ref) && !expired(fileOf(k.ref)!)) || (k.kind === 'folder' && t.get(k.ref)))
  const linkRows = d.knowledge.filter(k => k.kind === 'link' && fileOf(k.ref))
  const ended = d.knowledge.filter(k => k.kind === 'file' && fileOf(k.ref) && expired(fileOf(k.ref)!)).map(k => fileOf(k.ref)!)
  const log = useMemo(() => knowledgeLog(history, brandId, ended.map(f => ({ id: f.id, validUntil: f.validUntil! }))), [history, brandId, ended])
  const nameOf = (r: Pick<LogRow, 'kind' | 'ref'>) => (r.kind === 'folder' ? t.get(r.ref)?.name : fileOf(r.ref)?.kind === 'link' ? hostOf(fileOf(r.ref)?.url ?? '') : fileOf(r.ref)?.name) ?? 'Removed from the Data Center'
  const toggle = (k: KnowledgePick) => set(x => ({ ...x, knowledge: x.knowledge.map(y => (pickKey(y) === pickKey(k) ? { ...y, paused: !y.paused } : y)) }))
  const drop = (k: KnowledgePick) => { set(x => ({ ...x, knowledge: x.knowledge.filter(y => pickKey(y) !== pickKey(k)) })); setSel(null) }
  const cur = fileRows.find(k => pickKey(k) === sel) ?? fileRows[0] ?? null
  const openFile = (f: DataFile) => {
    if (!f.path) return
    const w = window.open('', '_blank')
    start(async () => {
      const r = await openDataFile(f.path!)
      if (!r.ok) { w?.close(); setError(r.reason); return }
      if (w) w.location.href = r.data
    })
  }
  const CATS: Array<{ k: KnowCat; l: string; icon: LeadIconName; n: string }> = [
    { k: 'files', l: 'Files', icon: 'file-text', n: String(fileRows.length) }, { k: 'links', l: 'Web links', icon: 'link', n: String(linkRows.length) },
    { k: 'info', l: 'General info', icon: 'store', n: String(infoOnCount) }, { k: 'log', l: 'History', icon: 'history', n: '' },
  ]
  const title = CATS.find(c => c.k === cat)!.l
  const stOf = (k: KnowledgePick) => (k.paused ? { l: 'Paused', t: 'paused' } : { l: 'In use', t: 'on' })

  return (
    <div className={a.split}>
      <Nav items={CATS} cur={cat} onPick={k => { setCat(k); setPicker(false) }} />
      <div className={a.col} data-gap="">
        <div className={a.headGrid}>
          <Head icon="book-open" title={title}>
            {(cat === 'files' || cat === 'links') && !dis ? <button type="button" className={a.addBtn} disabled={!foldersReady} title={foldersReady ? undefined : 'Waiting for the database update'} onClick={() => setPicker(true)}><LeadIcon name="plus" size={14} />{cat === 'links' ? 'Add links' : 'Add files'}</button> : null}
          </Head>
        </div>
        {picker ? (
          <Picker links={cat === 'links'} brandId={brandId} brandName={brandName} d={d} t={t} files={files} folders={folders} busy={busy}
            onClose={() => setPicker(false)}
            onAdd={picks => { set(x => ({ ...x, knowledge: [...x.knowledge, ...picks.filter(p => !x.knowledge.some(y => pickKey(y) === pickKey(p)))] })); setPicker(false) }}
            onAddUrl={url => start(async () => {
              const r = await addAgentLink(brandId, url)
              if (!r.ok) { setError(r.reason); return }
              set(x => ({ ...x, knowledge: [...x.knowledge, { kind: 'link', ref: r.data, paused: false }] }))
              setPicker(false)
              router.refresh()
            })} />
        ) : null}

        {cat === 'files' ? (
          <div className={a.listGrid}>
            <div className={a.listCol}>
              <div className={a.th}><span>File</span><span>Folder</span><span>Ends</span><span>Status</span></div>
              {fileRows.map(k => {
                const f = k.kind === 'file' ? fileOf(k.ref)! : null, node = k.kind === 'folder' ? t.get(k.ref)! : null
                const st = stOf(k)
                return (
                  <div key={pickKey(k)} className={a.kRow} role="option" aria-selected={cur ? pickKey(cur) === pickKey(k) : false} onClick={() => setSel(pickKey(k))}>
                    <span className={a.kName}><span className={a.ext}>{f ? extOf(f.name, f.mime).ext : 'DIR'}</span><span>{f ? f.name : node!.name}</span></span>
                    <span className={a.dim}>{f ? t.pathOf(placeOf(f)) : t.pathOf(node!.parent) || 'Data center'}</span>
                    <span className={a.dim} data-mid={f?.validUntil ? '' : undefined} data-none={f?.validUntil ? undefined : ''}>{f?.validUntil ? dayMon(f.validUntil) : '—'}</span>
                    <span className={a.st} data-t={st.t}>{st.l}</span>
                  </div>
                )
              })}
              {!fileRows.length ? <div className={a.empty}>No files yet — add folders or files from the Data Center.</div> : null}
            </div>
            {cur ? (() => {
              const f = cur.kind === 'file' ? fileOf(cur.ref)! : null, node = cur.kind === 'folder' ? t.get(cur.ref)! : null
              const st = stOf(cur), warn = f ? endsWarn(f.validUntil, today) : null
              const also = f ? [...new Set((f.usedBy ?? []).filter(u => u.brandId !== brandId).map(u => `AI Agent · ${brandFor(u.brandId)}`))] : []
              const vers = f?.versions ?? []
              return (
                <div className={a.side}>
                  <div className={a.sTop}>
                    <div className={a.sHead}>
                      <span className={a.bigExt}>{f ? extOf(f.name, f.mime).ext : 'DIR'}</span>
                      <div className={a.sTitles}><span className={a.sName}>{f ? f.name : node!.name}</span><span className={a.st} data-t={st.t}>{st.l}</span></div>
                    </div>
                    {warn ? <div className={a.warn} data-ended={warn.ended || undefined}><LeadIcon name="clock" size={13} />{warn.text}</div> : null}
                    <div className={a.sBtns}>
                      {f ? <button type="button" className={a.dark} title="Open file" disabled={busy} onClick={() => openFile(f)}><LeadIcon name="external-link" size={14} />Open</button>
                        : <Link className={a.dark} href="/leads/knowledge" title="Open in the Data Center"><LeadIcon name="external-link" size={14} />Open</Link>}
                      <button type="button" className={a.light} disabled={dis} onClick={() => toggle(cur)}>{cur.paused ? 'Resume' : 'Pause'}</button>
                      <button type="button" className={a.sq} title="Remove from agent" aria-label="Remove from agent" disabled={dis} onClick={() => drop(cur)}><LeadIcon name="trash-2" size={15} /></button>
                    </div>
                  </div>
                  <div className={a.stats}>
                    <div className={a.stat}><span>—</span><span>replies · 7 days</span></div>
                    <div className={a.stat}><span>—</span><span>of AI replies</span></div>
                  </div>
                  <div className={a.sBody}>
                    <div className={a.sSect} data-tight="">
                      <span className={a.kicker} data-pb="">DETAILS</span>
                      {f ? (
                        <>
                          <div className={a.kv}><span>Uploaded</span><span>{vers.length ? `${dayMon(vers[vers.length - 1].at)} · ${vers[vers.length - 1].byName || '—'}` : `${dayMon(f.updatedAt)} · ${f.updatedByName || '—'}`}</span></div>
                          <div className={a.kv}><span>Starts</span><span>{f.validFrom ? dayMon(f.validFrom) : vers.length ? dayMon(vers[vers.length - 1].at) : dayMon(f.updatedAt)}</span></div>
                          <div className={a.kv}><span>Ends</span><span>{f.validUntil ? dayMon(f.validUntil) : 'No end date'}</span></div>
                          <div className={a.kv}><span>Folder</span><span>{t.pathOf(placeOf(f))}</span></div>
                          <div className={a.kv}><span>Version</span><span>v{f.ver}</span></div>
                        </>
                      ) : (
                        <>
                          <div className={a.kv}><span>Folder</span><span>{t.pathOf(node!.place)}</span></div>
                          <div className={a.kv}><span>Files</span><span>{t.count(node!.place)} — everything in it, as it changes</span></div>
                        </>
                      )}
                    </div>
                    {also.length ? <div className={a.sSect}><span className={a.kicker}>ALSO USED IN</span><div className={a.also}>{also.map(x => <span key={x}>{x}</span>)}</div></div> : null}
                  </div>
                </div>
              )
            })() : null}
          </div>
        ) : null}

        {cat === 'links' ? (
          <div className={a.listCol} style={{ maxWidth: 'none' }}>
            {linkRows.map(k => {
              const f = fileOf(k.ref)!, st = stOf(k)
              return (
                <div key={pickKey(k)} className={a.uRow}>
                  <span>{f.url}</span>
                  <span className={a.dim} style={{ color: 'rgb(var(--lv-fg-4))' }}>{brandFor(f.brandId)}</span>
                  <span className={a.kCell} style={{ color: k.paused ? 'rgb(var(--lv-warn))' : 'rgb(var(--lv-pos))' }}>{st.l}</span>
                  <span className={a.uAct}><button type="button" className={a.textBtn} disabled={dis} onClick={() => toggle(k)}>{k.paused ? 'Resume' : 'Pause'}</button></span>
                </div>
              )
            })}
            {!linkRows.length ? <div className={a.empty}>No web links yet.</div> : null}
          </div>
        ) : null}

        {cat === 'info' ? (
          <div className={a.listCol}>
            {infoCards.map(c => {
              const k = infoKind(c, today), off = d.settings.infoOff.includes(c.id), exp = k.kind === 'expired', on = !off && !exp
              const catLabel = info?.cats.find(x => x.id === c.catId)?.label ?? ''
              const first = c.fields[0]
              const tone = k.kind === 'live' ? 'on' : k.kind === 'soon' ? 'soon' : k.kind === 'scheduled' ? 'sched' : k.kind === 'expired' ? 'expired' : 'off'
              return (
                <div key={c.id} className={a.giRow} role="checkbox" aria-checked={on} aria-disabled={exp || dis} tabIndex={0}
                  onClick={() => { if (exp || dis) return; setS({ infoOff: off ? d.settings.infoOff.filter(x => x !== c.id) : [...d.settings.infoOff, c.id] }) }}>
                  <span className={a.box} data-on={on || undefined}>{on ? <LeadIcon name="check" size={12} /> : null}</span>
                  <span className={a.giText}><span>{c.name}</span><span>{[catLabel, first?.value].filter(Boolean).join(' · ')}</span></span>
                  <span className={`${a.st} ${a.giSt}`} data-t={tone}>{INFO_KIND_LABEL[k.kind]}</span>
                </div>
              )
            })}
            {!infoCards.length ? <div className={a.empty}>No General info for this brand yet.</div> : null}
            <Link className={a.goLink} href="/leads/info">Edit in General info<LeadIcon name="arrow-up-right" size={13} /></Link>
          </div>
        ) : null}

        {cat === 'log' ? (
          <div className={a.listGrid}>
            <div className={a.listCol}>
              {log.map(r => (
                <div key={r.key} className={a.lRow} role="option" aria-selected={(hSel ?? log[0]?.key) === r.key} onClick={() => setHSel(r.key)}>
                  <span className={a.act} data-a={r.act}>{r.act}</span>
                  <span className={a.lWhat}>{nameOf(r)}</span>
                  <span className={a.lWhen}><span>{dayMon(r.at)}</span><span>{r.by}</span></span>
                </div>
              ))}
              {!log.length ? <div className={a.empty}>Nothing has changed yet.</div> : null}
            </div>
            {(() => {
              const h = log.find(r => r.key === (hSel ?? log[0]?.key))
              if (!h) return null
              return <HistoryCard key={h.key} h={h} f={h.kind !== 'folder' ? fileOf(h.ref) ?? null : null} name={nameOf(h)} t={t} today={today} dis={dis}
                onRestore={(f, until) => start(async () => {
                  const r = await setDataFileUntil(f.id, until)
                  if (!r.ok) { setError(r.reason); return }
                  setCat('files'); setSel(`file:${f.id}`); setHSel(null)
                  router.refresh()
                })} />
            })()}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function HistoryCard({ h, f, name, t, today, dis, onRestore }: { h: LogRow; f: DataFile | null; name: string; t: ReturnType<typeof dcTree>; today: string; dis: boolean; onRestore: (f: DataFile, until: string) => void }) {
  const [date, setDate] = useState('')
  const ext = f ? (f.kind === 'link' ? 'LINK' : extOf(f.name, f.mime).ext) : h.kind === 'folder' ? 'DIR' : 'FILE'
  const vers = f?.versions ?? []
  const canRestore = h.act === 'Expired' && !!f && !dis
  return (
    <div className={a.side} data-pad="">
      <div className={a.sHead}>
        <span className={a.bigExt}>{ext}</span>
        <div className={a.sTitles}><span className={a.sName}>{name}</span><span className={a.sWhen} style={{ color: h.act === 'Expired' ? 'rgb(var(--lv-accent))' : 'rgb(var(--lv-fg-2))' }}>{h.act} · <span>{dayMon(h.at)} · {h.by}</span></span></div>
      </div>
      <div className={a.sSect} data-tight="">
        <span className={a.kicker} data-pb="">DETAILS</span>
        <div className={a.kv}><span>Uploaded</span><span>{f && vers.length ? `${dayMon(vers[vers.length - 1].at)} · ${vers[vers.length - 1].byName || '—'}` : '—'}</span></div>
        <div className={a.kv}><span>Ended</span><span>{f?.validUntil && f.validUntil < today ? dayMon(f.validUntil) : '—'}</span></div>
        <div className={a.kv}><span>Folder</span><span>{f && f.kind === 'file' ? t.pathOf(placeOf(f)) : '—'}</span></div>
        <div className={a.kv}><span>Version</span><span>{f && f.kind === 'file' ? `v${f.ver}` : '—'}</span></div>
        <div className={a.kv}><span>Replies</span><span>—</span></div>
      </div>
      {canRestore ? (
        <div className={a.restore}>
          <span className={a.kicker}>RESTORE UNTIL</span>
          <div className={a.restoreRow}>
            <input type="date" value={date} min={today} aria-label="Restore until" onChange={e => setDate(e.target.value)} />
            <button type="button" className={a.green} disabled={!date} onClick={() => onRestore(f!, date)}>Restore</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Picker({ links, brandId, brandName, d, t, files, folders, busy, onClose, onAdd, onAddUrl }: {
  links: boolean
  brandId: string
  brandName: string
  d: Draft
  t: ReturnType<typeof dcTree>
  files: DataFile[]
  folders: DataFolder[]
  busy: boolean
  onClose: () => void
  onAdd: (picks: KnowledgePick[]) => void
  onAddUrl: (url: string) => void
}) {
  const [pick, setPick] = useState<string[]>([])
  const [shut, setShut] = useState<Record<string, boolean>>({})
  const [paste, setPaste] = useState('')
  const [pasteErr, setPasteErr] = useState(false)
  const have = new Set(d.knowledge.map(k => `${k.kind}:${k.ref}`))
  const roots: Place[] = [`B:${brandId}`, 'B:shared']
  void folders
  // Files: the brand's folder and Shared, each folder with its folders and files; a folder already picked (or picked
  // now) takes what is in it, so those rows are ticked and locked.
  type Row = { key: string; kind: 'folder' | 'file'; ref: string; name: string; depth: number; meta: string; place: Place; anc: Place[]; isDir: boolean; has: boolean }
  const rows: Row[] = []
  const walk = (p: Place, depth: number) => {
    const n = t.get(p)
    if (!n) return
    const anc = t.chain(n.parent).map(c => c.place)
    const nf = t.count(p)
    rows.push({ key: `folder:${p}`, kind: 'folder', ref: p, name: n.name, depth, meta: `${nf} ${nf === 1 ? 'file' : 'files'}`, place: p, anc, isDir: true, has: t.kids(p).length + t.filesIn(p).length > 0 })
    if (shut[p]) return
    for (const k of t.kids(p)) walk(k.place, depth + 1)
    for (const f of t.filesIn(p)) rows.push({ key: `file:${f.id}`, kind: 'file', ref: f.id, name: f.name, depth: depth + 1, meta: extOf(f.name, f.mime).ext, place: p, anc: [...anc, p], isDir: false, has: false })
  }
  if (!links) roots.forEach(r => walk(r, 0))
  // A brand's own folder or Shared is no folder row: picking it picks each of its folders and files.
  const realKey = (r: Row) => (r.isDir && r.ref.startsWith('B:') ? null : r.key)
  const pickedDirs = pick.filter(k => k.startsWith('folder:')).map(k => k.slice(7))
  const haveDir = (p: Place) => have.has(`folder:${p}`)
  const rowState = (r: Row) => {
    const added = realKey(r) ? have.has(r.key) : false
    const inDir = r.anc.some(x => pickedDirs.includes(x) || haveDir(x))
    return { added, lock: added || inDir, on: pick.includes(r.key) }
  }
  const linkList = files.filter(f => f.kind === 'link' && (f.brandId === null || f.brandId === brandId) && !have.has(`link:${f.id}`))
  const toggleRow = (r: Row) => {
    if (r.isDir && r.ref.startsWith('B:')) {
      // The brand's folder: tick each of its folders and files at the top.
      const inner = [...t.kids(r.ref).map(k => `folder:${k.place}`), ...t.filesIn(r.ref).map(f => `file:${f.id}`)].filter(k => !have.has(k))
      const all = inner.every(k => pick.includes(k))
      setPick(p => (all ? p.filter(k => !inner.includes(k)) : [...new Set([...p, ...inner])]))
      return
    }
    if (rowState(r).lock) return
    setPick(p => (p.includes(r.key) ? p.filter(k => k !== r.key) : [...p, r.key]))
  }
  const addPaste = () => {
    const v = paste.trim().replace(/\/$/, '')
    if (!v) return
    const dirHit = [...t.nodes.values()].find(n => t.linkOf(n.place) === v)
    const fileHit = files.find(f => f.kind === 'file' && t.linkOf(placeOf(f), f.name) === v && (f.brandId === null || f.brandId === brandId))
    if (fileHit) { onAdd([{ kind: 'file', ref: fileHit.id, paused: false }]); return }
    if (dirHit?.folder && (dirHit.brandId === null || dirHit.brandId === brandId)) { onAdd([{ kind: 'folder', ref: dirHit.place, paused: false }]); return }
    setPasteErr(true)
  }
  const urlOk = /^https:\/\/\S+\.\S+/.test(paste.trim())
  const count = pick.length
  const empty = links ? !linkList.length : !rows.some(r => !rowState(r).lock)
  return (
    <div className={a.pkBack} onClick={onClose}>
      <div className={a.pk} role="dialog" aria-modal="true" aria-label={links ? 'Add links' : 'Add files'} onClick={e => e.stopPropagation()}>
        <div className={a.pkTitle}>{links ? 'Add links' : 'Add files'}</div>
        {!links ? (
          <>
            <div className={a.pkPaste} data-tint="">
              <LeadIcon name="link" size={14} />
              <input className={a.pkIn} value={paste} placeholder="Paste a Data center link" aria-label="Paste a Data center link" onChange={e => { setPaste(e.target.value); setPasteErr(false) }} onKeyDown={e => { if (e.key === 'Enter') addPaste() }} />
              <button type="button" className={a.pkGo} disabled={!paste.trim()} onClick={addPaste}>Add</button>
            </div>
            {pasteErr ? <span className={a.pkErr}>Link not found in Data center</span> : null}
          </>
        ) : null}
        <div className={a.pkList}>
          {links ? linkList.map(f => {
            const on = pick.includes(`link:${f.id}`)
            return (
              <div key={f.id} className={a.pkRow} role="checkbox" aria-checked={on} style={{ paddingLeft: 14 }} onClick={() => setPick(p => (on ? p.filter(k => k !== `link:${f.id}`) : [...p, `link:${f.id}`]))}>
                <span className={a.pkBox}>{on ? '✓' : ''}</span>
                <span className={a.pkName}>{f.url}</span><span className={a.pkMeta}>{f.brandId === null ? 'Shared' : brandName}</span>
              </div>
            )
          }) : rows.map(r => {
            const st = rowState(r)
            const brandRoot = r.isDir && r.ref.startsWith('B:')
            return (
              <div key={r.key} className={a.pkRow} role="checkbox" aria-checked={st.on || st.lock} data-lock={!brandRoot && st.lock && !st.on ? '' : undefined} style={{ paddingLeft: 10 + r.depth * 18 }} onClick={() => toggleRow(r)}>
                <button type="button" className={a.pkChev} data-off={r.has ? undefined : ''} aria-expanded={!shut[r.ref]} aria-label="Fold"
                  onClick={e => { e.stopPropagation(); if (r.isDir) setShut(x => ({ ...x, [r.ref]: !x[r.ref] })) }}><LeadIcon name="chevron-right" size={13} /></button>
                <span className={a.pkBox}>{st.on || st.lock ? '✓' : ''}</span>
                {r.isDir ? <LeadIcon name="folder" size={15} /> : null}
                <span className={a.pkName} data-dir={r.isDir || undefined}>{r.name}</span>
                <span className={a.pkMeta}>{st.added ? 'Added' : r.meta}</span>
              </div>
            )
          })}
        </div>
        {empty ? <div className={a.pkEmpty}>{links ? 'Every Data Center link for this brand is already added.' : 'Everything in these folders is already added.'}</div> : null}
        {links ? (
          <>
            <div className={a.pkPaste}>
              <LeadIcon name="link" size={14} />
              <input className={a.pkIn} value={paste} placeholder="Or paste a web address, e.g. https://…" aria-label="Paste a web address" onChange={e => { setPaste(e.target.value); setPasteErr(false) }}
                onKeyDown={e => { if (e.key === 'Enter') { if (urlOk) onAddUrl(paste.trim()); else setPasteErr(true) } }} />
              <button type="button" className={a.pkGo} disabled={!urlOk || busy} onClick={() => onAddUrl(paste.trim())}>Add</button>
            </div>
            {pasteErr ? <span className={a.pkErr} style={{ paddingTop: 0 }}>Enter a full web address starting with https://</span> : null}
          </>
        ) : null}
        <div className={a.pkFoot}>
          <button type="button" className={a.pkCancel} onClick={onClose}>Cancel</button>
          <button type="button" className={a.pkAdd} disabled={!count} onClick={() => onAdd(pick.map(k => { const i = k.indexOf(':'); return { kind: k.slice(0, i) as KnowledgePick['kind'], ref: k.slice(i + 1), paused: false } }))}>{count ? `Add ${count}` : 'Add'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Fixed answers ──

function AnswersTab({ d, set, dis }: { d: Draft; set: (fn: (x: Draft) => Draft) => void; dis: boolean }) {
  const [cat, setCat] = useState<'pay' | 'del' | 'prod'>('pay')
  const [sel, setSel] = useState<string | null>(null)
  // A new answer stays in the list it was added to until its question says otherwise.
  const [fresh, setFresh] = useState<Record<string, 'pay' | 'del' | 'prod'>>({})
  const catOf = (q: FixedAnswer) => (!q.question.trim() && fresh[q.id] ? fresh[q.id] : faqCat(q.question))
  const list = d.answers.filter(q => catOf(q) === cat)
  const cur = list.find(q => q.id === sel) ?? list[0] ?? null
  const upd = (id: string, o: Partial<FixedAnswer>) => set(x => ({ ...x, answers: x.answers.map(q => (q.id === id ? { ...q, ...o } : q)) }))
  const title = FAQ_CATS.find(c => c[0] === cat)![1]
  return (
    <div className={a.split}>
      <Nav items={FAQ_CATS.map(([k, l, icon]) => ({ k, l, icon: icon as LeadIconName, n: String(d.answers.filter(q => catOf(q) === k).length) }))} cur={cat} onPick={k => { setCat(k); setSel(null) }} />
      <div className={a.col}>
        <div className={a.headGrid}>
          <Head icon="message-square-quote" title={title}>
            {!dis ? <button type="button" className={a.addBtn} onClick={() => { const id = newId(); set(x => ({ ...x, answers: [...x.answers, { id, question: '', answer: '', source: 'Added by you' }] })); setFresh(f => ({ ...f, [id]: cat })); setSel(id) }}><LeadIcon name="plus" size={14} />Add answer</button> : null}
          </Head>
        </div>
        <div className={a.listGrid}>
          <div className={a.listCol}>
            {list.map(q => (
              <div key={q.id} className={a.qRow} role="option" aria-selected={cur?.id === q.id} onClick={() => setSel(q.id)}>
                <span className={a.qQ}>{q.question || 'Untitled question'}</span><span className={a.qA}>{q.answer}</span>
              </div>
            ))}
            {!list.length ? <div className={a.empty}>No answers here yet</div> : null}
          </div>
          {cur ? (
            <div className={a.side}>
              <div className={a.sTop} data-tight="">
                <span className={a.kicker}>CUSTOMER ASKS</span>
                <input className={a.fInput} data-strong="" value={cur.question} maxLength={500} placeholder="Customer asks…" aria-label="Customer asks" disabled={dis} onChange={e => upd(cur.id, { question: e.target.value })} />
                <span className={a.kicker} data-pt="">EXACT REPLY</span>
                <textarea className={a.fInput} rows={4} value={cur.answer} maxLength={2000} placeholder="Exact reply" aria-label="Exact reply" disabled={dis} onChange={e => upd(cur.id, { answer: e.target.value })} />
              </div>
              <div className={a.stats}>
                <div className={a.stat}><span>—</span><span>times used · 7 days</span></div>
                <div className={a.stat}><span>—</span><span>customer replied after</span></div>
              </div>
              <div className={a.sBody} style={{ gap: 4, padding: '16px 18px' }}>
                <span className={a.kicker} data-pb="">DETAILS</span>
                <div className={a.kv} style={{ padding: 0 }}><span>Source</span><span>{cur.source || 'Added by you'}</span></div>
              </div>
              {!dis ? <div className={a.del}><button type="button" className={a.delBtn} onClick={() => { set(x => ({ ...x, answers: x.answers.filter(q => q.id !== cur.id) })); setSel(null) }}><LeadIcon name="trash-2" size={14} />Delete</button></div> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ── Sales playbook ──

function PlayTab({ d, set, dis, onTry }: { d: Draft; set: (fn: (x: Draft) => Draft) => void; dis: boolean; onTry: (text: string) => void }) {
  const [cat, setCat] = useState<'price' | 'hes' | 'choose'>('price')
  const [sel, setSel] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [fresh, setFresh] = useState<Record<string, 'price' | 'hes' | 'choose'>>({})
  const catOf = (p: PlaySituation) => (!p.name.trim() && fresh[p.id] ? fresh[p.id] : pbCat(p.name))
  const list = d.playbook.filter(p => catOf(p) === cat)
  const cur = list.find(p => p.id === sel) ?? list[0] ?? null
  const upd = (id: string, o: Partial<PlaySituation>) => set(x => ({ ...x, playbook: x.playbook.map(p => (p.id === id ? { ...p, ...o } : p)) }))
  const title = PLAY_CATS.find(c => c[0] === cat)![1]
  return (
    <div className={a.split}>
      <Nav items={PLAY_CATS.map(([k, l, icon]) => ({ k, l, icon: icon as LeadIconName, n: String(d.playbook.filter(p => catOf(p) === k).length) }))} cur={cat} onPick={k => { setCat(k); setSel(null); setMenu(false) }} />
      <div className={a.col}>
        <div className={a.headGrid}>
          <Head icon="target" title={title}>
            {!dis ? <button type="button" className={a.addBtn} onClick={() => { const id = newId(); set(x => ({ ...x, playbook: [...x.playbook, { id, active: true, name: '', words: '', approaches: [], reply: '' }] })); setFresh(f => ({ ...f, [id]: cat })); setSel(id) }}><LeadIcon name="plus" size={14} />Add situation</button> : null}
          </Head>
        </div>
        <div className={a.listGrid}>
          <div className={a.listCol}>
            {list.map(p => (
              <div key={p.id} className={a.pRow} data-off={p.active ? undefined : ''} role="option" aria-selected={cur?.id === p.id} onClick={() => setSel(p.id)}>
                <div className={a.pText}><span className={a.qQ}>{p.name || 'Untitled situation'}</span><span>{p.words}</span></div>
                <span className={a.st} data-t={p.active ? 'on' : 'off'}>{p.active ? 'On' : 'Off'}</span>
              </div>
            ))}
            {!list.length ? <div className={a.empty}>No situations here yet</div> : null}
          </div>
          {cur ? (
            <div className={a.side} style={{ overflow: 'visible' }}>
              <div className={a.sTop} data-tight="">
                <div className={a.pbHead}>
                  <input className={a.pbName} value={cur.name} maxLength={80} placeholder="Situation" aria-label="Situation" disabled={dis} onChange={e => upd(cur.id, { name: e.target.value })} />
                  <Tog on={cur.active} disabled={dis} label="On / off" onChange={active => upd(cur.id, { active })} />
                </div>
                <span className={a.kicker} data-pt="">WHEN THE CUSTOMER SAYS</span>
                <input className={a.fInput} data-sm="" value={cur.words} maxLength={300} placeholder="Comma separated" aria-label="When the customer says" disabled={dis} onChange={e => upd(cur.id, { words: e.target.value })} />
                <span className={a.kicker} data-pt="">APPROACH</span>
                <div className={a.apBox}>
                  {cur.approaches.map(l => <span key={l} className={a.trig} data-sm="">{l}{!dis ? <button type="button" className={a.x} title="Remove" aria-label={`Remove ${l}`} onClick={() => upd(cur.id, { approaches: cur.approaches.filter(x => x !== l) })}>×</button> : null}</span>)}
                  {!dis ? <button type="button" className={a.sug} onClick={() => setMenu(m => !m)}>+ Approach</button> : null}
                  {menu ? (
                    <>
                      <div className={a.apCatch} onClick={() => setMenu(false)} aria-hidden="true" />
                      <div className={a.apMenu} role="menu">
                        {APPROACHES.map(l => {
                          const on = cur.approaches.includes(l)
                          return <button key={l} type="button" role="menuitemcheckbox" aria-checked={on} className={a.apItem} onClick={() => upd(cur.id, { approaches: on ? cur.approaches.filter(x => x !== l) : [...cur.approaches, l] })}><span className={a.apMark}>{on ? '✓' : ''}</span>{l}</button>
                        })}
                      </div>
                    </>
                  ) : null}
                </div>
                <span className={a.kicker} data-pt="">EXAMPLE REPLY</span>
                <textarea className={a.fInput} rows={4} value={cur.reply} maxLength={2000} placeholder="Example reply" aria-label="Example reply" disabled={dis} onChange={e => upd(cur.id, { reply: e.target.value })} />
              </div>
              <div className={a.stats}>
                <div className={a.stat}><span>—</span><span>times used · 7 days</span></div>
                <div className={a.stat}><span>—</span><span>gave a phone after</span></div>
              </div>
              <div className={a.pbFoot}>
                <button type="button" className={a.dark} disabled={!cur.words.trim()} onClick={() => onTry(cur.words.split(',')[0].trim())}><LeadIcon name="message-circle" size={14} />Try it</button>
                <button type="button" className={a.sq} title="Remove" aria-label="Remove" disabled={dis} onClick={() => { set(x => ({ ...x, playbook: x.playbook.filter(p => p.id !== cur.id) })); setSel(null) }}><LeadIcon name="trash-2" size={15} /></button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ── Memory ──

function MemTab({ d, dis, setS }: { d: Draft; dis: boolean; setS: (o: Partial<AgentSettings>) => void }) {
  const [cat, setCat] = useState<'rv' | 'use' | 'set'>('rv')
  const title = { rv: 'To review', use: 'In use', set: 'Settings' }[cat]
  return (
    <div className={a.split}>
      <Nav items={[{ k: 'rv', l: 'To review', icon: 'inbox', n: '0' }, { k: 'use', l: 'In use', icon: 'circle-check', n: '0' }, { k: 'set', l: 'Settings', icon: 'settings-2', n: '' }]} cur={cat} onPick={setCat} />
      <div className={a.col} data-w="680">
        <Head icon="brain" title={title} />
        {cat === 'rv' ? <div className={a.empty} style={{ borderTop: '1px solid rgb(var(--lv-line-2))' }}>Nothing to review</div> : null}
        {cat === 'use' ? <div className={a.empty} style={{ borderTop: '1px solid rgb(var(--lv-line-2))' }}>No lessons in use yet</div> : null}
        {cat === 'set' ? (
          <div className={a.memSet}>
            <div className={a.togRow}><Tog on={d.settings.autoLearn} disabled={dis} label="Learn from its own chats" onChange={autoLearn => setS({ autoLearn })} /><span>Learn from its own chats</span></div>
            <div className={a.togRow}><Tog on={d.settings.learnOthers} disabled={dis} label="Learn from templates and CS" onChange={learnOthers => setS({ learnOthers })} /><span>Learn from templates and CS</span></div>
            <span className={a.memNote}>Lessons come once the agent answers on its own — today it drafts and CS sends.</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── Test ──

type Line = { who: 'customer' | 'us'; text: string; meta?: string }

function TestChat({ brandId, brandName, persona, draft, connected, canManage, onClose }: {
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
  const can = connected && canManage && !!persona
  const ask = (text: string) => {
    const tx = text.trim()
    if (!tx || !persona || thinking || !can) return
    const next: Line[] = [...chat, { who: 'customer', text: tx }]
    setChat(next)
    setTyped('')
    start(async () => {
      const r = await tryAgent(brandId, { agentName: persona.agentName, personality: persona.personality, tone: persona.tone, goal: draft.settings.goal, dos: persona.dos, donts: persona.donts, examples: persona.examples, mode: persona.mode },
        next.map(l => ({ who: l.who, text: l.text })), { settings: draft.settings, answers: draft.answers, playbook: draft.playbook, knowledge: draft.knowledge })
      setChat(c => [...c, r.ok
        ? { who: 'us', text: r.data.reply, meta: [r.data.handoff ? `Hands to a person${r.data.note ? ` · ${r.data.note}` : ''}` : '', r.data.used.length ? `Used: ${r.data.used.map(u => u.title).join(', ')}` : ''].filter(Boolean).join(' · ') || undefined }
        : { who: 'us', text: r.reason, meta: 'Not an answer' }])
    })
  }
  useEffect(() => {
    const onTry = (e: Event) => ask(String((e as CustomEvent).detail ?? ''))
    window.addEventListener('lead-agent-try', onTry)
    return () => window.removeEventListener('lead-agent-try', onTry)
  })
  const samples = SAMPLES[brandName.toLowerCase().includes('carress') ? 'carress' : 'default']
  return (
    <section className={a.test} aria-label="Test">
      <div className={a.testHead}>
        <span>Test</span>
        <button type="button" className={a.clear} onClick={() => setChat([])}>Clear</button>
        <button type="button" className={a.fold} title="Collapse" aria-label="Collapse" onClick={onClose}><LeadIcon name="chevrons-right" size={16} /></button>
      </div>
      <div className={a.chat}>
        <div className={a.chatGap} />
        {chat.length === 0 ? (
          <div className={a.samples}>
            <span>{can ? 'Try asking' : !connected ? 'The AI is not connected yet (no API key).' : 'Testing needs Lead View · Manage.'}</span>
            {can ? samples.map(x => <button key={x} type="button" className={a.sample} onClick={() => ask(x)}>{x}</button>) : null}
          </div>
        ) : null}
        {chat.map((l, i) => (
          <div key={i} className={a.msg} data-ai={l.who === 'us' || undefined}>
            <div className={a.bubble}>{l.text}</div>
            {l.meta ? <span className={a.meta}>{l.meta}</span> : null}
          </div>
        ))}
        {thinking ? <span className={a.typing}>Typing…</span> : null}
        <div ref={end} />
      </div>
      <div className={a.chatFoot}>
        <form className={a.pill} onSubmit={e => { e.preventDefault(); ask(typed) }}>
          <input value={typed} onChange={e => setTyped(e.target.value)} placeholder="Ask as a customer…" aria-label="Ask as a customer" disabled={!can} />
          <button type="submit" className={a.send} title="Send" aria-label="Send" disabled={!can || !typed.trim() || thinking}><LeadIcon name="arrow-up" size={16} /></button>
        </form>
      </div>
    </section>
  )
}
