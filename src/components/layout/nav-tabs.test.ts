import { describe, expect, it } from 'vitest'
import { PROD_LOGINS } from '@/lib/page-tabs.fixtures'
import { buildNavEntries, isGroup, tabsForRole, type NavData, type NavEntry, type NavViewer } from './nav-config'
import { hrNavSections, visibleHrNav } from './hr-nav'
import { PAGE_TABS, opensPath, routeOf, userTabs } from '@/lib/page-tabs'
import { TAB_BY_ID } from '@/lib/permission-tabs'
import { can, type Permission } from '@/lib/permissions'
import type { UserRole } from '@/types'

// The sidebars ask the tabs too (2026-10-11, HR revamp 8b): a link shows only
// where its page would open. On the day, every login production has sees the
// links it saw — less any whose page already refused it.

const DATA: NavData = {
  revenueSubDepts: [{ slug: 'fair', name: 'Fair' }, { slug: 'ir', name: 'IR' }],
  revenueSub: 'fair',
}

function hrefs(entries: NavEntry[], viewer: NavViewer): string[] {
  return entries
    .filter(e => e.visible(viewer))
    .flatMap(e => (isGroup(e) ? [...(e.href ? [`[${e.href}]`] : [`[${e.label}]`]), ...hrefs(e.children, viewer)] : [e.href]))
}

const viewers = PROD_LOGINS.map(l => {
  const base = { id: l.email, role: l.role as UserRole, permissions: l.keys, actions: l.actions }
  return { name: l.email, before: base as NavViewer, after: { ...base, tabs: userTabs(null, l.actions, l.keys) } as NavViewer }
})

describe('the menus on the day tabs arrive', () => {
  // Only a link to a page that already refused them may go: carrie's old menu showed Reconciliation and
  // Journal Entries (the links asked Treasury, the pages ask Reconciliation, which she is held back from).
  it.each(viewers.map(v => [v.name, v] as const))('%s sees the links it saw, but dead ones', (_name, v) => {
    const before = hrefs(buildNavEntries(DATA), v.before)
    const after = hrefs(buildNavEntries(DATA), v.after)
    const gone = before.filter(h => !after.includes(h))
    expect(after.filter(h => !before.includes(h))).toEqual([])
    for (const h of gone) {
      const route = routeOf(h)!
      expect(can(v.before, ...(PAGE_TABS[route].flatMap(t => TAB_BY_ID.get(t)!.keys) as Permission[])), `${h} opened for ${v.name}`).toBe(false)
    }
    expect(gone).toEqual(v.name === 'carrieong1218@gmail.com' ? ['/reconciliation', '/reconciliation/journal-entries'] : [])
    const hr = (viewer: NavViewer) => visibleHrNav(hrNavSections('fair'), viewer).flatMap(s => s.items.map(i => i.href))
    expect(hr(v.after)).toEqual(hr(v.before))
    const bar = (viewer: NavViewer) => tabsForRole(viewer.role).filter(t => opensPath(viewer.tabs, t.href)).map(t => t.href)
    expect(bar(v.after)).toEqual(bar(v.before))
  })

  it('and a tab taken away takes its link: Receipt unticked, Payments kept', () => {
    const v = { ...viewers.find(x => x.name === 'finance@venture.my')!.after }
    const tabs = (v.tabs ?? []).filter(t => !t.startsWith('fin.receipt.'))
    const shown = hrefs(buildNavEntries(DATA), { ...v, tabs })
    expect(shown).toContain('/payments')
    expect(shown).not.toContain('/receipts')
  })

  it('names the tab of each Settings link: Chart of Account is Finance’s, Treasury the Principal’s', () => {
    const v = viewers.find(x => x.name === 'principal@venture.my')!.after
    const tabs = (v.tabs ?? []).filter(t => !t.startsWith('pri.settings.'))
    const shown = hrefs(buildNavEntries(DATA), { ...v, tabs })
    expect(shown).toContain('/settings?tab=accounts')
    expect(shown).not.toContain('/settings?tab=treasury')
  })
})
