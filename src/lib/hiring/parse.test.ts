import { describe, expect, it } from 'vitest'
import { boardFromJson, fieldFromJson, requestFromJson } from './parse'

// hiring_board()'s jsonb: whatever is missing or of the wrong kind comes back
// empty, never a crash on the page.
describe('boardFromJson', () => {
  it('an empty answer is an empty board read as HR', () => {
    expect(boardFromJson(null)).toEqual({ fields: [], sources: [], candidateFields: [], fileTypes: [], people: [], requests: [], talents: [], me: { staffId: null, name: 'HR' } })
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

  it('reads a candidate’s files, the résumé said so; a file without an id is left out', () => {
    const r = requestFromJson({ candidates: [{ id: 'c1', name: 'Ali', files: [
      { id: 'f1', typeId: 't1', type: 'Résumé', resume: true, name: 'Ali_CV.pdf', addedAt: '2026-10-11T04:00:00Z', addedBy: 'Grace Lim' },
      { id: 'f2', typeId: 't2', type: 'IC', name: 'ic.jpg' }, { typeId: 't2', name: 'lost.pdf' }, 'junk'] }] })
    expect(r.candidates[0].files).toEqual([
      { id: 'f1', typeId: 't1', type: 'Résumé', resume: true, name: 'Ali_CV.pdf', addedAt: '2026-10-11T04:00:00Z', addedBy: 'Grace Lim' },
      { id: 'f2', typeId: 't2', type: 'IC', resume: false, name: 'ic.jpg', addedAt: '', addedBy: '' },
    ])
    expect(requestFromJson({ candidates: [{ id: 'c2' }] }).candidates[0].files).toEqual([])
  })

  it('the file types, in their order; only Résumé is built in', () => {
    const b = boardFromJson({ fileTypes: [{ id: 'a', name: 'Résumé', builtin: 'resume' }, { id: 'b', name: 'IC', builtin: 'other' }, { id: '', name: 'Blank' }],
      talents: [{ id: 't', files: [{ id: 'f', type: 'IC', name: 'x.png' }] }] })
    expect(b.fileTypes).toEqual([{ id: 'a', name: 'Résumé', builtin: 'resume', active: true, used: 0 }, { id: 'b', name: 'IC', builtin: null, active: true, used: 0 }])
    expect(b.talents[0].files.map(f => [f.type, f.name, f.resume])).toEqual([['IC', 'x.png', false]])
    expect(boardFromJson({ fileTypes: [{ id: 'c', name: 'Old', active: false, used: '4' }] }).fileTypes).toEqual([{ id: 'c', name: 'Old', builtin: null, active: false, used: 4 }])
  })

  it('an unknown status is Pending, an unknown field type is short text', () => {
    expect(requestFromJson({ status: 'archived' }).status).toBe('submitted')
    expect(fieldFromJson({ id: 'x', label: 'X', type: 'colour', required: 'yes' })).toEqual({ id: 'x', label: 'X', type: 'text', options: '', required: false, core: false })
  })

  it('why somebody is kept: one of the five, else none (2026-10-24)', () => {
    const b = boardFromJson({ talents: [{ id: 'a', reason: 'failed_interview' }, { id: 'b', reason: 'bored' }, { id: 'c' }] })
    expect(b.talents.map(t => t.reason)).toEqual(['failed_interview', null, null])
  })

  it('sources default on, with how often they were used', () => {
    const b = boardFromJson({ sources: [{ id: 's', name: 'Jobstreet', used: '2' }, { id: 't', name: 'Other', active: false }], me: { staffId: 'x', name: 'Grace Lim' } })
    expect(b.sources).toEqual([{ id: 's', name: 'Jobstreet', active: true, used: 2 }, { id: 't', name: 'Other', active: false, used: 0 }])
    expect(b.me).toEqual({ staffId: 'x', name: 'Grace Lim' })
  })
})
