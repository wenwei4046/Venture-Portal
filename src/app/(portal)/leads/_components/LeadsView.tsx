'use client'

import { useEffect, useMemo, useState, useTransition, type MouseEvent as ReactMouseEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { handLeadToGroup, markLeadLost, reopenLead, setLeadStage } from '@/lib/leads/actions'
import { adLabel } from '@/lib/leads/ads'
import { handedTo } from '@/lib/leads/handoff'
import { visitShown } from '@/lib/leads/inbox'
import { formatPhone, whatsAppLink } from '@/lib/leads/phone'
import {
  PROGRESS, RANGES, RANGE_MENU, STAGE_LABEL, STAGE_ORDER, STAGE_TABS, STAGE_TONE, followUp, lastUpdate, leadsCsv, readSaleValue, stageDays, stageOf, stageReached,
  type LeadStage, type RangeId, type SetStage,
} from '@/lib/leads/stage'
import { whenFull } from '@/lib/leads/time'
import type { LeadConfig, LeadContact } from '@/lib/leads/types'
import { LeadIcon, type LeadIconName } from '@/components/layout/lead-icons'
import { flash } from '@/components/hrv/toast'
import Popover from './ui/Popover'
import { MenuItem } from './ui/ContextMenu'
import { SortHead } from './ui/bits'
import { initials } from './bits'
import s from './leads.module.css'

/**
 * Lead View › Leads (2026-11-02, the v2 handoff `docs/design_handoff_lead_view_v2` §7.2 — `Lead View App.dc.html` lines
 * 197–309): one card — search, Brand / Salesperson / Source, Needs follow-up, the range and Export; the status tabs;
 * a sortable table with ticks (the dark bulk bar over the toolbar: Hand over to sales, Change status, Export selected,
 * Clear); per page and paging at the foot; and the 420px drawer.
 *
 * Kept from before: a step clicked on the drawer's Progress sets it, the Sale value is typed there once closed, a lost
 * lead reopens; the custom range's two days. The period is read by the server (`?r=`, `?from=` `?to=`); `?lead=` opens
 * one lead's drawer (the Inbox's *Open in Leads*).
 */

type SortKey = 'name' | 'source' | 'interest' | 'sales' | 'status' | 'updated'
const SIZES = [20, 50, 100] as const
const SETTABLE: readonly LeadStage[] = ['handed', 'contacted', 'appt', 'came', 'closed']
const tone = (t: string) => `rgb(var(--lv-${t}))`

export default function LeadsView({ config, contacts, range, from, to, today, now, stagesReady, canEdit, openLead = null }: {
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
  /** A lead to open on arrival (`?lead=`). */
  openLead?: string | null
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [brand, setBrand] = useState('all')
  const [sales, setSales] = useState('all')
  const [source, setSource] = useState('all')
  const [menu, setMenu] = useState<'brand' | 'sales' | 'source' | 'range' | null>(null)
  const [staleOnly, setStaleOnly] = useState(false)
  const [tab, setTab] = useState<LeadStage | 'all'>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'updated', dir: 'desc' })
  const [size, setSize] = useState<number>(20)
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState<string | null>(openLead)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [moveAt, setMoveAt] = useState<{ x: number; y: number; ids: string[] } | null>(null)
  const [busy, startBusy] = useTransition()
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

  const sortValue = (c: LeadContact, k: SortKey): string | number => k === 'name' ? c.name.toLowerCase()
    : k === 'source' ? (adLabel(c) || 'Organic') : k === 'interest' ? c.interest : k === 'sales' ? (handedTo(c) ?? '￿')
      : k === 'status' ? STAGE_ORDER.indexOf(stageOf(c)) : Date.parse(lastUpdate(c))
  const shownAll = base.filter(c => (tab === 'all' || stageOf(c) === tab) && (!staleOnly || followUp(c, now)))
    .sort((a, b) => {
      const x = sortValue(a, sort.key), y = sortValue(b, sort.key)
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * (sort.dir === 'asc' ? 1 : -1)
    })
  const pages = Math.max(1, Math.ceil(shownAll.length / size))
  const p = Math.min(page, pages - 1)
  const shown = shownAll.slice(p * size, (p + 1) * size)
  const ticked = shownAll.filter(c => picked.has(c.id))
  const allOn = shownAll.length > 0 && ticked.length === shownAll.length
  const partOn = ticked.length > 0 && !allOn
  const onSort = (key: SortKey) => setSort(o => (o.key === key ? { key, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'updated' ? 'desc' : 'asc' }))
  const tick = (id: string, e: ReactMouseEvent) => {
    e.stopPropagation()
    setPicked(cur => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const goRange = (r: RangeId, f = from, t = to) => {
    const qs = new URLSearchParams({ r })
    if (r === 'custom') { if (f) qs.set('from', f); if (t) qs.set('to', t) }
    router.push(`/leads/list?${qs.toString()}`)
  }
  const download = (rows: LeadContact[]) => {
    const csv = leadsCsv(rows, brandName, whenFull)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `Leads ${today}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  const plural = (n: number) => `${n} ${n === 1 ? 'lead' : 'leads'}`
  // Hand over to sales: the ticked leads with a phone not handed yet go to their brand's sales group.
  const bulkHand = () => {
    const ok = ticked.filter(c => stageOf(c) === 'new')
    const skip = ticked.length - ok.length
    startBusy(async () => {
      let done = 0
      for (const c of ok) { const r = await handLeadToGroup(c.id); if (r.ok) done++ }
      setPicked(new Set())
      flash(`${plural(done)} handed over to sales${skip || done < ok.length ? ` · ${skip + ok.length - done} skipped (no phone or already handed)` : ''}`)
      router.refresh()
    })
  }
  // Change status: each lead moved where the pipeline lets it (a step past the hand-over, or lost).
  const moveTo = (ids: string[], to: LeadStage) => {
    setMoveAt(null)
    const rows = contacts.filter(c => ids.includes(c.id))
    startBusy(async () => {
      let done = 0
      for (const c of rows) {
        const st = stageOf(c)
        if (st === to) { done++; continue }
        const r = to === 'lost' ? (c.phone && st !== 'closed' ? await markLeadLost(c.id, 'Marked lost') : null)
          : SETTABLE.includes(to) && c.handedAt ? await setLeadStage(c.id, to as SetStage) : null
        if (r?.ok) done++
      }
      setPicked(new Set())
      const skip = rows.length - done
      flash(`${plural(done)} moved to ${STAGE_LABEL[to]}${skip ? ` · ${skip} skipped` : ''}`)
      router.refresh()
    })
  }
  const openMove = (ids: string[], e: ReactMouseEvent) => {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    setMoveAt({ ids, x: Math.min(r.right - 220, window.innerWidth - 230), y: Math.min(r.bottom + 6, window.innerHeight - 340) })
  }

  const open = contacts.find(c => c.id === openId) ?? null
  const brandLabel = brand === 'all' ? 'All brands' : brandName(brand)
  const salesLabel = sales === 'all' ? 'All salespeople' : sales
  const sourceLabel = source === 'all' ? 'All sources' : source === 'organic' ? 'Organic' : source === 'ads' ? 'From ads' : source
  const rangeLabel = RANGES.find(r => r.id === range)?.label ?? 'This month'
  const filters: Array<{ k: 'brand' | 'sales' | 'source'; icon: LeadIconName; label: string; options: Array<{ v: string; label: string }>; set: (v: string) => void; value: string }> = [
    { k: 'brand', icon: 'store', label: brandLabel, value: brand, set: setBrand, options: [{ v: 'all', label: 'All brands' }, ...config.brands.map(b => ({ v: b.id, label: b.name }))] },
    { k: 'sales', icon: 'user', label: salesLabel, value: sales, set: setSales, options: [{ v: 'all', label: 'All salespeople' }, ...salesNames.map(n => ({ v: n, label: n }))] },
    { k: 'source', icon: 'radio-tower', label: sourceLabel, value: source, set: setSource, options: [{ v: 'all', label: 'All sources' }, { v: 'organic', label: 'Organic' }, { v: 'ads', label: 'From ads' }, ...adNames.map(n => ({ v: n, label: n }))] },
  ]

  return (
    <div className={s.page}>
      <section className={s.card}>
        <div className={s.tools}>
          {ticked.length ? (
            <div className={s.bulk}>
              <span className={s.bulkCount}>{ticked.length} selected</span>
              <button type="button" className={s.bulkBtn} onClick={bulkHand} disabled={busy || !canEdit}><LeadIcon name="send" size={14} />Hand over to sales</button>
              <button type="button" className={s.bulkBtn} onClick={e => openMove(ticked.map(c => c.id), e)} disabled={busy || !canEdit || !stagesReady}><LeadIcon name="circle-dot" size={14} />Change status</button>
              <button type="button" className={s.bulkBtn} onClick={() => download(ticked)}><LeadIcon name="download" size={14} />Export selected</button>
              <span className={s.fill} />
              <button type="button" className={s.bulkClear} onClick={() => setPicked(new Set())}>Clear</button>
            </div>
          ) : null}
          <label className={s.search}>
            <LeadIcon name="search" size={15} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, phone or interest" aria-label="Search leads" />
          </label>
          {filters.map(f => (
            <span key={f.k} className={s.anchor}>
              <button type="button" className={s.ghost} onClick={() => setMenu(m => (m === f.k ? null : f.k))} aria-haspopup="menu" aria-expanded={menu === f.k}>
                <LeadIcon name={f.icon} size={15} className={s.ghostIcon} />{f.label}<LeadIcon name="chevron-down" size={14} className={s.chev} />
              </button>
              <Popover open={menu === f.k} onClose={() => setMenu(null)} style={{ top: 40, left: 0, minWidth: 200 }} label={f.label}>
                {f.options.map(o => <MenuItem key={o.v} selected={f.value === o.v} onSelect={() => { f.set(o.v); setMenu(null) }}>{o.label}</MenuItem>)}
              </Popover>
            </span>
          ))}
          <button type="button" className={s.stale} aria-pressed={staleOnly} onClick={() => setStaleOnly(v => !v)}>
            <span className={s.staleDot} aria-hidden="true" />Needs follow-up<span className={s.staleCount}>{staleCount}</span>
          </button>
          <span className={s.fill} />
          {range === 'custom' ? (
            <span className={s.dates}>
              <input type="date" className={s.date} value={from} max={today} onChange={e => goRange('custom', e.target.value, to)} aria-label="From" />
              to
              <input type="date" className={s.date} value={to} max={today} onChange={e => goRange('custom', from, e.target.value)} aria-label="To" />
            </span>
          ) : null}
          <span className={s.anchor}>
            <button type="button" className={s.ghost} onClick={() => setMenu(m => (m === 'range' ? null : 'range'))} aria-haspopup="menu" aria-expanded={menu === 'range'}>
              <LeadIcon name="calendar" size={15} className={s.ghostIcon} />{rangeLabel}<LeadIcon name="chevron-down" size={14} className={s.chev} />
            </button>
            <Popover open={menu === 'range'} onClose={() => setMenu(null)} style={{ top: 40, right: 0, width: 170, minWidth: 170 }} label="Period">
              {RANGE_MENU.map(r => <MenuItem key={r.id} selected={range === r.id} onSelect={() => { setMenu(null); goRange(r.id) }}>{r.label}</MenuItem>)}
            </Popover>
          </span>
          <button type="button" className={s.ghost} title="Export CSV" onClick={() => download(shownAll)} disabled={!shownAll.length}><LeadIcon name="download" size={15} />Export</button>
        </div>

        <div className={s.tabs} role="group" aria-label="Where they stand">
          {STAGE_TABS.map(t => (
            <button key={t.id} type="button" className={s.tab} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}<span className={s.tabCount}>{counts[t.id] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className={s.headRow} role="row">
          <button type="button" role="checkbox" className={s.check} aria-checked={allOn ? true : partOn ? 'mixed' : false} aria-label="Select all"
            onClick={() => setPicked(allOn ? new Set() : new Set(shownAll.map(c => c.id)))}>
            {allOn ? <LeadIcon name="check" size={12} /> : partOn ? <span className={s.partial} /> : null}
          </button>
          <SortHead k="name" sort={sort} onSort={onSort}>Customer</SortHead>
          <SortHead k="source" sort={sort} onSort={onSort}>Source</SortHead>
          <SortHead k="interest" sort={sort} onSort={onSort}>Interest</SortHead>
          <SortHead k="sales" sort={sort} onSort={onSort}>Salesperson</SortHead>
          <SortHead k="status" sort={sort} onSort={onSort}>Status</SortHead>
          <SortHead k="updated" sort={sort} onSort={onSort}>Last update</SortHead>
        </div>
        <div className={s.body}>
          {shown.map(c => {
            const st = stageOf(c)
            const late = followUp(c, now)
            const ad = adLabel(c)
            const on = picked.has(c.id)
            const salesName = handedTo(c)
            return (
              <div key={c.id} role="row" className={s.row} data-on={on || openId === c.id || undefined} onClick={() => setOpenId(c.id)}>
                <button type="button" role="checkbox" className={s.check} aria-checked={on} aria-label={`Select ${c.name || 'lead'}`} onClick={e => tick(c.id, e)}>
                  {on ? <LeadIcon name="check" size={12} /> : null}
                </button>
                <div className={s.who}>
                  <span className={s.avatar} aria-hidden="true">{initials(c.name)}</span>
                  <div className={s.stack}>
                    <span className={s.name}>{c.name || '—'}</span>
                    <span className={s.phone} data-none={c.phone ? undefined : ''}>{c.phone ? formatPhone(c.phone) : 'No phone yet'}</span>
                  </div>
                </div>
                <div className={s.stack}>
                  <span className={s.sourceLine}><span className={s.ch}>{c.channel === 'instagram' ? 'IG' : 'FB'}</span><span className={s.cut}>{ad || 'Organic'}</span></span>
                  <span className={s.brand}>{brandName(c.brandId)}</span>
                </div>
                <span className={s.cut}>{c.interest}</span>
                <span className={`${s.cut} ${salesName ? '' : s.salesNone}`}>{salesName ?? '—'}</span>
                <span className={s.status} style={{ color: tone(STAGE_TONE[st].fg) }}>
                  <span className={s.dot} style={{ background: tone(STAGE_TONE[st].dot) }} aria-hidden="true" />{STAGE_LABEL[st]}
                </span>
                <div className={s.stack}>
                  <span className={s.updated}>{whenFull(lastUpdate(c))}</span>
                  {late ? <span className={s.late}>{late}</span> : null}
                </div>
              </div>
            )
          })}
          {shown.length === 0 ? <div className={s.empty}>No leads match these filters.</div> : null}
        </div>

        <div className={s.foot}>
          <span className={s.perPage}>Per page
            <span className={s.seg} role="group" aria-label="Per page">
              {SIZES.map(n => <button key={n} type="button" className={s.segBtn} aria-pressed={size === n} onClick={() => setSize(n)}>{n}</button>)}
            </span>
          </span>
          <span className={s.fill} />
          <span>{shownAll.length ? `${p * size + 1}–${Math.min(shownAll.length, (p + 1) * size)} of ${shownAll.length}` : '0 of 0'}</span>
          <span className={s.pager}>
            <button type="button" className={s.pageBtn} onClick={() => setPage(Math.max(0, p - 1))} disabled={p === 0} title="Previous page" aria-label="Previous page"><LeadIcon name="chevron-left" size={15} /></button>
            <button type="button" className={s.pageBtn} onClick={() => setPage(Math.min(pages - 1, p + 1))} disabled={p >= pages - 1} title="Next page" aria-label="Next page"><LeadIcon name="chevron-right" size={15} /></button>
          </span>
        </div>
      </section>

      {moveAt ? (
        <>
          <div className={s.catcher} onClick={() => setMoveAt(null)} onContextMenu={e => { e.preventDefault(); setMoveAt(null) }} aria-hidden="true" />
          <div className={s.moveMenu} style={{ left: moveAt.x, top: moveAt.y }} role="menu">
            <span className={s.moveHead}>MOVE {moveAt.ids.length} {moveAt.ids.length === 1 ? 'LEAD' : 'LEADS'} TO</span>
            {STAGE_ORDER.map(k => (
              <button key={k} type="button" role="menuitem" className={s.moveItem} onClick={() => moveTo(moveAt.ids, k)}>
                <span className={s.moveDot} style={{ background: tone(STAGE_TONE[k].dot) }} />{STAGE_LABEL[k]}
              </button>
            ))}
          </div>
        </>
      ) : null}

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
  const remind = salesPhone && lead.handedSalesName
    ? whatsAppLink(salesPhone, `Hi ${lead.handedSalesName}, a reminder about ${lead.name || 'the customer'} (${formatPhone(lead.phone)}) from Lead View — have you contacted them? 请回复进度，谢谢`)
    : null
  // The drawn rows, each only when it says something (Salesperson and Budget always); kept: the visit, language, special
  // request and note, shown when set.
  const facts: Array<[string, string]> = ([
    ['Salesperson', handedTo(lead) ?? ''], ['Interest', lead.interest], ['Budget', lead.budget], ['Showroom', lead.showroom],
    ['Visit', visitShown(lead.preferredTime)], ['Language', lead.language ?? ''], ['Special request', lead.specialRequest ?? ''], ['Note', lead.note],
    ['Sale value', lead.saleValue == null || lead.saleValue === '' ? '' : `RM ${Number(lead.saleValue).toLocaleString('en-MY')}`], ['Lost because', lead.lostReason ?? ''],
  ] as Array<[string, string]>).filter(([k, v]) => v || k === 'Salesperson' || k === 'Budget')

  return (
    <>
      <div className={s.scrim} onClick={onClose} aria-hidden="true" />
      <aside className={s.drawer} role="dialog" aria-label={lead.name || 'Lead'}>
        <div className={s.dHead}>
          <div className={s.dWho}>
            <span className={s.dLine}>{brandName} · {lead.channel === 'instagram' ? 'Instagram' : 'Messenger'} · {ad || 'Organic'}</span>
            <span className={s.dName}>{lead.name || '—'}</span>
            <span className={s.dPhone} data-none={lead.phone ? undefined : ''}>{lead.phone ? formatPhone(lead.phone) : 'No phone yet'}</span>
          </div>
          <button type="button" className={s.dClose} onClick={onClose} title="Close" aria-label="Close"><LeadIcon name="x" size={17} /></button>
        </div>
        <div className={s.dBody}>
          <div className={s.dSection}>
            <span className={s.dKicker}>Progress</span>
            {PROGRESS.map((x, i) => {
              const done = i <= idx
              const nowStep = i === idx && st !== 'lost'
              const settable = canEdit && !busy && !!lead.handedAt && SETTABLE.includes(x.id) && !(x.id === reached && st !== 'lost')
              return (
                <button key={x.id} type="button" className={s.step} data-settable={settable || undefined} disabled={!settable} onClick={() => pick(x.id)} title={settable ? `Set to: ${x.label}` : undefined}>
                  <span className={s.stepRail}>
                    <span className={s.stepDot} data-done={done || undefined} data-now={nowStep || undefined} />
                    <span className={s.stepLine} data-done={i < idx || undefined} data-last={i === PROGRESS.length - 1 || undefined} />
                  </span>
                  <span className={s.stepBody}>
                    <span className={s.stepLabel} data-done={done || undefined} data-now={nowStep || undefined}>{x.label}</span>
                    <span className={s.stepWhen}>{days[x.id] ? whenFull(days[x.id]!) : ''}</span>
                  </span>
                </button>
              )
            })}
            {lead.stageByName ? <span className={s.by}>Updated by {lead.stageByName}</span> : null}
          </div>
          <div className={s.dSection}>
            <span className={s.dKickerTight}>For the salesperson</span>
            {facts.map(([k, v]) => (
              <div key={k} className={s.fact}>
                <span className={s.factKey}>{k}</span>
                {k === 'Sale value' && st === 'closed' && canEdit ? (
                  <input className={s.valueInput} value={value} onChange={e => setValue(e.target.value)} placeholder="RM" disabled={busy}
                    onBlur={saveValue} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} aria-label="Sale value" />
                ) : (
                  <span className={s.factValue} data-none={v ? undefined : ''}>{v || 'Not set'}</span>
                )}
              </div>
            ))}
            {st === 'closed' && canEdit && !facts.some(([k]) => k === 'Sale value') ? (
              <div className={s.fact}>
                <span className={s.factKey}>Sale value</span>
                <input className={s.valueInput} value={value} onChange={e => setValue(e.target.value)} placeholder="RM" disabled={busy}
                  onBlur={saveValue} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} aria-label="Sale value" />
              </div>
            ) : null}
          </div>
          {error ? <div className={s.error} role="alert">{error}</div> : null}
        </div>
        <div className={s.dFoot}>
          <Link className={s.open} href={`/leads?c=${lead.id}`}><LeadIcon name="message-circle" size={15} />Open conversation</Link>
          {remind ? <a className={s.remind} href={remind} target="_blank" rel="noopener noreferrer">Remind on WhatsApp</a> : null}
          <span className={s.fill} />
          {canEdit && st === 'lost' ? <button type="button" className={s.lose} onClick={() => run(() => reopenLead(lead.id))} disabled={busy}>Reopen</button> : null}
          {canEdit && !['nophone', 'closed', 'lost'].includes(st) ? <button type="button" className={s.lose} onClick={lose} disabled={busy}>Mark as lost</button> : null}
        </div>
      </aside>
    </>
  )
}
