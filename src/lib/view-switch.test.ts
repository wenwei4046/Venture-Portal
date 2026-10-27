import { describe, expect, it } from 'vitest'
import { isViewAsRole } from './view-as'
import { REVENUE_APP_VIEWS, SWITCH_VIEWS, phoneWhere, type PhoneFace } from './view-switch'

// EVERY VIEW SWITCHER LISTS EVERY VIEW (2026-10-27 — the user: "我要全部是跟 principal 那种的，它能够显示出来全部的东西"):
// one list in the Principal's order; the Revenue app's switchers list the views alone (the user: "view as person, no
// need in revenue app add on, others can, cause revenue app can use view as team member").

describe('the views every switcher lists', () => {
  it('are the Principal’s menu, in its order, ending with View as a person…', () => {
    expect(SWITCH_VIEWS.map(v => v.label)).toEqual([
      'Principal', 'Finance view', 'HR view', 'Marketing view', 'Revenue View', 'Lead View', 'View as a person…',
    ])
    expect(SWITCH_VIEWS.map(v => v.short)).toEqual([
      'Principal', 'Finance', 'HR', 'Marketing', 'Revenue team', 'Lead View', 'View as a person…',
    ])
  })

  it('are each a view setViewAs takes — or the picker', () => {
    for (const { value } of SWITCH_VIEWS) {
      expect(value === 'principal' || value === 'lead' || value === 'person' || isViewAsRole(value)).toBe(true)
    }
  })

  it('in the Revenue app: every view, no View as a person… (a team member is viewed with Profile’s View as)', () => {
    expect(REVENUE_APP_VIEWS.map(v => v.short)).toEqual(['Principal', 'Finance', 'HR', 'Marketing', 'Revenue team', 'Lead View'])
  })
})

describe('where a view opens on a phone', () => {
  const where = (face: PhoneFace) => Object.fromEntries(SWITCH_VIEWS.map(v => [v.value, phoneWhere(v.value, face)]))

  it('from the Revenue app and the HR app: the Principal’s and Finance’s are the Finance app (2026-10-17)', () => {
    expect(where('revenue')).toEqual({
      principal: 'The Finance app', finance: 'The Finance app', hr: 'The HR app', marketing: 'The portal',
      revenue_member: 'This app', lead: 'The portal', person: 'Read-only',
    })
    expect(where('hr')).toMatchObject({ principal: 'The Finance app', finance: 'The Finance app', hr: 'This app', revenue_member: 'The Revenue app' })
  })

  it('from the Finance app: this app, the Principal’s with its Approvals', () => {
    expect(where('finance')).toMatchObject({ principal: 'This app, with Approvals', finance: 'This app', hr: 'The HR app', marketing: 'The portal', lead: 'The portal' })
  })
})
