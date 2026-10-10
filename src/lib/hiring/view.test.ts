import { describe, expect, it } from 'vitest'
import { HIRING_BOARD as BOARD } from '@/test/hiring-board'
import type { HiringRequest } from './types'
import {
  STATUS,
  STAGE,
  activeSources,
  assistOptions,
  budgetText,
  candidateInfo,
  candidateMeta,
  candidateMix,
  costText,
  departmentNames,
  fromLine,
  hiredChoices,
  hrOwners,
  inReview,
  listingCount,
  missingAnswers,
  pageMeta,
  pageTiles,
  pickRows,
  pipeline,
  requestSummary,
  requestTitle,
  reviewTiles,
  talentStatus,
  trailRows,
} from './view'

// The Hiring pages' words, against the handoff's own sample data
// (Revenue App.dc.html — HIRE_ST, CAND_ST, bfmt, rvVals, hireVals, evMap).
const req = (id: string) => BOARD.requests.find(r => r.id === id)!
const guest: HiringRequest = {
  ...req('HR-205'),
  id: 'HR-206',
  source: 'guest',
  requestedBy: null,
  requesterName: 'Wong Mei Yee',
  requesterDepartment: 'Project',
  requesterCompany: 'HOUZS Interior Sdn Bhd',
  attachmentName: 'Org_chart.pdf',
}

describe('the words a request is shown with', () => {
  it('names statuses and stages as the handoff does', () => {
    expect(Object.values(STATUS).map(s => s.label)).toEqual(['More info needed', 'Declined', 'Pending', 'Acknowledged', 'Filled', 'Cancelled'])
    expect(Object.values(STAGE).map(s => s.label)).toEqual(['Shortlisted', 'Done appointment', 'Offered', 'Hired', 'Not selected'])
  })

  it('writes a budget range as money, and a blank one as a dash', () => {
    expect(budgetText('3200–3800')).toBe('RM 3,200 – 3,800')
    expect(budgetText('3,200–3,800')).toBe('RM 3,200 – 3,800')
    expect(budgetText('3000–3000')).toBe('RM 3,000')
    expect(budgetText('–2500')).toBe('RM 2,500')
    expect(budgetText('–')).toBe('—')
    expect(budgetText('')).toBe('—')
  })

  it('writes a hiring cost in whole ringgit unless there are sen', () => {
    expect(costText(450)).toBe('RM 450')
    expect(costText(1234.5)).toBe('RM 1,234.50')
    expect(costText(null)).toBe('—')
  })

  it('titles a request by its position, and how many when more than one', () => {
    expect(requestTitle(req('HR-203'))).toBe('Revenue Specialist × 2')
    expect(requestTitle(req('HR-205'))).toBe('Senior Revenue Specialist')
  })

  it('says who asked, from where and when — a guest by their company', () => {
    expect(fromLine(req('HR-205'))).toBe('From Kar Jun · Revenue · submitted 9 Oct 2026')
    expect(fromLine(guest)).toBe('From Wong Mei Yee · HOUZS Interior Sdn Bhd (guest link) · submitted 9 Oct 2026')
    expect(pageMeta(req('HR-202'))).toBe('Requested by Stanley · Revenue · submitted 2 Sep 2026 · hired Siti Aisyah')
  })
})

describe('who may own and help a hire', () => {
  it('owners are HR’s own people', () => {
    expect(hrOwners(BOARD).map(p => p.name)).toEqual(['Grace Lim', 'Nurul Huda'])
  })

  it('helpers are HR and the leads and managers, never the owner', () => {
    expect(assistOptions(BOARD, 'grace').map(p => p.name)).toEqual(['Anthony', 'Chea Huan', 'Lawrence', 'Stanley', 'Nurul Huda', 'Jason Ong'])
  })
})

describe('tiles', () => {
  it('the review puts Budget, Headcount and Expected start first, then the company and the rest', () => {
    const tiles = reviewTiles(req('HR-205'))
    expect(tiles.map(t => t.label)).toEqual([
      'Budget (RM / month)', 'Headcount', 'Expected start', 'Company', 'Department', 'Employment type', 'Reason', 'Age requirement', 'Gender', 'Race',
    ])
    expect(tiles.filter(t => t.highlight).map(t => t.value)).toEqual(['RM 3,200 – 3,800', '1', 'Within 1 month'])
    expect(tiles.find(t => t.label === 'Company')?.value).toBe('HOUZS Venture')
    expect(reviewTiles(guest).find(t => t.label === 'Company')?.value).toBe('HOUZS Interior Sdn Bhd')
  })

  it('a request page adds where a filled hire came from and what it cost', () => {
    const tiles = pageTiles(req('HR-202'))
    expect(tiles.slice(0, 3).map(t => t.label)).toEqual(['Headcount', 'Budget (RM / month)', 'Expected start'])
    expect(tiles.slice(-2)).toEqual([
      { label: 'Hired through', value: 'Jobstreet', highlight: false },
      { label: 'Hiring cost', value: 'RM 450', highlight: false },
    ])
    expect(pageTiles(guest).at(-1)).toEqual({ label: 'Attachment', value: 'Org_chart.pdf', highlight: false })
  })

  it('a blank short answer is a dash', () => {
    expect(pageTiles(req('HR-201')).find(t => t.label === 'Age requirement')?.value).toBe('—')
  })
})

describe('the audit trail', () => {
  it('oldest first, the newest step last; Status only keeps the request’s own steps', () => {
    const r = req('HR-203')
    const events = [...r.events, { what: 'Candidate edited', who: 'Grace Lim', note: 'Daniel Lee', at: '2026-10-10T05:00:00.000Z' }]
    const all = trailRows(events)
    expect(all.map(e => [e.what, e.major, e.last])).toEqual([
      ['Submitted', true, false], ['Acknowledged', true, false], ['Interview booked', true, false], ['Candidate edited', false, true],
    ])
    expect(trailRows(events, true).map(e => [e.what, e.last])).toEqual([['Submitted', false], ['Acknowledged', false], ['Interview booked', true]])
    expect(all[0].when).toBe('28 Sep 2026')
  })
})

describe('candidates', () => {
  it('counts them, those past an appointment, those not selected', () => {
    expect(candidateMix(req('HR-203'))).toEqual({ count: '2', meta: ' · 1 appt' })
    expect(candidateMix(req('HR-202'))).toEqual({ count: '2', meta: ' · 1 appt · 1 out' })
    expect(candidateMix(req('HR-205'))).toEqual({ count: '0', meta: '' })
  })

  it('the pipeline: candidates, shortlisted, done appointment (and beyond), offered, hired, not selected', () => {
    expect(pipeline(req('HR-203')).map(p => p.value)).toEqual(['2', '1', '1', '0', '0', '0'])
    expect(pipeline(req('HR-202')).map(p => p.value)).toEqual(['2', '0', '1', '0', '1', '1'])
  })

  it('a Hired pick per headcount, from candidates still in it', () => {
    expect(hiredChoices(req('HR-203'))).toEqual({ slots: 2, names: ['Daniel Lee', 'Nur Iman'] })
    expect(hiredChoices(req('HR-202'))).toEqual({ slots: 1, names: ['Siti Aisyah'] })
  })

  it('their details as pills: a salary as money, a date as a day', () => {
    const daniel = req('HR-203').candidates[0]
    expect(candidateInfo(daniel, BOARD.candidateFields)).toEqual([
      { label: 'Expected salary', value: 'RM 3,000' },
      { label: 'Available from', value: '1 Nov 2026' },
      { label: 'Own transport', value: 'Yes' },
    ])
    expect(candidateMeta(req('HR-203').candidates[1])).toBe('Talent Bank · 012-778 4410')
  })
})

describe('the listing and the inbox', () => {
  it('counts each status', () => {
    expect(['all', 'submitted', 'acknowledged', 'filled', 'cancelled'].map(k => listingCount(BOARD.requests, k as never))).toEqual([9, 2, 1, 5, 1])
  })

  it('Pending, Info requested and Declined', () => {
    expect(BOARD.requests.filter(r => inReview(r, 'pending')).map(r => r.id)).toEqual(['HR-205', 'HR-204'])
    const asked = { ...req('HR-204'), status: 'needs_info' as const }
    expect(inReview(asked, 'info')).toBe(true)
    expect(inReview(asked, 'pending')).toBe(false)
  })
})

describe('the Talent Bank, seen from a request', () => {
  it('offers who is not already on it — a not-selected one may come back — matching people first', () => {
    expect(pickRows(BOARD, req('HR-203')).map(p => p.talent.no)).toEqual(['T-103', 'T-102', 'T-101'])
    const rows = pickRows(BOARD, req('HR-202'))
    expect(rows.map(p => p.talent.no)).toContain('T-104')
    expect(pickRows(BOARD, req('HR-204'))[0]).toMatchObject({ match: true, talent: { no: 'T-101' } })
  })

  it('a talent interviewing for an open request says so', () => {
    const [t104, , , t101] = BOARD.talents
    expect(talentStatus(BOARD, t104)).toEqual({ label: 'Interviewing · HR-203', tone: 'alert', request: 'HR-203' })
    expect(talentStatus(BOARD, t101)).toEqual({ label: 'Available', tone: 'ledger', request: null })
  })

  it('departments come from the Department field', () => {
    expect(departmentNames(BOARD)).toEqual(['Revenue', 'HR', 'Finance'])
  })
})

describe('the HR phone app’s summary and the form', () => {
  it('names every answer', () => {
    expect(requestSummary(req('HR-202'), BOARD)).toMatchObject({
      id: 'HR-202', status: 'filled', statusLabel: 'Filled', position: 'Team Assistant', headcount: '1', department: 'Revenue · Fair',
      budget: 'RM 2,800 – 3,200', start: 'Immediately', employment: 'Full-time', reason: 'New position', gender: 'Female',
      ownerName: 'Grace Lim', requesterName: 'Stanley', requesterOrg: 'Revenue', viaGuestLink: false, submitted: '2 Sep 2026',
      hiredNames: ['Siti Aisyah'], source: 'Jobstreet', cost: 450,
    })
    expect(requestSummary(req('HR-202'), BOARD).candidates.map(c => c.stageLabel)).toEqual(['Hired', 'Not selected'])
  })

  it('the sources still on', () => {
    const sources = BOARD.sources.map(s => (s.name === 'Other' ? { ...s, active: false } : s))
    expect(activeSources({ sources })).toEqual(['Jobstreet', 'LinkedIn', 'Social Media', 'Referral', 'Walk-in'])
  })

  it('says which required answers are blank (a range of nothing is blank)', () => {
    expect(missingAnswers(BOARD.fields, { position: 'Driver', budget: '–' })).toEqual([
      'Department', 'Headcount', 'Budget (RM / month)', 'Expected start', 'Job description',
    ])
    expect(missingAnswers(BOARD.fields, { position: 'Driver', dept: 'HR', headcount: '1', budget: '2000–', start: 'Immediately', jd: 'Drive.' })).toEqual([])
  })
})
