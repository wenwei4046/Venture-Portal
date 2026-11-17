'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LeadIcon } from '@/components/layout/lead-icons'
import { deleteVisit, saveVisit } from '@/lib/leads/actions'
import type { LeadOutlet } from '@/lib/leads/outlets'
import { rm } from '@/lib/leads/overview'
import {
  VISIT_SOURCES, VISIT_STATUSES, blankVisit, draftOf, phoneText, sourceLabel, statusLabel, suggestions, visitProblem, visitsCsv,
  type LeadVisit, type VisitDraft,
} from '@/lib/leads/visits'
import Segmented from './ui/Segmented'
import Modal from './ui/Modal'
import u from './ui/ui.module.css'
import s from './overview.module.css'

/**
 * Lead View › Leads › Showroom visits (2026-11-17 — the owner's showroom sheet, "类似这样"): one row per customer who came
 * to an outlet, its sale once closed. A month at a time (?m=YYYY-MM; a visit shows in the month it came or bought), one
 * outlet or all. Lead View · Edit adds and changes them; an Outlet staff sees and records their own outlets (the database
 * decides). A phone that is a Lead View customer's opens their chat. Insight › Overview counts these.
 */
export default function VisitsView({ visits, outlets, brands, month, today, canEdit }: {
  visits: LeadVisit[]
  outlets: LeadOutlet[]
  brands: Array<{ id: string; name: string }>
  month: string
  today: string
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [outlet, setOutlet] = useState('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<{ id: string | null; d: VisitDraft } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const outletName = (id: string) => outlets.find(o => o.id === id)?.name ?? '—'

  const ql = q.trim().toLowerCase()
  const shown = useMemo(() => visits
    .filter(v => outlet === 'all' || v.outletId === outlet)
    .filter(v => !ql || `${v.name} ${v.phone} ${v.salesPerson} ${v.brand} ${v.products} ${v.orderNo}`.toLowerCase().includes(ql)), [visits, outlet, ql])
  const inMonth = (d: string | null) => !!d && d.startsWith(month)
  const came = shown.filter(v => inMonth(v.visitOn)).length
  const bought = shown.filter(v => v.status === 'close_sales' && inMonth(v.purchaseOn))
  const salesSum = bought.reduce((a, v) => a + (Number(v.sales) || 0), 0)

  const go = (m: string) => router.push(`/leads/list?v=visits&m=${m}`)
  const shift = (n: number) => { const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1)); go(d.toISOString().slice(0, 7)) }
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const firstOutlet = outlet !== 'all' ? outlet : outlets[0]?.id ?? ''

  const set = <K extends keyof VisitDraft>(k: K, val: VisitDraft[K]) => setOpen(o => (o ? { ...o, d: { ...o.d, [k]: val } } : o))
  const save = () => {
    if (!open) return
    const problem = visitProblem(open.d)
    if (problem) { setErr(problem); return }
    start(async () => {
      const r = await saveVisit(open.id, open.d)
      if (!r.ok) { setErr(r.reason); return }
      setOpen(null); router.refresh()
    })
  }
  const remove = () => {
    if (!open?.id) return
    const id = open.id
    start(async () => {
      const r = await deleteVisit(id)
      if (!r.ok) { setErr(r.reason); return }
      setOpen(null); router.refresh()
    })
  }
  const download = () => {
    const blob = new Blob([visitsCsv(shown, outletName)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `showroom-visits-${month}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const d = open?.d
  const sp = d ? suggestions(visits, 'salesPerson', d.outletId) : []
  const br = d ? suggestions(visits, 'brand', d.outletId) : []

  return (
    <div className={s.wrap}>
      <div className={s.bar}>
        <Segmented value="visits" label="Leads view" options={[{ value: 'leads', label: 'Leads' }, { value: 'visits', label: 'Showroom visits' }]}
          onChange={v => (v === 'leads' ? router.push('/leads/list') : undefined)} />
        <span className={s.gap} />
        <button type="button" className={`${u.ghost} ${u.small}`} onClick={() => shift(-1)} aria-label="Month before"><LeadIcon name="chevron-left" size={14} /></button>
        <span className={s.note} style={{ minWidth: 110, textAlign: 'center' }}>{monthLabel}</span>
        <button type="button" className={`${u.ghost} ${u.small}`} onClick={() => shift(1)} disabled={month >= today.slice(0, 7)} aria-label="Month after"><LeadIcon name="chevron-right" size={14} /></button>
      </div>
      <section className={s.card}>
        <div className={s.tools}>
          <input className={s.search} value={q} onChange={e => setQ(e.target.value)} placeholder="Name, phone, order…" aria-label="Search visits" />
          <select className={s.date} value={outlet} onChange={e => setOutlet(e.target.value)} aria-label="Outlet">
            <option value="all">All outlets</option>
            {brands.map(b => {
              const own = outlets.filter(o => o.brandId === b.id)
              return own.length ? <optgroup key={b.id} label={b.name}>{own.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup> : null
            })}
          </select>
          <span className={s.note}>{came} visit{came === 1 ? '' : 's'} · {bought.length} closed · {rm(salesSum)}</span>
          <span className={s.gap} />
          <button type="button" className={u.ghost} onClick={download} disabled={!shown.length}><LeadIcon name="download" size={14} />Export</button>
          {canEdit ? (
            <button type="button" className={u.primary} disabled={!firstOutlet} onClick={() => { setErr(null); setConfirmDel(false); setOpen({ id: null, d: blankVisit(firstOutlet, today) }) }}>
              <LeadIcon name="plus" size={14} />Add visit
            </button>
          ) : null}
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Date</th><th>Name</th><th>Phone</th><th>Outlet</th><th>Sales person</th><th>Brand</th><th>Source</th><th>Product inquiry</th>
                <th className={s.num}>Price offered</th><th>Status</th><th>Purchase date</th><th>Order no.</th><th className={s.num}>Sales</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(v => (
                <tr key={v.id} onClick={() => { setErr(null); setConfirmDel(false); setOpen({ id: v.id, d: draftOf(v) }) }}>
                  <td style={{ whiteSpace: 'nowrap' }}>{dmy(v.visitOn)}</td>
                  <td>{v.name || <span className={s.muted}>—</span>}{v.repeat ? <span className={s.tag} style={{ marginLeft: 6 }}>Repeat</span> : null}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {phoneText(v.phone)}
                    {v.contactId ? <Link className={s.chat} href={`/leads?c=${v.contactId}`} onClick={e => e.stopPropagation()}>Chat</Link> : null}
                  </td>
                  <td>{outletName(v.outletId)}</td>
                  <td>{v.salesPerson}</td>
                  <td>{v.brand}</td>
                  <td><span className={s.tag} data-k={v.source}>{sourceLabel(v.source)}</span></td>
                  <td className={s.clip} title={v.products}>{v.products}</td>
                  <td className={s.num}>{v.priceOffered == null ? '' : rm(Number(v.priceOffered))}</td>
                  <td><span className={s.tag} data-k={v.status}>{statusLabel(v.status)}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{v.purchaseOn ? dmy(v.purchaseOn) : ''}</td>
                  <td>{v.orderNo}</td>
                  <td className={s.num}>{v.sales == null ? '' : rm(Number(v.sales))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length ? <div className={u.empty}>No visits recorded for {monthLabel}{canEdit ? ' — Add visit records one.' : '.'}</div> : null}
        </div>
      </section>

      <Modal open={!!open} onClose={() => setOpen(null)} width={640} title={open?.id ? 'Visit' : 'Add visit'}
        foot={(
          <div className={s.formFoot}>
            {open?.id && canEdit ? (
              confirmDel
                ? <button type="button" className={u.ghost} onClick={remove} disabled={pending}>Remove it</button>
                : <button type="button" className={u.ghost} onClick={() => setConfirmDel(true)} disabled={pending}><LeadIcon name="trash-2" size={14} />Remove</button>
            ) : null}
            {err ? <span className={s.err}>{err}</span> : null}
            <span className={s.gap} />
            <button type="button" className={u.ghost} onClick={() => setOpen(null)}>{canEdit ? 'Cancel' : 'Close'}</button>
            {canEdit ? <button type="button" className={u.primary} onClick={save} disabled={pending}>{pending ? 'Saving…' : 'Save'}</button> : null}
          </div>
        )}>
        {d ? (
          <fieldset disabled={!canEdit || pending} style={{ border: 'none', margin: 0, padding: 0 }}>
            <div className={s.form}>
              <label className={s.field}>Outlet
                <select value={d.outletId} onChange={e => set('outletId', e.target.value)}>
                  {brands.map(b => {
                    const own = outlets.filter(o => o.brandId === b.id)
                    return own.length ? <optgroup key={b.id} label={b.name}>{own.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup> : null
                  })}
                </select>
              </label>
              <label className={s.field}>Date<input type="date" value={d.visitOn} max={today} onChange={e => set('visitOn', e.target.value)} /></label>
              <label className={s.field}>Name<input value={d.name} maxLength={120} onChange={e => set('name', e.target.value)} /></label>
              <label className={s.field}>Phone no.<input value={d.phone} inputMode="tel" onChange={e => set('phone', e.target.value)} /></label>
              <label className={s.field}>Sales person<input value={d.salesPerson} maxLength={80} list="lv-visit-sp" onChange={e => set('salesPerson', e.target.value)} /></label>
              <label className={s.field}>Brand<input value={d.brand} maxLength={80} list="lv-visit-brand" onChange={e => set('brand', e.target.value)} /></label>
              <datalist id="lv-visit-sp">{sp.map(x => <option key={x} value={x} />)}</datalist>
              <datalist id="lv-visit-brand">{br.map(x => <option key={x} value={x} />)}</datalist>
              <label className={s.field}>Source
                <select value={d.source} onChange={e => set('source', e.target.value as VisitDraft['source'])}>
                  {VISIT_SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label className={s.field}>Price offered (RM)<input value={d.priceOffered} inputMode="decimal" onChange={e => set('priceOffered', e.target.value)} /></label>
              <label className={s.field} data-wide>Product inquiry<input value={d.products} maxLength={500} onChange={e => set('products', e.target.value)} /></label>
              <label className={s.field} data-wide>Remarks<textarea value={d.remarks} maxLength={500} onChange={e => set('remarks', e.target.value)} /></label>
              <label className={s.field}>Status
                <select value={d.status} onChange={e => set('status', e.target.value as VisitDraft['status'])}>
                  {VISIT_STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <span />
              {d.status === 'close_sales' ? (
                <>
                  <span className={s.sect}>Purchase</span>
                  <label className={s.field}>Purchase date<input type="date" value={d.purchaseOn} max={today} onChange={e => set('purchaseOn', e.target.value)} /></label>
                  <label className={s.field}>Order no.<input value={d.orderNo} maxLength={40} onChange={e => set('orderNo', e.target.value)} /></label>
                  <label className={s.field} data-wide>Item purchase<input value={d.items} maxLength={500} onChange={e => set('items', e.target.value)} /></label>
                  <label className={s.field}>Sales (RM)<input value={d.sales} inputMode="decimal" onChange={e => set('sales', e.target.value)} /></label>
                  <label className={s.check}><input type="checkbox" checked={d.repeat} onChange={e => set('repeat', e.target.checked)} />Repeat purchase</label>
                  <label className={s.field} data-wide>Purchase reason<input value={d.purchaseReason} maxLength={500} onChange={e => set('purchaseReason', e.target.value)} /></label>
                  <label className={s.field} data-wide>Remarks<input value={d.purchaseRemarks} maxLength={500} onChange={e => set('purchaseRemarks', e.target.value)} /></label>
                </>
              ) : null}
            </div>
          </fieldset>
        ) : null}
      </Modal>
    </div>
  )
}

/** "2026-11-03" → "03/11/2026", as the showroom's sheet writes a day. */
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
