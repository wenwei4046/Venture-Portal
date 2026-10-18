'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { HvPage, PageHead, SectHead, btn } from '@/components/hrv/kit'
import { removeLeadSales, saveLeadBrand, saveLeadSales, sendTestEnquiry } from '@/lib/leads/actions'
import { formatPhone } from '@/lib/leads/phone'
import type { BrandTone, LeadBrand, LeadConfig, LeadSales } from '@/lib/leads/types'
import type { LeadAd } from '@/lib/leads/ads'
import AdsPanel from './AdsPanel'
import { Bi, BrandChip } from './bits'
import s from './lead.module.css'

/**
 * Lead View › Settings (the canvas's "Settings" board): each brand — its Facebook Page and Instagram account
 * (filled once Meta is connected), how a lead is handed over, and its salespeople, who get the leads on
 * WhatsApp — and the test enquiry that stands in for Meta until then.
 */
export default function SettingsView({ config, ads, canManage, canTest }: { config: LeadConfig; ads: LeadAd[] | null; canManage: boolean; canTest: boolean }) {
  const [tab, setTab] = useState<'brands' | 'ads' | 'test'>('brands')
  return (
    <HvPage>
      <PageHead eyebrow="Lead View" title="Settings" right={
        <div className={s.tabs} role="group" aria-label="Section">
          <button type="button" className={s.tab} aria-pressed={tab === 'brands'} onClick={() => setTab('brands')}><Bi en="Brands" zh="品牌" /></button>
          <button type="button" className={s.tab} aria-pressed={tab === 'ads'} onClick={() => setTab('ads')}><Bi en="Ads" zh="广告" /></button>
          <button type="button" className={s.tab} aria-pressed={tab === 'test'} onClick={() => setTab('test')}><Bi en="Test" zh="测试" /></button>
        </div>
      } />
      {tab === 'brands' ? (
        <div className={s.twoCol}>
          {config.brands.map(b => <BrandPanel key={b.id} brand={b} canManage={canManage} />)}
          {canManage ? <NewBrand /> : null}
        </div>
      ) : tab === 'ads' ? (
        ads ? <AdsPanel ads={ads} brands={config.brands} canManage={canManage} /> : <div className={s.error}>The ads could not be read.</div>
      ) : (
        <TestPanel config={config} canTest={canTest} />
      )}
    </HvPage>
  )
}

const TONES: BrandTone[] = ['ink', 'clay', 'blue', 'olive', 'plum']

function BrandPanel({ brand, canManage }: { brand: LeadBrand; canManage: boolean }) {
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState({ name: brand.name, tone: brand.tone, fbPageId: brand.fbPageId ?? '', igAccountId: brand.igAccountId ?? '', handoffMode: brand.handoffMode })
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const save = () => start(async () => {
    setError(null)
    const r = await saveLeadBrand(brand.id, form)
    if (!r.ok) setError(r.reason)
    else setEdit(false)
  })
  return (
    <section className={s.panel} aria-label={brand.name}>
      <div className={s.panelHead}>
        <BrandChip brand={brand} />
        <span className={s.spacer} />
        {canManage && !edit ? <button type="button" className={btn('outline')} onClick={() => setEdit(true)}><Bi en="Edit" zh="编辑" /></button> : null}
      </div>
      {edit ? (
        <div className={s.fieldGrid}>
          <label className={s.field}><Bi en="Name" zh="名字" /><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={40} /></label>
          <label className={s.field}><Bi en="Colour" zh="颜色" />
            <select value={form.tone} onChange={e => setForm({ ...form, tone: e.target.value as BrandTone })}>
              {TONES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className={s.field}>FB Page ID<input value={form.fbPageId} onChange={e => setForm({ ...form, fbPageId: e.target.value })} inputMode="numeric" placeholder="When connecting" /></label>
          <label className={s.field}>Instagram ID<input value={form.igAccountId} onChange={e => setForm({ ...form, igAccountId: e.target.value })} inputMode="numeric" placeholder="When connecting" /></label>
          <label className={`${s.field} ${s.wide}`}><Bi en="Hand-over" zh="转交方式" />
            <select value={form.handoffMode} onChange={e => setForm({ ...form, handoffMode: e.target.value as 'rotate' | 'pick' })}>
              <option value="rotate">Suggest in turn</option>
              <option value="pick">Customer Service picks</option>
            </select>
          </label>
          {error ? <div className={`${s.error} ${s.wide}`} role="alert">{error}</div> : null}
          <div className={`${s.actions} ${s.wide}`}>
            <button type="button" className={btn('primary')} onClick={save} disabled={busy}><Bi en="Save" zh="保存" /></button>
            <button type="button" className={btn('outline')} onClick={() => setEdit(false)} disabled={busy}><Bi en="Cancel" zh="取消" /></button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <div className={s.salesLine}><span style={{ width: 90 }} className={s.muted}>FB Page</span><span className={s.mono} style={{ flex: 1 }}>{brand.fbPageId ?? '—'}</span><span className={s.brand} data-tone={brand.fbPageId ? 'olive' : 'clay'}>{brand.fbPageId ? 'Set' : 'Not connected'}</span></div>
          <div className={s.salesLine}><span style={{ width: 90 }} className={s.muted}>Instagram</span><span className={s.mono} style={{ flex: 1 }}>{brand.igAccountId ?? '—'}</span><span className={s.brand} data-tone={brand.igAccountId ? 'olive' : 'clay'}>{brand.igAccountId ? 'Set' : 'Not connected'}</span></div>
          <div className={s.salesLine}><span style={{ width: 90 }} className={s.muted}>Hand-over</span><span>{brand.handoffMode === 'rotate' ? 'Suggest in turn' : 'Customer Service picks'}</span></div>
        </div>
      )}
      <SectHead title="Salespeople" count={String(brand.sales.length)} />
      {brand.sales.length === 0 ? <div className={s.hint}><Bi block en="No salespeople yet. A handed-over lead is sent to their phone on WhatsApp." zh="还没有销售。转交时，客户资料会用 WhatsApp 发到这里的电话。" /></div> : null}
      {brand.sales.map(x => <SalesLine key={x.id} sales={x} brandId={brand.id} canManage={canManage} />)}
      {canManage ? <SalesForm brandId={brand.id} /> : null}
    </section>
  )
}

function SalesLine({ sales, brandId, canManage }: { sales: LeadSales; brandId: string; canManage: boolean }) {
  const [edit, setEdit] = useState(false)
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  if (edit) return <SalesForm brandId={brandId} sales={sales} onDone={() => setEdit(false)} />
  const remove = () => {
    if (!window.confirm(`Remove ${sales.name}? Leads handed to them keep their name.`)) return
    start(async () => {
      setError(null)
      const r = await removeLeadSales(sales.id)
      if (!r.ok) setError(r.reason)
    })
  }
  return (
    <div className={s.salesLine}>
      <span style={{ flex: 1, fontWeight: 600 }}>{sales.name}</span>
      <span className={s.mono}>{formatPhone(sales.phone)}</span>
      <span className={s.muted} style={{ minWidth: 60 }}>{sales.showroom || '—'}</span>
      <span className={s.hint}>{sales.week} this week</span>
      {canManage ? (
        <>
          <button type="button" className={btn('outline')} onClick={() => setEdit(true)} disabled={busy}>Edit</button>
          <button type="button" className={btn('outline')} onClick={remove} disabled={busy}>Remove</button>
        </>
      ) : null}
      {error ? <div className={s.error} role="alert" style={{ width: '100%' }}>{error}</div> : null}
    </div>
  )
}

function SalesForm({ brandId, sales, onDone }: { brandId: string; sales?: LeadSales; onDone?: () => void }) {
  const blank = { name: sales?.name ?? '', phone: sales ? formatPhone(sales.phone) : '', showroom: sales?.showroom ?? '' }
  const [form, setForm] = useState(blank)
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const save = () => start(async () => {
    setError(null)
    const r = await saveLeadSales(sales?.id ?? null, brandId, form)
    if (!r.ok) { setError(r.reason); return }
    setForm({ name: '', phone: '', showroom: '' })
    onDone?.()
  })
  return (
    <div className={s.inline}>
      <label className={s.field} style={{ flex: '1 1 120px' }}><Bi en="Name" zh="名字" /><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={60} /></label>
      <label className={s.field} style={{ flex: '1 1 120px' }}><Bi en="Mobile" zh="手机" /><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} inputMode="tel" placeholder="012-345 6789" /></label>
      <label className={s.field} style={{ flex: '1 1 100px' }}><Bi en="Showroom" zh="分店" /><input value={form.showroom} onChange={e => setForm({ ...form, showroom: e.target.value })} maxLength={60} /></label>
      <button type="button" className={btn(sales ? 'primary' : 'outline')} onClick={save} disabled={busy || !form.name.trim() || !form.phone.trim()}>{sales ? 'Save' : '+ Add salesperson'}</button>
      {onDone ? <button type="button" className={btn('outline')} onClick={onDone} disabled={busy}>Cancel</button> : null}
      {error ? <div className={s.error} role="alert" style={{ width: '100%' }}>{error}</div> : null}
    </div>
  )
}

function NewBrand() {
  const [name, setName] = useState('')
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const add = () => start(async () => {
    setError(null)
    const r = await saveLeadBrand(null, { name })
    if (!r.ok) setError(r.reason)
    else setName('')
  })
  return (
    <section className={s.panel} aria-label="New brand">
      <span className={s.label}><Bi en="New brand" zh="新增品牌" /></span>
      <div className={s.inline}>
        <label className={s.field} style={{ flex: 1 }}><Bi en="Name" zh="名字" /><input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="A 4th or 5th company" /></label>
        <button type="button" className={btn('outline')} onClick={add} disabled={busy || !name.trim()}>+ Add</button>
      </div>
      {error ? <div className={s.error} role="alert">{error}</div> : null}
    </section>
  )
}

function TestPanel({ config, canTest }: { config: LeadConfig; canTest: boolean }) {
  const [form, setForm] = useState({ brand: config.brands[0]?.id ?? '', channel: 'messenger' as 'messenger' | 'instagram', name: 'Test customer 01', ad: '', adId: '', body: 'Hi, is this sofa in stock?' })
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const send = () => start(async () => {
    setError(null)
    setSent(null)
    const r = await sendTestEnquiry(form.brand, form.channel, form.name, form.ad, form.body, form.adId)
    if (!r.ok) setError(r.reason)
    else setSent(r.data)
  })
  return (
    <div className={s.twoCol}>
      <section className={s.panel} aria-label="Test enquiry">
        <SectHead title="Test enquiry" />
        <p className={s.hint} style={{ margin: 0 }}><Bi block en="Until Meta is connected: the message lands in the Inbox as if a customer sent it, marked TEST. The same name is the same conversation; a phone number in it is picked up." zh="Meta 串接之前用来测试：消息会像客户发来的一样进 Inbox。" /></p>
        <div className={s.fieldGrid}>
          <label className={s.field}><Bi en="Brand" zh="品牌" />
            <select value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })}>
              {config.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className={s.field}><Bi en="Channel" zh="渠道" />
            <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value as 'messenger' | 'instagram' })}>
              <option value="messenger">Messenger</option><option value="instagram">Instagram</option>
            </select>
          </label>
          <label className={s.field}><Bi en="Customer name" zh="客户名字" /><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={80} /></label>
          <label className={s.field}><Bi en="From the ad" zh="从哪个广告来" /><input value={form.ad} onChange={e => setForm({ ...form, ad: e.target.value })} maxLength={120} placeholder="Empty = organic" /></label>
          <label className={s.field}><Bi en="Ad id (optional)" zh="广告编号（可不填）" /><input value={form.adId} onChange={e => setForm({ ...form, adId: e.target.value.replace(/\D/g, '') })} inputMode="numeric" maxLength={30} placeholder="e.g. 120210000000001" /></label>
          <label className={`${s.field} ${s.wide}`}><Bi en="Message" zh="消息" /><textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} maxLength={2000} /></label>
        </div>
        {error ? <div className={s.error} role="alert">{error}</div> : null}
        {sent ? <div className={s.ok}>Sent to the Inbox · <Link href={`/leads?c=${sent}`} style={{ fontWeight: 600 }}>Open →</Link></div> : null}
        <div className={s.actions}>
          <button type="button" className={btn('primary')} onClick={send} disabled={!canTest || busy || !form.brand || !form.name.trim() || !form.body.trim()}>
            {busy ? 'Sending…' : <Bi en="Send to the Inbox" zh="送进 Inbox" />}
          </button>
        </div>
      </section>
      <section className={s.panel} aria-label="Connection">
        <SectHead title="Connection" />
        <div className={s.salesLine}><span className={s.brand} data-tone="olive">Done</span><span>System, database, test enquiries</span></div>
        <div className={s.salesLine}><span className={s.brand} data-tone="clay">Waiting</span><span>Meta App Review (Messenger)</span></div>
        <div className={s.salesLine}><span className={s.brand} data-tone="clay">Waiting</span><span>Brand Pages into the business account, assigned to the System User</span></div>
        <div className={s.salesLine}><span className={s.brand} data-tone="plum">Later</span><span>Instagram permission review</span></div>
      </section>
    </div>
  )
}
