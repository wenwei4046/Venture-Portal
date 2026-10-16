'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, Cards, HvPage, PageHead } from '@/components/hrv/kit'
import { setLeadOutcome } from '@/lib/leads/actions'
import { leadInsight, rate } from '@/lib/leads/insight'
import { formatPhone } from '@/lib/leads/phone'
import type { LeadPeriod } from '@/lib/leads/period'
import { whenFull } from '@/lib/leads/time'
import type { Appt, LeadConfig, LeadContact, Shown } from '@/lib/leads/types'
import { BrandChip, CHANNEL_LABEL } from './bits'
import s from './lead.module.css'

const APPT: Readonly<Record<Appt, string>> = { unknown: '未知', booked: '已預約', not_booked: '沒約到' }
const SHOWN: Readonly<Record<Shown, string>> = { unknown: '未知', came: '到了', no_show: '沒來' }

/**
 * Lead View › Leads (the canvas's "Leads" board): the month's customers whose phone Customer Service got — who
 * they were handed to, and what came of it (kept by hand: the salespeople are not in the system).
 */
export default function LeadsView({ config, contacts, period, months, canEdit }: {
  config: LeadConfig
  contacts: LeadContact[]
  period: LeadPeriod
  months: LeadPeriod[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [brand, setBrand] = useState('all')
  const [handed, setHanded] = useState<'all' | 'yes' | 'no'>('all')
  const [tests, setTests] = useState(false)
  const brands = new Map(config.brands.map(b => [b.id, b]))
  const real = contacts.filter(c => tests || !c.isTest)
  const t = leadInsight(contacts, config.brands, { withTests: tests }).total
  const rows = real.filter(c => c.phone && (brand === 'all' || c.brandId === brand)
    && (handed === 'all' || (handed === 'yes') === !!c.handedAt))

  return (
    <HvPage>
      <PageHead eyebrow="Lead View" title="Leads" right={
        <select className={s.select} aria-label="Month" value={period.month} onChange={e => router.push(`/leads/list?m=${e.target.value}`)}>
          {months.map(m => <option key={m.month} value={m.month}>{m.label}</option>)}
        </select>
      } />
      <Cards count={4} label="This month">
        <Card label="拿到電話 Phones" value={String(t.phones)} note={`${t.conversations} 個對話 · ${rate(t.phones, t.conversations) ?? '—'}%`} />
        <Card label="已轉交 Handed" value={String(t.handed)} note={`${t.phones - t.handed} 個還沒轉交`} />
        <Card label="已預約 Booked" value={String(t.booked)} note="客服手動更新" />
        <Card label="已到店 Came" value={String(t.came)} note="參考，不算客服 KPI" />
      </Cards>

      <div className={s.toolbar} style={{ marginTop: 18 }}>
        <div className={s.tabs} role="group" aria-label="Brand">
          <button type="button" className={s.tab} aria-pressed={brand === 'all'} onClick={() => setBrand('all')}>全部</button>
          {config.brands.map(b => (
            <button key={b.id} type="button" className={s.tab} aria-pressed={brand === b.id} onClick={() => setBrand(b.id)}>{b.name}</button>
          ))}
        </div>
        <span className={s.spacer} />
        <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          轉交 Handed
          <select className={s.select} value={handed} onChange={e => setHanded(e.target.value as 'all' | 'yes' | 'no')}>
            <option value="all">全部 All</option><option value="no">還沒轉交 Not yet</option><option value="yes">已轉交 Handed</option>
          </select>
        </label>
        <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={tests} onChange={e => setTests(e.target.checked)} /> 包含測試 Include tests
        </label>
      </div>

      <div className={s.tableBox}>
        <table className={s.table}>
          <thead>
            <tr><th>客戶 Customer</th><th>品牌 Brand</th><th>來源 Source</th><th>電話 Phone</th><th>意向 Interest</th><th>轉交給 Handed to</th><th>轉交時間</th><th>預約 Booked</th><th>到店 Came</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className={s.muted} style={{ textAlign: 'center', padding: 28 }}>這個月還沒有拿到電話的客戶。</td></tr>
            ) : rows.map(c => (
              <tr key={c.id}>
                <td>
                  <Link href={`/leads?c=${c.id}`} style={{ fontWeight: 600 }}>{c.name || '—'}</Link>
                  <div className={s.hint}>{CHANNEL_LABEL[c.channel]}{c.isTest ? ' · TEST' : ''}</div>
                </td>
                <td><BrandChip brand={brands.get(c.brandId)} /></td>
                <td className={s.muted}>{c.sourceAd || 'Organic'}</td>
                <td className={s.mono}>{formatPhone(c.phone)}{c.phoneState === 'detected' ? <span className={s.hint}> · 待確認</span> : null}</td>
                <td>{c.interest || <span className={s.muted}>—</span>}</td>
                <td>{c.handedSalesName ?? (canEdit ? <Link href={`/leads?c=${c.id}`} style={{ fontWeight: 600 }}>轉交 →</Link> : '—')}</td>
                <td className={`${s.mono} ${s.muted}`}>{c.handedAt ? whenFull(c.handedAt) : '—'}</td>
                <OutcomeCells contact={c} canEdit={canEdit} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={s.hint} style={{ marginTop: 10 }}>銷售不登入這個系統：預約和到店由客服向銷售了解後更新。</p>
    </HvPage>
  )
}

function OutcomeCells({ contact, canEdit }: { contact: LeadContact; canEdit: boolean }) {
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  if (!contact.handedAt || !canEdit) {
    return (<><td className={s.muted}>{contact.handedAt ? APPT[contact.appt] : '—'}</td><td className={s.muted}>{contact.handedAt ? SHOWN[contact.shown] : '—'}</td></>)
  }
  const put = (appt: Appt, shown: Shown) => start(async () => {
    setError(null)
    const r = await setLeadOutcome(contact.id, appt, shown)
    if (!r.ok) setError(r.reason)
  })
  return (
    <>
      <td>
        <select className={s.select} aria-label="Appointment" value={contact.appt} disabled={busy} onChange={e => put(e.target.value as Appt, contact.shown)}>
          {(Object.keys(APPT) as Appt[]).map(k => <option key={k} value={k}>{APPT[k]}</option>)}
        </select>
      </td>
      <td>
        <select className={s.select} aria-label="Came" value={contact.shown} disabled={busy} onChange={e => put(contact.appt, e.target.value as Shown)} title={error ?? undefined}>
          {(Object.keys(SHOWN) as Shown[]).map(k => <option key={k} value={k}>{SHOWN[k]}</option>)}
        </select>
        {error ? <div className={s.error} role="alert">{error}</div> : null}
      </td>
    </>
  )
}
