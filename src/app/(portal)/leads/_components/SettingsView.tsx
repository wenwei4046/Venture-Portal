'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { LeadIcon, type LeadIconName } from '@/components/layout/lead-icons'
import { connectPage, disconnectPage, saveAgentBrands, fetchAdNames, listManagedPages, nameAd, saveLeadBrand, sendTestEnquiry, setPage } from '@/lib/leads/actions'
import { adsManagerLink, type LeadAd } from '@/lib/leads/ads'
import { STATE_LABEL, connectable, replyLabel, followersLabel, pageName, pageState, type LeadPage, type ManagedPage, type PageChannel } from '@/lib/leads/pages'
import type { ReplyRules } from '@/lib/leads/template'
import type { LeadBrand } from '@/lib/leads/types'
import Modal from './ui/Modal'
import s from './settings.module.css'

/**
 * Lead View v2 › Settings (2026-11-02, the v2 handoff §7.14; mig 20261102110000): how Facebook Pages and Instagram
 * accounts come into the Inbox. Pages (grouped by brand: Receiving / Paused / Reconnect; pause, move to a brand,
 * disconnect) and Brands (rename, add). Connect page offers the system user's own Pages — the user's answer to
 * "Meta OAuth or the system user's Pages" — and gives Reply rules that brand and channel's row with the first reply.
 * Kept though the reference does not draw them (the user's point 2): Ads (naming an ad, Fetch names from Meta) and
 * the Test enquiry, as two more sections under the drawn two.
 */

type View = 'pages' | 'brands' | 'team' | 'ads' | 'test'
const CH_SUB: Record<PageChannel, string> = { messenger: 'Messenger', instagram: 'Instagram' }

export default function SettingsView({ brands, pages, ready, managed, rules, templates, ads, canManage, canTest, team }: {
  brands: LeadBrand[]
  pages: LeadPage[]
  /** Is mig 20261102110000 applied? Before it the pages are read off the brands and nothing about them saves. */
  ready: boolean
  /** The system user's Pages, or null when Meta was not asked (no token / no answer). */
  managed: ManagedPage[] | null
  rules: ReplyRules | null
  templates: Array<{ id: string; name: string }>
  ads: LeadAd[] | null
  canManage: boolean
  canTest: boolean
  /** Settings › Team: the CS people and the brands each handles (none = every brand); null when it could not be read. */
  team: Array<{ id: string; name: string; brandIds: string[] }> | null
}) {
  const router = useRouter()
  const [view, setView] = useState<View>('pages')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [selB, setSelB] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [, start] = useTransition()
  const [error, setError] = useState('')

  const ql = q.trim().toLowerCase()
  const brandName = (id: string) => brands.find(b => b.id === id)?.name ?? '—'
  const visP = pages.filter(p => !ql || `${pageName(p, managed)} ${brandName(p.brandId)}`.toLowerCase().includes(ql))
  const selP = visP.find(p => p.id === sel) ?? visP[0] ?? null
  const visB = brands.filter(b => !ql || b.name.toLowerCase().includes(ql))
  const selBrand = visB.find(b => b.id === selB) ?? visB[0] ?? null
  const bad = pages.filter(p => pageState(p, managed) === 'reconnect').length

  const go = (v: View) => { setView(v); setQ(''); setError('') }
  const run = (fn: () => Promise<{ ok: boolean; reason?: string }>, done?: () => void) => start(async () => {
    setError('')
    const r = await fn()
    if (!r.ok) { setError(r.reason ?? 'That did not go through.'); return }
    done?.()
    router.refresh()
  })
  const addBrand = () => {
    let n = 'New brand'
    for (let i = 2; brands.some(b => b.name.toLowerCase() === n.toLowerCase()); i++) n = `New brand ${i}`
    start(async () => {
      setError('')
      const r = await saveLeadBrand(null, { name: n })
      if (!r.ok) { setError(r.reason); return }
      setSelB(r.data)
      router.refresh()
    })
  }

  const nav: Array<{ v: View; l: string; icon: LeadIconName; n: string; bad?: boolean; sep?: boolean }> = [
    { v: 'pages', l: 'Pages', icon: 'radio-tower', n: bad ? `${bad} !` : String(pages.length), bad: bad > 0 },
    { v: 'brands', l: 'Brands', icon: 'store', n: String(brands.length) },
    { v: 'team', l: 'Team', icon: 'users', n: team ? String(team.length) : '' },
    { v: 'ads', l: 'Ads', icon: 'megaphone', n: ads ? String(ads.length) : '', sep: true },
    { v: 'test', l: 'Test enquiry', icon: 'send', n: '' },
  ]
  const wide = view === 'test'

  return (
    <div className={s.wrap}>
      <section className={s.board} data-wide={wide || undefined}>
        <div className={s.nav}>
          {nav.map(n => (
            <div key={n.v} style={{ display: 'contents' }}>
              {n.sep ? <span className={s.navSep} aria-hidden="true" /> : null}
              <button type="button" className={s.navBtn} aria-pressed={view === n.v} onClick={() => go(n.v)}>
                <LeadIcon name={n.icon} size={16} className={s.navIcon} />
                <span className={s.navLabel}>{n.l}</span>
                <span className={s.navCount} data-bad={n.bad || undefined}>{n.n}</span>
              </button>
            </div>
          ))}
        </div>

        {view === 'pages' || view === 'brands' ? (
          <>
            <div className={s.mid}>
              <div className={s.midHead}>
                <div className={s.search}>
                  <LeadIcon name="search" size={15} />
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder={view === 'pages' ? 'Search pages' : 'Search brands'} aria-label={view === 'pages' ? 'Search pages' : 'Search brands'} />
                </div>
                {canManage ? (
                  <button type="button" className={s.add} disabled={view === 'pages' && !ready} title={view === 'pages' && !ready ? 'Waiting for the database update' : undefined}
                    onClick={() => (view === 'pages' ? setConnecting(true) : addBrand())}>
                    <LeadIcon name="plus" size={15} />{view === 'pages' ? 'Connect page' : 'Add brand'}
                  </button>
                ) : null}
              </div>
              <div className={s.list}>
                {view === 'pages' ? (
                  brands.map(b => {
                    const rows = visP.filter(p => p.brandId === b.id)
                    if (!rows.length) return null
                    return (
                      <div key={b.id} className={s.group}>
                        <span className={s.kicker}>{b.name.toUpperCase()}</span>
                        {rows.map(p => {
                          const st = pageState(p, managed)
                          return (
                            <div key={p.id} className={s.row} role="option" aria-selected={selP?.id === p.id} tabIndex={0} onClick={() => setSel(p.id)} onKeyDown={e => { if (e.key === 'Enter') setSel(p.id) }}>
                              <Tile ch={p.channel} />
                              <div className={s.rowText}><span className={s.rowName}>{pageName(p, managed)}</span><span className={s.rowSub}>{CH_SUB[p.channel]}</span></div>
                              <span className={s.state} data-st={st}>{STATE_LABEL[st]}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })
                ) : (
                  visB.map(b => {
                    const n = pages.filter(p => p.brandId === b.id).length
                    return (
                      <div key={b.id} className={s.brandRow} role="option" aria-selected={selBrand?.id === b.id} tabIndex={0} onClick={() => setSelB(b.id)} onKeyDown={e => { if (e.key === 'Enter') setSelB(b.id) }}>
                        <span className={s.ini} aria-hidden="true">{b.name.slice(0, 1).toUpperCase()}</span>
                        <div className={s.rowText}><span className={s.rowName}>{b.name}</span><span className={s.rowSub}>{n} {n === 1 ? 'page' : 'pages'}</span></div>
                      </div>
                    )
                  })
                )}
                {(view === 'pages' ? !visP.length : !visB.length) ? <div className={s.empty}>Nothing here</div> : null}
              </div>
            </div>
            <div className={s.side}>
              {view === 'pages' && selP ? (
                <PageDetail key={selP.id} page={selP} brands={brands} managed={managed} rules={rules} templates={templates} canEdit={canManage && ready}
                  error={error} run={run} onGone={() => setSel(null)} />
              ) : null}
              {view === 'brands' && selBrand ? (
                <BrandDetail key={selBrand.id} brand={selBrand} pages={pages.filter(p => p.brandId === selBrand.id)} managed={managed} canEdit={canManage} error={error}
                  onRename={name => run(() => saveLeadBrand(selBrand.id, { name }))} onOpen={id => { setView('pages'); setQ(''); setSel(id) }} />
              ) : null}
            </div>
          </>
        ) : view === 'team' ? (
          <TeamPanel team={team} brands={brands} canManage={canManage} />
        ) : view === 'ads' ? (
          <AdsSection ads={ads} brands={brands} canManage={canManage} />
        ) : (
          <TestSection brands={brands} canTest={canTest} />
        )}
      </section>
      {connecting ? (
        <ConnectWindow brands={brands} pages={pages} onClose={() => setConnecting(false)}
          onDone={(id, name) => { setConnecting(false); setView('pages'); setSel(id); flash(`${name} connected. New messages will come into the Inbox.`, 3000); router.refresh() }} />
      ) : null}
    </div>
  )
}

function Tile({ ch, size }: { ch: PageChannel; size?: 30 | 40 }) {
  return (
    <span className={s.tile} data-ch={ch} data-size={size} aria-hidden="true">
      <LeadIcon name={ch === 'instagram' ? 'instagram' : 'facebook'} size={16} />
    </span>
  )
}

function PageDetail({ page, brands, managed, rules, templates, canEdit, error, run, onGone }: {
  page: LeadPage
  brands: LeadBrand[]
  managed: ManagedPage[] | null
  rules: ReplyRules | null
  templates: Array<{ id: string; name: string }>
  canEdit: boolean
  error: string
  run: (fn: () => Promise<{ ok: boolean; reason?: string }>, done?: () => void) => void
  onGone: () => void
}) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [checking, startCheck] = useTransition()
  const [checkErr, setCheckErr] = useState('')
  const st = pageState(page, managed)
  const row = rules?.pages.find(r => r.brandId === page.brandId && r.channel === page.channel)
  const connected = page.connectedByName
    ? `${page.connectedByName} · ${new Date(page.connectedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' })}`
    : '—'
  const reconnect = () => startCheck(async () => {
    setCheckErr('')
    const r = await listManagedPages()
    const back = r.ok && r.data.some(m => (page.channel === 'messenger' ? m.id : m.ig?.id) === page.externalId)
    if (!back) setCheckErr(r.ok ? 'The system user still cannot reach this page — assign it to the system user in Business Settings, then try again.' : r.reason)
    router.refresh()
  })
  return (
    <div className={s.detail}>
      <div className={s.dHead}>
        <Tile ch={page.channel} size={40} />
        <div className={s.dTitles}>
          <span className={s.dName}>{pageName(page, managed)}</span>
          <span className={s.dSub}>{page.channel === 'instagram' ? 'Instagram' : 'Facebook Page · Messenger'}</span>
        </div>
        <button type="button" className={s.pill} data-st={st} title="Pause / resume" disabled={!canEdit || st === 'reconnect'}
          onClick={() => run(() => setPage(page.id, { paused: !page.paused }))}>{STATE_LABEL[st]}</button>
      </div>
      {st === 'reconnect' ? (
        <div className={s.expired}>
          <span>Access expired. New messages are not coming in.</span>
          <button type="button" className={s.rustBtn} onClick={reconnect} disabled={checking}>{checking ? 'Checking…' : 'Reconnect'}</button>
        </div>
      ) : null}
      {checkErr ? <span className={s.error} role="alert">{checkErr}</span> : null}
      <div className={s.sect}>
        <span className={s.sectKicker}>BRAND</span>
        <div className={s.chips}>
          {brands.map(b => (
            <button key={b.id} type="button" className={s.chip} aria-pressed={b.id === page.brandId} disabled={!canEdit}
              onClick={() => { if (b.id !== page.brandId) run(() => setPage(page.id, { brandId: b.id })) }}>{b.name}</button>
          ))}
        </div>
      </div>
      <div className={s.sect}>
        <div className={s.sectHead}>
          <span className={s.sectKicker}>REPLIES</span>
          <Link className={s.link} href="/leads/rules">Reply rules<LeadIcon name="arrow-up-right" size={12} /></Link>
        </div>
        <div className={s.kv}>
          <div className={s.kvRow}><span>Working hours</span><span>{replyLabel(row?.work, templates)}</span></div>
          <div className={s.kvRow}><span>After hours</span><span>{replyLabel(row?.after, templates)}</span></div>
        </div>
      </div>
      <div className={s.sect}>
        <span className={s.sectKicker}>DETAILS</span>
        <div className={s.kv}>
          <div className={s.kvRow}><span>{page.channel === 'instagram' ? 'Account ID' : 'Page ID'}</span><span>{page.externalId}</span></div>
          <div className={s.kvRow}><span>Connected by</span><span>{connected}</span></div>
          <div className={s.kvRow}><span>Access</span><span>{st === 'reconnect' ? 'Expired' : managed ? 'Through the system user' : 'Not checked'}</span></div>
        </div>
      </div>
      {error ? <span className={s.error} role="alert">{error}</span> : null}
      {canEdit ? (asking ? (
        <div className={s.ask}>
          <span>Disconnect this page? New messages will stop coming in. Past chats stay in the Inbox.</span>
          <div className={s.askRow}>
            <button type="button" className={s.askNo} onClick={() => setAsking(false)}>Cancel</button>
            <button type="button" className={s.askYes} onClick={() => run(() => disconnectPage(page.id), () => { setAsking(false); onGone() })}>Disconnect</button>
          </div>
        </div>
      ) : (
        <button type="button" className={s.disconnect} onClick={() => setAsking(true)}>Disconnect page</button>
      )) : null}
    </div>
  )
}

function BrandDetail({ brand, pages, managed, canEdit, error, onRename, onOpen }: {
  brand: LeadBrand
  pages: LeadPage[]
  managed: ManagedPage[] | null
  canEdit: boolean
  error: string
  onRename: (name: string) => void
  onOpen: (pageId: string) => void
}) {
  const [name, setName] = useState(brand.name)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  // As drawn: the name saves 600 ms after the last key, and every page of the brand follows it.
  const type = (v: string) => {
    setName(v)
    if (timer.current) clearTimeout(timer.current)
    const nv = v.trim()
    if (nv && nv !== brand.name) timer.current = setTimeout(() => onRename(nv), 600)
  }
  return (
    <div className={s.detail}>
      <div className={s.sect}>
        <span className={s.sectKicker}>BRAND NAME</span>
        <input className={s.nameInput} value={name} onChange={e => type(e.target.value)} maxLength={40} disabled={!canEdit} aria-label="Brand name" />
      </div>
      <div className={s.sect}>
        <span className={s.sectKicker}>PAGES</span>
        {pages.map(p => {
          const st = pageState(p, managed)
          return (
            <div key={p.id} className={s.bp} role="button" tabIndex={0} onClick={() => onOpen(p.id)} onKeyDown={e => { if (e.key === 'Enter') onOpen(p.id) }}>
              <Tile ch={p.channel} size={30} />
              <span className={s.bpName}>{pageName(p, managed)}</span>
              <span className={s.bpState} data-st={st}>{STATE_LABEL[st]}</span>
            </div>
          )
        })}
        {!pages.length ? <span className={s.none}>No pages yet</span> : null}
      </div>
      {error ? <span className={s.error} role="alert">{error}</span> : null}
    </div>
  )
}

function ConnectWindow({ brands, pages, onClose, onDone }: {
  brands: LeadBrand[]
  pages: LeadPage[]
  onClose: () => void
  onDone: (pageId: string, name: string) => void
}) {
  const [channel, setChannel] = useState<PageChannel>('messenger')
  const [list, setList] = useState<ManagedPage[] | null>(null)
  const [listErr, setListErr] = useState('')
  const [pick, setPick] = useState<string | null>(null)
  const [brand, setBrand] = useState<string>('')
  const [newName, setNewName] = useState('')
  const [reply, setReply] = useState<'cs' | 'ai'>('cs')
  const [busy, start] = useTransition()
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    listManagedPages().then(r => { if (!live) return; if (r.ok) setList(r.data); else setListErr(r.reason) })
    return () => { live = false }
  }, [])
  const rows = useMemo(() => (list ? connectable(list, channel, pages) : []), [list, channel, pages])
  const row = rows.find(r => r.externalId === pick && !r.connected)
  const isNew = brand === '__new'
  const ok = !!row && (isNew ? !!newName.trim() : !!brand)
  const connect = () => {
    if (!ok || !row) return
    start(async () => {
      setError('')
      const r = await connectPage({ channel, externalId: row.externalId, pageId: row.pageId, name: row.name, brandId: isNew ? null : brand, newBrand: isNew ? newName.trim() : '', reply })
      if (!r.ok) { setError(r.reason); return }
      onDone(r.data, row.name)
    })
  }
  return (
    <Modal open onClose={onClose} title="Connect a page" width={480}
      foot={<><button type="button" className={s.cancel} onClick={onClose}>Cancel</button><button type="button" className={s.go} disabled={!ok || busy} onClick={connect}>{busy ? 'Connecting…' : 'Connect'}</button></>}>
      <div className={s.sect}>
        <span className={s.cnLabel}>PLATFORM</span>
        <div className={s.chips}>
          {(['messenger', 'instagram'] as const).map(c => (
            <button key={c} type="button" className={s.chip} aria-pressed={channel === c} onClick={() => { setChannel(c); setPick(null) }}>{c === 'messenger' ? 'Facebook' : 'Instagram'}</button>
          ))}
        </div>
      </div>
      <div className={s.sect}>
        <span className={s.cnLabel}>PAGE *</span>
        {listErr ? <span className={s.error} role="alert">{listErr}</span> : !list ? <span className={s.hint}>Asking Meta for the system user’s pages…</span> : !rows.length ? (
          <span className={s.hint}>{channel === 'instagram' ? 'None of the system user’s Pages has an Instagram account linked.' : 'The system user manages no Pages yet — assign them in Business Settings.'}</span>
        ) : (
          <div className={s.cnList} role="radiogroup" aria-label="Page">
            {rows.map(r => (
              <button key={r.externalId} type="button" role="radio" className={s.cnRow} aria-checked={pick === r.externalId} disabled={r.connected} onClick={() => setPick(r.externalId)}>
                <span className={s.radio} aria-hidden="true" />
                <span className={s.cnName}>{r.name}</span>
                <span className={s.cnMeta}>{r.connected ? 'Connected' : followersLabel(r.followers)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={s.sect}>
        <span className={s.cnLabel}>BRAND *</span>
        <div className={s.chips}>
          {brands.map(b => <button key={b.id} type="button" className={s.chip} aria-pressed={brand === b.id} onClick={() => setBrand(b.id)}>{b.name}</button>)}
          <button type="button" className={s.chip} aria-pressed={isNew} onClick={() => setBrand('__new')}>+ New brand</button>
        </div>
        {isNew ? <input className={s.cnInput} value={newName} onChange={e => setNewName(e.target.value)} placeholder="New brand name" maxLength={40} autoFocus aria-label="New brand name" /> : null}
      </div>
      <div className={s.sect}>
        <span className={s.cnLabel}>FIRST REPLY</span>
        <div className={s.chips}>
          <button type="button" className={s.chip} aria-pressed={reply === 'cs'} onClick={() => setReply('cs')}>A person</button>
          <button type="button" className={s.chip} aria-pressed={reply === 'ai'} onClick={() => setReply('ai')}>AI Agent</button>
        </div>
      </div>
      {error ? <span className={s.error} role="alert">{error}</span> : null}
    </Modal>
  )
}

/** Kept (the user's point 2): every ad conversations came from — its name by hand, or from Ads Manager. */
function AdsSection({ ads, brands, canManage }: { ads: LeadAd[] | null; brands: LeadBrand[]; canManage: boolean }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [busy, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const list = (ads ?? []).filter(a => !q.trim() || `${a.name} ${a.headline} ${a.adId}`.toLowerCase().includes(q.trim().toLowerCase()))
  const ad = list.find(a => a.adId === sel) ?? list[0] ?? null
  const brandOf = (a: LeadAd) => a.brandIds.map(id => brands.find(b => b.id === id)?.name).filter(Boolean).join(', ')
  const fetchAll = () => start(async () => {
    setMsg(null)
    const r = await fetchAdNames((ads ?? []).map(a => a.adId))
    setMsg(r.ok ? { ok: true, text: `Meta answered for ${r.data.named} of ${(ads ?? []).length} ads${r.data.refused ? ` — ${r.data.refused} are on ad accounts the system user cannot see: give it those accounts, or name them here.` : ''}` } : { ok: false, text: r.reason })
    router.refresh()
  })
  return (
    <>
      <div className={s.mid}>
        <div className={s.midHead}>
          <div className={s.search}><LeadIcon name="search" size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search ads" aria-label="Search ads" /></div>
          {canManage ? <button type="button" className={s.add} onClick={fetchAll} disabled={busy || !ads?.length}><LeadIcon name="refresh-cw" size={15} />{busy ? 'Asking Meta…' : 'Fetch names'}</button> : null}
        </div>
        {msg ? <div style={{ padding: '0 18px 8px' }} className={msg.ok ? s.ok : s.error} role={msg.ok ? 'status' : 'alert'}>{msg.text}</div> : null}
        <div className={s.list}>
          {!ads ? <div className={s.empty}>The ads could not be read.</div> : list.map(a => (
            <div key={a.adId} className={s.row} role="option" aria-selected={ad?.adId === a.adId} tabIndex={0} onClick={() => setSel(a.adId)} onKeyDown={e => { if (e.key === 'Enter') setSel(a.adId) }}>
              <div className={s.rowText}>
                <span className={s.rowName}>{a.name || a.headline || `Ad ${a.adId}`}</span>
                <span className={s.rowSub}>{[brandOf(a), a.channels.map(c => CH_SUB[c]).join(' · '), `${a.conversations} chats`].filter(Boolean).join(' · ')}</span>
              </div>
              <span className={s.rowSub}>{a.source === 'meta' ? 'From Meta' : a.source === 'manual' ? 'Named' : 'Not named'}</span>
            </div>
          ))}
          {ads && !list.length ? <div className={s.empty}>No conversation has come from an ad yet.</div> : null}
        </div>
      </div>
      <div className={s.side}>{ad ? <AdDetail key={ad.adId} ad={ad} canManage={canManage} /> : null}</div>
    </>
  )
}

function AdDetail({ ad, canManage }: { ad: LeadAd; canManage: boolean }) {
  const router = useRouter()
  const mine = ad.source === 'manual'
  const [form, setForm] = useState({ name: mine ? ad.name : '', campaign: mine ? ad.campaign : '', adset: mine ? ad.adset : '', link: mine ? ad.link : '' })
  const [busy, start] = useTransition()
  const [error, setError] = useState('')
  const save = (data: typeof form) => start(async () => {
    setError('')
    const r = await nameAd(ad.adId, data)
    if (!r.ok) { setError(r.reason); return }
    flash(data.name ? 'Ad named' : 'Your name is cleared')
    router.refresh()
  })
  const am = adsManagerLink(ad.accountId, ad.adId)
  return (
    <div className={s.detail}>
      <div className={s.dTitles}>
        <span className={s.dName}>{ad.name || ad.headline || `Ad ${ad.adId}`}</span>
        <span className={s.dSub}>{ad.headline && ad.name ? `“${ad.headline}” · ` : ''}{ad.adId}{ad.status ? ` · ${ad.status}` : ''}</span>
      </div>
      <div className={s.kv}>
        <div className={s.kvRow}><span>Campaign › Ad set</span><span>{[ad.campaign, ad.adset].filter(Boolean).join(' › ') || '—'}</span></div>
        <div className={s.kvRow}><span>Chats · Phones</span><span>{ad.conversations} · {ad.phones}</span></div>
        <div className={s.kvRow}><span>Named</span><span>{ad.source === 'meta' ? 'From Meta' : mine ? `By ${ad.updatedByName || 'hand'}` : 'Not yet'}</span></div>
      </div>
      <div className={s.chips}>
        {ad.link ? <a className={s.link} href={ad.link} target="_blank" rel="noopener noreferrer">View the ad<LeadIcon name="arrow-up-right" size={12} /></a> : null}
        {am ? <a className={s.link} href={am} target="_blank" rel="noopener noreferrer">Ads Manager<LeadIcon name="arrow-up-right" size={12} /></a> : null}
      </div>
      {canManage ? (
        <div className={s.sect}>
          <span className={s.sectKicker}>NAME BY HAND</span>
          <label className={s.field}>Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={200} placeholder={ad.name || ad.headline || 'e.g. Oct Sofa Week · Video'} /></label>
          <label className={s.field}>Campaign<input value={form.campaign} onChange={e => setForm({ ...form, campaign: e.target.value })} maxLength={200} placeholder={ad.campaign} /></label>
          <label className={s.field}>Ad set<input value={form.adset} onChange={e => setForm({ ...form, adset: e.target.value })} maxLength={200} placeholder={ad.adset} /></label>
          <label className={s.field}>Link to the ad<input value={form.link} onChange={e => setForm({ ...form, link: e.target.value })} placeholder={ad.link || 'https://www.facebook.com/…'} /></label>
          <span className={s.hint}>A name typed here wins over Meta’s.</span>
          {error ? <span className={s.error} role="alert">{error}</span> : null}
          <div className={s.askRow}>
            {mine ? <button type="button" className={s.askNo} disabled={busy} onClick={() => save({ name: '', campaign: '', adset: '', link: '' })}>Clear my name</button> : null}
            <button type="button" className={s.go} disabled={busy} onClick={() => save(form)}>Save</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Kept (the user's point 2): a customer's message as if it came from Meta, marked TEST. */
function TestSection({ brands, canTest }: { brands: LeadBrand[]; canTest: boolean }) {
  const [form, setForm] = useState({ brand: brands[0]?.id ?? '', channel: 'messenger' as PageChannel, name: 'Test customer 01', ad: '', adId: '', body: 'Hi, is this sofa in stock?' })
  const [busy, start] = useTransition()
  const [error, setError] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const send = () => start(async () => {
    setError(''); setSent(null)
    const r = await sendTestEnquiry(form.brand, form.channel, form.name, form.ad, form.body, form.adId)
    if (!r.ok) setError(r.reason)
    else setSent(r.data)
  })
  return (
    <div className={s.mid}>
      <div className={s.form}>
        <div className={s.dTitles}>
          <span className={s.dName}>Test enquiry</span>
          <span className={s.hint}>The message lands in the Inbox as if a customer sent it, marked TEST. The same name is the same conversation; a phone number in it is picked up.</span>
        </div>
        <div className={s.pair}>
          <label className={s.field}>Brand<select value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })}>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label className={s.field}>Channel<select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value as PageChannel })}><option value="messenger">Messenger</option><option value="instagram">Instagram</option></select></label>
          <label className={s.field}>Customer name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={80} /></label>
          <label className={s.field}>From the ad<input value={form.ad} onChange={e => setForm({ ...form, ad: e.target.value })} maxLength={120} placeholder="Empty = organic" /></label>
        </div>
        <label className={s.field}>Ad id (optional)<input value={form.adId} onChange={e => setForm({ ...form, adId: e.target.value.replace(/\D/g, '') })} inputMode="numeric" maxLength={30} placeholder="e.g. 120210000000001" /></label>
        <label className={s.field}>Message<textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} maxLength={2000} /></label>
        {error ? <span className={s.error} role="alert">{error}</span> : null}
        {sent ? <span className={s.ok}>Sent to the Inbox · <Link href={`/leads?c=${sent}`}>Open →</Link></span> : null}
        <div className={s.askRow}>
          <button type="button" className={s.go} onClick={send} disabled={!canTest || busy || !form.brand || !form.name.trim() || !form.body.trim()}>{busy ? 'Sending…' : 'Send to the Inbox'}</button>
        </div>
      </div>
    </div>
  )
}

/**
 * Settings › Team (2026-11-02 — the user: "有一个人会carress & 2990mini；另一个会专门负责2990，有办法设定这两个人登入时只看到自己
 * 负责的part吗？"; mig 20261102270000): each CS with the brands they handle. Ticked, they see only those brands' chats in the
 * Inbox, Leads and an opened chat; none ticked, every brand. Lead View · Manage always sees every brand. A tick saves at once.
 */
function TeamPanel({ team, brands, canManage }: { team: Array<{ id: string; name: string; brandIds: string[] }> | null; brands: LeadBrand[]; canManage: boolean }) {
  const router = useRouter()
  const [picks, setPicks] = useState<Record<string, string[]>>(() => Object.fromEntries((team ?? []).map(t => [t.id, t.brandIds])))
  const [busy, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const namesOf = (ids: string[]) => brands.filter(b => ids.includes(b.id)).map(b => b.name).join(', ')
  const toggle = (person: { id: string; name: string }, brandId: string) => {
    const was = picks[person.id] ?? []
    const next = was.includes(brandId) ? was.filter(x => x !== brandId) : [...was, brandId]
    setPicks(p => ({ ...p, [person.id]: next }))
    start(async () => {
      const r = await saveAgentBrands(person.id, next)
      if (!r.ok) { setPicks(p => ({ ...p, [person.id]: was })); setMsg({ ok: false, text: r.reason }); return }
      setMsg({ ok: true, text: next.length ? `${person.name} sees ${namesOf(next)} only.` : `${person.name} sees every brand.` })
      router.refresh()
    })
  }
  return (
    <div className={s.mid}>
      <div className={s.midHead}><span className={s.rowName}>Who handles which brand</span></div>
      {msg ? <div style={{ padding: '0 18px 8px' }} className={msg.ok ? s.ok : s.error} role={msg.ok ? 'status' : 'alert'}>{msg.text}</div> : null}
      <div className={s.list}>
        {!team ? <div className={s.empty}>The team could not be read.</div> : !team.length ? <div className={s.empty}>Nobody yet — a CS appears here once HR gives their own login Lead View › Inbox.</div> : team.map(t => {
          const mine = picks[t.id] ?? []
          return (
            <div key={t.id} className={s.row}>
              <div className={s.rowText}>
                <span className={s.rowName}>{t.name}</span>
                <span className={s.rowSub}>{mine.length ? `Sees ${namesOf(mine)} only` : 'Sees every brand'}</span>
              </div>
              <div className={s.teamBrands} role="group" aria-label={`Brands ${t.name} handles`}>
                {brands.map(b => (
                  <button key={b.id} type="button" className={s.teamBrand} aria-pressed={mine.includes(b.id)} disabled={!canManage || busy} onClick={() => toggle(t, b.id)}>{b.name}</button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
