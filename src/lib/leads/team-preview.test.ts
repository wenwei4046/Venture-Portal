import { describe, expect, it } from 'vitest'
import { previewReplies, previewScope, previewSees, type TeamMember } from './team'

const outlets = [{ id: 'kj', brandId: 'b1', name: '2990s Kelana Jaya' }, { id: 'tm', brandId: 'b3', name: 'Carress Taman Maluri' }]
const m = (p: Partial<TeamMember>): TeamMember => ({ staffId: 's', code: '', name: 'Michelle Wong', email: '', title: '', erpCode: '', erpJob: '', branch: '', hasLogin: true,
  role: 'outlet', reply: true, reports: false, outlets: ['kj'], from: null, to: null, why: '', leftOn: null, ...p })

// Lead View v3 § 4 · Preview as: what a member sees and may do, as the database decides it.
describe('Preview as', () => {
  it('Outlet staff see their outlets and chats with no outlet; others every chat; stopped none', () => {
    expect([previewSees(m({}), 'kj'), previewSees(m({}), null), previewSees(m({}), 'tm')]).toEqual([true, true, false])
    expect(previewSees(m({ role: 'cs' }), 'tm')).toBe(true)
    expect(previewSees(m({ role: 'cs', why: 'erp' }), 'tm')).toBe(false)
  })
  it('the banner says the scope', () => {
    expect(previewScope(m({}), outlets)).toBe('2990s Kelana Jaya + no outlet')
    expect(previewScope(m({ reply: false }), outlets)).toBe('2990s Kelana Jaya + no outlet · view only')
    expect(previewScope(m({ role: 'cs' }), outlets)).toBe('All outlets')
    expect(previewScope(m({ why: 'ended' }), outlets)).toBe('Access stopped')
  })
  it('replying needs Reply ticked for Outlet staff', () => {
    expect([previewReplies(m({})), previewReplies(m({ reply: false })), previewReplies(m({ role: 'cs', reply: false }))]).toEqual([true, false, true])
  })
})
