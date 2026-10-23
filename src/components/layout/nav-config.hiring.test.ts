import { describe, expect, it } from 'vitest'
import { withActions } from '@/test/with-actions'
import { buildNavEntries, emptyNavData, isGroup, itemActive, navLabelByPath, type NavItem, type NavViewer } from './nav-config'

// Hiring requests' Listing tab is a row of its own (2026-10-24, the user), in the portal's sidebar as in HR's:
// Hiring Requests lights on the inbox and Form settings, Hiring Listing on the list.

const hiring = withActions({ id: 'h', role: 'hr', permissions: ['hiring'] }) as unknown as NavViewer
const rows = buildNavEntries(emptyNavData).filter((e): e is NavItem => !isGroup(e) && e.section === 'Hiring' && e.visible(hiring))
const lit = (pathname: string, tab: string | null) => rows.filter(r => itemActive(r, pathname, tab, null)).map(r => r.label)

describe('Hiring in the portal’s sidebar', () => {
  it('has Listing under Requests', () => {
    expect(rows.map(r => [r.label, r.href])).toEqual([
      ['Hiring Requests', '/hiring/requests'],
      ['Hiring Listing', '/hiring/requests?tab=listing'],
      ['Hiring Insights', '/hiring/insights'],
      ['Talent Bank', '/hiring/talent'],
    ])
  })

  it.each([
    ['/hiring/requests', null, 'Hiring Requests'],
    ['/hiring/requests', 'form', 'Hiring Requests'],
    ['/hiring/requests', 'listing', 'Hiring Listing'],
  ])('%s?tab=%s lights %s, alone', (pathname, tab, label) => {
    expect(lit(pathname, tab)).toEqual([label])
  })

  it('still names the page Hiring Requests for the activity log', () => {
    expect(navLabelByPath(emptyNavData).get('/hiring/requests')).toBe('Hiring Requests')
  })
})
