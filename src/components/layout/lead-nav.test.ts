import { describe, expect, it } from 'vitest'
import { leadNavSections, leadPageTitle, showsLeadSearch } from './lead-nav'
import { clampToWindow } from '@/app/(portal)/leads/_components/ui/ContextMenu'

describe("Lead View's rail — the v2 handoff's NAV", () => {
  it('lists the fourteen rows in the drawn order and names', () => {
    expect(leadNavSections().map(s => s.items.map(i => i.label))).toEqual([
      ['Inbox', 'Leads', 'Insight', 'Campaigns'],
      ['Reply rules', 'Reply templates', 'Step library', 'AI Agent'],
      ['General info', 'Data Center', 'AI corrections'],
      ['Working hours', 'Audit log', 'Settings'],
    ])
  })

  it("titles the header with the page's row", () => {
    expect(leadPageTitle('/leads')).toBe('Inbox')
    expect(leadPageTitle('/leads/hours')).toBe('Working hours')
    expect(leadPageTitle('/leads/knowledge')).toBe('Data Center')
    expect(leadPageTitle('/leads/somewhere')).toBe('Lead View')
  })

  it('draws the search on Inbox and Leads only', () => {
    expect(showsLeadSearch('/leads')).toBe(true)
    expect(showsLeadSearch('/leads/list')).toBe(true)
    expect(showsLeadSearch('/leads/insight')).toBe(false)
    expect(showsLeadSearch('/leads/settings')).toBe(false)
  })
})

describe('the context menu stays in the window', () => {
  it('opens at the pointer when it fits', () => {
    expect(clampToWindow({ x: 100, y: 100 }, 200, 150, 1440, 900)).toEqual({ left: 100, top: 100 })
  })
  it('moves left and up near the edges, 8px inside', () => {
    expect(clampToWindow({ x: 1400, y: 880 }, 200, 150, 1440, 900)).toEqual({ left: 1232, top: 742 })
  })
})
