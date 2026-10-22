'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { saveReplyRules } from '@/lib/leads/actions'
import type { LeadAd } from '@/lib/leads/ads'
import type { ReplyRules } from '@/lib/leads/template'
import type { LeadBrand } from '@/lib/leads/types'
import s from './replies.module.css'

/**
 * Lead View › Reply rules (2026-10-23, the redesign v2 handoff `Auto Reply.dc.html?view=routing`): which reply answers a
 * conversation's first message — BY AD (each ad, any time / working hours / after hours, → a template, the AI Agent or
 * Customer Service) and ORGANIC AND OTHER ADS (each page and channel, working hours and after hours, by Business
 * hours). Saved as a whole (lead_save_reply_rules). With no rule for a conversation, today's triggers still decide.
 * The AI Agent is a copilot today: a chat it answers waits for CS with a draft.
 */

const WHEN: ReadonlyArray<{ v: 'any' | 'open' | 'closed'; l: string }> = [{ v: 'any', l: 'Any time' }, { v: 'open', l: 'Working hours' }, { v: 'closed', l: 'After hours' }]
let seq = 0

export default function RulesView({ rules, ads, templates, brands, ready, canEdit }: {
  rules: ReplyRules
  /** The ads conversations came from (Settings › Ads). */
  ads: LeadAd[]
  templates: Array<{ id: string; name: string }>
  brands: LeadBrand[]
  /** Is the migration applied? Before it, the page can be tried but not saved. */
  ready: boolean
  canEdit: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'ad' | 'org'>('ad')
  const [saved, setSaved] = useState(rules)
  const [d, setD] = useState(rules)
  const [dirty, setDirty] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, start] = useTransition()
  useEffect(() => {
    if (!dirty) return
    const ask = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [dirty])

  const edit = (fn: (x: ReplyRules) => ReplyRules) => { setD(fn); setDirty(true); setNote(''); setError('') }
  const replyOpts = [{ v: 'cs', l: 'Person (CS)' }, { v: 'ai', l: 'AI Agent' }, ...templates.map(t => ({ v: t.id, l: `Template · ${t.name}` }))]
  const adName = (id: string) => { const a = ads.find(x => x.adId === id); return a ? (a.name || a.headline || `Ad ${id}`) : `Ad ${id}` }
  const adOpts = ads.map(a => ({
    v: a.adId,
    l: [a.name || a.headline || `Ad ${a.adId}`, a.brandIds.map(b => brands.find(x => x.id === b)?.name).filter(Boolean).join(', '), a.channels.map(c => (c === 'instagram' ? 'Instagram' : 'Messenger')).join(', ')].filter(Boolean).join(' · '),
  }))
  const unruled = ads.filter(a => !d.ads.some(r => r.adId === a.adId)).length
  const dis = !canEdit
  const save = () => start(async () => {
    const r = await saveReplyRules(d.ads, d.pages)
    if (!r.ok) { setError(r.reason); return }
    setSaved(d)
    setDirty(false)
    setNote('Saved · just now')
    router.refresh()
  })

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div className={s.titles}>
          <span className={s.eyebrow}>REPLIES</span>
          <h1 className={s.title}>Reply rules</h1>
        </div>
        <span className={s.status}><span className={s.dot} aria-hidden="true" />Meta not connected · auto replies run in test conversations only</span>
      </div>
      <div className={s.panel}>
        <div className={s.scroll}>
          {!ready ? <div className={s.note}>Waiting for the database update — you can try the page, but nothing is saved yet.</div> : null}
          <div className={s.seg} role="group" aria-label="Rules">
            <button type="button" className={s.segBtn} aria-pressed={tab === 'ad'} onClick={() => setTab('ad')}>By ad</button>
            <button type="button" className={s.segBtn} aria-pressed={tab === 'org'} onClick={() => setTab('org')}>Organic and other ads</button>
          </div>

          {tab === 'ad' ? (
            <>
              <span className={s.kicker}>BY AD</span>
              <div className={s.box}>
                <div className={s.boxHead}>
                  <span className={s.dot} aria-hidden="true" style={{ color: 'rgb(var(--lv-green))' }} />
                  <span>{ads.length} ad{ads.length === 1 ? '' : 's'} customers came from{unruled ? ` · ${unruled} with no rule use the default` : ''}</span>
                  <span className={s.fill} />
                  <Link className={s.link} href="/leads/settings">Names in Settings › Ads ↗</Link>
                </div>
                <div className={s.ruleRow}>
                  <span className={s.ruleHead}>AD</span><span className={s.ruleHead}>WHEN</span><span className={s.ruleHead}>REPLIES WITH</span><span /><span />
                </div>
                {d.ads.map((r, i) => {
                  const known = ads.some(a => a.adId === r.adId)
                  const tpl = templates.some(t => t.id === r.reply)
                  return (
                    <div key={r.id} className={s.ruleRow}>
                      <div style={{ minWidth: 0 }}>
                        <select className={s.select} style={{ width: '100%' }} value={r.adId} disabled={dis} aria-label="Ad"
                          onChange={e => edit(x => ({ ...x, ads: x.ads.map((y, j) => (j === i ? { ...y, adId: e.target.value } : y)) }))}>
                          {!known ? <option value={r.adId}>{adName(r.adId)}</option> : null}
                          {adOpts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                        {ads.find(a => a.adId === r.adId && a.status && !['ACTIVE', ''].includes(a.status)) ? (
                          <div className={s.stopped}>Ad not running in Ads Manager · this rule waits until it runs again. Remove it or pick another ad.</div>
                        ) : null}
                      </div>
                      <select className={s.select} value={r.when} disabled={dis} aria-label="When"
                        onChange={e => edit(x => ({ ...x, ads: x.ads.map((y, j) => (j === i ? { ...y, when: e.target.value as typeof r.when } : y)) }))}>
                        {WHEN.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                      <select className={s.select} value={r.reply} disabled={dis} aria-label="Replies with"
                        onChange={e => edit(x => ({ ...x, ads: x.ads.map((y, j) => (j === i ? { ...y, reply: e.target.value } : y)) }))}>
                        {replyOpts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                      {tpl ? <Link className={s.link} href={`/leads/flows?t=${r.reply}`}>Edit →</Link> : <span className={s.small}>—</span>}
                      {canEdit ? <button type="button" className={s.x} title="Remove" onClick={() => edit(x => ({ ...x, ads: x.ads.filter((_, j) => j !== i) }))}>×</button> : <span />}
                    </div>
                  )
                })}
                {d.ads.length === 0 ? <div className={s.ruleRow}><span className={s.small} style={{ gridColumn: '1 / -1' }}>No ad rules — every conversation uses Organic and other ads.</span></div> : null}
                <div style={{ padding: '8px 12px' }}>
                  {canEdit ? (
                    <button type="button" className={s.link} disabled={ads.length === 0}
                      title={ads.length === 0 ? 'Ads appear here once a conversation comes from one' : undefined}
                      onClick={() => {
                        const free = ads.find(a => !d.ads.some(r => r.adId === a.adId)) ?? ads[0]
                        edit(x => ({ ...x, ads: [...x.ads, { id: `new-${Date.now().toString(36)}${seq++}`, adId: free.adId, when: 'any', reply: 'cs' }] }))
                      }}>+ Add ad rule</button>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <>
              <span className={s.kicker}>ORGANIC MESSAGES AND ADS WITHOUT A RULE</span>
              <div className={s.box}>
                <div className={s.pageRow}><span className={s.ruleHead}>PAGE</span><span className={s.ruleHead}>WORKING HOURS</span><span className={s.ruleHead}>AFTER HOURS</span></div>
                {d.pages.map((p, i) => (
                  <div key={`${p.brandId}-${p.channel}`} className={s.pageRow}>
                    <span className={s.pageName}>
                      <span className={s.ch} data-ch={p.channel}>{p.channel === 'instagram' ? 'IG' : 'FB'}</span>
                      {brands.find(b => b.id === p.brandId)?.name ?? '—'} <span className={s.small}>{p.channel === 'instagram' ? 'Instagram' : 'Messenger'}</span>
                    </span>
                    {(['work', 'after'] as const).map(k => (
                      <span key={k} className={s.withEdit}>
                        <select className={s.select} value={p[k]} disabled={dis} aria-label={k === 'work' ? 'Working hours' : 'After hours'}
                          onChange={e => edit(x => ({ ...x, pages: x.pages.map((y, j) => (j === i ? { ...y, [k]: e.target.value } : y)) }))}>
                          {replyOpts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                        {templates.some(t => t.id === p[k]) ? <Link className={s.link} href={`/leads/flows?t=${p[k]}`} title="Edit">→</Link> : null}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
              <span className={s.small}>Working hours come from Business hours. In the Inbox, CS can take over any conversation at any time.</span>
            </>
          )}
          {error ? <div className={s.error} role="alert">{error}</div> : null}
        </div>
        {canEdit ? (
          <div className={s.foot}>
            <span className={s.hint} data-dirty={dirty || undefined}>{dirty ? 'Unsaved changes' : note || 'No changes yet'}</span>
            <span className={s.fill} />
            <button type="button" className={s.btn} data-quiet="" disabled={!dirty || busy} onClick={() => { setD(saved); setDirty(false) }}>Discard</button>
            <button type="button" className={s.btn} data-strong="" disabled={!dirty || busy || !ready} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
