import { describe, expect, it } from 'vitest'
import { changeViews, CRM_HREF } from './change-view'

// Change view (2026-11-11): a Marketing login the Principal opened the CRM to — CRM · View in People › Permissions.
const staff = (actions: Record<string, 'own' | 'dept' | 'all'>, permissions: string[], over = {}) => ({
  permissions, actions, ...over,
})

describe('changeViews', () => {
  it('is empty for Marketing staff without CRM · View', () => {
    expect(changeViews(staff({ 'marketing.view': 'all' }, ['marketing']))).toEqual([])
  })

  it('lists Marketing and the CRM once CRM · View is ticked for the person', () => {
    const rows = changeViews(staff({ 'marketing.view': 'all', 'crm.view': 'all' }, ['marketing', 'member_crm']))
    expect(rows.map(r => r.key)).toEqual(['marketing', 'crm'])
    expect(rows[1].href).toBe(CRM_HREF)
  })

  it('takes CRM · View at Own too', () => {
    expect(changeViews(staff({ 'crm.view': 'own' }, ['member_crm']))).toHaveLength(2)
  })

  it('needs the key the cell opens, not only the cell', () => {
    expect(changeViews(staff({ 'crm.view': 'all' }, []))).toEqual([])
  })

  it('is never drawn for an account with the portal view switch, nor while viewing as a person', () => {
    const crm = staff({ 'crm.view': 'all' }, ['member_crm'])
    expect(changeViews({ ...crm, canSwitchView: true })).toEqual([])
    expect(changeViews({ ...crm, viewingAs: { id: 'x', name: 'X' } })).toEqual([])
    expect(changeViews(null)).toEqual([])
  })
})
