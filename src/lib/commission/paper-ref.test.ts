import { describe, expect, it } from 'vitest'
import { paperRef } from './paper-ref'

// ref_no / paper_no pairs as revenue_month_orders returned them for Fair,
// September 2026 (dry run of 20261003170000).
describe('paperRef', () => {
  it('shows the Ref No. of an ERP bill as the paper it is on', () => {
    // The user's example: HC-SO-2609-400 was keyed from paper HC13369.
    expect(paperRef('HC13369', 'HC13369')).toEqual({ kind: 'paper', text: 'HC13369', checkedAs: null })
  })

  it('says nothing more when the Ref No. differs from the number only in spacing, case or dashes', () => {
    expect(paperRef('HC 3749', 'HC3749')).toEqual({ kind: 'paper', text: 'HC 3749', checkedAs: null })
    expect(paperRef('znt-6762', 'ZNT6762')).toEqual({ kind: 'paper', text: 'znt-6762', checkedAs: null })
  })

  it('names the number the check matches on when the Ref No. carries more than one', () => {
    // HC-SO-2609-124: the customer's other paper follows its own.
    expect(paperRef('HC11589+HC12443', 'HC11589')).toEqual({ kind: 'paper', text: 'HC11589+HC12443', checkedAs: 'HC11589' })
    expect(paperRef('Refer HC8978', 'HC8978')).toEqual({ kind: 'paper', text: 'Refer HC8978', checkedAs: 'HC8978' })
  })

  it('shows a bill worked out by hand under its own number — that is its paper', () => {
    // August's claim-form rows carry the paper as order_no and have no ERP Ref No.
    expect(paperRef(null, 'EGT1068')).toEqual({ kind: 'paper', text: 'EGT1068', checkedAs: null })
  })

  it('flags a Ref No. that names no paper number', () => {
    // HC-SO-013509 "6760", HC-SO-2609-078 "-", HC-SO-2609-179 "ZNT".
    expect(paperRef('6760', null)).toEqual({ kind: 'unreadable', text: '6760' })
    expect(paperRef('-', null)).toEqual({ kind: 'unreadable', text: '-' })
    expect(paperRef('ZNT', null)).toEqual({ kind: 'unreadable', text: 'ZNT' })
  })

  it('flags an ERP bill with no Ref No. at all', () => {
    // HC-SO-2609-084, -164, -254 …: nothing typed into the Ref No.
    expect(paperRef(null, null)).toEqual({ kind: 'missing' })
    expect(paperRef('   ', null)).toEqual({ kind: 'missing' })
    expect(paperRef(undefined, undefined)).toEqual({ kind: 'missing' })
  })
})
