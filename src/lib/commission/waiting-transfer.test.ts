import { describe, expect, it } from 'vitest'
import {
  accountDigits,
  defaultHireDate,
  fullText,
  missingFields,
  nricDigits,
  onTheList,
  transferBanner,
  transferErrorWords,
  transferFactsFromRow,
  transferRefusal,
  type TransferInput,
} from './waiting-transfer'

// member_waiting_transfer as it answered in the dry-run of mig 20261010140000 (2026-10-10).
const ROW = {
  held: 0, start: '2026-10-20', status: 'waiting', contact: '012-345 6789', capacity: 28, occupied: 28, seatFree: false,
  newPerson: 'Amelia Tan', requestId: '33333333-3333-4333-8333-333333333333', requestNo: 'RQ-2610-001', submittedBy: 'CHEA HUAN',
  departmentId: '186bd9e0-fee1-4a8f-b2a9-c2656398b316', subDepartment: 'Fair', submittedById: '6c8c6df1-a77f-4088-bb79-1ececb0a1041',
  subDepartmentId: '71709f7e-9f7c-4e28-80cf-ce21be336995',
}

const INPUT: TransferInput = {
  requestId: ROW.requestId, name: 'Amelia Tan', titleId: 't1', reportsTo: null, hireDate: '2026-10-20',
  nric: '900101-14-5678', bankName: 'Maybank', bankAccountNo: '1234 5678 90', contact: '012-345 6789', email: '',
}

describe('the facts the form starts from', () => {
  it('reads member_waiting_transfer()', () => {
    const f = transferFactsFromRow(ROW)
    expect(f).toMatchObject({ requestNo: 'RQ-2610-001', newPerson: 'Amelia Tan', subDepartment: 'Fair', capacity: 28, occupied: 28, seatFree: false })
    expect(transferFactsFromRow({})).toBeNull()
  })

  it('says when the sub-department is full, and nothing while there is room or no limit', () => {
    const f = transferFactsFromRow(ROW)!
    expect(fullText(f)).toBe('Fair is full — 28 of 28 places are taken.')
    expect(fullText({ ...f, seatFree: true })).toBeNull()
    expect(fullText({ ...f, capacity: null, seatFree: true })).toBeNull()
  })

  it('takes only applicants still on the list', () => {
    expect(['waiting', 'reserved', 'accepted'].every(onTheList)).toBe(true)
    expect(['failed', 'executed', 'withdrawn', 'submitted'].some(onTheList)).toBe(false)
  })

  it('heads the form with where the applicant came from', () => {
    expect(transferBanner(transferFactsFromRow(ROW)!)).toBe('Transfer from waiting list · RQ-2610-001 · submitted by CHEA HUAN · joins Revenue · Fair only')
  })

  it('opens on the preferred start, or today once it has passed', () => {
    expect(defaultHireDate('2026-10-20', '2026-10-10')).toBe('2026-10-20')
    expect(defaultHireDate('2026-09-11', '2026-10-10')).toBe('2026-10-10')
    expect(defaultHireDate(null, '2026-10-10')).toBe('2026-10-10')
  })
})

describe('Add to company', () => {
  it('goes once NRIC and the bank account are in', () => {
    expect(transferRefusal(INPUT)).toBeNull()
    expect(missingFields({ nric: ' ', bankName: 'Maybank', bankAccountNo: '' })).toEqual(['nric', 'bankAccountNo'])
    expect(transferRefusal({ ...INPUT, nric: '' })).toBe('Fill in NRIC and the bank account to add Amelia Tan.')
    expect(transferRefusal({ ...INPUT, name: ' ' })).toBe('Enter the full name.')
    expect(transferRefusal({ ...INPUT, titleId: '' })).toBe('Pick the joining title.')
    expect(transferRefusal({ ...INPUT, bankAccountNo: '12AB' })).toBe('An account number is its digits.')
    expect(transferRefusal({ ...INPUT, email: 'amelia@' })).toBe('That email does not look right.')
  })

  it('files NRIC and the account as digits', () => {
    expect(nricDigits('900101-14-5678')).toBe('900101145678')
    expect(accountDigits('1234 5678-90')).toBe('1234567890')
  })

  it('passes the database’s own sentence on, and words the rest', () => {
    expect(transferErrorWords({ code: '22023', message: 'Fair is full — 28 of 28 places are taken. Raise the limit on Rules › Capacity first.' }))
      .toBe('Fair is full — 28 of 28 places are taken. Raise the limit on Rules › Capacity first.')
    expect(transferErrorWords({ code: '23REC', message: 'Revenue Specialist cannot lead anyone in Fair' })).toBe('Revenue Specialist cannot lead anyone in Fair')
    expect(transferErrorWords({ code: '42501', message: 'x' })).toBe('Transferring needs HR request management and People › Create access.')
    expect(transferErrorWords({ code: 'XX000', message: 'boom' })).toBe('The employee could not be added. Please try again.')
  })
})
