'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { HvPage, PageHead, btn } from '@/components/hrv/kit'
import { removeAutoCategory, removeLeadFlow, saveAutoCategory, saveLeadFlow } from '@/lib/leads/actions'
import {
  GOALS,
  TEMPLATE_CARDS,
  compile,
  dayName,
  starterConfig,
  type AdConfig,
  type AwayConfig,
  type FaqConfig,
  type GoalId,
  type KeywordConfig,
  type SaveAs,
  type TemplateConfig,
  type TemplateId,
  type WelcomeConfig,
} from '@/lib/leads/automation'
import { flowProblem, starterSteps, type FlowStep, type LeadFlow } from '@/lib/leads/flow'
import type { AutoCategory } from '@/lib/leads/server'
import type { LeadBrand } from '@/lib/leads/types'
import { Bi } from './bits'
import { FlowTree, Switch, TryIt } from './FlowsView'
import s from './lead.module.css'

/**
 * Lead View › Automations (2026-10-16 — the user: Customer Service makes their own workplace, sorted into categories
 * like General and Ads, and the tree is hard to follow; the design canvas's "自動化" row, approved "可以"). The
 * categories on the left, each automation a card with its switch; "New automation" opens the templates by goal
 * (as Meta's own), and each template is a short form, with a phone that runs it. English first, Simplified
 * Chinese beside it (the user: 简体+英文；英文大点，中文辅助翻译).
 */

type Editing = {
  id: string | null
  name: string
  brandId: string | null
  categoryId: string | null
  active: boolean
  config: TemplateConfig
  /** The step editor's steps (template custom). */
  steps: FlowStep[]
}

const TEMPLATE_NAME: Readonly<Record<TemplateId, { en: string; zh: string }>> = {
  faq: { en: 'FAQ', zh: '常见问题' },
  welcome: { en: 'Welcome message', zh: '欢迎消息' },
  away: { en: 'Away message', zh: '离开消息' },
  keyword: { en: 'Custom keywords', zh: '自定义关键词' },
  ad: { en: 'Ad Q&A', zh: '广告问答' },
  custom: { en: 'From scratch', zh: '从零开始' },
}

const toneOf = (t: string) => (['ink', 'clay', 'blue', 'olive', 'plum'].includes(t) ? t : 'blue')

export default function AutomationsView({ flows, categories, brands, canManage }: {
  flows: LeadFlow[]
  categories: AutoCategory[]
  brands: LeadBrand[]
  canManage: boolean
}) {
  const [cat, setCat] = useState<string>('all')
  const [gallery, setGallery] = useState(false)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const count = (id: string) => (id === 'all' ? flows.length : flows.filter(f => (f.categoryId ?? 'none') === id).length)
  const shown = flows.filter(f => cat === 'all' || (f.categoryId ?? 'none') === cat)
  const catName = (id: string | null | undefined) => categories.find(c => c.id === id)?.name ?? 'No category'

  const toggle = (f: LeadFlow) => start(async () => {
    setError(null)
    const r = await saveLeadFlow(f.id, {
      brandId: f.brandId, name: f.name, triggerKind: f.triggerKind, triggerValue: f.triggerValue, active: !f.active, steps: f.steps,
      categoryId: f.categoryId ?? null, template: f.template ?? 'custom', config: f.config ?? {},
    })
    if (!r.ok) setError(r.reason)
  })

  const openNew = (key: string) => {
    const config = starterConfig(key)
    const card = TEMPLATE_CARDS.find(c => c.key === key)
    setEditing({
      id: null,
      name: card ? card.en : 'New automation',
      brandId: null,
      categoryId: cat !== 'all' && cat !== 'none' ? cat : (config.template === 'ad' ? categories.find(c => c.name === '廣告' || c.name === '广告' || c.name === 'Ads')?.id : categories[0]?.id) ?? null,
      active: true,
      config,
      steps: starterSteps(),
    })
    setGallery(false)
  }
  const openFlow = (f: LeadFlow) => setEditing({
    id: f.id,
    name: f.name,
    brandId: f.brandId,
    categoryId: f.categoryId ?? null,
    active: f.active,
    config: (f.template && f.template !== 'custom' && f.config && Object.keys(f.config).length ? { template: f.template, ...f.config } : { template: 'custom' }) as TemplateConfig,
    steps: f.steps,
  })

  if (editing) {
    return <Editor key={editing.id ?? 'new'} start={editing} categories={categories} brands={brands} canManage={canManage} onClose={() => setEditing(null)} />
  }

  return (
    <HvPage>
      <PageHead eyebrow="Lead View" title="Automations" right={canManage ? <button type="button" className={btn('primary')} onClick={() => setGallery(true)}><Bi en="+ New automation" zh="新增" /></button> : undefined} />
      {error ? <div className={s.error} role="alert" style={{ marginBottom: 12 }}>{error}</div> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, alignItems: 'flex-start' }}>
        <Categories categories={categories} picked={cat} onPick={setCat} count={count} canManage={canManage} />

        <div style={{ flex: '1 1 560px', minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {shown.length === 0 ? (
            <div className={s.panel} style={{ gridColumn: '1 / -1' }}>
              <span><Bi en="No automations here yet." zh="这里还没有自动化。" /></span>
              {canManage ? <button type="button" className={btn('outline')} style={{ alignSelf: 'flex-start' }} onClick={() => setGallery(true)}><Bi en="+ New automation" zh="新增" /></button> : null}
            </div>
          ) : shown.map(f => {
            const tpl = TEMPLATE_NAME[f.template ?? 'custom']
            const card = TEMPLATE_CARDS.find(c => c.template === (f.template ?? 'custom'))
            return (
              <div key={f.id} className={s.panel} style={{ gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={s.autoIcon} data-tone={card?.tone ?? 'blue'} aria-hidden="true">{card?.glyph ?? '⋯'}</span>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <strong style={{ fontSize: 14 }}>{f.name}</strong>
                    <span className={s.hint}><Bi en={tpl.en} zh={tpl.zh} /></span>
                  </div>
                  <Switch on={f.active} disabled={!canManage || busy} label={`${f.name} on / off`} onClick={() => toggle(f)} />
                </div>
                <span className={s.hint} style={{ lineHeight: 1.5 }}>{whenLine(f)}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <span className={s.brand} data-tone={toneOf(categories.find(c => c.id === f.categoryId)?.tone ?? 'plum')}>{catName(f.categoryId)}</span>
                  <span className={s.brand} data-tone="plum">{f.brandId ? brands.find(b => b.id === f.brandId)?.name ?? '—' : 'All brands'}</span>
                  <span className={s.spacer} />
                  <span className={s.salesMeta}>{f.started} this week · {f.phones} phones</span>
                </div>
                <button type="button" className={btn('outline')} onClick={() => openFlow(f)}>{canManage ? <Bi en="Edit" zh="编辑" /> : <Bi en="Open" zh="查看" />}</button>
              </div>
            )
          })}
        </div>
      </div>

      {gallery ? <Gallery onPick={openNew} onClose={() => setGallery(false)} /> : null}
    </HvPage>
  )
}

/** What starts it, in a line. */
function whenLine(f: LeadFlow): ReactNode {
  if (f.triggerKind === 'ad') return <Bi en={`From the ad "${f.triggerValue}"`} zh="从这个广告进来时" />
  if (f.triggerKind === 'keyword') return <Bi en={`When a message has: ${f.triggerValue}`} zh="消息里有这些字时" />
  if (f.triggerKind === 'away') return <Bi en="Outside opening hours" zh="下班 / 休息时间" />
  return <Bi en="A customer's first message" zh="客户第一次发消息时" />
}

function Categories({ categories, picked, onPick, count, canManage }: {
  categories: AutoCategory[]
  picked: string
  onPick: (id: string) => void
  count: (id: string) => number
  canManage: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const save = (id: string | null) => start(async () => {
    setError(null)
    const r = await saveAutoCategory(id, name)
    if (!r.ok) { setError(r.reason); return }
    setAdding(false); setRenaming(null); setName('')
  })
  const remove = (c: AutoCategory) => {
    if (!window.confirm(`Delete "${c.name}"? Its automations stay, with no category.`)) return
    start(async () => {
      const r = await removeAutoCategory(c.id)
      if (!r.ok) setError(r.reason)
      else if (picked === c.id) onPick('all')
    })
  }
  const row = (id: string, label: ReactNode, tone: string | null) => (
    <button type="button" className={s.catRow} aria-pressed={picked === id} onClick={() => onPick(id)}>
      {tone ? <span className={s.catDot} data-tone={tone} aria-hidden="true" /> : null}
      <span style={{ flex: 1 }}>{label}</span>
      <span className={s.salesMeta}>{count(id)}</span>
    </button>
  )
  return (
    <div style={{ flex: '0 1 220px', minWidth: 200, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className={s.label} style={{ padding: '0 10px 6px' }}><Bi en="My categories" zh="我的分类" /></span>
      {row('all', <Bi en="All" zh="全部" />, null)}
      {categories.map(c => renaming === c.id ? (
        <div key={c.id} className={s.inline} style={{ padding: '4px 0' }}>
          <input className={s.search} style={{ flex: 1, minWidth: 0 }} value={name} onChange={e => setName(e.target.value)} maxLength={30} autoFocus aria-label="Category name" />
          <button type="button" className={btn('primary')} onClick={() => save(c.id)} disabled={busy || !name.trim()}>OK</button>
        </div>
      ) : (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center' }}>
          {row(c.id, c.name, toneOf(c.tone))}
          {canManage ? (
            <>
              <button type="button" className={s.iconBtn} aria-label={`Rename ${c.name}`} onClick={() => { setRenaming(c.id); setName(c.name) }}>✎</button>
              <button type="button" className={s.iconBtn} aria-label={`Delete ${c.name}`} onClick={() => remove(c)}>✕</button>
            </>
          ) : null}
        </div>
      ))}
      {count('none') ? row('none', <Bi en="No category" zh="未分类" />, null) : null}
      {canManage ? (adding ? (
        <div className={s.inline} style={{ padding: '4px 0' }}>
          <input className={s.search} style={{ flex: 1, minWidth: 0 }} value={name} onChange={e => setName(e.target.value)} maxLength={30} autoFocus placeholder="e.g. Festive" aria-label="New category" />
          <button type="button" className={btn('primary')} onClick={() => save(null)} disabled={busy || !name.trim()}>Add</button>
        </div>
      ) : (
        <button type="button" className={s.catRow} style={{ color: 'rgb(var(--hv-orange-text))' }} onClick={() => { setAdding(true); setName('') }}>
          <Bi en="+ New category" zh="新增分类" />
        </button>
      )) : null}
      {error ? <div className={s.error} role="alert">{error}</div> : null}
    </div>
  )
}

function Gallery({ onPick, onClose }: { onPick: (key: string) => void; onClose: () => void }) {
  const [goal, setGoal] = useState<GoalId>('greet')
  const g = GOALS.find(x => x.id === goal)!
  return (
    <div className={s.scrim} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={s.window} role="dialog" aria-modal="true" aria-label="Choose a template" style={{ width: 1000 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, borderBottom: '1px solid rgb(var(--hv-hairline))', paddingBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <h2 className={s.windowTitle}>Templates</h2>
            <span className={s.hint}><Bi en="Choose a template, or start from scratch." zh="选择模板，或从零开始。" /></span>
          </div>
          <button type="button" className={btn('outline')} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
          <div style={{ flex: '0 1 220px', minWidth: 190, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button type="button" className={btn('dark')} style={{ marginBottom: 8 }} onClick={() => onPick('custom')}><Bi en="+ Start from scratch" zh="从零开始" /></button>
            <span className={s.label} style={{ padding: '6px 10px' }}><Bi en="Goals" zh="目标" /></span>
            {GOALS.map(x => (
              <button key={x.id} type="button" className={s.catRow} aria-pressed={goal === x.id} onClick={() => setGoal(x.id)}><Bi en={x.en} zh={x.zh} /></button>
            ))}
          </div>
          <div style={{ flex: '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <strong style={{ fontSize: 15 }}><Bi en={g.en} zh={g.zh} /></strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
              {TEMPLATE_CARDS.filter(c => c.goal === goal).map(c => (
                <button key={c.key} type="button" className={s.tplCard} disabled={c.soon} onClick={() => onPick(c.key)}>
                  <span className={s.tplArt} data-tone={c.tone} aria-hidden="true">{c.glyph}</span>
                  <span style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <strong style={{ fontSize: 14 }}><Bi en={c.en} zh={c.zh} /></strong>
                    <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>{c.descEn}</span>
                    {c.soon ? <span className={s.brand} data-tone="plum" style={{ alignSelf: 'flex-start' }}>Coming soon</span> : null}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── The editor ──────────────────────────────────────────────────────────────

function Editor({ start, categories, brands, canManage, onClose }: {
  start: Editing
  categories: AutoCategory[]
  brands: LeadBrand[]
  canManage: boolean
  onClose: () => void
}) {
  const [e, setE] = useState<Editing>(start)
  const [busy, go] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const set = (next: Partial<Editing>) => setE(x => ({ ...x, ...next }))
  const setConfig = (next: Partial<TemplateConfig>) => setE(x => ({ ...x, config: { ...x.config, ...next } as TemplateConfig }))
  const custom = e.config.template === 'custom'
  const tpl = TEMPLATE_NAME[e.config.template]

  // What the form makes, or why it cannot yet.
  const made = useMemo((): { steps: FlowStep[]; problem: string | null; trigger?: ReturnType<typeof compile> } => {
    if (custom) return { steps: e.steps, problem: flowProblem(e.steps) }
    try {
      const c = compile(e.config)
      return { steps: c.steps, problem: flowProblem(c.steps), trigger: c }
    } catch (err) {
      return { steps: [], problem: err instanceof Error ? err.message : String(err) }
    }
  }, [custom, e.config, e.steps])

  const save = () => go(async () => {
    setError(null)
    const { template, ...config } = e.config
    const r = await saveLeadFlow(e.id, {
      name: e.name, brandId: e.brandId, categoryId: e.categoryId, active: e.active,
      template, config: custom ? {} : (config as Record<string, unknown>),
      steps: made.steps,
      triggerKind: custom ? 'first' : made.trigger!.triggerKind,
      triggerValue: custom ? '' : made.trigger!.triggerValue,
    })
    if (!r.ok) { setError(r.reason); return }
    onClose()
  })
  const remove = () => {
    if (!e.id || !window.confirm(`Delete "${e.name}"?`)) return
    go(async () => {
      const r = await removeLeadFlow(e.id!)
      if (!r.ok) setError(r.reason)
      else onClose()
    })
  }

  return (
    <HvPage>
      <div className={s.inline} style={{ alignItems: 'center', marginBottom: 12, fontSize: 14 }}>
        <button type="button" className={s.linkBtn} onClick={onClose}>Automations</button>
        <span className={s.muted}>›</span>
        <strong>{tpl.en}</strong>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: '3 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section className={s.panel}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <label className={s.field}><Bi en="Name" zh="名字" /><input value={e.name} onChange={x => set({ name: x.target.value })} maxLength={60} disabled={!canManage} /></label>
              <label className={s.field}><Bi en="Category" zh="分类" />
                <select value={e.categoryId ?? ''} onChange={x => set({ categoryId: x.target.value || null })} disabled={!canManage}>
                  <option value="">No category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className={s.field}><Bi en="Brand" zh="品牌" />
                <select value={e.brandId ?? ''} onChange={x => set({ brandId: x.target.value || null })} disabled={!canManage}>
                  <option value="">All brands</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            </div>
          </section>

          {e.config.template === 'faq' ? <FaqForm c={e.config} set={setConfig} disabled={!canManage} /> : null}
          {e.config.template === 'welcome' ? <WelcomeForm c={e.config} set={setConfig} disabled={!canManage} /> : null}
          {e.config.template === 'away' ? <AwayForm c={e.config} set={setConfig} disabled={!canManage} /> : null}
          {e.config.template === 'keyword' ? <KeywordForm c={e.config} set={setConfig} disabled={!canManage} /> : null}
          {e.config.template === 'ad' ? <AdForm c={e.config} set={setConfig} disabled={!canManage} /> : null}
          {custom ? (
            <>
              <section className={s.panel}><span className={s.hint}><Bi en="From scratch: build the conversation step by step. It runs on a customer's first message." zh="从零开始：一步一步编排对话，在客户第一次发消息时开始。" /></span></section>
              <FlowTree steps={e.steps} canManage={canManage} onChange={steps => set({ steps })} />
            </>
          ) : null}

          {made.problem ? <div className={s.note} style={{ margin: 0 }}><Bi en={`Not ready to save: ${made.problem}`} zh="还不能保存" /></div> : null}
          {error ? <div className={s.error} role="alert">{error}</div> : null}
          {canManage ? (
            <div className={s.actions} style={{ alignItems: 'center' }}>
              <button type="button" className={btn('primary')} onClick={save} disabled={busy || !!made.problem || !e.name.trim()}>{busy ? 'Saving…' : <Bi en="Save" zh="保存" />}</button>
              <button type="button" className={btn('outline')} onClick={onClose} disabled={busy}><Bi en="Cancel" zh="取消" /></button>
              {e.id ? <button type="button" className={btn('outline')} onClick={remove} disabled={busy}><Bi en="Delete" zh="删除" /></button> : null}
              <span className={s.spacer} />
              <Switch on={e.active} disabled={!canManage} label="On after saving" onClick={() => set({ active: !e.active })} />
              <span className={s.hint}><Bi en={e.active ? 'On after saving' : 'Off after saving'} zh={e.active ? '保存后开启' : '保存后关闭'} /></span>
            </div>
          ) : null}
        </div>

        <div style={{ flex: '2 1 320px', minWidth: 0, position: 'sticky', top: 0 }}>
          <TryIt key={JSON.stringify(made.steps)} steps={made.steps} ok={!made.problem && made.steps.length > 0} />
        </div>
      </div>
    </HvPage>
  )
}

type FormProps<C> = { c: C; set: (next: Partial<TemplateConfig>) => void; disabled: boolean }

function Section({ en, zh, children }: { en: string; zh: string; children: ReactNode }) {
  return (
    <section className={s.panel}>
      <span className={s.label}><Bi en={en} zh={zh} /></span>
      {children}
    </section>
  )
}

function Rows<T>({ rows, render, onAdd, max, addEn, addZh, disabled }: {
  rows: T[]
  render: (row: T, i: number) => ReactNode
  onAdd: () => void
  max: number
  addEn: string
  addZh: string
  disabled: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map(render)}
      {!disabled && rows.length < max ? <button type="button" className={btn('dashed')} style={{ alignSelf: 'flex-start' }} onClick={onAdd}><Bi en={addEn} zh={addZh} /></button> : null}
    </div>
  )
}

const without = <T,>(xs: T[], i: number) => xs.filter((_, j) => j !== i)
const replaced = <T,>(xs: T[], i: number, x: T) => xs.map((y, j) => (j === i ? x : y))

function FaqForm({ c, set, disabled }: FormProps<FaqConfig>) {
  return (
    <>
      <Section en="When it shows" zh="什么时候出现">
        <span className={s.hint}><Bi en="A customer's first message." zh="客户第一次发消息时。" /></span>
        <label className={s.field}><Bi en="Opening line" zh="开场句" /><input value={c.intro} onChange={e => set({ intro: e.target.value })} disabled={disabled} maxLength={300} /></label>
      </Section>
      <Section en="Questions and answers — customers tap a question, they get its answer" zh="问题和回答：客户点问题，就收到回答">
        <div className={s.qaHead}><span><Bi en="Question (the button)" zh="问题（按钮上的字）" /></span><span><Bi en="Answer" zh="回答" /></span><span /></div>
        <Rows rows={c.items} max={c.handoffButton ? 12 : 13} addEn="+ Add a question" addZh="新增问题" disabled={disabled}
          onAdd={() => set({ items: [...c.items, { q: '', a: '' }] })}
          render={(it, i) => (
            <div key={i} className={s.qaRow}>
              <input className={s.search} value={it.q} maxLength={20} disabled={disabled} placeholder="Instalments?" aria-label="Question"
                onChange={e => set({ items: replaced(c.items, i, { ...it, q: e.target.value }) })} />
              <textarea className={s.textarea} rows={2} value={it.a} maxLength={1000} disabled={disabled} aria-label="Answer"
                onChange={e => set({ items: replaced(c.items, i, { ...it, a: e.target.value }) })} />
              {!disabled ? <button type="button" className={btn('outline')} aria-label="Remove" onClick={() => set({ items: without(c.items, i) })}>✕</button> : <span />}
            </div>
          )} />
        <label className={s.check}><input type="checkbox" checked={c.handoffButton} disabled={disabled} onChange={e => set({ handoffButton: e.target.checked })} /><Bi en='Add a "Talk to us" button (the conversation goes to Customer Service)' zh="最后加一个「找客服」按钮" /></label>
        <label className={s.check}><input type="checkbox" checked={c.repeat} disabled={disabled} onChange={e => set({ repeat: e.target.checked })} /><Bi en="Show the questions again after each answer" zh="回答之后，再显示一次问题按钮" /></label>
      </Section>
    </>
  )
}

function WelcomeForm({ c, set, disabled }: FormProps<WelcomeConfig>) {
  return (
    <Section en="A customer's first message — reply with" zh="客户第一次发消息时，回复">
      <label className={s.field}><Bi en="Welcome message" zh="欢迎消息" /><textarea value={c.message} onChange={e => set({ message: e.target.value })} disabled={disabled} maxLength={1000} /></label>
      <span className={s.hint}><Bi en="Buttons (optional, up to 3) — a tap sends the reply you write" zh="按钮（选填，最多 3 个）：客户点了就收到你写的回复" /></span>
      <Rows rows={c.buttons} max={3} addEn="+ Add a button" addZh="加按钮" disabled={disabled}
        onAdd={() => set({ buttons: [...c.buttons, { label: '', reply: '' }] })}
        render={(b, i) => (
          <div key={i} className={s.qaRow}>
            <input className={s.search} value={b.label} maxLength={20} disabled={disabled} placeholder="Promotions" aria-label="Button"
              onChange={e => set({ buttons: replaced(c.buttons, i, { ...b, label: e.target.value }) })} />
            <input className={s.search} value={b.reply} maxLength={1000} disabled={disabled} placeholder="Reply" aria-label="Reply"
              onChange={e => set({ buttons: replaced(c.buttons, i, { ...b, reply: e.target.value }) })} />
            {!disabled ? <button type="button" className={btn('outline')} aria-label="Remove" onClick={() => set({ buttons: without(c.buttons, i) })}>✕</button> : <span />}
          </div>
        )} />
    </Section>
  )
}

const WEEK = [1, 2, 3, 4, 5, 6, 0]

function AwayForm({ c, set, disabled }: FormProps<AwayConfig>) {
  const day = (d: number) => c.hours.find(h => h.day === d) ?? { day: d, from: '', to: '', off: true }
  const put = (d: number, next: Partial<AwayConfig['hours'][number]>) =>
    set({ hours: [...c.hours.filter(h => h.day !== d), { ...day(d), ...next }].sort((a, b) => a.day - b.day) })
  return (
    <>
      <Section en="Opening hours — outside them, this replies" zh="营业时间：时间以外自动回复">
        <div className={s.dayGrid}>
          <span /><span className={s.hint}><Bi en="Open" zh="上班" /></span><span className={s.hint}><Bi en="Close" zh="下班" /></span><span />
          {WEEK.map(d => {
            const h = day(d)
            return [
              <span key={`n${d}`}>{dayName(d)}</span>,
              <input key={`f${d}`} type="time" className={s.search} value={h.from} disabled={disabled || h.off} onChange={e => put(d, { from: e.target.value })} aria-label={`${dayName(d)} open`} />,
              <input key={`t${d}`} type="time" className={s.search} value={h.to} disabled={disabled || h.off} onChange={e => put(d, { to: e.target.value })} aria-label={`${dayName(d)} close`} />,
              <label key={`o${d}`} className={s.check}><input type="checkbox" checked={h.off} disabled={disabled} onChange={e => put(d, { off: e.target.checked })} /><Bi en="Closed" zh="休息" /></label>,
            ]
          })}
        </div>
      </Section>
      <Section en="When away, reply with" zh="不在的时候回复">
        <textarea className={s.textarea} rows={3} value={c.message} onChange={e => set({ message: e.target.value })} disabled={disabled} maxLength={1000} aria-label="Away message" />
        <label className={s.check}><input type="checkbox" checked={c.askPhone} disabled={disabled} onChange={e => set({ askPhone: e.target.checked })} /><Bi en="Wait for a phone number, then hand to Customer Service" zh="等客户留电话，再交给客服" /></label>
        {c.askPhone ? <label className={s.field}><Bi en="After the phone" zh="留了电话之后" /><input value={c.after} onChange={e => set({ after: e.target.value })} disabled={disabled} maxLength={1000} /></label> : null}
        <span className={s.hint}><Bi en="Sent at most once in 12 hours to the same customer." zh="同一个客户 12 小时内只回一次。" /></span>
      </Section>
    </>
  )
}

function Chips({ values, onChange, disabled, placeholder }: { values: string[]; onChange: (v: string[]) => void; disabled: boolean; placeholder: string }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setDraft('')
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {values.map(v => (
        <span key={v} className={s.chipItem}>{v}{!disabled ? <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter(x => x !== v))}>✕</button> : null}</span>
      ))}
      {!disabled ? (
        <input className={s.search} style={{ width: 150 }} value={draft} placeholder={placeholder} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }} onBlur={add} aria-label={placeholder} />
      ) : null}
    </div>
  )
}

function KeywordForm({ c, set, disabled }: FormProps<KeywordConfig>) {
  return (
    <Section en="When a message has any of these words" zh="消息里有这些字（任何一个）">
      <Chips values={c.keywords} onChange={keywords => set({ keywords })} disabled={disabled} placeholder="+ keyword, Enter" />
      <span className={s.hint}><Bi en="Works on any message, unless Customer Service replied to this customer in the last 12 hours." zh="任何一则消息都会触发；客服 12 小时内回复过这个客户就不会。" /></span>
      <label className={s.field}><Bi en="Reply" zh="自动回复" /><textarea value={c.reply} onChange={e => set({ reply: e.target.value })} disabled={disabled} maxLength={1000} /></label>
      <label className={s.check}><input type="checkbox" checked={c.askPhone} disabled={disabled} onChange={e => set({ askPhone: e.target.checked })} /><Bi en="Then ask for a phone number" zh="回复之后请客户留电话" /></label>
      {c.askPhone ? (
        <div className={s.fieldGrid}>
          <label className={s.field}><Bi en="Ask for the phone" zh="问电话" /><input value={c.phoneAsk} onChange={e => set({ phoneAsk: e.target.value })} disabled={disabled} /></label>
          <label className={s.field}><Bi en="After the phone" zh="留了电话之后" /><input value={c.after} onChange={e => set({ after: e.target.value })} disabled={disabled} /></label>
        </div>
      ) : null}
    </Section>
  )
}

const SAVE_AS: ReadonlyArray<{ v: SaveAs | ''; en: string; zh: string }> = [
  { v: '', en: "Don't keep", zh: '不保存' },
  { v: 'interest', en: 'Interest', zh: '意向' },
  { v: 'budget', en: 'Budget', zh: '预算' },
  { v: 'showroom', en: 'Showroom', zh: '分店' },
  { v: 'preferredTime', en: 'Time', zh: '时间' },
]

function AdForm({ c, set, disabled }: FormProps<AdConfig>) {
  return (
    <>
      <Section en="Which ad" zh="从哪个广告进来">
        <label className={s.field}><Bi en="Ad name contains" zh="广告名称包含" /><input value={c.ad} onChange={e => set({ ad: e.target.value })} disabled={disabled} placeholder="Sofa Week" maxLength={120} /></label>
        <label className={s.field}><Bi en="Opening line" zh="开场句" /><input value={c.intro} onChange={e => set({ intro: e.target.value })} disabled={disabled} maxLength={300} /></label>
      </Section>
      <Section en="Ask a few questions — answers are buttons (up to 3 questions)" zh="问客户几个问题（答案是按钮，最多 3 题）">
        <Rows rows={c.questions} max={3} addEn="+ Add a question" addZh="加一题" disabled={disabled}
          onAdd={() => set({ questions: [...c.questions, { text: '', options: [], saveAs: null }] })}
          render={(q, i) => (
            <div key={i} className={s.panel} style={{ gap: 8, padding: 12 }}>
              <div className={s.inline} style={{ alignItems: 'flex-end' }}>
                <label className={s.field} style={{ flex: '1 1 220px' }}><Bi en={`Question ${i + 1}`} zh={`第 ${i + 1} 题`} />
                  <input value={q.text} onChange={e => set({ questions: replaced(c.questions, i, { ...q, text: e.target.value }) })} disabled={disabled} maxLength={300} />
                </label>
                <label className={s.field} style={{ flex: '0 1 160px' }}><Bi en="Keep the answer as" zh="答案存到客户卡" />
                  <select value={q.saveAs ?? ''} disabled={disabled} onChange={e => set({ questions: replaced(c.questions, i, { ...q, saveAs: (e.target.value || null) as SaveAs | null }) })}>
                    {SAVE_AS.map(x => <option key={x.v} value={x.v}>{x.en}</option>)}
                  </select>
                </label>
                {!disabled ? <button type="button" className={btn('outline')} onClick={() => set({ questions: without(c.questions, i) })}><Bi en="Remove" zh="删除" /></button> : null}
              </div>
              <span className={s.hint}><Bi en="Options" zh="选项" /></span>
              <Chips values={q.options} onChange={options => set({ questions: replaced(c.questions, i, { ...q, options }) })} disabled={disabled} placeholder="+ option, Enter" />
            </div>
          )} />
      </Section>
      <Section en="Then ask for a phone number" zh="最后请客户留电话">
        <div className={s.fieldGrid}>
          <label className={s.field}><Bi en="Ask for the phone" zh="问电话" /><input value={c.phoneAsk} onChange={e => set({ phoneAsk: e.target.value })} disabled={disabled} /></label>
          <label className={s.field}><Bi en="After the phone" zh="留了电话之后" /><input value={c.after} onChange={e => set({ after: e.target.value })} disabled={disabled} /></label>
        </div>
        <span className={s.hint}><Bi en="The answers and the phone go into the customer card; then Customer Service takes over." zh="答案和电话会自动填进客户卡，然后交给客服。" /></span>
      </Section>
    </>
  )
}
