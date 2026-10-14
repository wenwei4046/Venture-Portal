import { describe, expect, it } from 'vitest'
import { withActions } from '@/test/with-actions'
import { buildNavEntries, emptyNavData, isGroup, navLabelByPath, type NavEntry, type NavViewer } from './nav-config'
import { activeHrNavKey, hrNavSections, visibleHrNav } from './hr-nav'

// Change password (2026-10-12 — the user: in their profile "or admin category"; "just for that
// personal acc"): the last link of Admin in both sidebars (and so in the phone's More sheet), for a
// login a People record names — never a shared one, never while viewing the portal as somebody.

type Leaf = { href: string; label: string; section?: string }
const leaves = (entries: NavEntry[], v: NavViewer): Leaf[] =>
  entries.filter(e => e.visible(v)).flatMap((e): Leaf[] =>
    isGroup(e) ? leaves(e.children, v).map(c => ({ ...c, section: e.section })) : [{ href: e.href, label: e.label, section: e.section }])

const finance = withActions({ id: 'carrie', role: 'finance', permissions: ['treasury', 'reports', 'audit_log'] }) as unknown as NavViewer
const staff = withActions({ id: 'new', role: 'staff', permissions: [] }) as unknown as NavViewer
const hr = withActions({ id: 'h', role: 'hr', permissions: ['team', 'audit_log'] }) as unknown as NavViewer

describe('Change password in the portal’s sidebar', () => {
  it('ends Reports & Admin for a personal login', () => {
    const links = leaves(buildNavEntries(emptyNavData), { ...finance, personalLogin: true })
    const admin = links.filter(l => l.section === 'Reports & Admin')
    expect(admin[admin.length - 1]).toMatchObject({ href: '/admin/password', label: 'Change password' })
  })

  it('is there for a login that opens nothing else (Overview, and Admin › My documents · Change password)', () => {
    expect(leaves(buildNavEntries(emptyNavData), { ...staff, personalLogin: true }).map(l => l.label)).toEqual(['Overview', 'My documents', 'Change password'])
  })

  it('is not there for a shared login, nor while the portal is viewed as somebody', () => {
    const shared = leaves(buildNavEntries(emptyNavData), finance).map(l => l.href)
    expect(shared).not.toContain('/admin/password')
    const viewing = leaves(buildNavEntries(emptyNavData), { ...finance, personalLogin: true, viewingAs: { id: 'x', name: 'X' } }).map(l => l.href)
    expect(viewing).not.toContain('/admin/password')
  })

  it('names the page for the activity log', () => {
    expect(navLabelByPath(emptyNavData).get('/admin/password')).toBe('Change password')
  })
})

// My documents (2026-10-14): one's own documents sit just before it, for the same logins.
describe('My documents beside it', () => {
  // HR's sidebar dropped it (2026-10-15, the Attendance handoff: "Admin's Company docs / Personal docs removed"); the page stays.
  it('is there for a personal login in the portal’s sidebar, not in HR’s', () => {
    expect(leaves(buildNavEntries(emptyNavData), { ...finance, personalLogin: true }).map(l => l.href)).toContain('/admin/documents')
    expect(activeHrNavKey(hrNavSections('fair'), '/admin/documents')).toBeNull()
    expect(navLabelByPath(emptyNavData).get('/admin/documents')).toBe('My documents')
  })

  it('is not there for a shared login, nor while viewing as somebody', () => {
    expect(leaves(buildNavEntries(emptyNavData), finance).map(l => l.href)).not.toContain('/admin/documents')
    const viewing = leaves(buildNavEntries(emptyNavData), { ...finance, personalLogin: true, viewingAs: { id: 'x', name: 'X' } }).map(l => l.href)
    expect(viewing).not.toContain('/admin/documents')
  })
})

describe('Change password in HR’s sidebar', () => {
  it('ends Admin for a personal login, and lights there', () => {
    const admin = visibleHrNav(hrNavSections('fair'), { ...hr, personalLogin: true }).find(s => s.label === 'Admin')
    expect(admin?.items.map(i => i.label)).toEqual(['Audit Log', 'Change password'])
    expect(admin?.items.at(-1)).toMatchObject({ href: '/admin/password', icon: 'lock' })
    expect(activeHrNavKey(hrNavSections('fair'), '/admin/password')).toBe('password')
  })

  it('is not there for hr@ (shared), nor while viewing as somebody', () => {
    expect(visibleHrNav(hrNavSections('fair'), hr).find(s => s.label === 'Admin')?.items.map(i => i.label)).toEqual(['Audit Log'])
    const viewing = visibleHrNav(hrNavSections('fair'), { ...hr, personalLogin: true, viewingAs: { id: 'x', name: 'X' } })
    expect(viewing.find(s => s.label === 'Admin')?.items.map(i => i.label)).toEqual(['Audit Log'])
  })
})
