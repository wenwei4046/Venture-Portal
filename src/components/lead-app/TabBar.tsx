'use client'

import { Ic, type IconName } from './icons'
import { lv } from './parts'
import type { Tab } from './vm'

export interface TabItem { id: Tab; label: string; icon: IconName; badge?: string | null }

/**
 * The bottom bar (LeadPhone.dc.html lines 179–186): a 52×30 pill under each glyph, rust when picked (its colour eases
 * over .18s), the Inbox's unread count on its corner, the label under it; it stands clear of the phone's own bar.
 */
export default function TabBar({ tabs, on, onPick }: { tabs: TabItem[]; on: Tab; onPick: (t: Tab) => void }) {
  return (
    <nav aria-label="Lead View" style={{ flex: 'none', display: 'flex', padding: '8px 6px calc(8px + var(--safe-bottom))', background: lv('surface'), borderTop: `1px solid ${lv('line')}` }}>
      {tabs.map(t => {
        const here = t.id === on
        return (
          <button key={t.id} type="button" onClick={() => onPick(t.id)} aria-current={here ? 'page' : undefined}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: here ? lv('accent') : lv('fg-3') }}>
            <span style={{ position: 'relative', width: 52, height: 30, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: here ? lv('accent') : 'transparent', color: here ? lv('surface') : lv('fg-3'), transition: 'background .18s' }}>
              <Ic name={t.icon} size={22} />
              {t.badge ? (
                <span style={{ position: 'absolute', top: -4, right: 2, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 600, fontSize: 10, background: lv('accent'), color: lv('surface'), border: `2px solid ${lv('surface')}` }}>{t.badge}</span>
              ) : null}
            </span>
            <span style={{ fontWeight: here ? 600 : 500, fontSize: 11 }}>{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
