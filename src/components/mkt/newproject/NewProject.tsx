'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { longDay, type MktSub } from '@/lib/marketing/board'
import { addMktClient, createMktTask, startMktProduct } from '@/lib/marketing/actions'
import type { ProductPick } from '@/lib/marketing/project'
import {
  defaultRule, DAY_NAMES, ENDS, FREQS, INTERVALS, MONTH_DAYS, periodText, recurPreview, rulePayload, ruleText, type RecurRule,
} from '@/lib/marketing/recur'
import { stageDates, stageProblems, stagesPayload, starterStages, TASK_TYPES, type DraftStage, type TaskType } from '@/lib/marketing/tasks'
import StageBuilder, { type BuilderPerson } from './StageBuilder'
import s from './newproject.module.css'

// New Project (`New Project.dc.html`): pick who it is for, then what is being started — a ⚡ Quick task or a 🔁
// Recurring task (its Repeat: every day / week / month, from a start, until a day, for so many runs or for good), its
// title, type and what needs to be done, and its stages (the quick Workflow Builder) — or a 📦 Product project (the
// manager's): a product on sale, whose intake meeting minutes open next. Created, the task (or the project) opens.
// The manager adds Marketing's own clients here too (the "+" beside Subsidiary — the handoff's Add & select).

type Mode = 'product' | 'task' | 'recurring'

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
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [sub, setSub] = useState(firstSub ?? subs[0]?.id ?? '')
  const [mode, setMode] = useState<Mode>('task')
  const [product, setProduct] = useState(products?.[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [type, setType] = useState<TaskType>('social')
  const [brief, setBrief] = useState('')
  const [rule, setRule] = useState<RecurRule>(() => defaultRule(today))
  const mine = me ? people.find(p => p.id === me) ?? null : null
  const [stages, setStages] = useState<DraftStage[]>(() => starterStages(mine, approvers.find(a => a.id === me)?.id ?? approvers[0]?.id ?? null))
  const [error, setError] = useState<string | null>(null)
  // Marketing's own clients: added here, picked at once.
  const [subList, setSubList] = useState(subs)
  const [adding, setAdding] = useState(canAddSub && addFirst)
  const [draftName, setDraftName] = useState('')
  const [draftPic, setDraftPic] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  const hol = useMemo(() => new Set(holidays), [holidays])
  const isRec = mode === 'recurring'
  const isProduct = mode === 'product'
  const picked = products?.find(p => p.id === product) ?? null
  const subName = subList.find(x => x.id === sub)?.name ?? ''
  const base = isRec ? rule.start : today
  const dates = stageDates(base, stages.map(x => x.sla), hol)
  const problems = stageProblems(stages)
  const preview = recurPreview(rule)
  const titleOk = !!title.trim()
  const ready = isProduct ? !!sub && !!picked : titleOk && problems.length === 0 && !!sub && (!isRec || preview.ok)

  let hint = ''
  if (isProduct) hint = picked ? `${subName} · ${picked.name} · ${picked.intake.name} minutes` : 'Pick a product'
  else if (!titleOk) hint = 'Add a task title'
  else if (problems.length) hint = problems[0] === 'A stage has no person' ? 'Every stage needs a name and a person' : problems[0]
  else if (isRec && !preview.ok) hint = 'Pick at least one day inside the period'
  else if (isRec) hint = `${subName} · Recurring · ${ruleText(rule)} · ${preview.count.toLowerCase()}`
  else hint = `${subName} · Quick task · ${stages.length} stage${stages.length === 1 ? '' : 's'} · finishes ${dates.length ? longDay(dates[dates.length - 1].dueOn) : '—'}`

  const setR = (patch: Partial<RecurRule>) => setRule(r => ({ ...r, ...patch }))

  const closeAdd = () => {
    setAdding(false)
    setDraftName('')
    setDraftPic('')
    setAddError(null)
  }
  const saveSub = () => {
    const name = draftName.trim()
    if (!name || pending) return
    setAddError(null)
    start(async () => {
      const r = await addMktClient(name, draftPic.trim())
      if (!r.ok) {
        setAddError(r.reason)
        return
      }
      setSubList(l => [...l, r.sub])
      setSub(r.sub.id)
      closeAdd()
    })
  }

  const create = () => {
    if (!ready || pending) return
    setError(null)
    if (isProduct) {
      start(async () => {
        const r = await startMktProduct(sub, product)
        if (!r.ok) {
          setError(r.reason)
          return
        }
        router.push(`/marketing/projects/${r.track}`)
      })
      return
    }
    start(async () => {
      const r = await createMktTask({
        sub,
        kind: isRec ? 'recurring' : 'quick',
        title: title.trim(),
        type,
        brief: brief.trim(),
        stages: stagesPayload(stages),
        recur: isRec ? rulePayload(rule) : null,
      })
      if (!r.ok) {
        setError(r.reason)
        return
      }
      router.push(`/marketing/projects/${r.open}`)
    })
  }

  return (
    <div className={s.page}>
      <div className={s.crumbs}>
        <Link href="/marketing/projects" className={s.crumbLink}>← Projects</Link>
        <span>/</span>
        <span>New project</span>
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

      <div className={s.lead}>Start a project</div>

      <div className={s.label}>
        Subsidiary
        {canAddSub ? (
          <button type="button" className={s.addSubBtn} title="Add subsidiary" aria-label="Add subsidiary" onClick={() => { setAdding(true); setAddError(null) }}>+</button>
        ) : null}
      </div>
      <div className={s.subs} role="radiogroup" aria-label="Subsidiary">
        {subList.map(x => (
          <button key={x.id} type="button" role="radio" aria-checked={sub === x.id} className={`${s.subCard}${sub === x.id ? ` ${s.cardOn}` : ''}`} onClick={() => setSub(x.id)}>
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
          <button type="button" className={s.addCancel} disabled={pending} onClick={closeAdd}>Cancel</button>
          <button type="button" className={s.addSave} disabled={pending || !draftName.trim()} onClick={saveSub}>Add &amp; select</button>
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
              onClick={() => !off && setMode(m.key)}
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
                <button key={p.id} type="button" role="radio" aria-checked={product === p.id} className={`${s.productCard}${product === p.id ? ` ${s.cardOn}` : ''}`} onClick={() => setProduct(p.id)}>
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
        </>
      ) : (
      <>
      <div className={s.box}>
        <label className={s.field}>
          <span className={s.fieldLabel}>Task title</span>
          <input className={s.input} value={title} maxLength={140} onChange={e => setTitle(e.target.value)} placeholder="e.g. Amend 11.11 ad · new price RM 1,299" />
        </label>
        <div className={s.field}>
          <span className={s.fieldLabel}>Type</span>
          <div className={s.chips}>
            {TASK_TYPES.map(t => (
              <button key={t.key} type="button" className={`${s.chip}${type === t.key ? ` ${s.chipOn}` : ''}`} onClick={() => setType(t.key)} aria-pressed={type === t.key}>{t.label}</button>
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
          <textarea className={s.textarea} rows={3} value={brief} maxLength={4000} onChange={e => setBrief(e.target.value)} placeholder="What to change, where, and anything they should know" />
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

      <StageBuilder stages={stages} onChange={setStages} people={people} approvers={approvers} me={me} start={base} holidays={hol} />
      </>
      )}

      <div className={s.footer}>
        {error ? <span className={`${s.hint} ${s.hintRed}`} role="alert">{error}</span> : <span className={`${s.hint}${ready ? '' : ` ${s.hintRed}`}`}>{hint}</span>}
        <button type="button" className={s.primary} disabled={!ready || pending} onClick={create}>
          {pending ? (isProduct ? 'Opening…' : 'Creating…') : isProduct ? 'Open meeting minutes →' : isRec ? 'Create recurring task →' : 'Create task & open →'}
        </button>
      </div>
    </div>
  )
}
