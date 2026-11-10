'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { LeadIcon, type LeadIconName } from '@/components/layout/lead-icons'
import { connectPage, disconnectPage, fetchAdNames, listManagedPages, nameAd, saveLeadBrand, saveOutlets, sendTestEnquiry, setAdOutlet, setPage, saveTeamMember, removeTeamMember } from '@/lib/leads/actions'
import { outletName, outletsFor, type LeadOutlet } from '@/lib/leads/outlets'
import { adsManagerLink, type LeadAd } from '@/lib/leads/ads'
import { STATE_LABEL, adSlots, connectable, replyLabel, followersLabel, pageName, pageState, type LeadPage, type ManagedPage, type PageChannel } from '@/lib/leads/pages'
import type { ReplyRules } from '@/lib/leads/template'
import type { LeadBrand } from '@/lib/leads/types'
import { ROLES, defaultsFor, initialsOf, pickRows, shortDay, stopped, subLine, type DirectoryPerson, type StaffDirectory, type TeamMember, type TeamRole } from '@/lib/leads/team'
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

type View = 'pages' | 'brands' | 'ads' | 'team' | 'test'
const CH_SUB: Record<PageChannel, string> = { messenger: 'Messenger', instagram: 'Instagram' }

export default function SettingsView({ brands, pages, ready, managed, rules, templates, ads, canManage, canTest, team, directory = null, outlets = [], outletsReady = false }: {
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
  /** Settings › Team (v3 § 4; mig 20261110220100); null before the migration. */
  team: TeamMember[] | null
  /** Add from ERP: People and the ERP's staff (Manage only); null before the migration or without Manage. */
  directory?: StaffDirectory | null
  /** Every brand's outlets (v3 § 3; mig 20261110200000) — none before it. */
  outlets?: LeadOutlet[]
  /** Is the outlets' migration in? Before it Brands draws no OUTLETS block and Ads no outlet. */
  outletsReady?: boolean
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
  // v3 § 3: ads with no outlet are a warning on the nav, once there are outlets to pick (before the migration, none).
  const noOutlet = outletsReady ? (ads ?? []).filter(a => !a.outletId).length : 0

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

  // v3: Pages · Brands · Ads · Team as drawn (Ads is a section of its own now), then — kept, under a line — Test enquiry.
  // A warning count ("1 !") says why on hover (README § 3).
  const nav: Array<{ v: View; l: string; icon: LeadIconName; n: string; tip?: string; sep?: boolean }> = [
    { v: 'pages', l: 'Pages', icon: 'radio-tower', n: bad ? `${bad} !` : String(pages.length), tip: bad ? `${bad} ${bad === 1 ? 'page needs' : 'pages need'} attention. Open it to reconnect.` : undefined },
    { v: 'brands', l: 'Brands', icon: 'store', n: String(brands.length) },
    { v: 'ads', l: 'Ads', icon: 'megaphone', n: noOutlet ? `${noOutlet} !` : ads ? String(ads.length) : '', tip: noOutlet ? `${noOutlet} ${noOutlet === 1 ? 'ad has' : 'ads have'} no outlet. Its leads won’t show up when you filter by outlet.` : undefined },
    { v: 'team', l: 'Team', icon: 'users', n: team ? String(team.length) : '' },
    { v: 'test', l: 'Test enquiry', icon: 'send', n: '', sep: true },
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
                <span className={s.navCount} data-bad={n.tip ? '' : undefined} title={n.tip}>{n.n}</span>
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
                  onRename={name => run(() => saveLeadBrand(selBrand.id, { name }))} onOpen={id => { setView('pages'); setQ(''); setSel(id) }}
                  outlets={outlets.filter(o => o.brandId === selBrand.id)} ads={ads ?? []} hasOutlets={outletsReady}
                  onOutlets={list => run(() => saveOutlets(selBrand.id, list))} />
              ) : null}
            </div>
          </>
        ) : view === 'team' ? (
          <TeamPanel members={team} directory={directory} outlets={outlets} brands={brands} canManage={canManage} />
        ) : view === 'ads' ? (
          <AdsSection ads={ads} brands={brands} canManage={canManage} outlets={outlets} rules={rules} templates={templates} />
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

function BrandDetail({ brand, pages, managed, canEdit, error, onRename, onOpen, outlets, ads, hasOutlets, onOutlets }: {
  brand: LeadBrand
  pages: LeadPage[]
  managed: ManagedPage[] | null
  canEdit: boolean
  error: string
  onRename: (name: string) => void
  onOpen: (pageId: string) => void
  /** This brand's outlets (v3 § 3). */
  outlets: LeadOutlet[]
  ads: LeadAd[]
  /** Is the outlets' migration in? Before it the block is not drawn. */
  hasOutlets: boolean
  onOutlets: (list: Array<{ id?: string; name: string }>) => void
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
      {hasOutlets ? <OutletsBlock key={outlets.map(o => o.id + o.name).join('|')} outlets={outlets} ads={ads} canEdit={canEdit} onSave={onOutlets} /> : null}
      {error ? <span className={s.error} role="alert">{error}</span> : null}
    </div>
  )
}

/**
 * Settings › Brands › OUTLETS (v3 § 3): the brand's outlets — the name edited in place (saved when it leaves the box or
 * on Enter), how many ads point at it, the bin (removing it lets its ads go back to "No outlet"), and *New outlet…* + Add.
 * Each change saves the brand's whole list (lead_save_outlets).
 */
function OutletsBlock({ outlets, ads, canEdit, onSave }: {
  outlets: LeadOutlet[]
  ads: LeadAd[]
  canEdit: boolean
  onSave: (list: Array<{ id?: string; name: string }>) => void
}) {
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(outlets.map(o => [o.id, o.name])))
  const [nv, setNv] = useState('')
  const list = (over?: { drop?: string; add?: string }) => [
    ...outlets.filter(o => o.id !== over?.drop).map(o => ({ id: o.id, name: (names[o.id] ?? o.name).trim() || o.name })),
    ...(over?.add ? [{ name: over.add }] : []),
  ]
  const commit = (o: LeadOutlet) => { const v = (names[o.id] ?? '').trim(); if (v && v !== o.name) onSave(list()); else setNames(m => ({ ...m, [o.id]: o.name })) }
  const adsOf = (id: string) => ads.filter(a => a.outletId === id).length
  return (
    <div className={s.sect}>
      <span className={s.sectKicker}>OUTLETS</span>
      <div className={s.outlets}>
        {outlets.map(o => {
          const n = adsOf(o.id)
          return (
            <div key={o.id} className={s.outletRow}>
              <LeadIcon name="map-pin" size={15} className={s.outletPin} />
              <input className={s.outletInput} value={names[o.id] ?? o.name} disabled={!canEdit} maxLength={80} aria-label="Outlet name"
                onChange={e => setNames(m => ({ ...m, [o.id]: e.target.value }))} onBlur={() => commit(o)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
              <span className={s.outletAds}>{n ? `${n} ${n === 1 ? 'ad' : 'ads'}` : ''}</span>
              {canEdit ? <button type="button" className={s.outletDel} title="Remove outlet" aria-label={`Remove ${o.name}`} onClick={() => onSave(list({ drop: o.id }))}><LeadIcon name="trash-2" size={14} /></button> : null}
            </div>
          )
        })}
      </div>
      {canEdit ? (
        <form className={s.outletAdd} onSubmit={e => { e.preventDefault(); const v = nv.trim(); if (!v) return; onSave(list({ add: v })); setNv('') }}>
          <input className={s.outletNew} value={nv} onChange={e => setNv(e.target.value)} placeholder="New outlet, e.g. 2990s Puchong" maxLength={80} aria-label="New outlet" />
          <button type="submit" className={s.outletGo} data-on={nv.trim() ? '' : undefined}><LeadIcon name="plus" size={14} />Add</button>
        </form>
      ) : null}
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

/**
 * Settings › Ads (v3 § 3): every ad conversations came from, grouped by brand, with its outlet on the right ("No outlet"
 * in rust); All / No outlet. Its detail: the outlet pills, the replies it gets and where they come from ("Ad rule" /
 * "From the page"), its details. Kept from v2 (the user's point 2): naming an ad by hand and Fetch names from Meta.
 */
function AdsSection({ ads, brands, canManage, outlets, rules, templates }: {
  ads: LeadAd[] | null
  brands: LeadBrand[]
  canManage: boolean
  outlets: LeadOutlet[]
  rules: ReplyRules | null
  templates: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [f, setF] = useState<'all' | 'none'>('all')
  const [sel, setSel] = useState<string | null>(null)
  const [busy, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const ql = q.trim().toLowerCase()
  const all = ads ?? []
  const labelOf = (a: LeadAd) => a.name || a.headline || `Ad ${a.adId}`
  const brandOf = (a: LeadAd) => brands.find(b => b.id === a.brandIds[0])?.name ?? ''
  const noO = all.filter(a => !a.outletId).length
  const vis = all.filter(a => (!ql || `${labelOf(a)} ${brandOf(a)} ${outletName(outlets, a.outletId)} ${a.adId}`.toLowerCase().includes(ql)) && (f === 'all' || !a.outletId))
  const ad = vis.find(a => a.adId === sel) ?? vis[0] ?? null
  const fetchAll = () => start(async () => {
    setMsg(null)
    const r = await fetchAdNames(all.map(a => a.adId))
    setMsg(r.ok ? { ok: true, text: `Meta answered for ${r.data.named} of ${all.length} ads${r.data.refused ? ` — ${r.data.refused} are on ad accounts the system user cannot see: give it those accounts, or name them here.` : ''}` } : { ok: false, text: r.reason })
    router.refresh()
  })
  return (
    <>
      <div className={s.mid}>
        <div className={s.midHead}>
          <div className={s.search}><LeadIcon name="search" size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search ads or outlets" aria-label="Search ads or outlets" /></div>
          <div className={s.seg} role="group" aria-label="Show">
            {([['all', 'All', all.length], ['none', 'No outlet', noO]] as const).map(([k, l, n]) => (
              <button key={k} type="button" className={s.segBtn} aria-pressed={f === k} onClick={() => setF(k)}>
                {l}<span className={s.segN} data-bad={k === 'none' && n ? '' : undefined}>{n}</span>
              </button>
            ))}
          </div>
        </div>
        <div className={s.list}>
          {!ads ? <div className={s.empty}>The ads could not be read.</div> : brands.map(b => {
            const rows = vis.filter(a => (a.brandIds[0] ?? '') === b.id)
            if (!rows.length) return null
            return (
              <div key={b.id} className={s.group}>
                <span className={s.kicker}>{b.name.toUpperCase()}</span>
                {rows.map(a => (
                  <div key={a.adId} className={s.row} role="option" aria-selected={ad?.adId === a.adId} tabIndex={0} onClick={() => setSel(a.adId)} onKeyDown={e => { if (e.key === 'Enter') setSel(a.adId) }}>
                    <Tile ch={a.channels[0] ?? 'messenger'} />
                    <div className={s.rowText}><span className={s.rowName}>{labelOf(a)}</span><span className={s.rowSub}>{a.channels.map(c => CH_SUB[c]).join(' · ')}</span></div>
                    <span className={s.rowOutlet} data-none={a.outletId ? undefined : ''}><LeadIcon name="map-pin" size={13} />{outletName(outlets, a.outletId) || 'No outlet'}</span>
                  </div>
                ))}
              </div>
            )
          })}
          {ads && !vis.length ? <div className={s.empty}>{all.length ? 'Nothing here' : 'No conversation has come from an ad yet.'}</div> : null}
        </div>
      </div>
      <div className={s.side}>
        {ad ? (
          <AdDetail key={ad.adId} ad={ad} brand={brandOf(ad)} canManage={canManage} outlets={outlets} rules={rules} templates={templates}
            fetch={canManage && all.length ? (
              <div className={s.fetch}>
                <button type="button" className={s.fetchBtn} onClick={fetchAll} disabled={busy}><LeadIcon name="refresh-cw" size={13} />{busy ? 'Asking Meta…' : 'Fetch names from Meta'}</button>
                {msg ? <span className={msg.ok ? s.ok : s.error} role={msg.ok ? 'status' : 'alert'}>{msg.text}</span> : null}
              </div>
            ) : null} />
        ) : null}
      </div>
    </>
  )
}

function AdDetail({ ad, brand, canManage, outlets, rules, templates, fetch }: {
  ad: LeadAd
  brand: string
  canManage: boolean
  outlets: LeadOutlet[]
  rules: ReplyRules | null
  templates: Array<{ id: string; name: string }>
  /** Fetch names from Meta (kept), shown under More. */
  fetch: ReactNode
}) {
  const [more, setMore] = useState(false)
  const router = useRouter()
  const mine = ad.source === 'manual'
  const [form, setForm] = useState({ name: mine ? ad.name : '', campaign: mine ? ad.campaign : '', adset: mine ? ad.adset : '', link: mine ? ad.link : '' })
  const [outlet, setOutlet] = useState<string | null>(ad.outletId ?? null)
  const [busy, start] = useTransition()
  const [error, setError] = useState('')
  const save = (data: typeof form) => start(async () => {
    setError('')
    const r = await nameAd(ad.adId, data)
    if (!r.ok) { setError(r.reason); return }
    flash(data.name ? 'Ad named' : 'Your name is cleared')
    router.refresh()
  })
  const pickOutlet = (id: string | null) => {
    if (id === outlet) return
    const before = outlet
    setOutlet(id)
    start(async () => {
      setError('')
      const r = await setAdOutlet(ad.adId, id)
      if (!r.ok) { setError(r.reason); setOutlet(before); return }
      router.refresh()
    })
  }
  // The replies it gets, as Reply rules answers them: its own rule, else its page's (the outlet layer is not built).
  const channel = ad.channels[0] ?? 'messenger'
  const page = rules?.pages.find(p => p.brandId === ad.brandIds[0] && p.channel === channel)
  const slots = rules ? adSlots(rules.ads, ad.adId) : { w: 'follow' as const, a: 'follow' as const }
  const reply = (slot: string, pageV: string | undefined) => slot === 'follow' ? { v: replyLabel(pageV ?? 'cs', templates), from: 'From the page' } : { v: replyLabel(slot, templates), from: 'Ad rule' }
  const replies = [{ k: 'Working hours', ...reply(slots.w, page?.work) }, { k: 'After hours', ...reply(slots.a, page?.after) }]
  const am = adsManagerLink(ad.accountId, ad.adId)
  return (
    <div className={s.detail}>
      <div className={s.dHead}>
        <Tile ch={channel} size={40} />
        <div className={s.dTitles}>
          <span className={s.dName}>{ad.name || ad.headline || `Ad ${ad.adId}`}</span>
          <span className={s.dSub}>Ad · {CH_SUB[channel]}</span>
        </div>
      </div>
      <div className={s.sect}>
        <span className={s.sectKicker}>OUTLET</span>
        <div className={s.chips}>
          {outletsFor(outlets, ad.brandIds[0]).map(o => (
            <button key={o.id} type="button" className={s.chip} aria-pressed={outlet === o.id} disabled={!canManage || busy} onClick={() => pickOutlet(o.id)}>{o.name}</button>
          ))}
          <button type="button" className={s.chip} aria-pressed={!outlet} disabled={!canManage || busy} onClick={() => pickOutlet(null)}>No outlet</button>
        </div>
      </div>
      <div className={s.sect}>
        <div className={s.sectHead}>
          <span className={s.sectKicker}>REPLIES</span>
          <Link className={s.link} href="/leads/rules">Reply rules<LeadIcon name="arrow-up-right" size={12} /></Link>
        </div>
        <div className={s.kv}>
          {replies.map(x => (
            <div key={x.k} className={s.kvRow}><span className={s.kvKey}>{x.k}</span><span className={s.kvTwo}><span className={s.kvV}>{x.v}</span><span className={s.kvFrom}>{x.from}</span></span></div>
          ))}
        </div>
      </div>
      <div className={s.sect}>
        <span className={s.sectKicker}>DETAILS</span>
        <div className={s.kv}>
          <div className={s.kvRow}><span>Brand</span><span>{brand || '—'}</span></div>
          <div className={s.kvRow}><span>Channel</span><span>{ad.channels.map(c => CH_SUB[c]).join(' · ')}</span></div>
          <div className={s.kvRow}><span>Chats</span><span>{ad.conversations}</span></div>
        </div>
      </div>
      {error ? <span className={s.error} role="alert">{error}</span> : null}
      {/* Kept from v2, not drawn in v3: folded under More so the panel reads as drawn. */}
      <button type="button" className={s.quiet} onClick={() => setMore(m => !m)} aria-expanded={more}><LeadIcon name={more ? 'chevron-down' : 'chevron-right'} size={13} />More</button>
      {more ? (
      <div className={s.sect}>
        <div className={s.kv}>
          <div className={s.kvRow}><span>Campaign › Ad set</span><span>{[ad.campaign, ad.adset].filter(Boolean).join(' › ') || '—'}</span></div>
          <div className={s.kvRow}><span>Ad ID</span><span>{ad.adId}</span></div>
        </div>
        {ad.link || am ? (
          <div className={s.chips}>
            {ad.link ? <a className={s.link} href={ad.link} target="_blank" rel="noopener noreferrer">View the ad<LeadIcon name="arrow-up-right" size={12} /></a> : null}
            {am ? <a className={s.link} href={am} target="_blank" rel="noopener noreferrer">Ads Manager<LeadIcon name="arrow-up-right" size={12} /></a> : null}
          </div>
        ) : null}
      </div>
      ) : null}
      {more && canManage ? (
        <div className={s.sect}>
          <span className={s.sectKicker}>NAME BY HAND</span>
          <label className={s.field}>Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={200} placeholder={ad.name || ad.headline || 'e.g. Oct Sofa Week · Video'} /></label>
          <label className={s.field}>Campaign<input value={form.campaign} onChange={e => setForm({ ...form, campaign: e.target.value })} maxLength={200} placeholder={ad.campaign} /></label>
          <label className={s.field}>Ad set<input value={form.adset} onChange={e => setForm({ ...form, adset: e.target.value })} maxLength={200} placeholder={ad.adset} /></label>
          <label className={s.field}>Link to the ad<input value={form.link} onChange={e => setForm({ ...form, link: e.target.value })} placeholder={ad.link || 'https://www.facebook.com/…'} /></label>
          <span className={s.hint}>A name typed here wins over Meta’s.</span>
          <div className={s.askRow}>
            {mine ? <button type="button" className={s.askNo} disabled={busy} onClick={() => save({ name: '', campaign: '', adset: '', link: '' })}>Clear my name</button> : null}
            <button type="button" className={s.go} disabled={busy} onClick={() => save(form)}>Save</button>
          </div>
        </div>
      ) : null}
      {more ? fetch : null}
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
 * Settings › Team (Lead View v3 § 4; migs 20261110220000 / 220100): who has Lead View and how. The list is ACTIVE and
 * INACTIVE (folded); a person's detail is the ERP link, why they are stopped, ROLE, and for Outlet staff their OUTLETS,
 * CAN (See chats always, Reply, See reports) and ACCESS (Always / Only between dates). Each change saves at once
 * (lead_team_save). *Add from ERP* lists People and the ERP's staff; a Lead Executive starts as Customer service,
 * anybody else as Outlet staff with their branch's outlet ticked. The database's permission readers follow the Team.
 */
function TeamPanel({ members, directory, outlets, brands, canManage }: {
  members: TeamMember[] | null
  directory: StaffDirectory | null
  outlets: LeadOutlet[]
  brands: LeadBrand[]
  canManage: boolean
}) {
  const router = useRouter()
  const ready = members !== null
  const [list, setList] = useState<TeamMember[]>(members ?? [])
  useEffect(() => { setList(members ?? []) }, [members])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [offOpen, setOffOpen] = useState(false)
  const [dated, setDated] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [pq, setPq] = useState('')
  const [busy, start] = useTransition()
  const [error, setError] = useState('')
  const oName = (id: string) => outlets.find(o => o.id === id)?.name ?? ''
  const ql = q.trim().toLowerCase()
  const vis = list.filter(m => !ql || `${m.name} ${m.email} ${m.outlets.map(oName).join(' ')}`.toLowerCase().includes(ql))
  const act = vis.filter(m => !stopped(m)), off = vis.filter(m => stopped(m))
  const cur = vis.find(m => m.staffId === sel) ?? act[0] ?? vis[0] ?? null
  const offShown = offOpen || (!!cur && stopped(cur) && sel === cur.staffId)
  const can = canManage && !busy

  useEffect(() => {
    if (!picking) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicking(false) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [picking])

  const done = (r: { ok: true; data: TeamMember[] } | { ok: false; reason: string }, was: TeamMember[] | null, then?: () => void) => {
    if (!r.ok) { setError(r.reason); if (was) setList(was); return }
    setList(r.data)
    then?.()
    router.refresh()
  }
  const save = (m: TeamMember, next: Partial<TeamMember>) => {
    const was = list
    const merged = { ...m, ...next }
    setList(xs => xs.map(x => (x.staffId === m.staffId ? merged : x)))
    setError('')
    start(async () => {
      done(await saveTeamMember(m.staffId, { role: merged.role, reply: merged.reply, reports: merged.reports, outlets: merged.outlets, from: merged.from, to: merged.to }), was)
    })
  }
  const add = (p: DirectoryPerson) => {
    const d = defaultsFor(p, outlets)
    setPicking(false)
    setError('')
    start(async () => {
      done(await saveTeamMember(p.staffId, { role: d.role, reply: true, reports: false, outlets: d.outlets, from: null, to: null }), null, () => setSel(p.staffId))
    })
  }
  const remove = (m: TeamMember) => {
    setError('')
    start(async () => { done(await removeTeamMember(m.staffId), null, () => setSel(null)) })
  }

  const row = (m: TeamMember) => (
    <div key={m.staffId} className={s.row} role="option" aria-selected={cur?.staffId === m.staffId} tabIndex={0}
      onClick={() => setSel(m.staffId)} onKeyDown={e => { if (e.key === 'Enter') setSel(m.staffId) }}>
      <span className={s.tmIni} data-off={stopped(m) || undefined} aria-hidden="true">{initialsOf(m.name)}</span>
      <div className={s.rowText}>
        <span className={s.rowName} data-off={stopped(m) || undefined}>{m.name}</span>
        <span className={s.tmSub} data-off={stopped(m) || undefined}>{subLine(m, outlets)}</span>
      </div>
      {!stopped(m) && m.role === 'outlet' && m.to ? <span className={s.tmUntil}><LeadIcon name="calendar-clock" size={12} />Until {shortDay(m.to)}</span> : null}
    </div>
  )

  const isDated = !!cur && (!!cur.from || !!cur.to || dated === cur.staffId)
  const pick = directory ? pickRows(directory, pq) : []
  const stopWords = (m: TeamMember) =>
    m.why === 'erp' ? `Inactive in ERP${m.leftOn ? ` since ${shortDay(m.leftOn)}` : ''}. Access stopped automatically. It comes back if the ERP marks them active again.`
    : m.why === 'people' ? `Not active in People${m.leftOn ? ` since ${shortDay(m.leftOn)}` : ''}. Access stopped automatically. It comes back if HR makes them active again.`
    : `Access ended on ${shortDay(m.to)}. Pick new dates, or Always, to give it back.`
  return (
    <>
      <div className={s.mid}>
        <div className={s.midHead}>
          <div className={s.search}><LeadIcon name="search" size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search people or outlets" aria-label="Search people or outlets" /></div>
          {canManage ? (
            <button type="button" className={s.add} disabled={!ready || !directory} title={!ready || !directory ? 'Waiting for the database update' : undefined} onClick={() => { setPq(''); setPicking(true) }}>
              <LeadIcon name="plus" size={15} />Add from ERP
            </button>
          ) : null}
        </div>
        <div className={s.list}>
          {!ready ? <div className={s.empty}>Waiting for the database update.</div> : (
            <>
              <span className={s.tmKicker}>ACTIVE · {act.length}</span>
              {act.map(row)}
              {off.length ? (
                <>
                  <button type="button" className={s.tmOff} onClick={() => { if (offShown && cur && stopped(cur)) setSel(null); setOffOpen(!offShown) }} aria-expanded={offShown}>
                    <span className={s.tmOffChev} data-open={offShown || undefined}><LeadIcon name="chevron-right" size={13} /></span>INACTIVE · {off.length}
                  </button>
                  {offShown ? off.map(row) : null}
                </>
              ) : null}
              {!vis.length && ql ? <div className={s.empty}>Nothing here</div> : null}
            </>
          )}
        </div>
      </div>
      <div className={s.side}>
        {cur ? (
          <div className={s.tmDetail}>
            <div className={s.dHead}>
              <span className={s.tmIniBig} aria-hidden="true">{initialsOf(cur.name)}</span>
              <div className={s.tmTitles}><span className={s.dName}>{cur.name}</span><span className={s.tmEmail}>{cur.email || '—'}</span></div>
            </div>
            <div className={s.tmLink}>
              <LeadIcon name="link-2" size={15} className={s.tmLinkIcon} />
              <div className={s.tmLinkText}>
                <span className={s.tmLinkTop}>{cur.erpCode ? `Linked to ERP · ${cur.erpCode}` : `In People · ${cur.code || '—'} · not found in the ERP`}</span>
                <span className={s.tmLinkSub}>{[cur.erpJob || cur.title, cur.branch].filter(Boolean).join(' · ') || '—'}</span>
              </div>
            </div>
            {stopped(cur) ? <div className={s.tmStop}><LeadIcon name="ban" size={15} className={s.tmStopIcon} /><span>{stopWords(cur)}</span></div> : null}
            {!stopped(cur) && !cur.hasLogin ? <div className={s.tmStop}><LeadIcon name="user-x" size={15} className={s.tmStopIcon} /><span>No login yet. HR invites them from People; Lead View opens for them once they sign in.</span></div> : null}
            <div className={s.tmSect}>
              <span className={s.tmK}>ROLE</span>
              <div className={s.tmRoles} role="radiogroup" aria-label="Role">
                {(Object.keys(ROLES) as TeamRole[]).map(k => (
                  <button key={k} type="button" role="radio" aria-checked={cur.role === k} className={s.tmRole} disabled={!can} onClick={() => { if (cur.role !== k) save(cur, { role: k }) }}>
                    <span className={s.tmDot} aria-hidden="true" />
                    <span className={s.tmRoleText}><span className={s.tmRoleL}>{ROLES[k][0]}</span><span className={s.tmRoleD}>{ROLES[k][1]}</span></span>
                  </button>
                ))}
              </div>
            </div>
            {cur.role === 'outlet' ? (
              <>
                <div className={s.tmSect}>
                  <span className={s.tmK}>OUTLETS</span>
                  {brands.filter(b => outlets.some(o => o.brandId === b.id)).map(b => (
                    <div key={b.id} className={s.tmGroup}>
                      <span className={s.tmGroupName}>{b.name}</span>
                      <div className={s.tmPills}>
                        {outlets.filter(o => o.brandId === b.id).map(o => {
                          const on = cur.outlets.includes(o.id)
                          return <button key={o.id} type="button" className={s.tmPill} aria-pressed={on} disabled={!can}
                            onClick={() => save(cur, { outlets: on ? cur.outlets.filter(x => x !== o.id) : [...cur.outlets, o.id] })}>{o.name}</button>
                        })}
                      </div>
                    </div>
                  ))}
                  {!cur.outlets.length ? <span className={s.tmWarn}>Pick at least one outlet</span> : null}
                </div>
                <div className={s.tmCan}>
                  <span className={s.tmK}>CAN</span>
                  {([['See chats and leads', 'messages-square', true, null], ['Reply to customers', 'reply', cur.reply, 'reply'], ['See reports', 'chart-column', cur.reports, 'reports']] as const).map(([l, icon, v, k]) => (
                    <button key={l} type="button" className={s.tmPerm} role="switch" aria-checked={v} disabled={!k || !can}
                      onClick={() => { if (k) save(cur, { [k]: !v }) }}>
                      <LeadIcon name={icon} size={15} className={s.tmPermIcon} /><span className={s.tmPermL}>{l}</span>
                      <span className={s.tmSwitch} data-on={v || undefined} data-locked={!k || undefined}><span className={s.tmKnob} /></span>
                    </button>
                  ))}
                </div>
                <div className={s.tmSect}>
                  <span className={s.tmK}>ACCESS</span>
                  <div className={s.tmPills}>
                    <button type="button" className={s.tmPill} aria-pressed={!isDated} disabled={!can} onClick={() => { setDated(null); if (cur.from || cur.to) save(cur, { from: null, to: null }) }}>Always</button>
                    <button type="button" className={s.tmPill} aria-pressed={isDated} disabled={!can} onClick={() => setDated(cur.staffId)}>Only between dates</button>
                  </div>
                  {isDated ? (
                    <>
                      <div className={s.tmDates}>
                        <input type="date" className={s.tmDate} value={cur.from ?? ''} disabled={!can} aria-label="From" onChange={e => save(cur, { from: e.target.value || null })} />
                        <span className={s.tmTo}>to</span>
                        <input type="date" className={s.tmDate} value={cur.to ?? ''} disabled={!can} aria-label="To" onChange={e => save(cur, { to: e.target.value || null })} />
                      </div>
                      <span className={s.tmNote}>Login stops working after the last day.</span>
                    </>
                  ) : null}
                </div>
              </>
            ) : null}
            {error ? <span className={s.error} role="alert">{error}</span> : null}
            {canManage ? <div className={s.tmFoot}><button type="button" className={s.tmRemove} disabled={busy} onClick={() => remove(cur)}><LeadIcon name="user-x" size={14} />Remove access</button></div> : null}
          </div>
        ) : null}
      </div>
      {picking ? (
        <>
          <div className={s.tmBack} onClick={() => setPicking(false)} aria-hidden="true" />
          <div className={s.tmPick} role="dialog" aria-modal="true" aria-label="Add from ERP">
            <div className={s.tmPickHead}>
              <span className={s.tmPickTitle}>Add from ERP</span>
              <button type="button" className={s.tmPickX} title="Close" aria-label="Close" onClick={() => setPicking(false)}><LeadIcon name="x" size={16} /></button>
            </div>
            <div className={s.tmPickSearch}>
              <div className={s.tmPickBox}><LeadIcon name="search" size={15} /><input value={pq} onChange={e => setPq(e.target.value)} placeholder="Name, staff ID or branch" aria-label="Name, staff ID or branch" autoFocus /></div>
            </div>
            <div className={s.tmPickList}>
              {pick.map(r => (
                <div key={r.key} className={s.tmPickRow} data-has={r.tag ? '' : undefined} role="button" tabIndex={r.tag ? -1 : 0} aria-disabled={!!r.tag}
                  onClick={() => { if (!r.tag && r.person) add(r.person) }} onKeyDown={e => { if (e.key === 'Enter' && !r.tag && r.person) add(r.person) }}>
                  <span className={s.tmPickIni} aria-hidden="true">{initialsOf(r.name)}</span>
                  <div className={s.tmLinkText}><span className={s.tmPickName}>{r.name}</span><span className={s.tmPickSub}>{r.sub}</span></div>
                  {r.tag ? <span className={s.tmPickTag}>{r.tag}</span> : <span className={s.tmPickPlus}><LeadIcon name="plus" size={16} /></span>}
                </div>
              ))}
              {!pick.length ? <div className={s.tmPickNone}>No one in the ERP matches</div> : null}
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}
