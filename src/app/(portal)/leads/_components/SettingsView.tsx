'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { HvPage, PageHead, SectHead, btn } from '@/components/hrv/kit'
import { removeLeadSales, saveLeadBrand, saveLeadSales, sendTestEnquiry } from '@/lib/leads/actions'
import { formatPhone } from '@/lib/leads/phone'
import type { BrandTone, LeadBrand, LeadConfig, LeadSales } from '@/lib/leads/types'
import { BrandChip } from './bits'
import s from './lead.module.css'

/**
 * Lead View › Settings (the canvas's "Settings" board): each brand — its Facebook Page and Instagram account
 * (filled once Meta is connected), how a lead is handed over, and its salespeople, who get the leads on
 * WhatsApp — and the test enquiry that stands in for Meta until then.
 */
export default function SettingsView({ config, canManage, canTest }: { config: LeadConfig; canManage: boolean; canTest: boolean }) {
  const [tab, setTab] = useState<'brands' | 'test'>('brands')
  return (
    <HvPage>
      <PageHead eyebrow="Lead View" title="Settings" right={
        <div className={s.tabs} role="group" aria-label="Section">
          <button type="button" className={s.tab} aria-pressed={tab === 'brands'} onClick={() => setTab('brands')}>品牌 Brands</button>
          <button type="button" className={s.tab} aria-pressed={tab === 'test'} onClick={() => setTab('test')}>測試 Test</button>
        </div>
      } />
      {tab === 'brands' ? (
        <div className={s.twoCol}>
          {config.brands.map(b => <BrandPanel key={b.id} brand={b} canManage={canManage} />)}
          {canManage ? <NewBrand /> : null}
        </div>
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
        {canManage && !edit ? <button type="button" className={btn('outline')} onClick={() => setEdit(true)}>編輯 Edit</button> : null}
      </div>
      {edit ? (
        <div className={s.fieldGrid}>
          <label className={s.field}>名字 Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={40} /></label>
          <label className={s.field}>顏色 Tone
            <select value={form.tone} onChange={e => setForm({ ...form, tone: e.target.value as BrandTone })}>
              {TONES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className={s.field}>FB Page ID<input value={form.fbPageId} onChange={e => setForm({ ...form, fbPageId: e.target.value })} inputMode="numeric" placeholder="串接時填" /></label>
          <label className={s.field}>Instagram ID<input value={form.igAccountId} onChange={e => setForm({ ...form, igAccountId: e.target.value })} inputMode="numeric" placeholder="串接時填" /></label>
          <label className={`${s.field} ${s.wide}`}>轉交方式 Hand-over
            <select value={form.handoffMode} onChange={e => setForm({ ...form, handoffMode: e.target.value as 'rotate' | 'pick' })}>
              <option value="rotate">輪流建議 Suggest in turn</option>
              <option value="pick">客服自己選 Customer Service picks</option>
            </select>
          </label>
          {error ? <div className={`${s.error} ${s.wide}`} role="alert">{error}</div> : null}
          <div className={`${s.actions} ${s.wide}`}>
            <button type="button" className={btn('primary')} onClick={save} disabled={busy}>儲存 Save</button>
            <button type="button" className={btn('outline')} onClick={() => setEdit(false)} disabled={busy}>取消</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <div className={s.salesLine}><span style={{ width: 90 }} className={s.muted}>FB Page</span><span className={s.mono} style={{ flex: 1 }}>{brand.fbPageId ?? '—'}</span><span className={s.brand} data-tone={brand.fbPageId ? 'olive' : 'clay'}>{brand.fbPageId ? '已填' : '未串接'}</span></div>
          <div className={s.salesLine}><span style={{ width: 90 }} className={s.muted}>Instagram</span><span className={s.mono} style={{ flex: 1 }}>{brand.igAccountId ?? '—'}</span><span className={s.brand} data-tone={brand.igAccountId ? 'olive' : 'clay'}>{brand.igAccountId ? '已填' : '未串接'}</span></div>
          <div className={s.salesLine}><span style={{ width: 90 }} className={s.muted}>轉交方式</span><span>{brand.handoffMode === 'rotate' ? '輪流建議 Suggest in turn' : '客服自己選 Customer Service picks'}</span></div>
        </div>
      )}
      <SectHead title="銷售 Salespeople" count={String(brand.sales.length)} />
      {brand.sales.length === 0 ? <div className={s.hint}>還沒有銷售。轉交時，客戶資料會用 WhatsApp 發到這裡的電話。</div> : null}
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
    if (!window.confirm(`把 ${sales.name} 從名單拿掉？轉交過給他的客戶會保留他的名字。`)) return
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
      <span className={s.hint}>本週 {sales.week}</span>
      {canManage ? (
        <>
          <button type="button" className={btn('outline')} onClick={() => setEdit(true)} disabled={busy}>改</button>
          <button type="button" className={btn('outline')} onClick={remove} disabled={busy}>拿掉</button>
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
      <label className={s.field} style={{ flex: '1 1 120px' }}>名字 Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={60} /></label>
      <label className={s.field} style={{ flex: '1 1 120px' }}>手機 Mobile<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} inputMode="tel" placeholder="012-345 6789" /></label>
      <label className={s.field} style={{ flex: '1 1 100px' }}>分店 Showroom<input value={form.showroom} onChange={e => setForm({ ...form, showroom: e.target.value })} maxLength={60} /></label>
      <button type="button" className={btn(sales ? 'primary' : 'outline')} onClick={save} disabled={busy || !form.name.trim() || !form.phone.trim()}>{sales ? '儲存' : '+ 加銷售'}</button>
      {onDone ? <button type="button" className={btn('outline')} onClick={onDone} disabled={busy}>取消</button> : null}
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
      <span className={s.label}>新增品牌 New brand</span>
      <div className={s.inline}>
        <label className={s.field} style={{ flex: 1 }}>名字 Name<input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="以後的第 4、5 家公司" /></label>
        <button type="button" className={btn('outline')} onClick={add} disabled={busy || !name.trim()}>+ 新增</button>
      </div>
      {error ? <div className={s.error} role="alert">{error}</div> : null}
    </section>
  )
}

function TestPanel({ config, canTest }: { config: LeadConfig; canTest: boolean }) {
  const [form, setForm] = useState({ brand: config.brands[0]?.id ?? '', channel: 'messenger' as 'messenger' | 'instagram', name: '測試客戶 01', ad: '', body: '你好，這款沙發還有貨嗎？' })
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const send = () => start(async () => {
    setError(null)
    setSent(null)
    const r = await sendTestEnquiry(form.brand, form.channel, form.name, form.ad, form.body)
    if (!r.ok) setError(r.reason)
    else setSent(r.data)
  })
  return (
    <div className={s.twoCol}>
      <section className={s.panel} aria-label="Test enquiry">
        <SectHead title="模擬客戶來訊 Test enquiry" />
        <p className={s.hint} style={{ margin: 0 }}>Meta 串接之前用來測試：訊息會像客戶發來的一樣進 Inbox，標示 TEST。同一個名字會進同一個對話；訊息裡的電話號碼會被偵測。</p>
        <div className={s.fieldGrid}>
          <label className={s.field}>品牌 Brand
            <select value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })}>
              {config.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className={s.field}>渠道 Channel
            <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value as 'messenger' | 'instagram' })}>
              <option value="messenger">Messenger</option><option value="instagram">Instagram</option>
            </select>
          </label>
          <label className={s.field}>客戶名字 Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={80} /></label>
          <label className={s.field}>從哪個廣告來 Ad<input value={form.ad} onChange={e => setForm({ ...form, ad: e.target.value })} maxLength={120} placeholder="留空 = organic" /></label>
          <label className={`${s.field} ${s.wide}`}>訊息 Message<textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} maxLength={2000} /></label>
        </div>
        {error ? <div className={s.error} role="alert">{error}</div> : null}
        {sent ? <div className={s.ok}>已送進 Inbox。<Link href={`/leads?c=${sent}`} style={{ fontWeight: 600 }}>去看 →</Link></div> : null}
        <div className={s.actions}>
          <button type="button" className={btn('primary')} onClick={send} disabled={!canTest || busy || !form.brand || !form.name.trim() || !form.body.trim()}>
            {busy ? '送出中…' : '送進 Inbox'}
          </button>
        </div>
      </section>
      <section className={s.panel} aria-label="Connection">
        <SectHead title="串接狀態 Connection" />
        <div className={s.salesLine}><span className={s.brand} data-tone="olive">完成</span><span>系統、資料庫、模擬來訊</span></div>
        <div className={s.salesLine}><span className={s.brand} data-tone="clay">等待</span><span>Meta App Review（Messenger）</span></div>
        <div className={s.salesLine}><span className={s.brand} data-tone="clay">等待</span><span>品牌 Page 加入商業帳號並指派給 System User</span></div>
        <div className={s.salesLine}><span className={s.brand} data-tone="plum">之後</span><span>Instagram 權限審核</span></div>
      </section>
    </div>
  )
}
