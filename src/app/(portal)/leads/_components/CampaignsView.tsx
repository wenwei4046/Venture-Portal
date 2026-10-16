'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { HvPage, PageHead, SectHead, btn } from '@/components/hrv/kit'
import { countAudience, removeCampaign, saveCampaign, sendCampaign } from '@/lib/leads/actions'
import {
  DAY_CHOICES, DEFAULT_AUDIENCE, audienceOf, campaignProblem, personalize, share,
  type Audience, type AudienceCount, type Campaign, type CampaignChannel,
} from '@/lib/leads/campaign'
import { whenFull } from '@/lib/leads/time'
import type { LeadBrand } from '@/lib/leads/types'
import { Bi, BrandChip } from './bits'
import s from './lead.module.css'

/**
 * Lead View › Campaigns (2026-10-16, the canvas's "Campaigns" board; the user's brief part 3). Every campaign on
 * the left; on the right the one picked — a draft or scheduled one in its editor (brand, channel, who, the count
 * before sending, the message with {name} and up to 3 buttons, a time), a sent one with what came of it.
 * Meta's rule is the database's: whoever wrote in 24 hours, else only who agreed to promotions (charged).
 * Meta is not connected: a send is recorded on each conversation, never delivered; a schedule waits.
 */

type Form = { id: string | null; brandId: string; name: string; channel: CampaignChannel; audience: Audience; body: string; buttons: string[]; scheduledAt: string }

const blank = (brandId: string): Form => ({ id: null, brandId, name: '', channel: 'all', audience: { ...DEFAULT_AUDIENCE }, body: 'Hi {name}! ', buttons: [], scheduledAt: '' })
const formOf = (c: Campaign): Form => ({
  id: c.id, brandId: c.brandId, name: c.name, channel: c.channel, audience: audienceOf(c.audience), body: c.body, buttons: c.buttons,
  scheduledAt: c.scheduledAt ? toLocal(c.scheduledAt) : '',
})
/** An instant as a datetime-local box writes it, in the browser's own zone (the office's). */
function toLocal(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const STATUS: Record<Campaign['status'], { en: string; zh: string; tone: string }> = {
  draft: { en: 'Draft', zh: '草稿', tone: 'plum' },
  scheduled: { en: 'Scheduled', zh: '已排程', tone: 'clay' },
  sent: { en: 'Sent', zh: '已发送', tone: 'olive' },
}

export default function CampaignsView({ campaigns, brands, canManage }: { campaigns: Campaign[]; brands: LeadBrand[]; canManage: boolean }) {
  const [picked, setPicked] = useState<string | 'new' | null>(campaigns[0]?.id ?? (canManage ? 'new' : null))
  const byBrand = useMemo(() => new Map(brands.map(b => [b.id, b])), [brands])
  const current = campaigns.find(c => c.id === picked) ?? null

  return (
    <HvPage>
      <PageHead eyebrow="Lead View" title="Campaigns" right={canManage
        ? <button type="button" className={btn('primary')} onClick={() => setPicked('new')}><Bi en="+ New campaign" zh="新群发" /></button>
        : null} />
      <div className={s.note} style={{ marginBottom: 14, borderRadius: 10 }}>
        <Bi block en="Meta's rule: customers who messaged in the last 24 hours can be sent to free. Past 24 hours, only customers who agreed to promotional messages (opt-in), and Meta charges per message. The system leaves everyone else out and shows the numbers before sending."
          zh="Meta 规定：24 小时内有互动的客户可以免费发；超过 24 小时，只能发给同意接收推广消息（opt-in）的客户，且 Meta 按条收费。系统会自动排除不符合的人，并在发送前显示人数。" />
      </div>
      <div className={s.twoCol}>
        <section className={s.panel} aria-label="Campaigns">
          <SectHead title="Campaigns · 群发记录" count={String(campaigns.length)} />
          {campaigns.length === 0 ? (
            <div className={s.empty}><Bi block en="No campaigns yet." zh="还没有群发。" /></div>
          ) : (
            <div className={s.tableBox}>
              <table className={s.table}>
                <thead>
                  <tr><th>Name · 名称</th><th>Brand</th><th>Status</th><th className={s.num}>Sent</th><th className={s.num}>Replied</th><th className={s.num}>Phones</th></tr>
                </thead>
                <tbody>
                  {campaigns.map(c => (
                    <tr key={c.id} onClick={() => setPicked(c.id)} style={{ cursor: 'pointer', background: c.id === picked ? 'rgb(var(--hv-peach))' : undefined }}>
                      <td><button type="button" className={s.linkBtn} onClick={() => setPicked(c.id)} aria-current={c.id === picked}>{c.name}</button></td>
                      <td><BrandChip brand={byBrand.get(c.brandId)} /></td>
                      <td>
                        <span className={s.brand} data-tone={STATUS[c.status].tone}>
                          {STATUS[c.status].en} · {STATUS[c.status].zh}{c.status === 'scheduled' && c.scheduledAt ? ` ${whenFull(c.scheduledAt)}` : ''}
                        </span>
                      </td>
                      <td className={s.num}>{c.status === 'sent' ? c.sent : '—'}</td>
                      <td className={s.num}>{c.status === 'sent' ? c.replied : '—'}</td>
                      <td className={s.num}>{c.status === 'sent' ? c.phones : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {picked === 'new' && canManage ? (
          <Editor key="new" start={blank(brands[0]?.id ?? '')} brands={brands} onDone={id => setPicked(id)} />
        ) : current?.status === 'sent' ? (
          <Results key={current.id} campaign={current} brand={byBrand.get(current.brandId)} />
        ) : current && canManage ? (
          <Editor key={current.id} start={formOf(current)} brands={brands} onDone={id => setPicked(id)} />
        ) : current ? (
          <Results key={current.id} campaign={current} brand={byBrand.get(current.brandId)} />
        ) : null}
      </div>
    </HvPage>
  )
}

function Editor({ start, brands, onDone }: { start: Form; brands: LeadBrand[]; onDone: (id: string | null) => void }) {
  const [form, setForm] = useState<Form>(start)
  const [count, setCount] = useState<AudienceCount | null>(null)
  const [counting, startCounting] = useTransition()
  const [busy, startBusy] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [button, setButton] = useState('')
  const set = (patch: Partial<Form>) => setForm(f => ({ ...f, ...patch }))
  const setAud = (patch: Partial<Audience>) => setForm(f => ({ ...f, audience: { ...f.audience, ...patch } }))

  // Count again a moment after the audience changes.
  const key = JSON.stringify([form.brandId, form.channel, form.audience])
  useEffect(() => {
    if (!form.brandId) return
    const t = window.setTimeout(() => startCounting(async () => {
      const r = await countAudience(form.brandId, form.channel, form.audience)
      setCount(r.ok ? r.data : null)
      if (!r.ok) setError(r.reason)
    }), 350)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const scheduledIso = form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null
  const problem = campaignProblem({ ...form, scheduledAt: scheduledIso })
  const reach = count ? count.window + count.optin : 0
  const data = () => ({ brandId: form.brandId, name: form.name, channel: form.channel, audience: form.audience, body: form.body, buttons: form.buttons, scheduledAt: scheduledIso })

  const save = (asSchedule: boolean) => startBusy(async () => {
    setError(null)
    const r = await saveCampaign(form.id, { ...data(), scheduledAt: asSchedule ? scheduledIso : null })
    if (!r.ok) { setError(r.reason); return }
    onDone(r.data)
  })
  const sendNow = () => {
    if (!window.confirm(`Send "${form.name}" to ${reach} customer${reach === 1 ? '' : 's'} now? (Recorded only — Meta is not connected.)\n现在发送给 ${reach} 位客户？`)) return
    startBusy(async () => {
      setError(null)
      const saved = await saveCampaign(form.id, { ...data(), scheduledAt: null })
      if (!saved.ok) { setError(saved.reason); return }
      const r = await sendCampaign(saved.data)
      if (!r.ok) { setError(r.reason); onDone(saved.data); return }
      onDone(saved.data)
    })
  }
  const remove = () => {
    if (!form.id || !window.confirm(`Remove "${form.name}"? 删除这个群发？`)) return
    startBusy(async () => {
      const r = await removeCampaign(form.id!)
      if (!r.ok) setError(r.reason)
      else onDone(null)
    })
  }
  const addButton = () => {
    const b = button.trim()
    if (!b || form.buttons.length >= 3) return
    set({ buttons: [...form.buttons, b.slice(0, 20)] })
    setButton('')
  }

  return (
    <section className={s.panel} aria-label="Campaign">
      <SectHead title={form.id ? `Edit · ${form.name}` : 'New campaign · 新群发'} />
      <div className={s.fieldGrid}>
        <label className={`${s.field} ${s.wide}`}><Bi en="Name (only you see it)" zh="名称（内部用）" />
          <input value={form.name} onChange={e => set({ name: e.target.value })} maxLength={60} placeholder="e.g. 11.11 sofa preview · 11.11 沙发预告" />
        </label>
        <label className={s.field}><Bi en="Brand" zh="品牌" />
          <select value={form.brandId} onChange={e => set({ brandId: e.target.value })}>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className={s.field}><Bi en="Channel" zh="渠道" />
          <select value={form.channel} onChange={e => set({ channel: e.target.value as CampaignChannel })}>
            <option value="all">Messenger + Instagram</option>
            <option value="messenger">Messenger</option>
            <option value="instagram">Instagram</option>
          </select>
        </label>
      </div>

      <SectHead title="Who · 对象" />
      <div className={s.fieldGrid}>
        <label className={s.field}><Bi en="Talked with us" zh="有对话" />
          <select value={form.audience.days} onChange={e => setAud({ days: Number(e.target.value) })}>
            {DAY_CHOICES.map(d => <option key={d.days} value={d.days}>{d.en} · {d.zh}</option>)}
          </select>
        </label>
        <label className={s.field}><Bi en="Interest contains" zh="意向包含" />
          <input value={form.audience.interest} onChange={e => setAud({ interest: e.target.value })} maxLength={60} placeholder="e.g. sofa · 沙发" />
        </label>
        <label className={s.field}><Bi en="Phone" zh="电话" />
          <select value={form.audience.phone} onChange={e => setAud({ phone: e.target.value as Audience['phone'] })}>
            <option value="any">Any · 不限</option>
            <option value="without">No phone yet · 还没电话</option>
            <option value="with">Have phone · 有电话</option>
          </select>
        </label>
        <label className={s.field}><Bi en="Handed to sales" zh="已转交" />
          <select value={form.audience.handed} onChange={e => setAud({ handed: e.target.value as Audience['handed'] })}>
            <option value="any">Any · 不限</option>
            <option value="no">Not yet · 未转交</option>
            <option value="yes">Handed · 已转交</option>
          </select>
        </label>
        <label className={s.field}><Bi en="Came from" zh="来源" />
          <select value={form.audience.source} onChange={e => setAud({ source: e.target.value as Audience['source'] })}>
            <option value="any">Any · 不限</option>
            <option value="ad">An ad · 广告</option>
            <option value="organic">Organic · 自然流量</option>
          </select>
        </label>
        <label className={s.check} style={{ alignSelf: 'end', minHeight: 36 }}>
          <input type="checkbox" checked={form.audience.tests} onChange={e => setAud({ tests: e.target.checked })} />
          <Bi en="Include test conversations" zh="包括测试对话" />
        </label>
      </div>
      <div className={s.inline} aria-live="polite">
        <div className={s.stat}><span className={s.label}>Match · 符合</span><span className={s.statValue}>{count ? count.matched : '—'}</span></div>
        <div className={s.stat}><span className={s.label}>Will get it · 可发送</span><span className={s.statValue}>{count ? reach : '—'}</span></div>
        <div className={s.stat}><span className={s.label}>Paid (opt-in) · 收费</span><span className={s.statValue}>{count ? count.optin : '—'}</span></div>
        <div className={s.stat}><span className={s.label}>Left out · 排除</span><span className={s.statValue}>{count ? count.notOptedIn + count.unsubscribed : '—'}</span></div>
      </div>
      {count ? (
        <span className={s.hint}>
          {counting ? 'Counting… ' : ''}{count.window} within 24 hours (free) · {count.optin} opted in (Meta charges) · {count.notOptedIn} past 24 hours without consent · {count.unsubscribed} unsubscribed
          <span className={s.zhBlock}>24小时内 {count.window}（免费）· 已同意 {count.optin}（收费）· 超过24小时未同意 {count.notOptedIn} · 已退订 {count.unsubscribed}</span>
        </span>
      ) : null}

      <SectHead title="Message · 消息" />
      <label className={s.field}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bi en="Message" zh="内容" />
          <span className={s.spacer} />
          <button type="button" className={s.linkBtn} onClick={() => set({ body: `${form.body}{name}` })}><Bi en="Insert {name}" zh="插入名字" /></button>
        </span>
        <textarea value={form.body} onChange={e => set({ body: e.target.value })} maxLength={1900} rows={5} />
      </label>
      <div className={s.inline}>
        {form.buttons.map((b, i) => (
          <span key={i} className={s.chipItem}>{b}<button type="button" aria-label={`Remove ${b}`} onClick={() => set({ buttons: form.buttons.filter((_, j) => j !== i) })}>✕</button></span>
        ))}
        {form.buttons.length < 3 ? (
          <>
            <label className={s.field} style={{ flex: '0 1 200px' }}>
              <span className="sr-only">New button</span>
              <input value={button} onChange={e => setButton(e.target.value)} maxLength={20} placeholder="Button, e.g. Book a visit · 按钮"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addButton() } }} />
            </label>
            <button type="button" className={btn('outline')} onClick={addButton} disabled={!button.trim()}><Bi en="Add button" zh="加按钮" /></button>
          </>
        ) : null}
      </div>
      <span className={s.hint}><Bi block en="A tapped button comes back as the customer's message, so your keyword automations can answer it." zh="客户点按钮，会变成客户发来的消息，关键词自动回复可以接着回答。" /></span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className={s.label}>Preview · 预览</span>
        <div className={s.tryChat} style={{ minHeight: 0 }}>
          <div className={s.msgOut}>
            <div className={s.bubbleOut} data-sender="flow" style={{ whiteSpace: 'pre-wrap' }}>{personalize(form.body, count?.sample[0] ?? 'Ann')}</div>
            {form.buttons.length ? <span className={s.tabs} style={{ justifyContent: 'flex-end' }}>{form.buttons.map((b, i) => <span key={i} className={s.flowButton}>{b}</span>)}</span> : null}
          </div>
        </div>
      </div>

      <SectHead title="When · 时间" />
      <label className={s.field}><Bi en="Schedule for (optional)" zh="排程时间（可不填）" />
        <input type="datetime-local" value={form.scheduledAt} onChange={e => set({ scheduledAt: e.target.value })} />
      </label>
      <span className={s.hint}><Bi block en="Meta is not connected yet: Send now records the message on each conversation (nothing is delivered), and a scheduled campaign waits until sending is switched on with Meta." zh="Meta 还没串接：现在发送只会记录在每个对话里（不会真的发出）；排程的群发会等到串接 Meta 后才会自动发送。" /></span>
      {error ? <div className={s.error} role="alert">{error}</div> : null}
      {problem && (form.name || form.body.trim() !== 'Hi {name}!') ? <span className={s.hint}>{problem}</span> : null}
      <div className={s.actions}>
        <button type="button" className={btn('primary')} onClick={sendNow} disabled={busy || !!problem || reach === 0}><Bi en={`Send now (${reach})`} zh="现在发送" /></button>
        <button type="button" className={btn('outline')} onClick={() => save(true)} disabled={busy || !!problem || !form.scheduledAt}><Bi en="Schedule" zh="排程" /></button>
        <button type="button" className={btn('outline')} onClick={() => save(false)} disabled={busy || !!campaignProblem({ ...form, scheduledAt: null })}><Bi en="Save draft" zh="存草稿" /></button>
        {form.id ? <button type="button" className={btn('outline')} onClick={remove} disabled={busy}><Bi en="Remove" zh="删除" /></button> : null}
      </div>
    </section>
  )
}

function Results({ campaign: c, brand }: { campaign: Campaign; brand: LeadBrand | undefined }) {
  const replied = share(c.replied, c.sent)
  const phones = share(c.phones, c.sent)
  return (
    <section className={s.panel} aria-label={c.name}>
      <div className={s.panelHead}>
        <span className={s.cardTitle}>{c.name}</span>
        <span className={s.spacer} />
        <BrandChip brand={brand} />
      </div>
      <span className={s.hint}>
        {c.status === 'sent' && c.sentAt ? `Sent ${whenFull(c.sentAt)} · ${c.sentByName}` : c.status === 'scheduled' && c.scheduledAt ? `Scheduled ${whenFull(c.scheduledAt)}` : 'Draft'}
      </span>
      {c.status === 'sent' ? (
        <div className={s.inline}>
          <div className={s.stat}><span className={s.label}>Sent · 发送</span><span className={s.statValue}>{c.sent}</span></div>
          <div className={s.stat}><span className={s.label}>Paid · 收费</span><span className={s.statValue}>{c.paid}</span></div>
          <div className={s.stat}><span className={s.label}>Replied · 回复</span><span className={s.statValue}>{c.replied}{replied === null ? '' : ` · ${replied}%`}</span></div>
          <div className={s.stat}><span className={s.label}>Phones · 电话</span><span className={s.statValue}>{c.phones}{phones === null ? '' : ` · ${phones}%`}</span></div>
        </div>
      ) : null}
      <span className={s.label}>Message · 消息</span>
      <div className={s.tryChat} style={{ minHeight: 0 }}>
        <div className={s.msgOut}>
          <div className={s.bubbleOut} data-sender="flow" style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>
          {c.buttons.length ? <span className={s.tabs} style={{ justifyContent: 'flex-end' }}>{c.buttons.map((b, i) => <span key={i} className={s.flowButton}>{b}</span>)}</span> : null}
        </div>
      </div>
      {c.status === 'sent' ? <span className={s.hint}><Bi block en="Replied and phones count customers who wrote back, or gave a phone, after it was sent." zh="回复和电话：发送之后有回复、或留下电话的客户数。" /></span> : null}
    </section>
  )
}
