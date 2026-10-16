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
import { Bi, BrandChip, CHANNEL_LABEL } from './bits'
import s from './lead.module.css'

const APPT: Readonly<Record<Appt, string>> = { unknown: 'Not known · 未知', booked: 'Booked · 已预约', not_booked: 'Not booked · 没约到' }
const SHOWN: Readonly<Record<Shown, string>> = { unknown: 'Not known · 未知', came: 'Came · 到了', no_show: 'No show · 没来' }

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
  // Only test conversations so far (before Meta is connected): show them, or the page is empty.
  const onlyTests = contacts.length > 0 && contacts.every(c => c.isTest)
  const [tests, setTests] = useState(onlyTests)
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
        <Card label="Phones · 拿到电话" value={String(t.phones)} note={`of ${t.conversations} conversations · ${rate(t.phones, t.conversations) ?? '—'}%`} />
        <Card label="Handed · 已转交" value={String(t.handed)} note={`${t.phones - t.handed} not handed yet · 还没转交`} />
        <Card label="Booked · 已预约" value={String(t.booked)} note="Kept by Customer Service · 客服手动更新" />
        <Card label="Came · 已到店" value={String(t.came)} note="For reference, not the CS KPI · 参考" />
      </Cards>

      {onlyTests ? <div className={s.note} style={{ margin: '18px 0 0' }}><Bi block en="Only test conversations so far (Meta is not connected), so they are shown. Once real customers arrive, tests are left out of the numbers." zh="目前只有测试资料，所以先显示测试对话。" /></div> : null}
      <div className={s.toolbar} style={{ marginTop: 18 }}>
        <div className={s.tabs} role="group" aria-label="Brand">
          <button type="button" className={s.tab} aria-pressed={brand === 'all'} onClick={() => setBrand('all')}><Bi en="All" zh="全部" /></button>
          {config.brands.map(b => (
            <button key={b.id} type="button" className={s.tab} aria-pressed={brand === b.id} onClick={() => setBrand(b.id)}>{b.name}</button>
          ))}
        </div>
        <span className={s.spacer} />
        <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Bi en="Handed" zh="转交" />
          <select className={s.select} value={handed} onChange={e => setHanded(e.target.value as 'all' | 'yes' | 'no')}>
            <option value="all">All · 全部</option><option value="no">Not yet · 还没转交</option><option value="yes">Handed · 已转交</option>
          </select>
        </label>
        <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={tests} onChange={e => setTests(e.target.checked)} /> <Bi en="Include tests" zh="包含测试" />
        </label>
      </div>

      <div className={s.tableBox}>
        <table className={s.table}>
          <thead>
            <tr><th>Customer<span className={s.zh}>客户</span></th><th>Brand<span className={s.zh}>品牌</span></th><th>Source<span className={s.zh}>来源</span></th><th>Phone<span className={s.zh}>电话</span></th><th>Interest<span className={s.zh}>意向</span></th><th>Handed to<span className={s.zh}>转交给</span></th><th>When<span className={s.zh}>时间</span></th><th>Booked<span className={s.zh}>预约</span></th><th>Came<span className={s.zh}>到店</span></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className={s.muted} style={{ textAlign: 'center', padding: 28 }}><Bi block en="No phones yet this month." zh="这个月还没有拿到电话的客户。" /></td></tr>
            ) : rows.map(c => (
              <tr key={c.id}>
                <td>
                  <Link href={`/leads?c=${c.id}`} style={{ fontWeight: 600 }}>{c.name || '—'}</Link>
                  <div className={s.hint}>{CHANNEL_LABEL[c.channel]}{c.isTest ? ' · TEST' : ''}</div>
                </td>
                <td><BrandChip brand={brands.get(c.brandId)} /></td>
                <td className={s.muted}>{c.sourceAd || 'Organic'}</td>
                <td className={s.mono}>{formatPhone(c.phone)}{c.phoneState === 'detected' ? <span className={s.hint}> · to confirm</span> : null}</td>
                <td>{c.interest || <span className={s.muted}>—</span>}</td>
                <td>{c.handedSalesName ?? (canEdit ? <Link href={`/leads?c=${c.id}`} style={{ fontWeight: 600 }}>Hand over →</Link> : '—')}</td>
                <td className={`${s.mono} ${s.muted}`}>{c.handedAt ? whenFull(c.handedAt) : '—'}</td>
                <OutcomeCells contact={c} canEdit={canEdit} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={s.hint} style={{ marginTop: 10 }}><Bi en="Salespeople don't sign in here: Customer Service updates the booking and the visit." zh="销售不登入这个系统：预约和到店由客服更新。" /></p>
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
