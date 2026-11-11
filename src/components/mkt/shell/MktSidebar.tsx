'use client'

import { Fragment, useState } from 'react'
import type { ChangeViewRow } from '@/lib/marketing/change-view'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cancelWarmIntent, warmOnIntent } from '@/lib/nav-warm'
import type { MktNavKey, MktNavRow } from '@/lib/marketing/nav'
import { subsForNav, subsTotal, type MktShellData } from '@/lib/marketing/shell'
import s from './shell.module.css'

// Marketing's sidebar (`Marketing Shell.dc.html`): the H tile folds it to its 64px rail and back; HOUZS Marketing, the
// number of subsidiaries and the avatar (the account menu) beside it; the rows on emoji tiles with a red count — a
// pill at the row's end, a dot on the tile while folded; Subsidiaries opens its list (those with something for the
// viewer first); MANAGER TOOLS under a rule; at the foot one's claims, the meeting rooms and Settings (Appearance).

export interface MktSidebarProps {
  rows: MktNavRow[]
  active: MktNavKey | `sub:${string}` | null
  shell: MktShellData | null
  collapsed: boolean
  onFold: () => void
  subsOpen: boolean
  onSubs: () => void
  /** The avatar's letter and colour, its tooltip ("Rachel · Marketing Manager"). */
  avatar: { letter: string; bg: string; title: string }
  menuOpen: boolean
  onMenu: () => void
  settingsOn: boolean
  onSettings: () => void
  /** A row just clicked lights at once, before its page answers. */
  onPick: (key: MktNavKey | `sub:${string}`) => void
  /** Change view's rows (lib/marketing/change-view.ts) — none: no row. */
  views?: ChangeViewRow[]
}

const TONE: Record<MktNavRow['tone'], string> = { sand: s.sand, mist: s.mist, peach: s.peach, cream: s.cream }

export default function MktSidebar(p: MktSidebarProps) {
  const router = useRouter()
  const { collapsed, shell } = p
  const subs = shell ? subsForNav(shell.subs) : []
  const main = p.rows.filter(r => !r.manager && !r.foot)
  const manager = p.rows.filter(r => r.manager)
  const foot = p.rows.filter(r => r.foot)
  const countOf = (r: MktNavRow) => {
    if (r.key === 'subs') return p.subsOpen && !collapsed ? 0 : subsTotal(subs)
    return r.count && shell ? shell.counts[r.count] : 0
  }

  const row = (r: MktNavRow) => {
    const on = p.active === r.key
    const count = countOf(r)
    const inner = (
      <>
        {on ? <span className={s.rowMark} aria-hidden="true" /> : null}
        <span className={`${s.tile} ${TONE[r.tone]}`} aria-hidden="true">
          {r.emoji}
          {collapsed && count > 0 ? <span className={s.dotCount}>{count}</span> : null}
        </span>
        <span className={s.label}>{r.label}</span>
        {r.key === 'subs' && !collapsed ? (
          <span className={s.chev} style={{ transform: p.subsOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }} aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        ) : null}
        {!collapsed && count > 0 ? <span className={s.pill}>{count}</span> : null}
      </>
    )
    if (!r.href) {
      return (
        <button
          key={r.key}
          type="button"
          className={`${s.row}${on ? ` ${s.rowOn}` : ''}`}
          title={r.label}
          onClick={r.key === 'subs' ? p.onSubs : undefined}
          aria-expanded={r.key === 'subs' ? p.subsOpen : undefined}
        >
          {inner}
        </button>
      )
    }
    return (
      <Link
        key={r.key}
        href={r.href}
        className={`${s.row}${on ? ` ${s.rowOn}` : ''}`}
        title={r.label}
        aria-current={on ? 'page' : undefined}
        onClick={e => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
          p.onPick(r.key)
        }}
        onMouseEnter={() => warmOnIntent(router, r.href as string)}
        onMouseLeave={cancelWarmIntent}
      >
        {inner}
      </Link>
    )
  }

  return (
    <aside
      className={`${s.side}${collapsed ? ` ${s.folded}` : ''}`}
      style={{ ['--mk-side-w' as string]: collapsed ? '64px' : '248px' }}
      aria-label="Marketing navigation"
    >
      <div className={s.brand}>
        <button
          type="button"
          className={s.brandTile}
          onClick={p.onFold}
          title={collapsed ? 'Expand sidebar' : 'HOUZS Marketing'}
          aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
          aria-expanded={!collapsed}
        >
          H
        </button>
        {collapsed ? null : (
          <>
            <div className={s.brandWords}>
              <div className={s.brandName}>HOUZS Marketing</div>
              <div className={s.brandSub}>{shell ? `${shell.subs.length} subsidiaries` : ' '}</div>
            </div>
            <button
              type="button"
              className={s.me}
              style={{ background: p.avatar.bg }}
              title={p.avatar.title}
              aria-label={`${p.avatar.title} — account`}
              aria-haspopup="menu"
              aria-expanded={p.menuOpen}
              onClick={p.onMenu}
            >
              {p.avatar.letter}
            </button>
            <button type="button" className={s.fold} onClick={p.onFold} title="Collapse sidebar" aria-label="Collapse the sidebar">
              «
            </button>
          </>
        )}
      </div>
      <nav className={s.rows}>
        {main.map(r => (
          <Fragment key={r.key}>
            {row(r)}
            {r.key === 'subs' && p.subsOpen && !collapsed
              ? subs.map(sub => {
                  const key = `sub:${sub.code}` as const
                  const on = p.active === key
                  return (
                    <Link
                      key={sub.id}
                      href={`/marketing/subsidiaries/${encodeURIComponent(sub.code)}`}
                      className={`${s.sub}${on ? ` ${s.subOn}` : ''}`}
                      title={sub.name}
                      aria-current={on ? 'page' : undefined}
                      onClick={e => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                        p.onPick(key)
                      }}
                    >
                      <span className={s.subDot} style={{ background: sub.dot }} aria-hidden="true" />
                      <span className={s.subEmoji} aria-hidden="true">{sub.emoji}</span>
                      <span className={s.label}>{sub.name}</span>
                      {sub.count > 0 ? <span className={s.pill}>{sub.count}</span> : null}
                    </Link>
                  )
                })
              : null}
            {/* Marketing's own clients — the manager's (Manage holds the manager tools and the clients). */}
            {r.key === 'subs' && p.subsOpen && !collapsed && manager.length ? (
              <Link href="/marketing/new?add=1" className={`${s.sub} ${s.addSub}`}>
                <span className={s.addPlus} aria-hidden="true">+</span>
                <span className={s.label}>Add subsidiary</span>
              </Link>
            ) : null}
          </Fragment>
        ))}
        {manager.length ? (
          <>
            <div className={s.divider} aria-hidden="true" />
            {collapsed ? null : <div className={s.section}>Manager tools</div>}
            {manager.map(row)}
          </>
        ) : null}
      </nav>
      <div className={s.foot}>
        {foot.map(row)}
        {p.views && p.views.length > 1 ? <ChangeView views={p.views} collapsed={collapsed} /> : null}
        <button
          type="button"
          className={`${s.row}${p.settingsOn ? ` ${s.rowOn}` : ''}`}
          title="Settings"
          onClick={p.onSettings}
          aria-expanded={p.settingsOn}
        >
          {p.settingsOn ? <span className={s.rowMark} aria-hidden="true" /> : null}
          <span className={`${s.tile} ${s.sand}`} aria-hidden="true">⚙️</span>
          <span className={s.label}>Settings</span>
        </button>
      </div>
    </aside>
  )
}

/**
 * Change view (2026-11-11): for a Marketing login the Principal opened the CRM to (CRM · View in People ›
 * Permissions) — Marketing, where one is, and the CRM. A plain navigation: the CRM is the Revenue app's page.
 */
function ChangeView({ views, collapsed }: { views: ChangeViewRow[]; collapsed: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={s.viewWrap}>
      {open ? <div className={s.viewScrim} onClick={() => setOpen(false)} aria-hidden="true" /> : null}
      {open ? (
        <div className={s.viewMenu} role="menu" aria-label="Change view">
          <div className={s.viewMenuHead}>Change view</div>
          {views.map(v => {
            const on = v.key === 'marketing'
            return on ? (
              <button key={v.key} type="button" role="menuitemradio" aria-checked="true" className={s.menuItem} onClick={() => setOpen(false)}>
                <span aria-hidden="true">{v.emoji}</span>
                <span>{v.label}</span>
                <span className={s.viewCheck} aria-hidden="true">✓</span>
              </button>
            ) : (
              <a key={v.key} href={v.href} role="menuitemradio" aria-checked="false" className={s.menuItem}>
                <span aria-hidden="true">{v.emoji}</span>
                <span>{v.label}</span>
              </a>
            )
          })}
        </div>
      ) : null}
      <button
        type="button"
        className={`${s.row}${open ? ` ${s.rowOn}` : ''}`}
        title="Change view"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span className={`${s.tile} ${s.mist}`} aria-hidden="true">🔀</span>
        <span className={s.label}>Change view</span>
        {collapsed ? null : <span className={s.viewCheck} style={{ fontWeight: 400, fontSize: '.85em' }}>Marketing</span>}
      </button>
    </div>
  )
}
