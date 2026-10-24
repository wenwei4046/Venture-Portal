import { beforeEach, describe, expect, it, vi } from 'vitest'

// The HR app's writes run only while their own portal page leaves them open (2026-10-11, the review's M2).
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  access: vi.fn(),
  saveTalentNotes: vi.fn(),
  acknowledge: vi.fn(),
  bookRoom: vi.fn(),
  decide: vi.fn(),
  letter: vi.fn(),
  attDecide: vi.fn(),
  probationAck: vi.fn(),
  contractAck: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getUser: mocks.user }))
vi.mock('./server', () => ({ appAccess: mocks.access }))
vi.mock('@/app/(member)/member/actions', () => ({ adminMemberAction: mocks.decide }))
vi.mock('@/lib/member/member-services', () => ({ ACCEPT_NOTE: 'Accepted onto the waiting list.' }))
vi.mock('@/lib/documentation/actions', () => ({ openDocumentationFile: mocks.letter }))
vi.mock('@/lib/hiring/actions', () => ({
  acknowledgeHiringRequest: mocks.acknowledge, cancelHiringRequest: vi.fn(), declineHiringRequest: vi.fn(), fillHiringRequest: vi.fn(),
  removeHiringTalent: vi.fn(), requestHiringInfo: vi.fn(), saveHiringCandidate: vi.fn(), saveTalentNotes: mocks.saveTalentNotes, setCandidateStage: vi.fn(), submitHiringRequest: vi.fn(),
}))
vi.mock('@/lib/rooms/actions', () => ({ bookRoom: mocks.bookRoom, cancelBooking: vi.fn() }))
vi.mock('@/lib/attendance/actions', () => ({ decideRequest: mocks.attDecide }))
vi.mock('@/app/(portal)/team/people/probation-actions', () => ({ acknowledgeProbation: mocks.probationAck }))
vi.mock('@/app/(portal)/team/people/contract-actions', () => ({ acknowledgeContract: mocks.contractAck }))

import { hrAppAcknowledge, hrAppAttDecide, hrAppBook, hrAppContractAck, hrAppDecide, hrAppLetterLink, hrAppProbationAck, hrAppTalentNotes } from './actions'

const OPEN = {
  parts: { requests: true, hiring: true, insights: true, talent: true, docs: true, rooms: true, people: true },
  may: { attDecide: true, decide: true, hireApprove: true, hireEdit: true, hireCreate: true, talentEdit: true, book: true, termAck: true },
}
const SHUT = { ok: false, reason: 'This is not open to your account.' }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.user.mockResolvedValue({ id: 'u' })
  mocks.access.mockReturnValue(OPEN)
})

describe('a write from the HR app', () => {
  it('reaches the module’s own action while its page leaves it open', async () => {
    mocks.saveTalentNotes.mockResolvedValue({ ok: true })
    await expect(hrAppTalentNotes('t1', 'Strong on AR.')).resolves.toEqual({ ok: true })
    expect(mocks.saveTalentNotes).toHaveBeenCalledWith('t1', 'Strong on AR.')
  })

  it('is refused in words, the module never asked, once its box is unticked', async () => {
    mocks.access.mockReturnValue({ ...OPEN, may: { ...OPEN.may, talentEdit: false, hireApprove: false, book: false, decide: false } })
    await expect(hrAppTalentNotes('t1', 'x')).resolves.toEqual(SHUT)
    await expect(hrAppAcknowledge('HR-001', 'grace')).resolves.toEqual(SHUT)
    await expect(hrAppBook({ title: 'Sync', dept: 'hr', roomId: 'r1', date: '2026-10-12', from: 600, to: 660, attendees: [], pax: 1 })).resolves.toEqual(SHUT)
    await expect(hrAppDecide('q1', 'reject', '')).resolves.toEqual(SHUT)
    expect(mocks.saveTalentNotes).not.toHaveBeenCalled()
    expect(mocks.acknowledge).not.toHaveBeenCalled()
    expect(mocks.bookRoom).not.toHaveBeenCalled()
    expect(mocks.decide).not.toHaveBeenCalled()
  })

  it('signed out: nothing is done', async () => {
    mocks.user.mockResolvedValue(null)
    await expect(hrAppTalentNotes('t1', 'x')).resolves.toEqual(SHUT)
    expect(mocks.access).not.toHaveBeenCalled()
  })

  it('books from the HR app as the HR app, and passes the module’s refusal on', async () => {
    mocks.bookRoom.mockResolvedValue({ ok: false, reason: 'Meeting Room 1 is taken 10:00–11:00 by “Sync”.' })
    await expect(hrAppBook({ title: 'Sync', dept: 'hr', roomId: 'r1', date: '2026-10-12', from: 600, to: 660, attendees: ['s1'], pax: 2 }))
      .resolves.toEqual({ ok: false, reason: 'Meeting Room 1 is taken 10:00–11:00 by “Sync”.' })
    expect(mocks.bookRoom).toHaveBeenCalledWith(expect.objectContaining({ source: 'hr_app', department: 'hr', internal: ['s1'], bookedBy: null }))
  })

  it('a letter opens only while the Data center is theirs', async () => {
    mocks.letter.mockResolvedValue({ ok: true, url: 'https://files.example/l.pdf', fileName: 'l.pdf', contentType: null })
    await expect(hrAppLetterLink('L1')).resolves.toEqual({ ok: true, url: 'https://files.example/l.pdf' })
    mocks.access.mockReturnValue({ ...OPEN, parts: { ...OPEN.parts, docs: false } })
    await expect(hrAppLetterLink('L1')).resolves.toEqual(SHUT)
  })
})

describe('HR Mobile’s decision on an attendance request (2026-10-17)', () => {
  it('goes to HR › Attendance’s own decideRequest while Requests’ Approve is open to them', async () => {
    mocks.attDecide.mockResolvedValue({ ok: true, data: { id: 'r1', ref: 'LV-2610-009', status: 'approved' } })
    await expect(hrAppAttDecide('r1', true, '')).resolves.toEqual({ ok: true })
    expect(mocks.attDecide).toHaveBeenCalledWith('r1', true, '')
  })
  it('asks for a note before a rejection, and is refused once the box is unticked', async () => {
    await expect(hrAppAttDecide('r1', false, '  ')).resolves.toEqual({ ok: false, reason: 'Add a note to reject' })
    mocks.access.mockReturnValue({ ...OPEN, may: { ...OPEN.may, attDecide: false } })
    await expect(hrAppAttDecide('r1', true, '')).resolves.toEqual(SHUT)
    expect(mocks.attDecide).not.toHaveBeenCalled()
  })
})

describe('a probation’s reminder, acknowledged from the HR app (2026-10-23)', () => {
  it('goes to People’s own acknowledgeProbation while the person page’s Edit is open to them', async () => {
    mocks.probationAck.mockResolvedValue({ ok: true, endsOn: '2026-10-31', ackName: 'LI SEAN', ackAt: '2026-10-23T02:00:00Z' })
    await expect(hrAppProbationAck('st1')).resolves.toEqual({ ok: true })
    expect(mocks.probationAck).toHaveBeenCalledWith('st1')
  })
  it('says the database’s refusal, and is refused before asking once the box is unticked', async () => {
    mocks.probationAck.mockResolvedValue({ ok: false, reason: 'They are not on probation any more — reload the page.' })
    await expect(hrAppProbationAck('st1')).resolves.toEqual({ ok: false, reason: 'They are not on probation any more — reload the page.' })
    mocks.probationAck.mockClear()
    mocks.access.mockReturnValue({ ...OPEN, may: { ...OPEN.may, termAck: false } })
    await expect(hrAppProbationAck('st1')).resolves.toEqual(SHUT)
    // An account whose may carries no termAck at all (an older shape): refused too.
    mocks.access.mockReturnValue({ ...OPEN, may: { attDecide: true, decide: true, hireApprove: true, hireEdit: true, hireCreate: true, talentEdit: true, book: true } })
    await expect(hrAppProbationAck('st1')).resolves.toEqual(SHUT)
    expect(mocks.probationAck).not.toHaveBeenCalled()
  })
})

describe('a contract’s reminder, acknowledged from the HR app (2026-10-24)', () => {
  it('goes to People’s own acknowledgeContract by the same right — never the probation’s', async () => {
    mocks.contractAck.mockResolvedValue({ ok: true, endsOn: '2027-09-30', ackName: 'LI SEAN', ackAt: '2026-10-24T02:00:00Z' })
    await expect(hrAppContractAck('st2')).resolves.toEqual({ ok: true })
    expect(mocks.contractAck).toHaveBeenCalledWith('st2')
    expect(mocks.probationAck).not.toHaveBeenCalled()
    mocks.contractAck.mockClear()
    mocks.access.mockReturnValue({ ...OPEN, may: { ...OPEN.may, termAck: false } })
    await expect(hrAppContractAck('st2')).resolves.toEqual(SHUT)
    expect(mocks.contractAck).not.toHaveBeenCalled()
  })
})
