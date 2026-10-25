'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { longDay, type MktSub } from '@/lib/marketing/board'
import { addMktClient, createMktTask, dropMktDraft, openMktDraft, saveMktDraft, startMktProduct } from '@/lib/marketing/actions'
import { billEditOf, billOf, billProblems, type BillEdit } from '@/lib/marketing/billing'
import {
  draftHref, draftLine, draftOf, formFromDraft, rowOf, worthKeeping, type DraftRow, type NewForm, type NewMode, type OpenDraft,
} from '@/lib/marketing/drafts'
import type { ProductPick } from '@/lib/marketing/project'
import {
  defaultRule, DAY_NAMES, ENDS, FREQS, INTERVALS, MONTH_DAYS, periodText, recurPreview, rulePayload, ruleText, type RecurRule,
} from '@/lib/marketing/recur'
import { trailTime } from '@/lib/marketing/task'
import { stageDates, stageProblems, stagesPayload, starterStages, TASK_TYPES } from '@/lib/marketing/tasks'
import { formatMoney } from '@/lib/utils'
import MoneyInput from '../products/MoneyInput'
import BillFields from '../subsidiary/BillFields'
import StageBuilder, { type BuilderPerson } from './StageBuilder'
import s from './newproject.module.css'

// New Project (`New Project.dc.html`): pick who it is for, then what is being started — a ⚡ Quick task or a 🔁
// Recurring task (its Repeat: every day / week / month, from a start, until a day, for so many runs or for good), its
// title, type and what needs to be done, and its stages (the quick Workflow Builder) — or a 📦 Product project (the
// manager's): a product on sale and its amount (②b-2b — a quote, its list price offered), whose intake meeting minutes
// open next. Created, the task (or the project) opens. The manager adds Marketing's own clients here too (the "+"
// beside Subsidiary — the handoff's Add & select), with their billing details when given (②b-2b).
// Kept as a draft while it is typed (mig 20261025211000 — the user: "一有输入就会自动进 draft"): the first thing typed
// starts one (~0.7 s after a change, every change after it), the address names it (?draft=) so a reload opens it again;
// the viewer's other drafts are listed above, to go on with or to discard; made into its project, it is dropped.

type Mode = NewMode

/** Where the draft stands: none yet (nothing typed), being saved, kept (when), or not saved and why — `stale` when another
 * window saved it since: nothing more is sent until the page is reloaded. */
type Keep = { state: 'none' } | { state: 'saving' } | { state: 'saved'; at: string } | { state: 'error'; reason: string; stale: boolean }

const MODES: readonly { key: Mode; icon: string; name: string }[] = [
  { key: 'product', icon: '📦', name: 'Product project' },
  { key: 'task', icon: '⚡', name: 'Quick task' },
  { key: 'recurring', icon: '🔁', name: 'Recurring task' },
]
const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function NewProject({
  today,
  me,
  subs,
  people,
  approvers,
  holidays,
  firstSub,
  products,
  canAddSub = false,
  addFirst = false,
  from = null,
  drafts = [],
  draft = null,
}: {
  today: string
  me: string | null
  subs: MktSub[]
  people: BuilderPerson[]
  approvers: BuilderPerson[]
  holidays: string[]
  /** A subsidiary to start on (?sub=CODE). */
  firstSub: string | null
  /** The products on sale — null when the viewer may not start a product project (the manager's). */
  products: ProductPick[] | null
  /** Whether the viewer adds Marketing's own clients (+ Add subsidiary — the manager's). */
  canAddSub?: boolean
  /** Open with the client form (the sidebar's + Add subsidiary). */
  addFirst?: boolean
  /** The project it is opened from (④-4c — ?from=), none for none. */
  from?: { id: string; trackId: string; title: string } | null
  /** The viewer's drafts, newest first (mig 20261025211000). */
  drafts?: DraftRow[]
  /** The draft opened (?draft=) — its form as kept. */
  draft?: OpenDraft | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const mine = me ? people.find(p => p.id === me) ?? null : null
  // The blank form, and the one the page opens on — a draft's when one is opened (a subsidiary or a product no longer
  // offered stays the blank form's).
  const [first] = useState(() => {
    const blank: NewForm = {
      sub: firstSub ?? subs[0]?.id ?? '', mode: 'task', product: products?.[0]?.id ?? '', amounts: {}, title: '', type: 'social',
      brief: '', rule: defaultRule(today), stages: starterStages(mine, approvers.find(a => a.id === me)?.id ?? approvers[0]?.id ?? null),
      source: from,
    }
    const kept = draft ? formFromDraft(draft.data, blank) : blank
    const form: NewForm = {
      ...kept,
      sub: subs.some(x => x.id === kept.sub) ? kept.sub : blank.sub,
      product: !products || products.some(p => p.id === kept.product) ? kept.product : blank.product,
      mode: kept.mode === 'product' && !products ? 'task' : kept.mode,
    }
    return { blank, form }
  })
  const blank = first.blank
  const [form, setForm] = useState<NewForm>(first.form)
  const { sub, mode, product, title, type, brief, rule, stages, amounts, source } = form
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // Marketing's own clients: added here, picked at once.
  const [subList, setSubList] = useState(subs)
  const [adding, setAdding] = useState(canAddSub && addFirst)
  const [draftName, setDraftName] = useState('')
  const [draftPic, setDraftPic] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  // The new client's billing details (②b-2b — the user's answer 50), shown on ask.
  const [billOpen, setBillOpen] = useState(false)
  const [draftBill, setDraftBill] = useState<BillEdit>(() => billEditOf(null))
  const [billRefusal, setBillRefusal] = useState<string | null>(null)

  // The draft (mig 20261025211000): which one, on what count, what it last kept and when.
  const [keep, setKeep] = useState<Keep>(draft ? { state: 'saved', at: draft.at } : { state: 'none' })
  const [openId, setOpenId] = useState<string | null>(draft?.id ?? null)
  const draftRef = useRef<{ id: string | null; rev: number | null }>({ id: draft?.id ?? null, rev: draft?.rev ?? null })
  const formRef = useRef(form)
  const keptRef = useRef(draft ? JSON.stringify(draftOf(first.form)) : '')
  const atRef = useRef(draft?.at ?? '')
  const staleRef = useRef(false)
  // Made into its project: nothing more is kept.
  const doneRef = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chain = useRef<Promise<boolean>>(Promise.resolve(true))
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The viewer's other drafts: the page's list less the one open, with what this page did since — one left for another
  // put back on it, one opened or discarded taken off.
  const [gone, setGone] = useState<readonly string[]>([])
  const [added, setAdded] = useState<readonly DraftRow[]>([])
  const [asking, setAsking] = useState<string | null>(null)
  const others = useMemo(() => {
    const seen = new Set<string>()
    return [...added, ...drafts].filter(d => {
      if (d.id === openId || gone.includes(d.id) || seen.has(d.id)) return false
      seen.add(d.id)
      return true
    })
  }, [added, drafts, gone, openId])

  const say = useCallback((words: string) => {
    setToast(words)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }, [])

  // The save: the form as it now stands, one at a time, on the count this page last kept — none until something is typed.
  const flush = useCallback((): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const run = chain.current.then(async () => {
      const now = formRef.current
      const d = draftRef.current
      const snap = JSON.stringify(draftOf(now))
      if (doneRef.current || staleRef.current || snap === keptRef.current || (!d.id && !worthKeeping(now, blank))) {
        setKeep(k => (k.state === 'saving' ? (atRef.current ? { state: 'saved', at: atRef.current } : { state: 'none' }) : k))
        return !staleRef.current
      }
      setKeep({ state: 'saving' })
      const r = await saveMktDraft(d.id, d.rev, draftOf(now))
      if (!r.ok) {
        const stale = /another window/.test(r.reason)
        staleRef.current = stale
        setKeep({ state: 'error', reason: r.reason, stale })
        return false
      }
      draftRef.current = { id: r.id, rev: r.rev }
      keptRef.current = snap
      atRef.current = r.at
      if (!d.id) {
        // The address names it, so a reload opens it again — the rest of the query kept, the page the same page.
        setOpenId(r.id)
        window.history.replaceState(window.history.state, '', draftHref(window.location.search, r.id))
      }
      if (formRef.current === now) setKeep({ state: 'saved', at: r.at })
      return true
    })
    chain.current = run.catch(() => false)
    return run
  }, [blank])

  const update = (next: NewForm | ((f: NewForm) => NewForm)) => {
    const f = typeof next === 'function' ? next(formRef.current) : next
    formRef.current = f
    setForm(f)
    if (doneRef.current || staleRef.current) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 700)
  }
  const set = (patch: Partial<NewForm>) => update(f => ({ ...f, ...patch }))

  // Leaving with a change not kept yet: asked first; leaving the page in the app: kept on the way out.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      const now = formRef.current
      const typed = draftRef.current.id ? JSON.stringify(draftOf(now)) !== keptRef.current : worthKeeping(now, blank)
      if (!doneRef.current && (timer.current || typed)) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      if (timer.current) void flush()
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [blank, flush])

  const hol = useMemo(() => new Set(holidays), [holidays])
  const isRec = mode === 'recurring'
  const isProduct = mode === 'product'
  const picked = products?.find(p => p.id === product) ?? null
  const amount = picked ? (picked.id in amounts ? amounts[picked.id] : picked.price) : null
  const subName = subList.find(x => x.id === sub)?.name ?? ''
  const base = isRec ? rule.start : today
  const dates = stageDates(base, stages.map(x => x.sla), hol)
  const problems = stageProblems(stages)
  const preview = recurPreview(rule)
  const titleOk = !!title.trim()
  const ready = isProduct ? !!sub && !!picked && amount != null && amount > 0 : titleOk && problems.length === 0 && !!sub && (!isRec || preview.ok)

  let hint = ''
  if (isProduct) {
    hint = !picked ? 'Pick a product' : amount == null || amount <= 0 ? 'Give it its amount'
      : `${subName} · ${picked.name} · ${formatMoney(amount)}${picked.kind === 'recurring' ? ' a month' : ''} · ${picked.intake.name} minutes`
  }
  else if (!titleOk) hint = 'Add a task title'
  else if (problems.length) hint = problems[0] === 'A stage has no person' ? 'Every stage needs a name and a person' : problems[0]
  else if (isRec && !preview.ok) hint = 'Pick at least one day inside the period'
  else if (isRec) hint = `${subName} · Recurring · ${ruleText(rule)} · ${preview.count.toLowerCase()}`
  else hint = `${subName} · Quick task · ${stages.length} stage${stages.length === 1 ? '' : 's'} · finishes ${dates.length ? longDay(dates[dates.length - 1].dueOn) : '—'}`

  const setR = (patch: Partial<RecurRule>) => update(f => ({ ...f, rule: { ...f.rule, ...patch } }))

  const closeAdd = () => {
    setAdding(false)
    setDraftName('')
    setDraftPic('')
    setAddError(null)
    setBillOpen(false)
    setDraftBill(billEditOf(null))
    setBillRefusal(null)
  }
  const saveSub = () => {
    const name = draftName.trim()
    if (!name || pending) return
    const wrong = billOpen ? [...billProblems(draftBill), ...(billRefusal ? [billRefusal] : [])] : []
    if (wrong.length) return setAddError(wrong[0])
    setAddError(null)
    start(async () => {
      const r = await addMktClient(name, draftPic.trim(), billOpen ? billOf(draftBill) : null)
      if (!r.ok) {
        setAddError(r.reason)
        return
      }
      setSubList(l => [...l, r.sub])
      set({ sub: r.sub.id })
      closeAdd()
    })
  }

  // Another draft opened in this one's place — what is typed here kept first, this one put back on the list.
  const openDraft = (row: DraftRow) => {
    if (pending) return
    setAsking(null)
    start(async () => {
      if (!(await flush())) return say('Not saved — reload before opening another draft')
      const r = await openMktDraft(row.id)
      if (!r.ok) {
        setGone(g => [...g, row.id])
        return say(r.reason)
      }
      // This one as it stands now — before the form below takes its place.
      const cur = draftRef.current
      const left = cur.id ? rowOf(cur.id, cur.rev ?? 1, formRef.current, atRef.current) : null
      if (left) setAdded(a => [left, ...a.filter(x => x.id !== left.id)])
      const kept = formFromDraft(r.data, blank)
      const next: NewForm = {
        ...kept,
        sub: subList.some(x => x.id === kept.sub) ? kept.sub : blank.sub,
        product: !products || products.some(p => p.id === kept.product) ? kept.product : blank.product,
        mode: kept.mode === 'product' && !products ? 'task' : kept.mode,
      }
      formRef.current = next
      setForm(next)
      draftRef.current = { id: r.id, rev: r.rev }
      keptRef.current = JSON.stringify(draftOf(next))
      atRef.current = r.at
      setOpenId(r.id)
      setAdded(a => a.filter(x => x.id !== r.id))
      setKeep({ state: 'saved', at: r.at })
      setError(null)
      window.history.replaceState(window.history.state, '', draftHref(window.location.search, r.id))
    })
  }

  // A draft discarded — one on the list, or the one open: then the form starts again blank.
  const discard = (id: string) => {
    if (pending) return
    const open = id === draftRef.current.id
    if (open && timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    start(async () => {
      if (open) await chain.current
      const r = await dropMktDraft(id)
      setAsking(null)
      if (!r.ok) return say(r.reason)
      setGone(g => [...g, id])
      setAdded(a => a.filter(x => x.id !== id))
      if (!open) return say('Draft discarded')
      draftRef.current = { id: null, rev: null }
      keptRef.current = ''
      atRef.current = ''
      staleRef.current = false
      formRef.current = blank
      setForm(blank)
      setOpenId(null)
      setKeep({ state: 'none' })
      setError(null)
      window.history.replaceState(window.history.state, '', draftHref(window.location.search, null))
      say('Draft discarded')
    })
  }

  const create = () => {
    if (!ready || pending) return
    setError(null)
    // A save waiting is not sent: the project is made from the form as it stands, and its draft dropped.
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    start(async () => {
      // In the saves' line: one under way lands first (its draft is the one dropped); one asked meanwhile waits for the
      // answer — and keeps nothing once the project is made.
      const job = chain.current.then(async (): Promise<string | null> => {
        if (isProduct) {
          const r = await startMktProduct(sub, product, amount, source?.id ?? null, draftRef.current.id)
          if (!r.ok) return r.reason
          doneRef.current = true
          router.push(`/marketing/projects/${r.track}`)
          return null
        }
        const r = await createMktTask({
          sub,
          kind: isRec ? 'recurring' : 'quick',
          title: title.trim(),
          type,
          brief: brief.trim(),
          stages: stagesPayload(stages),
          recur: isRec ? rulePayload(rule) : null,
          from: source?.id ?? null,
          draft: draftRef.current.id,
        })
        if (!r.ok) return r.reason
        doneRef.current = true
        router.push(`/marketing/projects/${r.open}`)
        return null
      })
      chain.current = job.then(() => true, () => false)
      const refused = await job
      if (!refused) return
      setError(refused)
      // Not made: what is typed is kept again.
      update(formRef.current)
    })
  }

  return (
    <div className={s.page}>
      <div className={s.crumbs}>
        <Link href="/marketing/projects" className={s.crumbLink}>← Projects</Link>
        <span>/</span>
        <span>New project</span>
        <span className={s.grow} />
        {keep.state === 'saving' ? <span className={s.kept}>Saving draft…</span> : null}
        {keep.state === 'saved' ? <span className={s.kept}>Draft saved{keep.at ? ` · ${trailTime(keep.at)}` : ''}</span> : null}
        {keep.state === 'error' ? (
          <span className={s.notKept} role="alert">
            Draft not saved · {keep.reason}
            {keep.stale ? <button type="button" className={s.reload} onClick={() => window.location.reload()}>Reload</button> : null}
          </span>
        ) : null}
        {openId ? (
          asking === openId ? (
            <span className={s.ask}>
              <button type="button" className={s.askYes} disabled={pending} onClick={() => discard(openId)}>Discard draft</button>
              <button type="button" className={s.askNo} disabled={pending} onClick={() => setAsking(null)}>Keep</button>
            </span>
          ) : <button type="button" className={s.textBtn} disabled={pending} onClick={() => setAsking(openId)}>Discard draft</button>
        ) : null}
      </div>

      <div className={s.steps}>
        {(mode === 'product' ? ['Subsidiary & product', 'Meeting minutes', 'Tracking link', 'PIC response'] : ['Subsidiary & task', 'Work on it']).map((label, i, all) => (
          <div key={label} className={s.step}>
            <span className={`${s.stepMark}${i === 0 ? ` ${s.stepMarkOn}` : ''}`}>{i + 1}</span>
            <span className={`${s.stepLabel}${i === 0 ? ` ${s.stepLabelOn}` : ''}`}>{label}</span>
            {i < all.length - 1 ? <span className={s.stepLine} /> : null}
          </div>
        ))}
      </div>

      {others.length ? (
        <section className={s.drafts} aria-label="Drafts">
          <div className={s.draftsHead}>Drafts · {others.length}</div>
          {others.map(d => {
            const line = draftLine(d, subList, products)
            return (
              <div key={d.id} className={s.draft}>
                <span className={s.draftIcon} aria-hidden="true">{line.icon}</span>
                <span className={s.draftText}>
                  <span className={s.draftName}>{line.name}</span>
                  {line.meta ? <span className={s.draftMeta}>{line.meta}</span> : null}
                </span>
                {asking === d.id ? (
                  <span className={s.ask}>
                    <button type="button" className={s.askYes} disabled={pending} onClick={() => discard(d.id)}>Discard</button>
                    <button type="button" className={s.askNo} disabled={pending} onClick={() => setAsking(null)}>Keep</button>
                  </span>
                ) : (
                  <>
                    <button type="button" className={s.draftGo} disabled={pending} onClick={() => openDraft(d)}>Continue</button>
                    <button type="button" className={s.draftX} disabled={pending} aria-label={`Discard ${line.name}`} onClick={() => setAsking(d.id)}>×</button>
                  </>
                )}
              </div>
            )
          })}
        </section>
      ) : null}

      <div className={s.lead}>Start a project</div>
      {source ? (
        <div className={s.from}>
          <span>↳ Opened from</span>
          <Link href={`/marketing/projects/${encodeURIComponent(source.trackId)}`} className={s.fromTrack}>{source.trackId}</Link>
          <span className={s.fromTitle}>{source.title}</span>
          <button type="button" className={s.fromX} aria-label={`Not from ${source.trackId}`} onClick={() => set({ source: null })}>×</button>
        </div>
      ) : null}

      <div className={s.label}>
        Subsidiary
        {canAddSub ? (
          <button type="button" className={s.addSubBtn} title="Add subsidiary" aria-label="Add subsidiary" onClick={() => { setAdding(true); setAddError(null) }}>+</button>
        ) : null}
      </div>
      <div className={s.subs} role="radiogroup" aria-label="Subsidiary">
        {subList.map(x => (
          <button key={x.id} type="button" role="radio" aria-checked={sub === x.id} className={`${s.subCard}${sub === x.id ? ` ${s.cardOn}` : ''}`} onClick={() => set({ sub: x.id })}>
            <span className={s.subDot} style={{ background: x.dot }} />
            <span className={s.cardText}>
              <span className={s.cardName} style={{ display: 'block' }}>{x.name}</span>
              <span className={s.cardSub} style={{ display: 'block' }}>PIC · {x.pic || '—'}</span>
            </span>
            <span className={`${s.radio}${sub === x.id ? ` ${s.radioOn}` : ''}`} />
          </button>
        ))}
      </div>
      {adding ? (
        <div className={s.addSub}>
          <input
            className={`${s.addInput} ${s.addName}`}
            value={draftName}
            maxLength={80}
            placeholder="Company or client name"
            aria-label="Company or client name"
            autoFocus
            onChange={e => setDraftName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveSub()}
          />
          <input
            className={`${s.addInput} ${s.addPic}`}
            value={draftPic}
            maxLength={80}
            placeholder="PIC name (optional)"
            aria-label="PIC name"
            onChange={e => setDraftPic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveSub()}
          />
          {billOpen ? null : <button type="button" className={s.addBill} disabled={pending} onClick={() => setBillOpen(true)}>+ Billing details</button>}
          <button type="button" className={s.addCancel} disabled={pending} onClick={closeAdd}>Cancel</button>
          <button type="button" className={s.addSave} disabled={pending || !draftName.trim()} onClick={saveSub}>Add &amp; select</button>
          {billOpen ? (
            <div className={s.addBillBox} aria-label="Billing details">
              <BillFields value={draftBill} idPrefix="new-client" onRefusal={setBillRefusal} onChange={v => { setAddError(null); setDraftBill(v) }} />
            </div>
          ) : null}
          {addError ? <span className={s.addError} role="alert">{addError}</span> : null}
        </div>
      ) : null}

      <div className={s.label}>What are you starting?</div>
      <div className={s.modes} role="radiogroup" aria-label="What are you starting">
        {MODES.map(m => {
          const off = m.key === 'product' && products === null
          return (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={mode === m.key}
              aria-disabled={off}
              className={`${s.modeCard}${mode === m.key ? ` ${s.cardOn}` : ''}${off ? ` ${s.modeOff}` : ''}`}
              onClick={() => !off && set({ mode: m.key })}
            >
              <span className={s.modeIcon}>{m.icon}</span>
              <span className={s.cardText}>
                <span className={s.modeName} style={{ display: 'block' }}>{m.name}</span>
                {off ? <span className={s.soon}>Manager only</span> : null}
              </span>
              <span className={`${s.radio}${mode === m.key ? ` ${s.radioOn}` : ''}`} style={{ marginTop: 2 }} />
            </button>
          )
        })}
      </div>

      {isProduct ? (
        <>
          <div className={s.label}>Product</div>
          {products?.length ? (
            <div className={s.products} role="radiogroup" aria-label="Product">
              {products.map(p => (
                <button key={p.id} type="button" role="radio" aria-checked={product === p.id} className={`${s.productCard}${product === p.id ? ` ${s.cardOn}` : ''}`} onClick={() => set({ product: p.id })}>
                  <span className={s.productTop}>
                    <span className={s.kindChip}>{p.kind === 'recurring' ? 'Recurring monthly' : 'One-time project'}</span>
                    <span className={s.grow} />
                    <span className={`${s.radio}${product === p.id ? ` ${s.radioOn}` : ''}`} />
                  </span>
                  <span className={s.cardName}>{p.name}</span>
                  {p.note ? <span className={s.cardSub}>{p.note}</span> : null}
                  <span className={s.productMeta}>{p.intake.fields} intake field{p.intake.fields === 1 ? '' : 's'} · {p.actions} action{p.actions === 1 ? '' : 's'}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className={s.noProducts}>
              <span>No products on sale</span>
              <Link href="/marketing/products" className={s.crumbLink}>Product Builder →</Link>
            </div>
          )}
          {picked ? (
            <>
              <div className={s.label}>Amount{picked.kind === 'recurring' ? ' · a month' : ''}</div>
              <div className={s.amountRow}>
                <span className={s.amountRm}>RM</span>
                <MoneyInput key={picked.id} className={`${s.input} ${s.amountInput}`} value={amount} label="Amount" placeholder="0.00"
                  onChange={v => update(f => ({ ...f, amounts: { ...f.amounts, [picked.id]: v } }))} />
                {picked.price != null && amount !== picked.price ? (
                  <button type="button" className={s.amountReset} onClick={() => update(f => { const n = { ...f.amounts }; delete n[picked.id]; return { ...f, amounts: n } })}>
                    List price {formatMoney(picked.price)}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </>
      ) : (
      <>
      <div className={s.box}>
        <label className={s.field}>
          <span className={s.fieldLabel}>Task title</span>
          <input className={s.input} value={title} maxLength={140} onChange={e => set({ title: e.target.value })} placeholder="e.g. Amend 11.11 ad · new price RM 1,299" />
        </label>
        <div className={s.field}>
          <span className={s.fieldLabel}>Type</span>
          <div className={s.chips}>
            {TASK_TYPES.map(t => (
              <button key={t.key} type="button" className={`${s.chip}${type === t.key ? ` ${s.chipOn}` : ''}`} onClick={() => set({ type: t.key })} aria-pressed={type === t.key}>{t.label}</button>
            ))}
          </div>
        </div>
        <div className={s.field} style={{ gap: 8 }}>
          <div className={s.reqHead}>
            <span className={s.fieldLabel}>What needs to be done</span>
            <div className={s.seg}>
              <button type="button" className={`${s.segBtn} ${s.segOn}`}>Write it here</button>
              <button type="button" className={`${s.segBtn} ${s.segOff}`} disabled title="Comes with the Minutes Builder">Use meeting minutes</button>
            </div>
          </div>
          <textarea className={s.textarea} rows={3} value={brief} maxLength={4000} onChange={e => set({ brief: e.target.value })} placeholder="What to change, where, and anything they should know" />
        </div>
      </div>

      {isRec ? (
        <div className={`${s.box} ${s.boxNext}`}>
          <div className={s.repeatHead}><span aria-hidden="true">🔁</span><span>Repeat</span></div>
          <div className={s.repeatRow}>
            <span className={s.repeatLabel}>Every</span>
            <div className={s.seg}>
              {FREQS.map(f => (
                <button key={f.key} type="button" className={`${s.segBtn} ${s.segBig}${rule.freq === f.key ? ` ${s.segOn}` : ''}`} onClick={() => setR({ freq: f.key })}>{f.label}</button>
              ))}
            </div>
            {rule.freq === 'weekly' ? (
              <div className={s.seg}>
                {INTERVALS.map(f => (
                  <button key={f.key} type="button" className={`${s.segBtn} ${s.segBig}${rule.every === f.key ? ` ${s.segOn}` : ''}`} onClick={() => setR({ every: f.key })}>{f.label}</button>
                ))}
              </div>
            ) : null}
          </div>
          {rule.freq === 'weekly' ? (
            <div className={s.repeatRow}>
              <span className={s.repeatLabel}>On</span>
              <div className={s.chips}>
                {WEEKDAY_SHORT.map((label, i) => {
                  const on = rule.days.includes(i + 1)
                  return (
                    <button
                      key={label}
                      type="button"
                      title={DAY_NAMES[i]}
                      aria-pressed={on}
                      className={`${s.day}${on ? ` ${s.dayOn}` : ''}`}
                      onClick={() => setR({ days: on ? rule.days.filter(d => d !== i + 1) : [...rule.days, i + 1] })}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
          {rule.freq === 'monthly' ? (
            <div className={s.repeatRow}>
              <span className={s.repeatLabel}>On</span>
              <div className={s.chips}>
                {MONTH_DAYS.map(m => (
                  <button key={m.key} type="button" aria-pressed={rule.mday === m.key} className={`${s.chip}${rule.mday === m.key ? ` ${s.chipOn}` : ''}`} onClick={() => setR({ mday: m.key })}>{m.label}</button>
                ))}
              </div>
            </div>
          ) : null}
          <div className={s.repeatRow}>
            <span className={s.repeatLabel}>Starts</span>
            <input type="date" className={s.date} value={rule.start} min={today} onChange={e => e.target.value && setR({ start: e.target.value })} aria-label="Starts" />
          </div>
          <div className={s.repeatRow}>
            <span className={s.repeatLabel}>Ends</span>
            <div className={s.seg}>
              {ENDS.map(f => (
                <button key={f.key} type="button" className={`${s.segBtn} ${s.segBig}${rule.endMode === f.key ? ` ${s.segOn}` : ''}`} onClick={() => setR({ endMode: f.key })}>{f.label}</button>
              ))}
            </div>
            {rule.endMode === 'date' ? (
              <input type="date" className={s.date} value={rule.end} min={rule.start} onChange={e => e.target.value && setR({ end: e.target.value })} aria-label="Ends on" />
            ) : null}
            {rule.endMode === 'count' ? (
              <span className={s.repeatRow} style={{ gap: 8 }}>
                <input
                  type="number"
                  className={`${s.date} ${s.count}`}
                  min={1}
                  max={60}
                  value={rule.count}
                  onChange={e => setR({ count: Math.max(1, Math.min(60, Math.trunc(Number(e.target.value)) || 1)) })}
                  aria-label="Runs"
                />
                <span className={s.unit}>runs</span>
              </span>
            ) : null}
          </div>
          <div className={s.summary}>
            <div className={s.summaryHead}>
              <span className={s.summaryRule}>{ruleText(rule)} · {periodText(rule)}</span>
              <span className={s.summaryCount}>{preview.count}</span>
            </div>
            {preview.first.length ? (
              <div className={s.runChips}>
                {preview.first.map(d => <span key={d} className={s.runChip}>{d}</span>)}
                {preview.more ? <span className={s.runMore}>{preview.more}</span> : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <StageBuilder stages={stages} onChange={next => set({ stages: next })} people={people} approvers={approvers} me={me} start={base} holidays={hol} />
      </>
      )}

      <div className={s.footer}>
        {error ? <span className={`${s.hint} ${s.hintRed}`} role="alert">{error}</span> : <span className={`${s.hint}${ready ? '' : ` ${s.hintRed}`}`}>{hint}</span>}
        <button type="button" className={s.primary} disabled={!ready || pending} onClick={create}>
          {pending ? (isProduct ? 'Opening…' : 'Creating…') : isProduct ? 'Open meeting minutes →' : isRec ? 'Create recurring task →' : 'Create task & open →'}
        </button>
      </div>
      {toast ? <div className={s.toast} role="status">{toast}</div> : null}
    </div>
  )
}
