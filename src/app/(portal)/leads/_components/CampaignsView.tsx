'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { countAudience, removeCampaign, saveCampaign } from '@/lib/leads/actions'
import {
  DEFAULT_AUDIENCE, audienceOf, campaignProblem, consentTotals, personalize, resultSteps,
  type Audience, type AudienceCount, type Campaign, type CampaignChannel, type ConsentRow,
} from '@/lib/leads/campaign'
import type { LeadBrand } from '@/lib/leads/types'
import { LeadIcon } from '@/components/layout/lead-icons'
import ContextMenu from './ui/ContextMenu'
import s from './campaigns.module.css'

/**
 * Lead View v2 › Campaigns (2026-11-02, the v2 handoff §7.4): three columns — Promotions consent (Agreed · Not asked ·
 * Stopped) and the campaigns on the left; the picked one in the middle (Who gets it, Message, When — or, once sent,
 * Sent · Read · Replied · Gave phone · Bought and See the leads it brought); the Messenger phone on the right. Meta's
 * rule stays the database's (lead_audience): whoever wrote in 24 hours, else only who agreed, never who stopped.
 * Held until Meta is connected, drawn and saying so: the Meta template, Send test to me, Read, Send now (off for the
 * go-live — a schedule is kept, nothing sends it yet). Kept though not drawn (the user's point 2): the brand (in the
 * subtitle), the filters' own values (days, the words asked about, test conversations), the buttons, Save draft, and
 * Remove / Cancel schedule behind ⋯.
 */

type Form = { id: string | null; brandId: string; name: string; channel: CampaignChannel; audience: Audience; body: string; buttons: string[]; day: string; time: string }

const DAYS = [7, 30, 60, 90, 365] as const
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const p2 = (n: number) => String(n).padStart(2, '0')
/** An instant as the day and time boxes write it, in the browser's own zone (the office's). */
const dayOf = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` }
const timeOfIso = (iso: string) => { const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())}` }
/** "Sat 24 Oct, 11:00" — as the list and the When box say it. */
const whenLabel = (iso: string) => { const d = new Date(iso); return `${WD[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}, ${p2(d.getHours())}:${p2(d.getMinutes())}` }
/** "2 Apr 2026, 11:00" — a sent one. */
const sentLabel = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}, ${p2(d.getHours())}:${p2(d.getMinutes())}` }

const blank = (brandId: string): Form => ({ id: null, brandId, name: 'New campaign', channel: 'all', audience: { ...DEFAULT_AUDIENCE, days: 60 }, body: 'Hi {name}! ', buttons: ['I’m interested'], day: '', time: '11:00' })
const formOf = (c: Campaign): Form => ({
  id: c.id, brandId: c.brandId, name: c.name, channel: c.channel, audience: audienceOf(c.audience), body: c.body, buttons: c.buttons,
  day: c.scheduledAt ? dayOf(c.scheduledAt) : '', time: c.scheduledAt ? timeOfIso(c.scheduledAt) : '11:00',
})
const STATUS: Record<Campaign['status'], string> = { draft: 'Draft', scheduled: 'Scheduled', sent: 'Sent' }

export default function CampaignsView({ campaigns, brands, consent, ready, canManage }: {
  campaigns: Campaign[]
  brands: LeadBrand[]
  consent: ConsentRow[]
  /** Mig 20261023400000 is in: the two "did not buy" filters, Bought and the consent counts. */
  ready: boolean
  canManage: boolean
}) {
  const [picked, setPicked] = useState<string | null>(campaigns[0]?.id ?? null)
  const [fresh, setFresh] = useState<Form | null>(campaigns.length === 0 && canManage ? blank(brands[0]?.id ?? '') : null)
  const [live, setLive] = useState<Form | null>(null)
  const byBrand = useMemo(() => new Map(brands.map(b => [b.id, b])), [brands])
  const current = fresh ? null : campaigns.find(c => c.id === picked) ?? null
  const totals = consentTotals(consent)
  const startNew = (f: Form) => { setFresh(f); setPicked(null) }
  const open = (id: string | null) => { setFresh(null); setPicked(id) }
  const shown = live ?? fresh ?? (current ? formOf(current) : null)

  return (
    <div className={s.wrap}>
      <section className={s.card} aria-label="Campaigns">
        <div className={s.consent}>
          <span className={s.muted}>Promotions consent</span>
          <div className={s.tiles} title={ready ? undefined : 'Counts come with the database update'}>
            <div className={s.tile} data-g=""><span>{ready ? totals.agreed : '—'}</span><span>Agreed</span></div>
            <div className={s.tile}><span>{ready ? totals.notAsked : '—'}</span><span>Not asked</span></div>
            <div className={s.tile}><span>{ready ? totals.unsub : '—'}</span><span>Stopped</span></div>
          </div>
        </div>
        <div className={s.listHead}>
          <span className={s.muted}>Campaigns</span>
          {canManage ? <button type="button" className={s.new} onClick={() => startNew(blank(brands[0]?.id ?? ''))}><LeadIcon name="plus" size={14} />New</button> : null}
        </div>
        <div className={s.list}>
          {fresh ? (
            <div className={s.row} aria-current="true">
              <span className={s.rowTop}><span className={s.rowName}>{(live ?? fresh).name || 'New campaign'}</span><span className={s.st} data-s="draft">Draft</span></span>
              <span className={s.rowSub}>{byBrand.get((live ?? fresh).brandId)?.name ?? '—'} · Not saved yet</span>
            </div>
          ) : null}
          {campaigns.map(c => (
            <button key={c.id} type="button" className={s.row} aria-current={!fresh && c.id === picked} onClick={() => open(c.id)}>
              <span className={s.rowTop}><span className={s.rowName}>{c.name}</span><span className={s.st} data-s={c.status}>{STATUS[c.status]}</span></span>
              <span className={s.rowSub}>
                {byBrand.get(c.brandId)?.name ?? '—'} · {c.status === 'sent' && c.sentAt ? `Sent ${sentLabel(c.sentAt)}` : c.status === 'scheduled' && c.scheduledAt ? whenLabel(c.scheduledAt) : 'Not scheduled'}
              </span>
            </button>
          ))}
          {campaigns.length === 0 && !fresh ? <div className={s.empty}>No campaigns yet.</div> : null}
        </div>
      </section>

      {fresh ? (
        <Editor key="new" start={fresh} brands={brands} ready={ready} canManage={canManage} onDone={open} onChange={setLive} />
      ) : current?.status === 'sent' ? (
        <Results key={current.id} campaign={current} brand={byBrand.get(current.brandId)} canManage={canManage}
          onDuplicate={() => startNew({ ...formOf(current), id: null, name: `${current.name} (copy)`.slice(0, 60), day: '' })} />
      ) : current ? (
        <Editor key={current.id} start={formOf(current)} brands={brands} ready={ready} canManage={canManage} onDone={open} onChange={setLive} />
      ) : (
        <section className={s.card}><div className={s.empty} style={{ padding: 24 }}>Pick a campaign, or start a new one.</div></section>
      )}

      <section className={s.pv} aria-label="Preview">
        <span className={s.pvKicker}>PREVIEW · MESSENGER</span>
        <div className={s.phone}>
          <div className={s.status}>
            <span>9:41</span><span className={s.notch} />
            <span className={s.icons}><LeadIcon name="signal" size={14} /><LeadIcon name="wifi" size={14} /><LeadIcon name="battery-full" size={18} /></span>
          </div>
          <div className={s.pHead}><span className={s.pAv}>H</span><span className={s.pName}>{byBrand.get(shown?.brandId ?? '')?.name ?? '—'}</span></div>
          <div className={s.pChat}>
            {shown ? (
              <>
                <div className={s.pBubble}>{personalize(shown.body, 'Jason')}</div>
                {[...shown.buttons.filter(b => b.trim()), 'Stop promotions'].map((b, i) => <div key={i} className={s.pBtn}>{b}</div>)}
              </>
            ) : null}
          </div>
          <div className={s.pHome}><span /></div>
        </div>
      </section>
    </div>
  )
}

function Editor({ start, brands, ready, canManage, onDone, onChange }: {
  start: Form
  brands: LeadBrand[]
  ready: boolean
  canManage: boolean
  onDone: (id: string | null) => void
  onChange: (f: Form | null) => void
}) {
  const router = useRouter()
  const [form, setForm] = useState<Form>(start)
  const [count, setCount] = useState<AudienceCount | null>(null)
  const [busy, startBusy] = useTransition()
  const [, startCounting] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const dis = !canManage || busy
  const set = (patch: Partial<Form>) => { setForm(f => ({ ...f, ...patch })); setNote('') }
  const setAud = (patch: Partial<Audience>) => set({ audience: { ...form.audience, ...patch } })
  const a = form.audience
  const recent = a.days < 3650
  useEffect(() => { onChange(form); return () => onChange(null) }, [form, onChange])

  // Count again a moment after the audience changes.
  const key = JSON.stringify([form.brandId, form.channel, form.audience])
  useEffect(() => {
    if (!form.brandId) return
    const t = window.setTimeout(() => startCounting(async () => {
      const r = await countAudience(form.brandId, form.channel, form.audience)
      setCount(r.ok ? r.data : null)
    }), 350)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const scheduledIso = form.day && form.time ? new Date(`${form.day}T${form.time}`).toISOString() : null
  const reach = count ? count.window + count.optin : 0
  const problem = campaignProblem({ ...form, buttons: form.buttons.filter(b => b.trim()), scheduledAt: scheduledIso })
  const data = (at: string | null) => ({ brandId: form.brandId, name: form.name, channel: form.channel, audience: form.audience, body: form.body, buttons: form.buttons.map(b => b.trim()).filter(Boolean), scheduledAt: at })
  const scheduled = !!(start.day && start.id)
  const save = (at: string | null, msg: string) => startBusy(async () => {
    setError(null)
    const r = await saveCampaign(form.id, data(at))
    if (!r.ok) { setError(r.reason); return }
    setNote(msg); onDone(r.data); router.refresh()
  })
  const remove = () => {
    setMenu(null)
    if (!form.id || !window.confirm(`Remove “${form.name}”?`)) return
    startBusy(async () => {
      const r = await removeCampaign(form.id!)
      if (!r.ok) setError(r.reason)
      else { onDone(null); router.refresh() }
    })
  }
  const filter = (on: boolean, label: React.ReactNode, onClick: (() => void) | null, after?: string) => (
    <div className={s.fRow} role="checkbox" aria-checked={on} aria-disabled={!onClick || dis} tabIndex={0} onClick={() => { if (onClick && !dis) onClick() }}>
      <LeadIcon name={on ? 'check' : 'square'} size={16} /><span>{label}</span>{after ? <span>{after}</span> : null}
    </div>
  )

  return (
    <section className={s.card} aria-label="Campaign">
      <div className={s.head}>
        <div className={s.titles}>
          <input className={s.name} value={form.name} maxLength={60} disabled={dis} onChange={e => set({ name: e.target.value })} aria-label="Campaign name" />
          <span className={s.sub}>
            <select value={form.brandId} disabled={dis} onChange={e => set({ brandId: e.target.value })} aria-label="Brand">
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            · <span data-s={scheduled ? 'scheduled' : 'draft'}>{scheduled ? 'Scheduled' : 'Draft'}</span>
          </span>
        </div>
        {canManage ? (
          <>
            <button type="button" className={s.ghost} disabled title="Comes with Meta">Send test to me</button>
            <button type="button" className={s.ghost} disabled={busy || !!problem} onClick={() => save(null, 'Saved as a draft.')}>Save draft</button>
            <button type="button" className={s.sched} disabled={busy || !!problem || !scheduledIso || reach === 0} title={!scheduledIso ? 'Pick a day and time under When' : undefined}
              onClick={() => save(scheduledIso, 'Scheduled. Nothing sends a schedule until Meta is connected.')}>
              <LeadIcon name="calendar-clock" size={15} />{scheduled ? 'Scheduled' : 'Schedule'}
            </button>
            <span className={s.more}><button type="button" className={s.moreBtn} aria-label="More" onClick={e => setMenu({ x: e.clientX - 180, y: e.clientY + 12 })}><LeadIcon name="ellipsis" size={16} /></button></span>
          </>
        ) : null}
      </div>
      <div className={s.body}>
        <div className={s.sect}>
          <span className={s.sectH}>Who gets it</span>
          <div className={s.box}>
            <div className={s.lockRow}><LeadIcon name="lock" size={14} /><span>Only customers who agreed to promotions</span><span>Always on · Meta rule</span></div>
            {filter(recent, <>Chatted in the last{' '}
              <select className={s.mini} value={recent ? a.days : 60} disabled={dis || !recent} onClick={e => e.stopPropagation()} onChange={e => setAud({ days: Number(e.target.value) })} aria-label="Days">
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>{' '}days</>, () => setAud({ days: recent ? 3650 : 60 }))}
            {filter(!!a.notBought, 'Did not buy yet', ready ? () => setAud({ notBought: !a.notBought }) : null, ready ? undefined : 'Comes with the database update')}
            {filter(!!a.interest.trim(), <>Asked about{' '}
              <input className={s.mini} style={{ width: 120 }} value={a.interest} maxLength={60} disabled={dis} placeholder="sofas" onClick={e => e.stopPropagation()} onChange={e => setAud({ interest: e.target.value })} aria-label="Asked about" /></>,
              () => setAud({ interest: a.interest.trim() ? '' : 'sofa' }))}
            {filter(!!a.cameNotBought, 'Came to the showroom but did not buy', ready ? () => setAud({ cameNotBought: !a.cameNotBought }) : null, ready ? undefined : 'Comes with the database update')}
            {filter(a.tests, 'Test conversations', () => setAud({ tests: !a.tests }), 'until Meta is connected')}
          </div>
          <span className={s.count}><b>{count ? reach.toLocaleString('en-US') : '…'}</b> customers will get this</span>
          {count ? <span className={s.why}>{count.optin} agreed · {count.window} wrote in the last 24 hours · {count.notOptedIn + count.unsubscribed} left out</span> : null}
        </div>

        <div className={s.sect}>
          <span className={s.sectH}>Message</span>
          <div className={s.tpl} title="Meta templates come with Meta"><LeadIcon name="file-check-2" size={15} /><span>No Meta template yet</span><span>Comes with Meta</span><LeadIcon name="chevron-down" size={14} /></div>
          <textarea className={s.msg} rows={4} value={form.body} maxLength={1900} disabled={dis} onChange={e => set({ body: e.target.value })} aria-label="Message" />
          <div className={s.btns}>
            {form.buttons.map((b, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center' }}>
                <input className={s.btnIn} value={b} maxLength={20} disabled={dis} onChange={e => set({ buttons: form.buttons.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`Button ${i + 1}`} />
                {canManage ? <button type="button" className={s.x} title="Remove" aria-label={`Remove button ${i + 1}`} disabled={busy} onClick={() => set({ buttons: form.buttons.filter((_, j) => j !== i) })}>×</button> : null}
              </span>
            ))}
            <input className={s.btnIn} value="Stop promotions" disabled data-locked="" aria-label="Stop promotions (required)" title="Required. Removes the customer from promotions." />
            {canManage && form.buttons.length < 3 ? <button type="button" className={s.addBtn} disabled={busy} onClick={() => set({ buttons: [...form.buttons, ''] })}>+ Button</button> : null}
          </div>
        </div>

        <div className={s.sect}>
          <span className={s.sectH}>When</span>
          <div className={s.when}>
            <LeadIcon name="calendar" size={15} />
            <input type="date" value={form.day} disabled={dis} onChange={e => set({ day: e.target.value })} aria-label="Day" />
            <input type="time" value={form.time} disabled={dis} onChange={e => set({ time: e.target.value })} aria-label="Time" />
          </div>
        </div>
        {error ? <span className={s.error} role="alert">{error}</span> : note ? <span className={s.note}>{note}</span> : problem && canManage ? <span className={s.note}>{problem}</span> : null}
      </div>
      <ContextMenu at={menu} onClose={() => setMenu(null)} width={200}>
        <button type="button" className={s.ghost} style={{ height: 32, textAlign: 'left' }} disabled title="Not sent through Meta yet — comes after the go-live">Send now</button>
        {scheduled ? <button type="button" className={s.ghost} style={{ height: 32, textAlign: 'left' }} onClick={() => { setMenu(null); save(null, 'Schedule cancelled — it is a draft again.') }}>Cancel schedule</button> : null}
        {form.id ? <button type="button" className={s.ghost} style={{ height: 32, textAlign: 'left', color: 'rgb(var(--lv-accent))' }} onClick={remove}>Remove</button> : null}
      </ContextMenu>
    </section>
  )
}

function Results({ campaign: c, brand, canManage, onDuplicate }: { campaign: Campaign; brand: LeadBrand | undefined; canManage: boolean; onDuplicate: () => void }) {
  const steps = resultSteps(c)
  return (
    <section className={s.card} aria-label="Results">
      <div className={s.head}>
        <div className={s.titles}>
          <span className={s.name}>{c.name}</span>
          <span className={s.sub}>{brand?.name ?? '—'} · <span data-s="sent">Sent</span></span>
        </div>
        {canManage ? <button type="button" className={s.ghost} onClick={onDuplicate}>Duplicate as new campaign</button> : null}
      </div>
      <div className={s.body}>
        <div className={s.sect} style={{ gap: 12 }}>
          <span className={s.muted}>Sent {c.sentAt ? sentLabel(c.sentAt) : '—'}{c.sentByName ? ` · by ${c.sentByName}` : ''}</span>
          <div className={s.res}>
            {steps.map(r => (
              <div key={r.label} className={s.resTile}>
                <span>{r.label === 'Gave a phone' ? 'Gave phone' : r.label}</span>
                <span>{r.n ?? '—'}</span>
                <span>{r.label === 'Sent' ? 'Customers' : r.n === null ? r.rate : c.sent ? `${Math.round((r.n / c.sent) * 100)}%` : '—'}</span>
              </div>
            ))}
          </div>
          <Link className={s.leadsLink} href="/leads/list">See the leads it brought<LeadIcon name="arrow-up-right" size={14} /></Link>
        </div>
      </div>
    </section>
  )
}
