'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LeadIcon } from '@/components/layout/lead-icons'
import { leadMediaLinks, saveReplyRules, setAdOutlet } from '@/lib/leads/actions'
import type { LeadAd } from '@/lib/leads/ads'
import { adSlots, replyLabel, withAdSlots, type PageChannel, type RuleLogLine, type Slot } from '@/lib/leads/pages'
import { extOf, isImage } from '@/lib/leads/template-map'
import { outletCounts, outletName, outletsFor, passesOutlet, type LeadOutlet, type OutletFilter as Filter } from '@/lib/leads/outlets'
import OutletFilter from './ui/OutletFilter'
import { filesOf, labelOf, walkAnswer, walkFrom, type ReplyRules, type ReplyTemplate, type Walk } from '@/lib/leads/template'
import RichText from './RichText'
import s from './rules.module.css'

/**
 * Lead View v2 › Reply rules (2026-11-02, the v2 handoff §7.5): which reply answers a conversation's first message.
 * PAGES — one row per brand and channel, from Settings › Pages (receiving pages only), working hours / after hours
 * (Working hours decides which, holidays included). ADS — every ad customers came from; an ad with no rule follows its
 * page, and may answer differently in each window. A choice saves at once (lead_save_reply_rules, as a whole); the
 * runner is unchanged — an ad's window is a rule for open / closed, or one any-time rule when both agree.
 * The right rail (collapsed by default) runs the reply as the customer would see it, and lists the rules' history.
 */

type Sel = { kind: 'page'; brandId: string; channel: PageChannel } | { kind: 'ad'; adId: string }
type Pick = { key: string; follow: boolean; x: number; y: number; outlet?: boolean }
const CH: Record<PageChannel, string> = { messenger: 'Messenger', instagram: 'Instagram' }
let seq = 0
const newId = () => `new-${Date.now().toString(36)}${seq++}`

export default function RulesView({ rules, ready, rows, ads, brands, templates, log, canEdit, outlets = [] }: {
  rules: ReplyRules
  ready: boolean
  /** routeRows: each brand's receiving channels. */
  rows: Array<{ brandId: string; brand: string; channels: PageChannel[] }>
  ads: LeadAd[]
  brands: Array<{ id: string; name: string }>
  templates: ReplyTemplate[]
  log: RuleLogLine[]
  canEdit: boolean
  /** Every brand's outlets (v3 § 3; mig 20261110200000) — none before it. */
  outlets?: LeadOutlet[]
}) {
  const router = useRouter()
  const [d, setD] = useState<ReplyRules>(rules)
  const [error, setError] = useState('')
  const [, start] = useTransition()
  const [pagesOpen, setPagesOpen] = useState(true)
  const [adsOpen, setAdsOpen] = useState(true)
  const [adF, setAdF] = useState<'all' | 'none' | 'has'>('all')
  // v3 § 3: the All outlets filter (above the outlet column) and each ad's outlet, kept here as it is saved.
  const [adOut, setAdOut] = useState<Filter>('all')
  const [outOf, setOutOf] = useState<Record<string, string | null>>(() => Object.fromEntries(ads.map(a => [a.adId, a.outletId ?? null])))
  const [hover, setHover] = useState<string | null>(null)
  const [pick, setPick] = useState<Pick | null>(null)
  const [adding, setAdding] = useState(false)
  const [railOpen, setRailOpen] = useState(false)
  const [tab, setTab] = useState<'pv' | 'log'>('pv')
  const first = rows[0]
  // The preview runs the first page until a row is picked; only a picked row is tinted (as the reference does).
  const [picked, setPicked] = useState<Sel | null>(null)
  const sel: Sel | null = picked ?? (first ? { kind: 'page', brandId: first.brandId, channel: first.channels[0] } : null)

  const tpl = (id: string) => templates.find(t => t.id === id)
  const brandName = (id: string) => brands.find(b => b.id === id)?.name ?? '—'
  const pageReply = (brandId: string, channel: PageChannel, w: 'work' | 'after') => d.pages.find(p => p.brandId === brandId && p.channel === channel)?.[w] ?? 'cs'
  const adList = ads
  const adPage = (a: LeadAd) => ({ brandId: a.brandIds[0] ?? '', channel: (a.channels[0] ?? 'messenger') as PageChannel })

  const save = (next: ReplyRules) => {
    setD(next)
    setError('')
    if (!ready) { setError('Waiting for the database update — this is not saved yet.'); return }
    start(async () => {
      const r = await saveReplyRules(next.ads, next.pages)
      if (!r.ok) { setError(r.reason); setD(d); return }
      router.refresh()
    })
  }
  const setPageReply = (brandId: string, channel: PageChannel, w: 'work' | 'after', v: string) => {
    const has = d.pages.some(p => p.brandId === brandId && p.channel === channel)
    const pages = has
      ? d.pages.map(p => (p.brandId === brandId && p.channel === channel ? { ...p, [w]: v } : p))
      : [...d.pages, { brandId, channel, work: 'cs', after: 'cs', [w]: v }]
    save({ ...d, pages })
  }
  const setAd = (adId: string, w: Slot, a: Slot) => save({ ...d, ads: withAdSlots(d.ads, adId, w, a, newId) })

  const open = (key: string, follow: boolean, outlet = false) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    setPick({ key, follow, outlet, x: Math.min(r.left, window.innerWidth - 250), y: Math.min(r.bottom + 6, window.innerHeight - 320) })
  }
  /** An ad's outlet, saved at once (lead_set_ad_outlet); the screen follows first and goes back on a refusal. */
  const chooseOutlet = (adId: string, outletId: string | null) => {
    setPick(null)
    const before = outOf[adId] ?? null
    if (before === outletId) return
    setOutOf(m => ({ ...m, [adId]: outletId }))
    setError('')
    start(async () => {
      const r = await setAdOutlet(adId, outletId)
      if (!r.ok) { setError(r.reason); setOutOf(m => ({ ...m, [adId]: before })); return }
      router.refresh()
    })
  }
  const [newRule, setNewRule] = useState<{ ad: string; w: Slot; a: Slot }>({ ad: '', w: 'cs', a: templates[0]?.id ?? 'cs' })
  const current = (key: string): Slot => {
    const [t, ...rest] = key.split('|')
    if (t === 'page') return pageReply(rest[0], rest[1] as PageChannel, rest[2] as 'work' | 'after')
    if (t === 'new') return rest[0] === 'w' ? newRule.w : newRule.a
    const slots = adSlots(d.ads, rest[0])
    return rest[1] === 'w' ? slots.w : slots.a
  }
  const choose = (key: string, v: Slot) => {
    setPick(null)
    const [t, ...rest] = key.split('|')
    if (t === 'page') return setPageReply(rest[0], rest[1] as PageChannel, rest[2] as 'work' | 'after', v as string)
    if (t === 'new') return setNewRule(n => ({ ...n, [rest[0]]: v }))
    const slots = adSlots(d.ads, rest[0])
    setAd(rest[0], rest[1] === 'w' ? v : slots.w, rest[1] === 'a' ? v : slots.a)
  }

  // The outlet picked above the outlet column (All outlets, one, or No outlet): the counts and the list follow it.
  const counted = adList.filter(a => passesOutlet(adOut, outOf[a.adId])).map(a => ({ a, has: d.ads.some(r => r.adId === a.adId) }))
  const aoCounts = outletCounts(adList, a => outOf[a.adId])
  const shown = counted.filter(x => adF === 'all' || (adF === 'has' ? x.has : !x.has))
  const free = adList.filter(a => !d.ads.some(r => r.adId === a.adId))
  const newAd = free.some(a => a.adId === newRule.ad) ? newRule.ad : (free[0]?.adId ?? '')
  const adLabel = (a: LeadAd) => a.name || a.headline || `Ad ${a.adId}`
  const adMeta = (a: LeadAd) => [a.brandIds.map(brandName).join(', '), a.channels.map(c => CH[c]).join(', ')].filter(Boolean).join(' · ')

  const chip = (v: Slot, key: string, follow: boolean, followOf?: string) => {
    const isFollow = v === 'follow'
    const shownV = isFollow ? (followOf ?? 'cs') : v
    const k = shownV === 'ai' ? 'ai' : shownV === 'cs' ? 'cs' : 'tpl'
    return (
      <button type="button" className={s.chip} data-follow={isFollow || undefined} disabled={!canEdit} onClick={open(key, follow)} aria-haspopup="menu">
        <span className={s.chipIcon} data-k={isFollow ? undefined : k}>
          <LeadIcon name={isFollow ? 'corner-down-right' : k === 'ai' ? 'sparkles' : k === 'cs' ? 'headset' : 'workflow'} size={15} />
        </span>
        {replyLabel(shownV, templates)}
        <LeadIcon name="chevron-down" size={13} className={s.chev} />
      </button>
    )
  }
  const pickSel = (x: Sel) => { setPicked(x); setRailOpen(true); setTab('pv') }
  const isSel = (x: Sel) => !!picked && picked.kind === x.kind && (x.kind === 'ad' ? picked.kind === 'ad' && picked.adId === x.adId : picked.kind === 'page' && picked.brandId === x.brandId && picked.channel === x.channel)
  const colHeads = (
    <>
      <span className={s.colHead}><LeadIcon name="sun" size={13} />Working hours</span>
      <span className={s.colHead}><LeadIcon name="moon" size={13} />After hours<span className={s.tip} title="Includes public holidays. Set them in Working hours."><LeadIcon name="info" size={12} /></span></span>
    </>
  )

  return (
    <div className={s.grid} style={{ gridTemplateColumns: `minmax(0, 1fr) ${railOpen ? '380px' : '48px'}` }}>
      <div className={s.left}>
        <section className={s.card} aria-label="Pages">
          <div className={s.head}>
            <button type="button" className={s.fold} onClick={() => setPagesOpen(o => !o)} aria-expanded={pagesOpen}>
              <span className={s.foldIcon}><LeadIcon name={pagesOpen ? 'chevron-down' : 'chevron-right'} size={16} /></span>
              <span className={s.title}>Pages</span>
            </button>
            <span />
            {colHeads}
            <span />
          </div>
          {pagesOpen ? rows.map(g => (
            <div key={g.brandId} className={s.brand}>
              <span className={s.brandName}>{g.brand}</span>
              {g.channels.map(ch => {
                const x: Sel = { kind: 'page', brandId: g.brandId, channel: ch }
                return (
                  <div key={ch} className={s.pageRow} role="option" aria-selected={isSel(x)} tabIndex={0} onClick={() => pickSel(x)} onKeyDown={e => { if (e.key === 'Enter') pickSel(x) }}>
                    <span className={s.channel}><LeadIcon name={ch === 'instagram' ? 'instagram' : 'facebook'} size={15} />{CH[ch]}</span>
                    <span />
                    {chip(pageReply(g.brandId, ch, 'work'), `page|${g.brandId}|${ch}|work`, false)}
                    {chip(pageReply(g.brandId, ch, 'after'), `page|${g.brandId}|${ch}|after`, false)}
                    <span />
                  </div>
                )
              })}
              <div className={s.brandEnd} />
            </div>
          )) : null}
          {pagesOpen && !rows.length ? <div className={s.empty}>No page is receiving messages yet — connect one in Settings.</div> : null}
        </section>

        <section className={s.card} aria-label="Ads">
          <div className={s.adsHead}>
            <span className={s.titleRow}>
              <button type="button" className={s.fold} onClick={() => setAdsOpen(o => !o)} aria-expanded={adsOpen}>
                <span className={s.foldIcon}><LeadIcon name={adsOpen ? 'chevron-down' : 'chevron-right'} size={16} /></span>
                <span className={s.title}>Ads</span>
              </button>
              <span className={s.seg} role="group" aria-label="Show">
                {([['all', 'All'], ['none', 'No rule'], ['has', 'Has rule']] as const).map(([k, l]) => (
                  <button key={k} type="button" className={s.segBtn} aria-pressed={adF === k} onClick={() => setAdF(k)}>
                    {l}<span className={s.segN}>{k === 'all' ? counted.length : counted.filter(x => (k === 'has' ? x.has : !x.has)).length}</span>
                  </button>
                ))}
              </span>
            </span>
            <OutletFilter size="sm" outlets={outlets} brands={brands} value={adOut} onChange={setAdOut} counts={aoCounts} />
            {colHeads}
            <span className={s.addCell}>
              {canEdit ? <button type="button" className={s.addRule} disabled={!free.length} title={free.length ? undefined : 'Every ad already has a rule'} onClick={() => { setNewRule({ ad: '', w: 'cs', a: templates[0]?.id ?? 'cs' }); setAdding(true) }}><LeadIcon name="plus" size={13} />Add</button> : null}
            </span>
          </div>
          {adsOpen ? shown.map(({ a, has }) => {
            const slots = adSlots(d.ads, a.adId)
            const pg = adPage(a)
            const x: Sel = { kind: 'ad', adId: a.adId }
            return (
              <div key={a.adId} className={s.adRow} role="option" aria-selected={isSel(x)} tabIndex={0} onClick={() => pickSel(x)} onKeyDown={e => { if (e.key === 'Enter') pickSel(x) }}
                onMouseEnter={() => setHover(a.adId)} onMouseLeave={() => setHover(h => (h === a.adId ? null : h))}>
                <span className={s.adName}>
                  <span className={s.adTitle}>
                    <span className={s.adTitleText}>{adLabel(a)}</span>
                    {a.postUrl ? (
                      // The ad as the customer saw it (2026-11-02 — the user: "点小箭头就导入到看该广告"): its Facebook post.
                      <a className={s.adOpen} href={a.postUrl} target="_blank" rel="noopener noreferrer" title="View the ad on Facebook" aria-label={`View the ad ${adLabel(a)} on Facebook`}>
                        <LeadIcon name="external-link" size={13} />
                      </a>
                    ) : null}
                  </span>
                  <span className={s.adMeta}>{adMeta(a)}</span>
                </span>
                <button type="button" className={s.outBtn} data-none={!outOf[a.adId] || undefined} disabled={!canEdit} onClick={open('ad|' + a.adId, false, true)} aria-haspopup="menu">
                  <span className={s.outPin}><LeadIcon name="map-pin" size={15} /></span>
                  <span className={s.outName}>{outletName(outlets, outOf[a.adId]) || 'Choose outlet'}</span>
                  <LeadIcon name="chevron-down" size={13} className={s.outChev} />
                </button>
                {chip(slots.w, `ad|${a.adId}|w`, true, pageReply(pg.brandId, pg.channel, 'work'))}
                {chip(slots.a, `ad|${a.adId}|a`, true, pageReply(pg.brandId, pg.channel, 'after'))}
                {has && canEdit && (hover === a.adId || isSel(x)) ? (
                  <button type="button" className={s.trash} title="Remove rule" aria-label="Remove rule" onClick={e => { e.stopPropagation(); setAd(a.adId, 'follow', 'follow') }}>
                    <LeadIcon name="trash-2" size={15} />
                  </button>
                ) : <span />}
              </div>
            )
          }) : null}
          {adsOpen && !shown.length ? <div className={s.empty}>{adList.length ? 'No ads here.' : 'No customer has come from an ad yet.'}</div> : null}
        </section>
        {error ? <div className={s.error} role="alert">{error}</div> : null}
      </div>

      <section className={s.rail} aria-label="Side panel">
        {railOpen ? (
          <>
            <div className={s.railHead}>
              <div className={s.tabs} role="group" aria-label="Panel">
                <button type="button" className={s.tab} aria-pressed={tab === 'pv'} onClick={() => setTab('pv')}>Preview</button>
                <button type="button" className={s.tab} aria-pressed={tab === 'log'} onClick={() => setTab('log')}>Audit log</button>
              </div>
              <span className={s.fill} />
              <button type="button" className={s.close} title="Collapse" aria-label="Collapse" onClick={() => setRailOpen(false)}><LeadIcon name="panel-right-close" size={16} /></button>
            </div>
            {tab === 'pv' ? (
              sel ? <Preview sel={sel} d={d} ads={adList} brandName={brandName} tpl={tpl} /> : <div className={s.logEmpty}>Pick a page or an ad.</div>
            ) : (
              <div className={s.log}>
                {log.map(l => (
                  <div key={l.id} className={s.logRow}>
                    <span className={s.logWhat}>{l.what}</span>
                    <span className={s.logBy}>{l.by} · {stamp(l.at)}</span>
                  </div>
                ))}
                {!log.length ? <div className={s.logEmpty}>No changes yet.</div> : null}
              </div>
            )}
          </>
        ) : (
          <div className={s.railShut}>
            <button type="button" className={s.railBtn} title="Preview" aria-label="Preview" onClick={() => { setRailOpen(true); setTab('pv') }}><LeadIcon name="smartphone" size={16} /></button>
            <button type="button" className={s.railBtn} title="Audit log" aria-label="Audit log" onClick={() => { setRailOpen(true); setTab('log') }}><LeadIcon name="history" size={16} /></button>
          </div>
        )}
      </section>

      {pick ? (
        <>
          <div className={s.catcher} onClick={() => setPick(null)} aria-hidden="true" />
          <div className={s.picker} role="menu" style={{ left: pick.x, top: pick.y }}>
            {(() => {
              if (pick.outlet) {
                const adId = pick.key.split('|')[1]
                const ad = adList.find(a => a.adId === adId)
                const now = outOf[adId] ?? null
                const brand = ad ? brandName(ad.brandIds[0] ?? '') : ''
                const oi = (label: string, v: string | null) => (
                  <button key={v ?? 'none'} type="button" role="menuitemradio" aria-checked={now === v} className={s.pickItem} onClick={() => chooseOutlet(adId, v)}>
                    <span>{label}</span>{now === v ? <span className={s.pickCheck}><LeadIcon name="check" size={14} /></span> : null}
                  </button>
                )
                return (
                  <>
                    <span className={s.pickHead}>{(brand + ' OUTLETS').trim().toUpperCase()}</span>
                    {outletsFor(outlets, ad?.brandIds[0]).map(o => oi(o.name, o.id))}
                    {oi('No outlet', null)}
                  </>
                )
              }
              const cur = current(pick.key)
              const item = (label: string, v: Slot) => (
                <button key={v} type="button" role="menuitemradio" aria-checked={cur === v} className={s.pickItem} onClick={() => choose(pick.key, v)}>
                  <span>{label}</span>{cur === v ? <span className={s.pickCheck}><LeadIcon name="check" size={14} /></span> : null}
                </button>
              )
              return (
                <>
                  {pick.follow ? item(pick.key.startsWith('ad|') ? 'Follow outlet or page' : 'Follow page rule', 'follow') : null}
                  {item('A person', 'cs')}
                  {item('AI Agent', 'ai')}
                  {templates.length ? <span className={s.pickHead}>TEMPLATES</span> : null}
                  {templates.map(t => item(t.name, t.id))}
                </>
              )
            })()}
          </div>
        </>
      ) : null}

      {adding ? (
        <>
          <div className={s.backdrop} onClick={() => setAdding(false)} aria-hidden="true" />
          <div className={s.modal} role="dialog" aria-modal="true" aria-label="Add ad rule">
            <div className={s.mHead}>
              <h2 className={s.mTitle}>Add ad rule</h2>
              <button type="button" className={s.mX} aria-label="Close" onClick={() => setAdding(false)}><LeadIcon name="x" size={16} /></button>
            </div>
            <label className={s.mField}>Ad
              <select value={newAd} onChange={e => setNewRule(n => ({ ...n, ad: e.target.value }))}>
                {free.length ? free.map(a => <option key={a.adId} value={a.adId}>{adLabel(a)} · {a.brandIds.map(brandName).join(', ')}</option>) : <option value="">Every ad already has a rule</option>}
              </select>
            </label>
            <div className={s.mPair}>
              <div className={s.mField}><span className={s.mLabel}><LeadIcon name="sun" size={13} />Working hours</span>{chip(newRule.w, 'new|w', true)}</div>
              <div className={s.mField}><span className={s.mLabel}><LeadIcon name="moon" size={13} />After hours<span className={s.tip} title="Includes public holidays. Set them in Working hours."><LeadIcon name="info" size={12} /></span></span>{chip(newRule.a, 'new|a', true)}</div>
            </div>
            <div className={s.mFoot}>
              <button type="button" className={s.mCancel} onClick={() => setAdding(false)}>Cancel</button>
              <button type="button" className={s.mAdd} disabled={!newAd} onClick={() => { setAd(newAd, newRule.w, newRule.a); setAdding(false) }}>Add rule</button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

const stamp = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kuala_Lumpur' }).replace(',', '')

type Line = { k: 'cust' | 'bot' | 'img' | 'vid' | 'file' | 'btns' | 'wait'; text: string; by?: string; btns?: string[]; url?: string }

/** The preview (README §7.5): the chosen reply, run step by step as the customer would see it. */
function Preview({ sel, d, ads, brandName, tpl }: {
  sel: Sel
  d: ReplyRules
  ads: LeadAd[]
  brandName: (id: string) => string
  tpl: (id: string) => ReplyTemplate | undefined
}) {
  const [time, setTime] = useState<'w' | 'a'>('w')
  const [dev, setDev] = useState<'phone' | 'desk'>('phone')
  const scroll = useRef<HTMLDivElement>(null)
  const ad = sel.kind === 'ad' ? ads.find(a => a.adId === sel.adId) : undefined
  const brandId = sel.kind === 'page' ? sel.brandId : ad?.brandIds[0] ?? ''
  const channel: PageChannel = sel.kind === 'page' ? sel.channel : (ad?.channels[0] ?? 'messenger')
  const page = d.pages.find(p => p.brandId === brandId && p.channel === channel)
  const pageV = (time === 'w' ? page?.work : page?.after) ?? 'cs'
  const slot = sel.kind === 'ad' ? (time === 'w' ? adSlots(d.ads, sel.adId).w : adSlots(d.ads, sel.adId).a) : pageV
  const v = slot === 'follow' ? pageV : slot
  const brand = brandName(brandId)
  const title = sel.kind === 'page' ? `${brand} · ${CH[channel]}` : (ad?.name || ad?.headline || `Ad ${sel.kind === 'ad' ? sel.adId : ''}`)
  // The template's photos and videos as the customer sees them, first (2026-11-11): an hour's signed links.
  const [links, setLinks] = useState<Record<string, string>>({})
  const want = useMemo(() => { const t = v && v !== 'cs' && v !== 'ai' ? tpl(v) : undefined; return [...new Set((t?.steps ?? []).flatMap(x => filesOf(x).map(f => f.path)))].filter(x => !links[x]).sort().join('|') }, [v, tpl, links])
  useEffect(() => {
    if (!want) return
    let live = true
    leadMediaLinks(want.split('|')).then(r => { if (live && r.ok) setLinks(l => ({ ...l, ...r.data })) })
    return () => { live = false }
  }, [want])
  const runKey = `${JSON.stringify(sel)}|${time}|${v}`
  const [run, setRun] = useState<{ key: string; picks: string[] }>({ key: runKey, picks: [] })
  const picks = useMemo(() => (run.key === runKey ? run.picks : []), [run, runKey])
  const add = (p: string) => setRun({ key: runKey, picks: [...picks, p] })
  const restart = () => setRun({ key: runKey, picks: [] })

  const lines = useMemo<Line[]>(() => {
    const out: Line[] = [{ k: 'cust', text: sel.kind === 'ad' ? 'Hi, I saw your ad. Is this still available?' : 'Hi, do you have this in stock?' }]
    if (v === 'cs') {
      out.push({ k: 'wait', text: time === 'w' ? 'Waiting for CS to reply' : 'Waiting for CS · replies when the team is back' })
      return out
    }
    if (v === 'ai') {
      out.push({ k: 'bot', text: `Hi! Thanks for messaging ${brand}. Happy to help. What are you looking for today?`, by: '✦ AI Agent' })
      for (const p of picks) { out.push({ k: 'cust', text: p }); out.push({ k: 'bot', text: 'Sure, let me check that for you.', by: '✦ AI Agent' }) }
      if (!picks.length) out.push({ k: 'btns', text: '', btns: ['Sofa', 'Delivery fee'] })
      return out
    }
    const t = tpl(v)
    if (!t || !t.steps.length) { out.push({ k: 'wait', text: 'This template has no steps yet' }); return out }
    const by = `Template · ${t.name}`
    let w: Walk = walkFrom(t, t.steps[0].id)
    for (const p of picks) { if (!w.waiting) break; w = walkAnswer(t, w, p) }
    for (const x of w.said) {
      if (x.from === 'customer') out.push({ k: 'cust', text: x.text })
      else if (x.from === 'system') out.push({ k: 'wait', text: x.text.startsWith('Goes to the AI') ? 'AI Agent takes over' : x.text.startsWith('Goes to a person') ? 'Handed to a person' : x.text })
      else if (x.file) out.push({ k: isImage(x.file.mime) ? 'img' : x.file.mime.startsWith('video/') && links[x.file.path] ? 'vid' : 'file', text: x.file.name, url: links[x.file.path] })
      else out.push({ k: 'bot', text: x.text.replace(/\{name\}/g, 'Jason'), by })
    }
    const waiting = w.waiting ? t.steps.find(x => x.id === w.waiting) : undefined
    if (waiting?.kind === 'question') {
      const shownBtns = [...w.said].reverse().find(x => x.from === 'bot' && x.buttons)?.buttons ?? (waiting.buttons ?? []).map(b => labelOf(b))
      out.push({ k: 'btns', text: '', btns: waiting.multi ? [...shownBtns, waiting.doneLabel || 'That’s all'] : shownBtns })
    } else if (waiting?.kind === 'phone') out.push({ k: 'btns', text: '', btns: ['Send my number'] })
    else if (waiting?.kind === 'text') out.push({ k: 'btns', text: '', btns: ['Type an answer'] })
    return out
  }, [sel.kind, v, time, brand, picks, tpl, links])
  const answer = (b: string) => add(b === 'Send my number' ? '012-338 4721' : b === 'Type an answer' ? 'Next Saturday afternoon' : b)
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }) }, [lines, dev])

  const body = (desk: boolean) => (
    <div ref={scroll} className={s.msgs} data-desk={desk || undefined}>
      <div className={s.spacer} />
      {lines.map((m, i) => m.k === 'cust' ? <div key={i} className={s.cust}>{m.text}</div>
        : m.k === 'bot' ? <div key={i} className={s.bot}><div className={s.botText}><RichText text={m.text} /></div><span className={s.by}>{m.by}</span></div>
        : m.k === 'img' ? <span key={i} className={s.img} style={{ backgroundImage: m.url ? `url("${m.url}")` : undefined }} role="img" aria-label={m.text} />
        : m.k === 'vid' ? <video key={i} className={s.vid} src={m.url} controls preload="metadata" aria-label={m.text} />
        : m.k === 'file' ? <div key={i} className={s.fileMsg}><span className={s.fileTag}>{extOf(m.text)}</span>{m.text}</div>
        : m.k === 'btns' ? <div key={i} className={s.btns}>{m.btns!.map(b => <button key={b} type="button" className={s.btn} onClick={() => answer(b)}>{b}</button>)}</div>
        : <span key={i} className={s.wait}>{m.text}</span>)}
    </div>
  )
  return (
    <div className={s.pvBody}>
      <div className={s.ctl}>
        <div className={s.ctlTop}>
          <span className={s.ctlTitle}>{title}</span>
          <button type="button" className={s.restart} title="Restart" aria-label="Restart" onClick={restart}><LeadIcon name="rotate-ccw" size={14} /></button>
        </div>
        <div className={s.ctlRow}>
          <div className={s.times} role="group" aria-label="Time">
            <button type="button" className={s.time} aria-pressed={time === 'w'} onClick={() => setTime('w')}><LeadIcon name="sun" size={13} />Working hours</button>
            <button type="button" className={s.time} aria-pressed={time === 'a'} onClick={() => setTime('a')}><LeadIcon name="moon" size={13} />After hours</button>
          </div>
          <div className={s.devs} role="group" aria-label="Device">
            <button type="button" className={s.dev} title="Phone" aria-label="Phone" aria-pressed={dev === 'phone'} onClick={() => setDev('phone')}><LeadIcon name="smartphone" size={14} /></button>
            <button type="button" className={s.dev} title="Desktop" aria-label="Desktop" aria-pressed={dev === 'desk'} onClick={() => setDev('desk')}><LeadIcon name="monitor" size={14} /></button>
          </div>
        </div>
      </div>
      {dev === 'phone' ? (
        <div className={s.phone}>
          <div className={s.status}><span>9:41</span><span className={s.notch} /><span /></div>
          <div className={s.pHead}>
            <LeadIcon name="chevron-left" size={16} />
            <span className={s.av}>H</span>
            <div className={s.pWho}><span className={s.pBrand}>{brand}</span><span className={s.pCh}>{CH[channel]}</span></div>
          </div>
          {body(false)}
          <div className={s.composer}><span>Message…</span><LeadIcon name="send" size={15} /></div>
          <div className={s.home}><span /></div>
        </div>
      ) : (
        <div className={s.desk}>
          <div className={s.dBar}><span className={s.dDot} /><span className={s.dDot} /><span className={s.dDot} /><span className={s.dBarTitle}>{CH[channel]}</span></div>
          <div className={s.dHead}>
            <span className={s.av} data-desk="">H</span>
            <div className={s.dWho}><span className={s.pBrand}>{brand}</span><span className={s.dSub}>Typically replies within minutes</span></div>
          </div>
          {body(true)}
          <div className={s.dComposer}>Aa</div>
        </div>
      )}
    </div>
  )
}
