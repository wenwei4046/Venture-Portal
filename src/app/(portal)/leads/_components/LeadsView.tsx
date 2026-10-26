'use client'

import { useEffect, useMemo, useState, useTransition, type MouseEvent as ReactMouseEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { markLeadLost, reopenLead, setLeadStage } from '@/lib/leads/actions'
import { adLabel } from '@/lib/leads/ads'
import { handedTo } from '@/lib/leads/handoff'
import { formatPhone, whatsAppLink } from '@/lib/leads/phone'
import {
  PROGRESS, RANGES, STAGE_LABEL, STAGE_ORDER, STAGE_TABS, followUp, lastUpdate, leadsCsv, readSaleValue, stageDays, stageOf, stageReached,
  type LeadStage, type RangeId, type SetStage,
} from '@/lib/leads/stage'
import { whenFull } from '@/lib/leads/time'
import type { LeadConfig, LeadContact } from '@/lib/leads/types'
import { LeadIcon } from '@/components/layout/lead-icons'
import s from './leads.module.css'

/**
 * Lead View › Leads v2 (2026-10-22, the redesign v2 handoff `Leads.dc.html`): everyone who messaged, on the pipeline
 * Customer Service keeps — filters, tabs by where they stand, a sortable table whose columns drag (kept in the
 * browser), the period and the page size at its foot, and a drawer to move a lead along, lose it or reopen it.
 * The period is read by the server (`?r=`, `?from=` `?to=`, the office's days of the last update); the rest here.
 */

const DEFAULT_W = [190, 100, 210, 170, 130, 130] as const
const COLS_KEY = 'houzs-leads-cols'
const HEADS = ['CUSTOMER', 'BRAND', 'SOURCE', 'INTEREST', 'SALESPERSON', 'STATUS', 'LAST UPDATE'] as const
const SIZES = [20, 50, 100] as const
const SETTABLE: readonly LeadStage[] = ['handed', 'contacted', 'appt', 'came', 'closed']

export default function LeadsView({ config, contacts, range, from, to, today, now, stagesReady, canEdit }: {
  config: LeadConfig
  contacts: LeadContact[]
  range: RangeId
  /** The custom range's days as asked (inclusive), for the two boxes. */
  from: string
  to: string
  today: string
  /** The server's clock, so "Not contacted · 26 h" reads the same on both sides. */
  now: number
  /** Is the pipeline's migration applied? Before it, the steps cannot be set. */
  stagesReady: boolean
  canEdit: boolean
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [brand, setBrand] = useState('all')
  const [sales, setSales] = useState('all')
  const [source, setSource] = useState('all')
  const [staleOnly, setStaleOnly] = useState(false)
  const [tab, setTab] = useState<LeadStage | 'all'>('all')
  const [sort, setSort] = useState<{ k: number; dir: 1 | -1 }>({ k: 6, dir: -1 })
  const [size, setSize] = useState<number>(20)
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const [widths, setWidths] = useState<number[]>([...DEFAULT_W])
  useEffect(() => {
    try {
      const kept: unknown = JSON.parse(window.localStorage.getItem(COLS_KEY) ?? 'null')
      if (Array.isArray(kept) && kept.length === 6 && kept.every(n => typeof n === 'number')) setWidths(kept.map(n => Math.max(70, Math.min(480, n))))
    } catch { /* the handoff's widths */ }
  }, [])
  // Any filter goes back to the first page.
  useEffect(() => { setPage(0) }, [q, brand, sales, source, staleOnly, tab, size, range, from, to])

  const brands = useMemo(() => new Map(config.brands.map(b => [b.id, b])), [config.brands])
  const brandName = (id: string) => brands.get(id)?.name ?? '—'
  const salesNames = useMemo(() => [...new Set(contacts.map(c => handedTo(c)).filter((n): n is string => !!n))].sort(), [contacts])
  const adNames = useMemo(() => [...new Set(contacts.map(c => adLabel(c)).filter(Boolean))].sort(), [contacts])

  const needle = q.trim().toLowerCase()
  const digits = needle.replace(/[\s-]/g, '')
  const base = contacts.filter(c => (brand === 'all' || c.brandId === brand)
    && (sales === 'all' || handedTo(c) === sales)
    && (source === 'all' || (source === 'organic' ? !adLabel(c) : source === 'ads' ? !!adLabel(c) : adLabel(c) === source))
    && (!needle || `${c.name} ${c.interest}`.toLowerCase().includes(needle) || (/^\d{3,}$/.test(digits) && (c.phone ?? '').includes(digits))))
  const staleCount = base.filter(c => followUp(c, now)).length
  const counts = useMemo(() => {
    const n: Record<string, number> = { all: base.length }
    for (const c of base) n[stageOf(c)] = (n[stageOf(c)] ?? 0) + 1
    return n
  }, [base])

  const sortValue = (c: LeadContact, k: number): string | number => k === 0 ? c.name.toLowerCase() : k === 1 ? brandName(c.brandId)
    : k === 2 ? (adLabel(c) || 'Organic') : k === 3 ? c.interest : k === 4 ? (handedTo(c) ?? '￿')
      : k === 5 ? STAGE_ORDER.indexOf(stageOf(c)) : Date.parse(lastUpdate(c))
  const shownAll = base.filter(c => (tab === 'all' || stageOf(c) === tab) && (!staleOnly || followUp(c, now)))
    .sort((a, b) => {
      const x = sortValue(a, sort.k), y = sortValue(b, sort.k)
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir
    })
  const pages = Math.max(1, Math.ceil(shownAll.length / size))
  const p = Math.min(page, pages - 1)
  const shown = shownAll.slice(p * size, (p + 1) * size)
  const cols = widths.map(w => `${w}px`).join(' ') + ' minmax(110px,1fr)'

  const goRange = (r: RangeId, f = from, t = to) => {
    const qs = new URLSearchParams({ r })
    if (r === 'custom') { if (f) qs.set('from', f); if (t) qs.set('to', t) }
    router.push(`/leads/list?${qs.toString()}`)
  }
  const resize = (i: number, e: ReactMouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const x0 = e.clientX
    const w0 = widths[i]
    let last = widths
    const move = (ev: MouseEvent) => setWidths(ws => { const next = ws.slice(); next[i] = Math.max(70, Math.min(480, w0 + ev.clientX - x0)); last = next; return next })
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      try { window.localStorage.setItem(COLS_KEY, JSON.stringify(last)) } catch { /* not kept */ }
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  const resetWidth = (i: number) => {
    setWidths(ws => { const next = ws.slice(); next[i] = DEFAULT_W[i]; return next })
    try { window.localStorage.removeItem(COLS_KEY) } catch { /* nothing kept */ }
  }
  const exportCsv = () => {
    const csv = leadsCsv(shownAll, brandName, whenFull)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `Leads ${today}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const open = contacts.find(c => c.id === openId) ?? null

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div className={s.titles}>
          <span className={s.eyebrow}>LEAD VIEW</span>
          <h1 className={s.title}>Leads</h1>
        </div>
        <span className={s.subtitle}>Everyone who messaged, from every page and channel.</span>
        <button type="button" className={s.export} onClick={exportCsv} disabled={shownAll.length === 0}>Export CSV ↓</button>
      </div>

      <div className={s.filters}>
        <label className={s.find}>
          <LeadIcon name="search" size={14} />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Name, phone or interest" aria-label="Search leads" />
        </label>
        <select className={s.select} value={brand} onChange={e => setBrand(e.target.value)} aria-label="Brand">
          <option value="all">All brands</option>
          {config.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className={s.select} value={sales} onChange={e => setSales(e.target.value)} aria-label="Salesperson">
          <option value="all">All salespeople</option>
          {salesNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select className={s.select} value={source} onChange={e => setSource(e.target.value)} aria-label="Source">
          <option value="all">All sources</option>
          <option value="organic">Organic</option>
          <option value="ads">From ads</option>
          {adNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button type="button" className={s.stale} aria-pressed={staleOnly} onClick={() => setStaleOnly(v => !v)}>
          <span className={s.staleDot} aria-hidden="true" />Needs follow-up · {staleCount}
        </button>
      </div>

      <div className={s.tabs} role="group" aria-label="Where they stand">
        {STAGE_TABS.map(t => (
          <button key={t.id} type="button" className={s.tab} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}<span className={s.count}>{counts[t.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {!stagesReady ? (
        <div className={s.note}>The steps after Handed (Contacted, Closed, Lost) wait for the database update · this list shows conversations started in the period.</div>
      ) : null}

      <div className={s.table} role="table" aria-label="Leads">
        <div className={s.headRow} style={{ gridTemplateColumns: cols }} role="row">
          {HEADS.map((label, i) => (
            <div key={label} className={s.headCell} role="columnheader" aria-sort={sort.k === i ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
              <button type="button" className={s.sort} title="Sort"
                onClick={() => setSort(o => (o.k === i ? { k: i, dir: o.dir > 0 ? -1 : 1 } : { k: i, dir: i === 6 ? -1 : 1 }))}>
                {label}<span className={s.arrow}>{sort.k === i ? (sort.dir > 0 ? '↑' : '↓') : ''}</span>
              </button>
              {i < 6 ? <span className={s.grip} onMouseDown={e => resize(i, e)} onDoubleClick={() => resetWidth(i)} title="Drag to resize · double-click to reset" aria-hidden="true" /> : null}
            </div>
          ))}
        </div>
        {shown.map(c => {
          const st = stageOf(c)
          const late = followUp(c, now)
          const ad = adLabel(c)
          return (
            <button key={c.id} type="button" role="row" className={s.row} style={{ gridTemplateColumns: cols }} aria-current={openId === c.id} onClick={() => setOpenId(c.id)}>
              <span className={s.two}>
                <span className={s.name}>{c.name || '—'}</span>
                <span className={s.small}>{c.phone ? formatPhone(c.phone) : 'No phone yet'}</span>
              </span>
              <span className={s.brand}>{brandName(c.brandId)}</span>
              <span className={s.source}>
                <span className={s.ch} data-ch={c.channel}>{c.channel === 'instagram' ? 'IG' : 'FB'}</span>
                <span className={`${s.cut} ${ad ? '' : s.small}`}>{ad || 'Organic'}</span>
              </span>
              <span className={s.cut}>{c.interest || <span className={s.quiet}>—</span>}</span>
              <span className={`${s.cut} ${handedTo(c) ? '' : s.quiet}`}>{handedTo(c) ?? '—'}</span>
              <span className={s.status} data-stage={st}>{STAGE_LABEL[st]}</span>
              <span className={s.two}>
                <span className={s.small}>{whenFull(lastUpdate(c))}</span>
                {late ? <span className={s.late}>{late}</span> : null}
              </span>
            </button>
          )
        })}
        {shown.length === 0 ? <div className={s.empty}>{contacts.length === 0 ? 'Nobody messaged in this period.' : 'No leads match these filters.'}</div> : null}
      </div>

      <div className={s.foot}>
        <span className={s.seg} role="group" aria-label="Period">
          {RANGES.map(r => (
            <button key={r.id} type="button" className={s.segBtn} aria-pressed={range === r.id} onClick={() => goRange(r.id)}>{r.label}</button>
          ))}
        </span>
        {range === 'custom' ? (
          <span className={s.inline}>
            <input type="date" className={s.date} value={from} max={today} onChange={e => goRange('custom', e.target.value, to)} aria-label="From" />
            <span>to</span>
            <input type="date" className={s.date} value={to} max={today} onChange={e => goRange('custom', from, e.target.value)} aria-label="To" />
          </span>
        ) : null}
        <span className={s.inline}>Per page
          <span className={s.seg} role="group" aria-label="Per page">
            {SIZES.map(n => <button key={n} type="button" className={s.segBtn} aria-pressed={size === n} onClick={() => setSize(n)}>{n}</button>)}
          </span>
        </span>
        <span className={s.fill} />
        <span className={s.pager}>
          {shownAll.length ? `${p * size + 1}–${Math.min(shownAll.length, (p + 1) * size)} of ${shownAll.length}` : '0 of 0'}
          <button type="button" className={s.pageBtn} onClick={() => setPage(Math.max(0, p - 1))} disabled={p === 0} title="Previous page">‹</button>
          <button type="button" className={s.pageBtn} onClick={() => setPage(Math.min(pages - 1, p + 1))} disabled={p >= pages - 1} title="Next page">›</button>
        </span>
      </div>

      {open ? (
        <LeadDrawer key={open.id} lead={open} brandName={brandName(open.brandId)} salesPhone={brands.get(open.brandId)?.sales.find(x => x.id === open.handedSalesId)?.phone ?? null}
          canEdit={canEdit && stagesReady} onClose={() => setOpenId(null)} onSaved={() => router.refresh()} />
      ) : null}
    </div>
  )
}

function LeadDrawer({ lead, brandName, salesPhone, canEdit, onClose, onSaved }: {
  lead: LeadContact
  brandName: string
  salesPhone: string | null
  canEdit: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [value, setValue] = useState(lead.saleValue == null || lead.saleValue === '' ? '' : String(lead.saleValue))
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const st = stageOf(lead)
  const reached = stageReached(lead)
  const idx = PROGRESS.findIndex(x => x.id === reached)
  const days = stageDays(lead)
  const ad = adLabel(lead)
  const run = (job: () => Promise<{ ok: true } | { ok: false; reason: string }>) => {
    setError(null)
    start(async () => {
      const r = await job()
      if (!r.ok) setError(r.reason)
      else onSaved()
    })
  }
  const pick = (id: LeadStage) => {
    if (!SETTABLE.includes(id) || !lead.handedAt || (id === reached && st !== 'lost')) return
    run(() => setLeadStage(lead.id, id as SetStage))
  }
  const lose = () => {
    const why = window.prompt('Why was it lost?', 'Bought elsewhere')
    if (why === null) return
    run(() => markLeadLost(lead.id, why))
  }
  const saveValue = () => {
    const v = readSaleValue(value)
    if (v === 'bad') { setError('A sale value is ringgit, like 2,690.'); return }
    const was = lead.saleValue == null || lead.saleValue === '' ? null : Number(lead.saleValue)
    if (v === was) return
    run(() => setLeadStage(lead.id, 'closed', v))
  }
  const timeline = [
    ...PROGRESS.filter(x => days[x.id]).map(x => ({ at: days[x.id]!, text: x.id === 'handed' && handedTo(lead) ? `${x.label} · ${handedTo(lead)}` : x.label })),
    ...(lead.lostAt ? [{ at: lead.lostAt, text: `Marked lost · ${lead.lostReason || 'No reason'}` }] : []),
  ].sort((a, b) => b.at.localeCompare(a.at))
  const remind = salesPhone && lead.handedSalesName
    ? whatsAppLink(salesPhone, `Hi ${lead.handedSalesName}, a reminder about ${lead.name || 'the customer'} (${formatPhone(lead.phone)}) from Lead View — have you contacted them? 请回复进度，谢谢`)
    : null

  return (
    <>
      <div className={s.scrim} onClick={onClose} aria-hidden="true" />
      <aside className={s.drawer} role="dialog" aria-label={lead.name || 'Lead'}>
        <div className={s.drawerHead}>
          <div className={s.drawerWho}>
            <span className={s.inline}>
              <span className={s.brand}>{brandName}</span>
              <span className={s.small} style={{ fontSize: 14 }}>{lead.channel === 'instagram' ? 'Instagram' : 'Messenger'} · {ad || 'Organic'}</span>
            </span>
            <span className={s.bigName}>{lead.name || '—'}</span>
            <span className={s.phone} data-none={lead.phone ? undefined : ''}>{lead.phone ? formatPhone(lead.phone) : 'No phone yet'}</span>
          </div>
          <button type="button" className={s.close} onClick={onClose} aria-label="Close"><LeadIcon name="x" size={15} /></button>
        </div>
        <div className={s.drawerBody}>
          <div className={s.section}>
            <span className={s.caps}>PROGRESS</span>
            <div className={s.steps}>
              {PROGRESS.map((x, i) => {
                const settable = canEdit && !busy && !!lead.handedAt && SETTABLE.includes(x.id) && !(x.id === reached && st !== 'lost')
                return (
                  <button key={x.id} type="button" className={s.step} data-done={i <= idx || undefined} data-current={(i === idx && st !== 'lost') || undefined}
                    disabled={!settable} onClick={() => pick(x.id)} title={settable ? `Set to: ${x.label}` : undefined}>
                    <span className={s.ring} aria-hidden="true" />
                    <span className={s.stepLabel}>{x.label}</span>
                    <span className={s.when}>{days[x.id] ? whenFull(days[x.id]!) : ''}</span>
                  </button>
                )
              })}
            </div>
            <div className={s.inline} style={{ gap: 10 }}>
              {canEdit && st !== 'lost' && st !== 'closed' && st !== 'nophone' ? (
                <button type="button" className={s.lostBtn} onClick={lose} disabled={busy}>Mark as lost</button>
              ) : null}
              {st === 'lost' ? (
                <>
                  <span className={s.lostText}>Lost · {lead.lostReason || 'No reason'}</span>
                  {canEdit ? <button type="button" className={s.link} onClick={() => run(() => reopenLead(lead.id))} disabled={busy}>Reopen</button> : null}
                </>
              ) : null}
              <span className={s.fill} />
              {lead.stageByName ? <span className={s.by}>Updated by {lead.stageByName}</span> : null}
            </div>
            {st === 'closed' ? (
              <label className={s.value}>Sale value
                <input className={s.valueInput} value={value} onChange={e => setValue(e.target.value)} placeholder="RM" disabled={!canEdit || busy}
                  onBlur={saveValue} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
              </label>
            ) : null}
            {!lead.handedAt && canEdit ? <span className={s.by}>The steps after the hand-over open once the lead is handed (Inbox).</span> : null}
            {error ? <div className={s.error} role="alert">{error}</div> : null}
          </div>

          <div className={s.section}>
            <span className={s.caps}>FOR THE SALESPERSON</span>
            <div className={s.facts}>
              <span>Salesperson</span><span>{handedTo(lead) ?? 'Not handed yet'}</span>
              <span>Handed</span><span>{lead.handedAt ? whenFull(lead.handedAt) : '—'}</span>
              <span>Interest</span><span>{lead.interest || '—'}</span>
              <span>Budget</span><span>{lead.budget || '—'}</span>
              <span>Showroom</span><span>{lead.showroom || '—'}</span>
              <span>Note</span><span>{lead.note || '—'}</span>
            </div>
          </div>

          <div className={s.section}>
            <span className={s.caps}>TIMELINE</span>
            {timeline.map((e, i) => (
              <div key={i} className={s.event}><span className={s.eventAt}>{whenFull(e.at)}</span><span>{e.text}</span></div>
            ))}
          </div>
        </div>
        <div className={s.drawerFoot}>
          <Link className={s.footBtn} data-strong="" href={`/leads?c=${lead.id}`}>Open conversation</Link>
          {remind ? <a className={s.footBtn} href={remind} target="_blank" rel="noopener noreferrer">Remind salesperson on WhatsApp</a> : null}
        </div>
      </aside>
    </>
  )
}
