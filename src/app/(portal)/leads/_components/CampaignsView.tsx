'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { countAudience, removeCampaign, saveCampaign, sendCampaign } from '@/lib/leads/actions'
import {
  DEFAULT_AUDIENCE, audienceOf, campaignProblem, consentTotals, personalize, resultSteps,
  type Audience, type AudienceCount, type Campaign, type CampaignChannel, type ConsentRow,
} from '@/lib/leads/campaign'
import { whenFull } from '@/lib/leads/time'
import type { LeadBrand } from '@/lib/leads/types'
import { LeadIcon } from '@/components/layout/lead-icons'
import s from './campaigns.module.css'

/**
 * Lead View › Campaigns v2 (2026-10-23, the redesign v2 handoff `Campaigns.dc.html`; step 6). Promotions consent in the
 * header; every campaign on the left; the one picked in the middle — a draft or scheduled one in its editor (1 · who
 * gets it, 2 · message, 3 · when), a sent one with its results (Sent · Read · Replied · Gave a phone · Bought) — and the
 * Messenger preview on the right. Meta's rule stays the database's (lead_audience): whoever wrote in 24 hours, else only
 * who agreed to promotions, never who unsubscribed. Held until Meta is connected, drawn and saying so: the Meta template,
 * a photo or video, Send test, Read. Meta is not connected: Send now records the message on each conversation; a
 * schedule is kept but nothing sends it yet. The two "did not buy" filters and Bought need mig 20261023400000.
 */

type Form = { id: string | null; brandId: string; name: string; channel: CampaignChannel; audience: Audience; body: string; buttons: string[]; day: string; time: string }

const DAYS = [7, 30, 60, 90, 365] as const
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const p2 = (n: number) => String(n).padStart(2, '0')
/** An instant as the day and time boxes write it, in the browser's own zone (the office's). */
const dayOf = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` }
const timeOfIso = (iso: string) => { const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())}` }
const shortDay = (day: string) => `${Number(day.slice(8))} ${MON[Number(day.slice(5, 7)) - 1]}`

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
  const byBrand = useMemo(() => new Map(brands.map(b => [b.id, b])), [brands])
  const current = fresh ? null : campaigns.find(c => c.id === picked) ?? null
  const totals = consentTotals(consent)
  const startNew = (f: Form) => { setFresh(f); setPicked(null) }
  const open = (id: string | null) => { setFresh(null); setPicked(id) }

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div className={s.titles}>
          <span className={s.eyebrow}>LEAD VIEW</span>
          <h1 className={s.title}>Campaigns</h1>
        </div>
        <span className={s.consent} title={ready ? undefined : 'Counts come with the database update'}>
          <span>Promotions consent</span>
          <span><span className={s.dot} data-tone="green" />Agreed <b>{ready ? totals.agreed : '—'}</b></span>
          <span><span className={s.dot} />Not asked <b>{ready ? totals.notAsked : '—'}</b></span>
          <span><span className={s.dot} data-tone="accent" />Unsubscribed <b>{ready ? totals.unsub : '—'}</b></span>
        </span>
      </div>
      <div className={s.grid}>
        <section className={s.list} aria-label="Campaigns">
          <div className={s.listHead}>
            <span className={s.kicker}>CAMPAIGNS</span>
            {canManage ? <button type="button" className={s.btn} data-strong="" onClick={() => startNew(blank(brands[0]?.id ?? ''))}>+ New</button> : null}
          </div>
          <div className={s.rows}>
            {fresh ? (
              <div className={s.row} aria-current="true">
                <span className={s.rowTop}><span className={s.rowName}>{fresh.name || 'New campaign'}</span><span className={s.tag}>Draft</span></span>
                <span className={s.rowLine}><span className={s.brand}>{byBrand.get(fresh.brandId)?.name ?? '—'}</span>Not saved yet</span>
              </div>
            ) : null}
            {campaigns.map(c => (
              <button key={c.id} type="button" className={s.row} aria-current={!fresh && c.id === picked} onClick={() => open(c.id)}>
                <span className={s.rowTop}><span className={s.rowName}>{c.name}</span><span className={s.tag} data-status={c.status}>{STATUS[c.status]}</span></span>
                <span className={s.rowLine}>
                  <span className={s.brand}>{byBrand.get(c.brandId)?.name ?? '—'}</span>
                  {c.status === 'sent' && c.sentAt ? `${shortDay(dayOf(c.sentAt))} ${dayOf(c.sentAt).slice(0, 4)}${c.bought !== undefined ? ` · ${c.bought} bought` : ''}`
                    : c.status === 'scheduled' && c.scheduledAt ? `${shortDay(dayOf(c.scheduledAt))}, ${timeOfIso(c.scheduledAt)}` : 'Not scheduled'}
                </span>
              </button>
            ))}
            {campaigns.length === 0 && !fresh ? <div className={s.empty}>No campaigns yet.</div> : null}
          </div>
        </section>

        {fresh ? (
          <Editor key="new" start={fresh} brands={brands} ready={ready} canManage={canManage} onDone={open} />
        ) : current?.status === 'sent' ? (
          <Results key={current.id} campaign={current} brand={byBrand.get(current.brandId)} canManage={canManage}
            onDuplicate={() => startNew({ ...formOf(current), id: null, name: `${current.name} (copy)`.slice(0, 60), day: '' })} />
        ) : current ? (
          <Editor key={current.id} start={formOf(current)} brands={brands} ready={ready} canManage={canManage} onDone={open} />
        ) : (
          <section className={s.main}><div className={s.empty}>Pick a campaign, or start a new one.</div></section>
        )}

        <Preview form={fresh ?? (current ? formOf(current) : null)} brand={byBrand.get((fresh ?? current)?.brandId ?? '')} />
      </div>
    </div>
  )
}

function Editor({ start, brands, ready, canManage, onDone }: { start: Form; brands: LeadBrand[]; ready: boolean; canManage: boolean; onDone: (id: string | null) => void }) {
  const router = useRouter()
  const [form, setForm] = useState<Form>(start)
  const [count, setCount] = useState<AudienceCount | null>(null)
  const [busy, startBusy] = useTransition()
  const [, startCounting] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const dis = !canManage || busy
  const set = (patch: Partial<Form>) => { setForm(f => ({ ...f, ...patch })); setNote('') }
  const setAud = (patch: Partial<Audience>) => set({ audience: { ...form.audience, ...patch } })
  const a = form.audience
  const recent = a.days < 3650

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
  const done = (id: string | null, msg: string) => { setNote(msg); onDone(id); router.refresh() }

  const save = (at: string | null, msg: string) => startBusy(async () => {
    setError(null)
    const r = await saveCampaign(form.id, data(at))
    if (!r.ok) { setError(r.reason); return }
    done(r.data, msg)
  })
  const sendNow = () => {
    if (!window.confirm(`Send “${form.name}” to ${reach} customer${reach === 1 ? '' : 's'} now? It is recorded on each conversation — Meta is not connected.`)) return
    startBusy(async () => {
      setError(null)
      const saved = await saveCampaign(form.id, data(null))
      if (!saved.ok) { setError(saved.reason); return }
      const r = await sendCampaign(saved.data)
      if (!r.ok) setError(r.reason)
      done(saved.data, '')
    })
  }
  const remove = () => {
    if (!form.id || !window.confirm(`Remove “${form.name}”?`)) return
    startBusy(async () => {
      const r = await removeCampaign(form.id!)
      if (!r.ok) setError(r.reason)
      else done(null, '')
    })
  }
  const statusText = note || (start.day && start.id ? `Scheduled. It is kept for ${shortDay(start.day)} at ${start.time} — nothing sends a schedule until Meta is connected.`
    : problem ?? (reach === 0 ? 'Nobody matches yet.' : `Ready. ${reach} customer${reach === 1 ? '' : 's'} will get it.`))

  return (
    <section className={s.main} aria-label="Campaign">
      <div className={s.scroll}>
        <input className={s.name} value={form.name} maxLength={60} disabled={dis} onChange={e => set({ name: e.target.value })} aria-label="Campaign name" />

        <div className={s.section}>
          <span className={s.kicker}>1 · WHO GETS IT</span>
          <label className={s.inline}>Brand
            <select className={s.select} value={form.brandId} disabled={dis} onChange={e => set({ brandId: e.target.value })}>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <div className={s.filters}>
            <div className={s.filter}>
              <Check on={recent} disabled={dis} onClick={() => setAud({ days: recent ? 3650 : 60 })} />
              <span>Chatted in the last{' '}
                <select className={s.mini} value={recent ? a.days : 60} disabled={dis || !recent} onChange={e => setAud({ days: Number(e.target.value) })} aria-label="Days">
                  {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>{' '}days</span>
            </div>
            <div className={s.filter} title={ready ? undefined : 'Comes with the database update'}>
              <Check on={!!a.notBought} disabled={dis || !ready} onClick={() => setAud({ notBought: !a.notBought })} />
              <span>Did not buy yet</span>
            </div>
            <div className={s.filter}>
              <Check on={!!a.interest.trim()} disabled={dis} onClick={() => setAud({ interest: a.interest.trim() ? '' : 'sofa' })} />
              <span>Asked about{' '}
                <input className={s.mini} style={{ width: 140 }} value={a.interest} maxLength={60} disabled={dis} placeholder="sofas" onChange={e => setAud({ interest: e.target.value })} aria-label="Asked about" />
              </span>
            </div>
            <div className={s.filter} title={ready ? undefined : 'Comes with the database update'}>
              <Check on={!!a.cameNotBought} disabled={dis || !ready} onClick={() => setAud({ cameNotBought: !a.cameNotBought })} />
              <span>Came to the showroom but did not buy</span>
            </div>
            <div className={s.filter}>
              <Check on={a.tests} disabled={dis} onClick={() => setAud({ tests: !a.tests })} />
              <span>Test conversations</span>
              <span className={s.faint}>until Meta is connected</span>
            </div>
            <div className={s.filter} data-locked="">
              <Check on disabled onClick={() => {}} />
              <span>Only customers who agreed to promotions</span>
              <span className={s.faint}>Always on · Meta rule</span>
            </div>
          </div>
          <div className={s.count}>
            <span className={s.big}>{count ? reach : '…'}</span><span>customers will get this</span>
            {count ? <span className={s.faint}>{count.optin} agreed · {count.window} wrote in the last 24 hours · {count.notOptedIn + count.unsubscribed} left out</span> : null}
          </div>
        </div>

        <div className={s.section}>
          <span className={s.kicker}>2 · MESSAGE</span>
          <label className={s.inline}>Meta template
            <select className={s.select} disabled value=""><option value="">—</option></select>
            <span className={s.tag}>Comes with Meta</span>
          </label>
          <textarea className={s.body} rows={4} value={form.body} maxLength={1900} disabled={dis} onChange={e => set({ body: e.target.value })} aria-label="Message" />
          <span className={s.faint}>{'{name}'} becomes the customer’s first name. Once Meta is connected, changing the text sends the template back to Meta for review, usually within a day.</span>
          <span className={s.inline}>
            <button type="button" className={s.btn} disabled title="Photos and videos come with Meta"><LeadIcon name="image" size={14} /> Add photo or video</button>
            <Link className={s.link} href="/leads/knowledge">or pick from Data Center</Link>
          </span>
          <span className={s.kicker} style={{ marginTop: 6 }}>Buttons</span>
          {form.buttons.map((b, i) => (
            <span key={i} className={s.btnRow}>
              <input className={s.input} value={b} maxLength={20} disabled={dis} onChange={e => set({ buttons: form.buttons.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`Button ${i + 1}`} />
              <span className={s.faint}>Customer taps it to reply. Goes to the Inbox.</span>
              {canManage ? <button type="button" className={s.x} title="Remove" disabled={busy} onClick={() => set({ buttons: form.buttons.filter((_, j) => j !== i) })}>×</button> : null}
            </span>
          ))}
          <span className={s.btnRow}>
            <input className={s.input} value="Stop promotions" disabled aria-label="Stop promotions" data-locked="" />
            <span className={s.faint}>Required. Removes the customer from promotions.</span>
          </span>
          {canManage && form.buttons.length < 3 ? <button type="button" className={s.link} disabled={busy} onClick={() => set({ buttons: [...form.buttons, ''] })}>+ Add button</button> : null}
        </div>

        <div className={s.section}>
          <span className={s.kicker}>3 · WHEN</span>
          <span className={s.inline}>
            <input type="date" className={s.input} style={{ width: 160 }} value={form.day} disabled={dis} onChange={e => set({ day: e.target.value })} aria-label="Day" />
            <input type="time" className={s.input} style={{ width: 120 }} value={form.time} disabled={dis} onChange={e => set({ time: e.target.value })} aria-label="Time" />
            <span className={s.faint}>Replies come into the Inbox. Send during working hours so someone can answer.</span>
          </span>
        </div>
        {error ? <div className={s.error} role="alert">{error}</div> : null}
      </div>
      {canManage ? (
        <div className={s.foot}>
          <span className={s.statusText}>{statusText}</span>
          <span className={s.fill} />
          {form.id ? <button type="button" className={s.btn} data-quiet="" disabled={busy} onClick={remove}>Remove</button> : null}
          <button type="button" className={s.btn} disabled title="Comes with Meta">Send test to me</button>
          {start.day && start.id ? <button type="button" className={s.btn} disabled={busy} onClick={() => save(null, 'Schedule cancelled — it is a draft again.')}>Cancel schedule</button> : null}
          <button type="button" className={s.btn} disabled={busy || !!problem} onClick={() => save(null, 'Saved as a draft.')}>Save draft</button>
          <button type="button" className={s.btn} disabled={busy || !!problem || reach === 0} onClick={sendNow} title="Recorded on each conversation — Meta is not connected">Send now</button>
          <button type="button" className={s.btn} data-strong="" disabled={busy || !!problem || !scheduledIso || reach === 0}
            title={!scheduledIso ? 'Pick a day and time' : undefined} onClick={() => save(scheduledIso, 'Scheduled.')}>
            {start.day && start.id ? 'Update schedule' : `Schedule for ${reach}`}
          </button>
        </div>
      ) : null}
    </section>
  )
}

function Results({ campaign: c, brand, canManage, onDuplicate }: { campaign: Campaign; brand: LeadBrand | undefined; canManage: boolean; onDuplicate: () => void }) {
  const steps = resultSteps(c)
  return (
    <section className={s.main} aria-label="Results">
      <div className={s.scroll}>
        <span className={s.name} style={{ border: 0 }}>{c.name}</span>
        <span className={s.faint} style={{ fontSize: 14 }}>Sent {c.sentAt ? whenFull(c.sentAt) : '—'} · {brand?.name ?? '—'} · {c.sent} customers{c.sentByName ? ` · by ${c.sentByName}` : ''}</span>
        <div className={s.results}>
          {steps.map(r => (
            <div key={r.label} className={s.result}>
              <span className={s.faint}>{r.label}</span>
              <span className={s.big}>{r.n ?? '—'}</span>
              <span className={s.faint}>{r.rate}</span>
            </div>
          ))}
        </div>
        <span className={s.faint} style={{ fontSize: 14 }}>
          {c.phones} customer{c.phones === 1 ? '' : 's'} left a phone{c.bought !== undefined ? ` and ${c.bought} bought` : ''}. Replies went to the Inbox like any chat and were handed to sales the usual way.
        </span>
        <span className={s.inline}>
          {canManage ? <button type="button" className={s.btn} data-strong="" onClick={onDuplicate}>Duplicate as new campaign</button> : null}
          <Link className={s.link} href="/leads/list">See the leads it brought ↗</Link>
        </span>
      </div>
    </section>
  )
}

function Preview({ form, brand }: { form: Form | null; brand: LeadBrand | undefined }) {
  return (
    <section className={s.preview} aria-label="Preview">
      <span className={s.kicker}>PREVIEW · MESSENGER</span>
      {form ? (
        <div className={s.phone}>
          <span className={s.phoneHead}><span className={s.avatar}>{(brand?.name ?? '?').slice(0, 1)}</span>{brand?.name ?? '—'}</span>
          <div className={s.bubble}>{personalize(form.body, 'Jason')}</div>
          {form.buttons.filter(b => b.trim()).map((b, i) => <span key={i} className={s.pill}>{b}</span>)}
          <span className={s.pill}>Stop promotions</span>
        </div>
      ) : null}
      <span className={s.faint}>Meta only allows promotions to customers who agreed to get them. Customers agree by tapping “Yes” on the opt-in question after a chat. Anyone who taps “Stop promotions” is removed at once.</span>
    </section>
  )
}

function Check({ on, disabled, onClick }: { on: boolean; disabled: boolean; onClick: () => void }) {
  return <button type="button" role="checkbox" aria-checked={on} className={s.check} disabled={disabled} onClick={onClick}>{on ? '✓' : ''}</button>
}
