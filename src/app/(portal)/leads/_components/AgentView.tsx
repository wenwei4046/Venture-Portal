'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { addAgentLink, openDataFile, saveAgent, saveAgentPersona, setDataFileUntil, tryAgent } from '@/lib/leads/actions'
import type { Persona } from '@/lib/leads/ai'
import {
  APPROACHES, AVOIDS, BLOCK_PRESETS, GOALS, INSTRUCTIONS, LENGTHS, PHONE_WORDS, SALES_HABITS, TONES, agentReads, settingsOf,
  type AgentMore, type AgentSettings, type DataFile, type FixedAnswer, type KnowledgePick, type PlaySituation,
} from '@/lib/leads/agent'
import { FAQ_CATS, PLAY_CATS, endsWarn, faqCat, knowledgeLog, pbCat, type LogRow } from '@/lib/leads/agent-page'
import { dayMon, dcState, dcTree, extOf, hostOf, placeOf, readLine, type DataFolder, type Place, type ReadLevel } from '@/lib/leads/data-center'
import { DEFAULT_LEARN, memoryMeta, moveSource, rateOf, readEntries, type FileQuestion, type LearnSettings, type MemoryLine, type MemorySuggestion } from '@/lib/leads/agent-memory'
import type { LeadOutlet } from '@/lib/leads/outlets'
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

type Draft = {
  settings: AgentSettings; answers: FixedAnswer[]; playbook: PlaySituation[]; knowledge: KnowledgePick[]
  /** v3 § 5 (mig 20261110230000): Memory's lines (Knowledge › Outlets' too), the files' questions, the suggestions decided. */
  memory: MemoryLine[]; fileQs: FileQuestion[]; sugg: Record<string, 'used' | 'dismissed'>
}
type Tab = 'how' | 'know' | 'answers' | 'play' | 'mem'
type KnowCat = 'files' | 'links' | 'info' | 'outlets' | 'log'
const TAB_OF: Record<string, Tab> = { how: 'how', behaviour: 'how', know: 'know', knowledge: 'know', answers: 'answers', ans: 'answers', playbook: 'play', play: 'play', memory: 'mem', mem: 'mem' }
const draftOf = (m: AgentMore | undefined, p: Persona | undefined, files: DataFile[], brandId: string): Draft => ({
  settings: settingsOf(m?.settings, p?.goal ?? ''),
  answers: m?.answers ?? [],
  playbook: m?.playbook ?? [],
  // Before mig 20261102140000 there are no picks: show what the agent reads (its folder and Shared) as files picked.
  knowledge: m?.knowledge ?? agentReads(files, brandId).map(s => ({ kind: s.file.kind === 'link' ? 'link' : 'file', ref: s.file.id, paused: s.paused })),
  memory: m?.memory ?? [],
  fileQs: m?.fileQs ?? [],
  sugg: {},
})
let seq = 0
const newId = () => `new-${Date.now().toString(36)}${(seq++).toString(36)}`
const SAMPLES: Record<string, string[]> = {
  carress: ['Which mattress is good for back pain?', 'What is the 100-night trial?', 'Too expensive', 'Can I try it in the showroom?'],
  default: ['L 型沙發多少錢?', 'Can I pay by instalments?', 'Too expensive lah', 'Where is your showroom?'],
}

export default function AgentView({ personas, more, files, folders, foldersReady, info, history, today, connected, ready, canManage, initialBrand, initialTab, outlets = [] }: {
  /** Every brand's outlets (Knowledge › Outlets, From goal results' outlet suggestions). */
  outlets?: LeadOutlet[]
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
  // v3 § 5: Memory and Knowledge's questions save once mig 20261110230000 is in (lead_ai_more carries them).
  const memoryReady = personas.length > 0 && personas.every(p => Array.isArray(more[p.brandId]?.memory))
  const brandOutlets = outlets.filter(o => o.brandId === brandId)
  useEffect(() => {
    const anyDirty = Object.keys(drafts).some(k => JSON.stringify(drafts[k]) !== JSON.stringify(saved[k]))
    if (!anyDirty) return
    const ask = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [drafts, saved])

  // What the server holds, taken again after a save or a refresh — by each brand with nothing unsaved (a new memory
  // line's id is the database's, so the next save updates it instead of making it again).
  const latest = useRef({ drafts, saved })
  latest.current = { drafts, saved }
  const moreKey = JSON.stringify(more)
  useEffect(() => {
    const { drafts: dr, saved: sv } = latest.current
    const next: Record<string, Draft> = Object.fromEntries(personas.map(p => [p.brandId, draftOf(more[p.brandId], p, files, p.brandId)]))
    setSaved(next)
    setDrafts(Object.fromEntries(Object.keys(next).map(k => [k, !dr[k] || JSON.stringify(dr[k]) === JSON.stringify(sv[k]) ? next[k] : dr[k]])))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- moreKey stands for more
  }, [moreKey])
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
    const r = await saveAgent(brandId, {
      settings: d.settings, answers: d.answers, playbook: d.playbook, ...(foldersReady ? { knowledge: d.knowledge } : {}),
      // v3 § 5: only once the memory's migration is in (the brand's agent reads it back).
      ...(memoryReady ? {
        memory: d.memory, fileQs: d.fileQs.filter(q => q.custom || q.instruction.trim()),
        suggestions: Object.entries(d.sugg).map(([id, status]) => ({ id, status })),
      } : {}),
    })
    if (!r.ok) { setError(r.reason); return }
    // A brand whose agent is set up drafts in the Inbox (copilot).
    if (persona && persona.mode !== 'copilot') {
      const m = await saveAgentPersona(brandId, { agentName: persona.agentName, personality: persona.personality, tone: persona.tone, goal: d.settings.goal, dos: persona.dos, donts: persona.donts, examples: persona.examples, mode: 'copilot' })
      if (!m.ok) { setError(m.reason); return }
    }
    setSaved(x => ({ ...x, [brandId]: d }))
    // New lines get their ids from the database: the refresh brings them, and a brand with nothing unsaved takes them.
    router.refresh()
  })

  // The Test chat, opened with a message sent (How to reach the goal's and the playbook's Try it).
  const tryText = (text: string) => { setTestOpen(true); setTimeout(() => window.dispatchEvent(new CustomEvent('lead-agent-try', { detail: text })), 0) }
  const review = d.memory.filter(m => m.kind === 'collected' && m.status === 'review').length
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
          {tab === 'how' ? <HowTab d={d} dis={dis} setS={setS} setPhone={setPhone} onTry={() => tryText((SAMPLES[(persona?.brandName ?? '').toLowerCase()] ?? SAMPLES.default)[0])} /> : null}
          {tab === 'know' ? (
            <KnowTab key={brandId} brandId={brandId} brandName={persona?.brandName ?? ''} d={d} set={set} dis={dis} t={t} files={files} folders={folders} foldersReady={foldersReady}
              info={info} infoCards={infoCards} infoOnCount={infoOnCount} history={history} today={today} personas={personas} setS={setS} setError={setError}
              outlets={brandOutlets} asked={more[brandId]?.asked ?? {}} memoryReady={memoryReady} minChats={d.settings.learn.min} />
          ) : null}
          {tab === 'answers' ? <AnswersTab key={brandId} d={d} set={set} dis={dis} /> : null}
          {tab === 'play' ? <PlayTab key={brandId} d={d} set={set} dis={dis} onTry={tryText} /> : null}
          {tab === 'mem' ? <MemTab key={brandId} d={d} set={set} setS={setS} dis={dis} outlets={brandOutlets} memoryReady={memoryReady} suggestions={more[brandId]?.suggestions ?? []} /> : null}
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

function HowTab({ d, dis, setS, setPhone, onTry }: { d: Draft; dis: boolean; setS: (o: Partial<AgentSettings>) => void; setPhone: (o: Partial<AgentSettings['phone']>) => void; onTry: () => void }) {
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
            {/* v3 § 5: How to reach the goal — free text the AI reads before every reply; Try it opens the Test chat. */}
            <div className={a.field}>
              <div className={a.fieldHead}>
                <div className={a.fieldTitles}><span className={a.label}>How to reach the goal</span><span className={a.fieldHelp}>Write it like you’d brief a new staff member. The AI reads this before every reply.</span></div>
                <button type="button" className={a.tryBtn} onClick={onTry}><LeadIcon name="message-square" size={14} />Try it</button>
              </div>
              <textarea className={a.area} data-tall="" rows={7} value={s.howGoal} maxLength={4000} disabled={dis} aria-label="How to reach the goal"
                placeholder="e.g. Answer their question first. Ask one question to understand what they need. Only ask for the phone after their second message, and give a reason, like sending photos or the price list on WhatsApp."
                onChange={e => setS({ howGoal: e.target.value })} />
            </div>
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
              <div className={a.handNote}>
                <span className={a.handNoteL}>Also hand over when…</span>
                <textarea className={a.area} rows={3} value={s.handNote} maxLength={2000} disabled={dis} aria-label="Also hand over when"
                  placeholder="e.g. They ask about an order they already paid for. They want to speak to a manager. They ask for a price we haven’t published."
                  onChange={e => setS({ handNote: e.target.value })} />
              </div>
            </Field>
          </>
        ) : null}
      </div>
    </div>
  )
}

// ── Knowledge ──

function KnowTab({ brandId, brandName, d, set, dis, t, files, folders, foldersReady, info, infoCards, infoOnCount, history, today, personas, setS, setError, outlets, asked, memoryReady, minChats }: {
  brandId: string
  /** v3 § 5: this brand's outlets (Knowledge › Outlets), what customers asked per file, and whether memory saves yet. */
  outlets: LeadOutlet[]
  asked: Record<string, string[]>
  memoryReady: boolean
  minChats: number
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
    { k: 'info', l: 'General info', icon: 'store', n: String(infoOnCount) },
    // v3 § 5: Outlets — the number of outlets with lines (none counted shows nothing, as drawn).
    { k: 'outlets', l: 'Outlets', icon: 'map-pin', n: String(new Set(d.memory.filter(m => m.kind === 'outlet').map(m => m.outletId)).size || '') },
    { k: 'log', l: 'History', icon: 'history', n: '' },
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
                // v3 § 5: the folders it also reads, under its name ("Also reads Sofa › 3 seater › Pushback").
                const line = readLine(k, files, folders)
                const trail = line.slice(1, k.kind === 'file' ? undefined : -1).map(l => l.name)
                return (
                  <div key={pickKey(k)} className={a.kRow} role="option" aria-selected={cur ? pickKey(cur) === pickKey(k) : false} onClick={() => setSel(pickKey(k))}>
                    <span className={a.kName}><span className={a.ext}>{f ? extOf(f.name, f.mime).ext : 'DIR'}</span>
                      <span className={a.kNames}><span className={a.kTitle}>{f ? f.name : node!.name}</span>{trail.length ? <span className={a.kTrail}>Also reads {trail.join(' › ')}</span> : null}</span></span>
                    <span className={a.dim}>{brandFor(f ? f.brandId : node!.brandId)}</span>
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
                    <ReadPath line={readLine(cur, files, folders)} brandName={brandFor(f ? f.brandId : node!.brandId)} />
                    <AskedAbout key={pickKey(cur)} pick={cur} d={d} set={set} dis={dis || !memoryReady}
                      asked={f ? asked[f.id] ?? [] : [...new Set(readLine(cur, files, folders).at(-1)?.files.flatMap(x => asked[x.id] ?? []) ?? [])].slice(0, 3)} />
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

        {cat === 'outlets' ? <OutletLines d={d} set={set} dis={dis || !memoryReady} outlets={outlets} minChats={minChats} /> : null}

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

/** WHAT THE AI READS · N files (v3 § 5): the brand down to the pick, the files read at each level, the folders beside it not read. */
function ReadPath({ line, brandName }: { line: ReadLevel[]; brandName: string }) {
  if (line.length < 2) return null
  const n = line.reduce((s, l) => s + l.files.length, 0)
  return (
    <div className={a.sSect}>
      <span className={a.kicker}>WHAT THE AI READS · {n} {n === 1 ? 'file' : 'files'}</span>
      <div className={a.path}>
        {line.map((l, i) => {
          const last = i === line.length - 1
          return (
            <div key={l.place} className={a.pLevel} data-last={last || undefined}>
              <div className={a.pRail}><span className={a.pDot} /><span className={a.pLine} /></div>
              <div className={a.pBody}>
                <span className={a.pName}>{i === 0 ? brandName : l.name}</span>
                {l.files.map(f => <span key={f.id} className={a.pFile}><span className={a.pExt}>{extOf(f.name, f.mime).ext}</span><span className={a.pFileName}>{f.name}</span></span>)}
                {!l.files.length ? <span className={a.pNone}>No files here</span> : null}
                {l.skipped.length ? <span className={a.pSkip}><LeadIcon name="circle-minus" size={12} />Not read: {l.skipped.join(', ')}</span> : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * ASKED ABOUT (v3 § 5): what customers asked when the AI used this file (the last 30 days), and questions people add —
 * each with how the AI should answer it, which goes to the AI with the file.
 */
function AskedAbout({ pick, d, set, dis, asked }: { pick: KnowledgePick; d: Draft; set: (fn: (x: Draft) => Draft) => void; dis: boolean; asked: string[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [nq, setNq] = useState('')
  const kind = pick.kind === 'folder' ? 'folder' : 'file'
  const mine = d.fileQs.filter(q => q.kind === kind && q.ref === pick.ref)
  const rows = [...asked.filter(q => !mine.some(m => m.question === q)).map(q => ({ question: q, instruction: '', custom: false })), ...mine]
    .sort((x, y) => Number(x.custom) - Number(y.custom))
  const put = (question: string, patch: Partial<FileQuestion> | null, custom = false) => set(x => {
    const rest = x.fileQs.filter(q => !(q.kind === kind && q.ref === pick.ref && q.question === question))
    if (!patch) return { ...x, fileQs: rest }
    const had = x.fileQs.find(q => q.kind === kind && q.ref === pick.ref && q.question === question)
    return { ...x, fileQs: [...rest, { kind, ref: pick.ref, question, instruction: '', custom, ...had, ...patch }] }
  })
  const add = (e: FormEvent) => {
    e.preventDefault()
    const q = nq.trim().slice(0, 300)
    if (!q || rows.some(r => r.question === q)) return
    put(q, { custom: true }, true); setNq(''); setEditing(q)
  }
  return (
    <div className={a.sSect} data-asked="">
      <span className={a.kicker}>ASKED ABOUT</span>
      <span className={a.askHelp}>Tell the AI how to answer when this comes up.</span>
      <div className={a.askList}>
        {rows.map(r => (
          <div key={r.question} className={a.askRow}>
            <div className={a.askQ}><span className={a.askBubble}>{r.question}</span>
              {r.custom && !dis ? <button type="button" className={a.askX} title="Remove question" aria-label="Remove question" onClick={() => put(r.question, null)}><LeadIcon name="x" size={12} /></button> : null}</div>
            {editing === r.question ? (
              <div className={a.askEdit}><LeadIcon name="corner-down-right" size={13} className={a.askArrow} />
                <textarea className={a.askArea} rows={2} value={r.instruction} maxLength={1000} autoFocus disabled={dis} aria-label={`How to answer: ${r.question}`}
                  placeholder="e.g. Say it’s in stock at Kelana Jaya, then ask if they want to come try it"
                  onChange={e => put(r.question, { instruction: e.target.value }, r.custom)} onBlur={() => setEditing(null)} /></div>
            ) : r.instruction ? (
              <button type="button" className={a.askShow} disabled={dis} onClick={() => setEditing(r.question)}><LeadIcon name="corner-down-right" size={13} className={a.askArrow} /><span>{r.instruction}</span></button>
            ) : !dis ? (
              <button type="button" className={a.askAdd} onClick={() => setEditing(r.question)}><LeadIcon name="plus" size={12} />Add instruction</button>
            ) : null}
          </div>
        ))}
        {!dis ? (
          <form className={a.askForm} onSubmit={add}>
            <input className={a.askIn} value={nq} maxLength={300} placeholder="Add a question customers ask" aria-label="Add a question customers ask" onChange={e => setNq(e.target.value)} />
            <button type="submit" className={a.askPlus} data-on={nq.trim() ? '' : undefined} title="Add" aria-label="Add"><LeadIcon name="plus" size={14} /></button>
          </form>
        ) : null}
      </div>
    </div>
  )
}

/** Numbered memory lines, edited in place (Knowledge › Outlets and From goal results); each with its figure. */
function Lines({ rows, dis, onText, onDel, rate }: { rows: MemoryLine[]; dis: boolean; onText: (id: string, t: string) => void; onDel: (id: string) => void; rate?: (m: MemoryLine) => { text: string; tone: string } }) {
  return (
    <>
      {rows.map((m, i) => {
        const r = rate?.(m)
        return (
          <div key={m.id} className={a.lineRow}>
            <span className={a.lineN}>{i + 1}</span>
            <textarea className={a.lineText} rows={1} value={m.body} maxLength={1000} disabled={dis} placeholder="Write one thing the AI should do" aria-label={`Line ${i + 1}`} onChange={e => onText(m.id, e.target.value)} />
            <span className={a.lineRes} data-tone={r?.tone}>{r?.text ?? ''}</span>
            {!dis ? <button type="button" className={a.lineX} title="Remove line" aria-label="Remove line" onClick={() => onDel(m.id)}><LeadIcon name="x" size={14} /></button> : <span />}
          </div>
        )
      })}
    </>
  )
}

const blankLine = (kind: MemoryLine['kind'], outletId: string | null = null): MemoryLine => ({
  id: newId(), kind, outletId, body: '', status: 'on', dir: null, source: '', cases: 0, addedByName: '', createdAt: new Date().toISOString(), chats: 0, reached: 0,
})

/** Knowledge › Outlets (v3 § 5): facts and rules for one outlet, used only in that outlet's chats. */
function OutletLines({ d, set, dis, outlets }: { d: Draft; set: (fn: (x: Draft) => Draft) => void; dis: boolean; outlets: LeadOutlet[]; minChats: number }) {
  const [menu, setMenu] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const lines = (id: string) => d.memory.filter(m => m.kind === 'outlet' && m.outletId === id)
  const shown = outlets.filter(o => lines(o.id).length || picked === o.id)
  const free = outlets.filter(o => !lines(o.id).length)
  const text = (id: string, t: string) => set(x => ({ ...x, memory: x.memory.map(m => (m.id === id ? { ...m, body: t } : m)) }))
  const del = (id: string) => set(x => ({ ...x, memory: x.memory.filter(m => m.id !== id) }))
  const add = (outletId: string) => set(x => ({ ...x, memory: [...x.memory, blankLine('outlet', outletId)] }))
  return (
    <div className={a.outs}>
      <span className={a.outsHelp}>Facts and rules for one outlet, like parking or opening days. The AI uses them only in chats from that outlet.</span>
      {shown.map(o => (
        <div key={o.id} className={a.outBlock}>
          <span className={a.outName}><LeadIcon name="map-pin" size={14} />{o.name}</span>
          <Lines rows={lines(o.id)} dis={dis} onText={text} onDel={del} />
          {!dis ? <button type="button" className={a.lineAdd} onClick={() => add(o.id)}><LeadIcon name="plus" size={14} />Add line</button> : null}
        </div>
      ))}
      {!dis && free.length ? (
        <div className={a.outAddWrap}>
          <button type="button" className={a.outAdd} onClick={() => setMenu(m => !m)}><LeadIcon name="plus" size={14} />Add for an outlet</button>
          {menu ? (
            <>
              <div className={a.catch} onClick={() => setMenu(false)} aria-hidden="true" />
              <div className={a.outMenu} role="menu">
                {free.map(o => <button key={o.id} type="button" role="menuitem" className={a.outItem} onClick={() => { add(o.id); setPicked(o.id); setMenu(false) }}>{o.name}</button>)}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      {!outlets.length ? <div className={a.empty}>This brand has no outlets yet — add them in Settings › Brands.</div> : null}
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

/**
 * Memory (Lead View v3 § 5; mig 20261110230000) — four parts, as drawn:
 * - **Fixed memory**: rules the AI always uses and never changes; only people edit them.
 * - **Collected**: LEARNING DIRECTION (topics to learn more about / never), then To review (Edit · Dismiss · Use it) and
 *   In use (👍 More like this / 👎 Less like this, Edit, Turn off, Make fixed). Lessons come from the learning run, which
 *   is not built yet — the lists stay empty until it is.
 * - **From goal results**: the lines that reach the goal, each with how often it does ("58% reached · 212 chats"), and
 *   the learning run's suggestions (Change line N / Add a line / Add for an outlet).
 * - **How it learns**: the reading order (higher wins), each source on or off, the brand's own sources, and the
 *   learning settings.
 */
function MemTab({ d, set, setS, dis, outlets, memoryReady, suggestions }: {
  d: Draft
  /** From goal results' open suggestions (the learning run's; none until it is built). */
  suggestions: MemorySuggestion[]
  set: (fn: (x: Draft) => Draft) => void
  setS: (o: Partial<AgentSettings>) => void
  dis: boolean
  outlets: LeadOutlet[]
  memoryReady: boolean
}) {
  const [cat, setCat] = useState<'fix' | 'col' | 'goal' | 'set'>('fix')
  const [colTab, setColTab] = useState<'rv' | 'use'>('rv')
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [moreIn, setMoreIn] = useState('')
  const [lessIn, setLessIn] = useState('')
  const [hover, setHover] = useState<string | null>(null)
  const [readEd, setReadEd] = useState<string | null>(null)
  const off = dis || !memoryReady
  const s = d.settings, L = s.learn ?? DEFAULT_LEARN
  const setL = (o: Partial<LearnSettings>) => setS({ learn: { ...L, ...o } })
  const setMem = (fn: (m: MemoryLine[]) => MemoryLine[]) => set(x => ({ ...x, memory: fn(x.memory) }))
  const patch = (id: string, p: Partial<MemoryLine>) => setMem(ms => ms.map(m => (m.id === id ? { ...m, ...p } : m)))
  const fixed = d.memory.filter(m => m.kind === 'fixed')
  const review = d.memory.filter(m => m.kind === 'collected' && m.status === 'review')
  const inUse = d.memory.filter(m => m.kind === 'collected' && m.status === 'on')
  const goal = d.memory.filter(m => m.kind === 'goal')
  const sugg = suggestions.filter(g => !d.sugg[g.id] && (g.kind !== 'edit' || goal.some(l => l.id === g.memoryId)) && (g.kind !== 'outlet' || outlets.some(o => o.id === g.outletId)))
  const rate = (m: MemoryLine) => rateOf(m, L.min)
  const title = { fix: 'Fixed memory', col: 'Collected', goal: 'From goal results', set: 'How it learns' }[cat]
  const chipAdd = (key: 'dirMore' | 'dirLess', v: string, clear: () => void) => {
    const t = v.trim().slice(0, 80)
    if (t && !s[key].includes(t)) setS({ [key]: [...s[key], t] } as Partial<AgentSettings>)
    clear()
  }
  const accept = (g: MemorySuggestion) => {
    setMem(ms => g.kind === 'edit' ? ms.map(m => (m.id === g.memoryId ? { ...blankLine('goal'), body: g.body } : m))
      : [...ms, { ...blankLine(g.kind === 'outlet' ? 'outlet' : 'goal', g.kind === 'outlet' ? g.outletId : null), body: g.body }])
    set(x => ({ ...x, sugg: { ...x.sugg, [g.id]: 'used' } }))
  }
  const entries = readEntries(L)
  const sel = (v: string, opts: ReadonlyArray<[string, string]>, on: (v: string) => void, label: string) => (
    <select className={a.lSel} value={v} disabled={off} aria-label={label} onChange={e => on(e.target.value)}>{opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
  )
  const seg = (v: string, opts: ReadonlyArray<[string, string]>, on: (v: string) => void) => (
    <div className={a.lSeg} role="group">{opts.map(([k, l]) => <button key={k} type="button" className={a.lSegBtn} aria-pressed={v === k} disabled={off} onClick={() => on(k)}>{l}</button>)}</div>
  )
  const learnRows: Array<{ t: string; d: string; c: ReactNode }> = [
    { t: 'Learn from its own chats', d: 'Looks at chats the AI handled and suggests lessons.', c: <button type="button" role="switch" aria-checked={s.autoLearn} aria-label="Learn from its own chats" className={a.lTog} disabled={off} onClick={() => setS({ autoLearn: !s.autoLearn })} /> },
    { t: 'Learn from CS and templates', d: 'Also looks at chats handled by your team and by templates.', c: <button type="button" role="switch" aria-checked={s.learnOthers} aria-label="Learn from CS and templates" className={a.lTog} disabled={off} onClick={() => setS({ learnOthers: !s.learnOthers })} /> },
    { t: 'Learn from', d: 'Which chats count when it looks for lessons.', c: seg(L.from, [['goal', 'Reached the goal'], ['all', 'All chats']], v => setL({ from: v as LearnSettings['from'] })) },
    { t: 'New lessons', d: 'What happens when it finds something new.', c: sel(L.newL, [['ask', 'Ask me first'], ['auto', 'Use right away'], ['off', 'Don’t collect']], v => setL({ newL: v as LearnSettings['newL'] }), 'New lessons') },
    { t: 'Minimum chats', d: 'How many chats a lesson needs before it’s suggested.', c: <span className={a.lNum}><NumBox value={L.min} disabled={off} label="Minimum chats" onChange={min => setL({ min })} />chats</span> },
    { t: 'Forget unused lessons', d: 'Turns off collected lessons that haven’t been used for a while. Fixed memory is never forgotten.', c: sel(L.forget, [['never', 'Never'], ['30', 'After 30 days'], ['90', 'After 90 days']], v => setL({ forget: v as LearnSettings['forget'] }), 'Forget unused lessons') },
    { t: 'Share lessons across outlets', d: 'A lesson learned in one outlet can be used in the others.', c: <button type="button" role="switch" aria-checked={L.share} aria-label="Share lessons across outlets" className={a.lTog} disabled={off} onClick={() => setL({ share: !L.share })} /> },
  ]
  return (
    <div className={a.split}>
      <Nav items={[
        { k: 'fix', l: 'Fixed memory', icon: 'pin', n: String(fixed.length) },
        { k: 'col', l: 'Collected', icon: 'inbox', n: review.length ? `${review.length} new` : '', rust: review.length > 0 },
        { k: 'goal', l: 'From goal results', icon: 'target', n: sugg.length ? String(sugg.length) : '', rust: sugg.length > 0 },
        { k: 'set', l: 'How it learns', icon: 'settings-2', n: '' },
      ]} cur={cat} onPick={setCat} />
      <div className={a.col} data-w="680">
        <Head icon="brain" title={title} />
        {!memoryReady ? <div className={a.memWait}>Waiting for the database update — nothing here saves yet.</div> : null}

        {cat === 'fix' ? (
          <div className={a.fix}>
            <span className={a.memHelp}>Always used, in every chat. The AI never changes or forgets these. Only people can edit them.</span>
            {fixed.map(m => (
              <div key={m.id} className={a.fixRow}>
                <span className={a.fixPin}><LeadIcon name="pin" size={14} /></span>
                <div className={a.fixBody}>
                  <textarea className={a.fixText} rows={1} value={m.body} maxLength={1000} disabled={off} placeholder="Something the AI must always remember" aria-label="Fixed memory" onChange={e => patch(m.id, { body: e.target.value })} />
                  <span className={a.fixMeta}>{m.id.startsWith('new-') ? 'Just now' : memoryMeta(m)}</span>
                </div>
                {!off ? <button type="button" className={a.lineX} data-top="" title="Remove" aria-label="Remove" onClick={() => setMem(ms => ms.filter(x => x.id !== m.id))}><LeadIcon name="x" size={14} /></button> : null}
              </div>
            ))}
            {!off ? <button type="button" className={a.fixAdd} onClick={() => setMem(ms => [...ms, blankLine('fixed')])}><LeadIcon name="plus" size={14} />Add fixed memory</button> : null}
          </div>
        ) : null}

        {cat === 'col' ? (
          <div className={a.colWrap}>
            <div className={a.dirCard}>
              <span className={a.kicker}>LEARNING DIRECTION</span>
              {([['dirMore', 'Learn more about', 'It looks harder for lessons on these.', moreIn, setMoreIn], ['dirLess', 'Don’t learn about', 'Lessons on these are never suggested.', lessIn, setLessIn]] as const).map(([key, t, help, v, setV]) => (
                <div key={key} className={a.dirSect}>
                  <div className={a.dirTitles}><span className={a.dirT}>{t}</span><span className={a.dirHelp}>{help}</span></div>
                  <div className={a.dirChips}>
                    {s[key].map(c => <span key={c} className={a.dirChip} data-k={key}>{c}{!off ? <button type="button" className={a.dirX} title="Remove" aria-label={`Remove ${c}`} onClick={() => setS({ [key]: s[key].filter(x => x !== c) } as Partial<AgentSettings>)}><LeadIcon name="x" size={12} /></button> : null}</span>)}
                    {!off ? <form className={a.dirForm} onSubmit={e => { e.preventDefault(); chipAdd(key, v, () => setV('')) }}><input className={a.dirIn} value={v} maxLength={80} placeholder="Add a topic…" aria-label={`${t}: add a topic`} onChange={e => setV(e.target.value)} /></form> : null}
                  </div>
                </div>
              ))}
            </div>
            <div className={a.lSeg} role="group">
              {([['rv', 'To review', review.length], ['use', 'In use', inUse.length]] as const).map(([k, l, n]) => (
                <button key={k} type="button" className={a.lSegBtn} aria-pressed={colTab === k} onClick={() => setColTab(k)}>{l}<span className={a.colN} data-rust={k === 'rv' && n ? '' : undefined}>{n}</span></button>
              ))}
            </div>
            <div className={a.colList}>
              {(colTab === 'rv' ? review : inUse).map(m => {
                const ed = editing?.id === m.id
                return (
                  <div key={m.id} className={a.colRow}>
                    {ed ? <textarea className={a.area} rows={3} value={editing!.text} maxLength={1000} autoFocus aria-label="Lesson" onChange={e => setEditing({ id: m.id, text: e.target.value })} />
                      : <span className={a.colText}>{m.body}</span>}
                    <div className={a.colMetaRow}><span className={a.colMeta}>{memoryMeta(m)}</span>{m.dir ? <span className={a.colDir} data-dir={m.dir}>{m.dir === 'up' ? 'Learning more like this' : 'Learning less like this'}</span> : null}</div>
                    {ed ? (
                      <div className={a.colActs}>
                        <button type="button" className={a.colBtn} onClick={() => setEditing(null)}>Cancel</button>
                        <button type="button" className={a.colGo} onClick={() => { if (editing!.text.trim()) patch(m.id, { body: editing!.text.trim() }); setEditing(null) }}>Save</button>
                      </div>
                    ) : off ? null : m.status === 'review' ? (
                      <div className={a.colActs}>
                        <button type="button" className={a.colBtn} onClick={() => setEditing({ id: m.id, text: m.body })}>Edit</button>
                        <button type="button" className={a.colBtn} onClick={() => patch(m.id, { status: 'off' })}>Dismiss</button>
                        <button type="button" className={a.colGo} onClick={() => patch(m.id, { status: 'on' })}>Use it</button>
                      </div>
                    ) : (
                      <div className={a.colActs} data-used="">
                        <button type="button" className={a.vote} data-on={m.dir === 'up' ? 'up' : undefined} title="More like this" aria-label="More like this" aria-pressed={m.dir === 'up'} onClick={() => patch(m.id, { dir: m.dir === 'up' ? null : 'up' })}><LeadIcon name="thumbs-up" size={15} /></button>
                        <button type="button" className={a.vote} data-on={m.dir === 'down' ? 'down' : undefined} title="Less like this" aria-label="Less like this" aria-pressed={m.dir === 'down'} onClick={() => patch(m.id, { dir: m.dir === 'down' ? null : 'down' })}><LeadIcon name="thumbs-down" size={15} /></button>
                        <span className={a.gap} />
                        <button type="button" className={a.colBtn} onClick={() => setEditing({ id: m.id, text: m.body })}>Edit</button>
                        <button type="button" className={a.colBtn} onClick={() => patch(m.id, { status: 'off' })}>Turn off</button>
                        <button type="button" className={a.pinBtn} onClick={() => patch(m.id, { kind: 'fixed', status: 'on', dir: null })}><LeadIcon name="pin" size={13} />Make fixed</button>
                      </div>
                    )}
                  </div>
                )
              })}
              {!(colTab === 'rv' ? review : inUse).length ? <div className={a.colEmpty}>Nothing here</div> : null}
            </div>
          </div>
        ) : null}

        {cat === 'goal' ? (
          <div className={a.goalWrap}>
            <span className={a.memHelp}>What the AI learned from chats that reached the goal, and how often each one works. Used together with your instructions in How it replies.</span>
            <div className={a.goalLines}>
              <Lines rows={goal} dis={off} rate={rate} onText={(id, t) => patch(id, { body: t })} onDel={id => setMem(ms => ms.filter(m => m.id !== id))} />
              {!off ? <button type="button" className={a.lineAdd} onClick={() => setMem(ms => [...ms, blankLine('goal')])}><LeadIcon name="plus" size={14} />Add line</button> : null}
            </div>
            {goal.some(m => rate(m).tone === 'low') ? <span className={a.goalLow}><LeadIcon name="info" size={13} />Lines in red rarely lead to the goal. Try rewording or removing them.</span> : null}
            {sugg.length ? (
              <div className={a.suggs}>
                <span className={a.suggHead}><LeadIcon name="sparkles" size={13} />{sugg.length === 1 ? '1 suggestion' : `${sugg.length} suggestions`} from recent chats</span>
                {sugg.map(g => {
                  const li = goal.findIndex(l => l.id === g.memoryId)
                  return (
                    <div key={g.id} className={a.sugg}>
                      <span className={a.suggKind}>{g.kind === 'edit' ? `Change line ${li + 1}` : g.kind === 'outlet' ? `Add for ${outlets.find(o => o.id === g.outletId)?.name ?? 'an outlet'}` : 'Add a line'}</span>
                      {g.kind === 'edit' && li >= 0 ? <span className={a.suggOld}>{goal[li].body}</span> : null}
                      <span className={a.suggText}>{g.body}</span>
                      <span className={a.suggWhy}>{g.why} Based on {g.chats} chats.</span>
                      {!off ? (
                        <div className={a.colActs}>
                          <button type="button" className={a.colBtn} onClick={() => set(x => ({ ...x, sugg: { ...x.sugg, [g.id]: 'dismissed' } }))}>Dismiss</button>
                          <button type="button" className={a.colGo} onClick={() => accept(g)}>Use it</button>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {cat === 'set' ? (
          <div className={a.learn}>
            <div className={a.readWrap}>
              <div className={a.readTitles}>
                <div className={a.readTop}><span className={a.readT}>How it starts reading</span><span className={a.readN}>{entries.filter(e => e.on).length} of {entries.length} sources</span></div>
                <span className={a.readHelp}>Read top to bottom before each reply. When two disagree, the higher one wins.</span>
              </div>
              <div className={a.readList}>
                {(() => {
                  let n = 0
                  return entries.map((e, i) => {
                    if (e.on) n++
                    const ed = readEd === e.id, hv = hover === e.id || ed
                    const cu = L.custom.find(c => c.id === e.id)
                    return (
                      <div key={e.id} className={a.readRow} data-hover={hv && !ed ? '' : undefined} data-editing={ed || undefined} onMouseEnter={() => setHover(e.id)} onMouseLeave={() => setHover(h => (h === e.id ? null : h))}>
                        <div className={a.readLine}>
                          <span className={a.readNum} data-off={!e.on || undefined}>{e.on ? n : ''}</span>
                          <div className={a.readText} data-off={!e.on || undefined}>
                            <span className={a.readName}>{e.title}{e.mine ? <span className={a.yours}>Yours</span> : null}</span>
                            <span className={a.readDesc}>{e.on ? e.desc : 'Not read'}</span>
                          </div>
                          <div className={a.readCtl} data-show={hv && !off ? '' : undefined}>
                            <button type="button" className={a.readBtn} title="Move up" aria-label={`Move ${e.title} up`} data-faint={i === 0 || undefined} onClick={() => setL(moveSource(L, e.id, -1))}><LeadIcon name="arrow-up" size={14} /></button>
                            <button type="button" className={a.readBtn} title="Move down" aria-label={`Move ${e.title} down`} data-faint={i === entries.length - 1 || undefined} onClick={() => setL(moveSource(L, e.id, 1))}><LeadIcon name="arrow-down" size={14} /></button>
                            {e.mine ? (
                              <>
                                <button type="button" className={a.readBtn} title="Edit" aria-label={`Edit ${e.title}`} onClick={() => setReadEd(ed ? null : e.id)}><LeadIcon name="pencil" size={14} /></button>
                                <button type="button" className={a.readBtn} title="Remove" aria-label={`Remove ${e.title}`} onClick={() => { setL({ custom: L.custom.filter(c => c.id !== e.id), order: L.order.filter(x => x !== e.id) }); setReadEd(null) }}><LeadIcon name="trash-2" size={14} /></button>
                              </>
                            ) : null}
                          </div>
                          {e.id === 'fixed'
                            ? <span className={a.readLock} title="Always read"><LeadIcon name="lock" size={13} /></span>
                            : <button type="button" role="switch" aria-checked={e.on} className={a.readTog} title={e.on ? 'Stop reading this' : 'Read this'} aria-label={e.title} disabled={off} onClick={() => setL({ off: { ...L.off, [e.id]: e.on } })} />}
                        </div>
                        {ed && cu ? (
                          <div className={a.readEdit}>
                            <input className={a.readIn} value={cu.name} maxLength={80} placeholder="Name, e.g. Today’s stock" aria-label="Name" onChange={x => setL({ custom: L.custom.map(c => (c.id === e.id ? { ...c, name: x.target.value } : c)) })} />
                            <textarea className={a.readArea} rows={3} value={cu.text} maxLength={2000} placeholder="What should the AI read or keep in mind here?" aria-label="What should the AI read or keep in mind here?" onChange={x => setL({ custom: L.custom.map(c => (c.id === e.id ? { ...c, text: x.target.value } : c)) })} />
                            <button type="button" className={a.colGo} data-end="" onClick={() => setReadEd(null)}>Done</button>
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                })()}
                {!off ? <button type="button" className={a.readAdd} onClick={() => { const id = `cx${Date.now().toString(36)}`; setL({ custom: [...L.custom, { id, name: '', text: '' }], order: [...L.order, id] }); setReadEd(id) }}><LeadIcon name="plus" size={14} />Add your own</button> : null}
              </div>
            </div>
            {learnRows.map(r => (
              <div key={r.t} className={a.learnRow}>
                <div className={a.learnText}><span className={a.learnT}>{r.t}</span><span className={a.learnD}>{r.d}</span></div>
                {r.c}
              </div>
            ))}
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
        next.map(l => ({ who: l.who, text: l.text })), { settings: draft.settings, answers: draft.answers, playbook: draft.playbook, knowledge: draft.knowledge, memory: draft.memory, fileQs: draft.fileQs })
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
