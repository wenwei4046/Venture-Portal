import { describe, expect, it } from 'vitest'
import { boardFromJson, fieldFromJson, requestFromJson } from './parse'

// hiring_board()'s jsonb: whatever is missing or of the wrong kind comes back
// empty, never a crash on the page.
describe('boardFromJson', () => {
  it('an empty answer is an empty board read as HR', () => {
    expect(boardFromJson(null)).toEqual({ fields: [], sources: [], candidateFields: [], people: [], requests: [], talents: [], me: { staffId: null, name: 'HR' } })
  })

  it('reads a request field by field', () => {
    const r = requestFromJson({
      id: 'HR-001', status: 'filled', source: 'guest', requesterName: 'Wong Mei Yee', requesterCompany: 'HOUZS Interior Sdn Bhd',
      answers: { headcount: 2, position: 'Driver', jd: null }, hiredNames: ['Ali', '', null], hiringCost: '450.00',
      candidates: [{ id: 'c1', name: 'Ali', stage: 'hired', answers: { salary: 3000 } }, { id: 'c2', name: 'Abu', stage: 'interviewing' }],
      events: [{ what: 'Filled', at: '2026-10-11T04:00:00Z' }],
    })
    expect(r).toMatchObject({
      id: 'HR-001', status: 'filled', source: 'guest', requesterCompany: 'HOUZS Interior Sdn Bhd', requesterDepartment: null,
      answers: { headcount: '2', position: 'Driver' }, hiredNames: ['Ali'], hiringCost: 450, ownerId: null,
    })
    expect(r.candidates.map(c => [c.stage, c.source, c.answers])).toEqual([['hired', 'Applied', { salary: '3000' }], ['shortlisted', 'Applied', {}]])
    expect(r.events).toEqual([{ what: 'Filled', who: '', note: '', at: '2026-10-11T04:00:00Z' }])
  })

  it('an unknown status is Pending, an unknown field type is short text', () => {
    expect(requestFromJson({ status: 'archived' }).status).toBe('submitted')
    expect(fieldFromJson({ id: 'x', label: 'X', type: 'colour', required: 'yes' })).toEqual({ id: 'x', label: 'X', type: 'text', options: '', required: false, core: false })
  })

  it('sources default on, with how often they were used', () => {
    const b = boardFromJson({ sources: [{ id: 's', name: 'Jobstreet', used: '2' }, { id: 't', name: 'Other', active: false }], me: { staffId: 'x', name: 'Grace Lim' } })
    expect(b.sources).toEqual([{ id: 's', name: 'Jobstreet', active: true, used: 2 }, { id: 't', name: 'Other', active: false, used: 0 }])
    expect(b.me).toEqual({ staffId: 'x', name: 'Grace Lim' })
  })
})
