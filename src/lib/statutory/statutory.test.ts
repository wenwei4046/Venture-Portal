import { describe, it, expect } from 'vitest'
import { generateKwspFormA } from './kwsp-form-a'
import { generatePerkesoSocso } from './perkeso-socso'
import { generatePerkesoEis } from './perkeso-eis'
import { generateLhdnCp39 } from './lhdn-cp39'
import type { StatutoryContributor, StatutoryFileMetadata } from './types'

const META: StatutoryFileMetadata = {
  period: '2026-04-01',
  employerReference: 'HV-202604',
}

const ALICE: StatutoryContributor = {
  code: 'EMP-001',
  fullName: 'Alice Tan',
  nric: '850101-14-1234',
  statutoryWages: 5000,
  taxableIncome: 4450,
  epfEr: 650,
  epfEe: 550,
  socsoEr: 86.65,
  socsoEe: 24.75,
  eisEr: 9.9,
  eisEe: 9.9,
  pcb: 120,
}

const BOB: StatutoryContributor = {
  code: 'EMP-002',
  fullName: 'Bob Lim',
  nric: '900202151234', // already dash-free
  statutoryWages: 3000,
  taxableIncome: 2670,
  epfEr: 390,
  epfEe: 330,
  socsoEr: 51.65,
  socsoEe: 14.75,
  eisEr: 5.9,
  eisEe: 5.9,
  pcb: 0, // no tax — filtered from LHDN only
}

const NRIC_MISSING: StatutoryContributor = {
  ...ALICE,
  fullName: 'Carol Lee',
  nric: null,
}

// ───────────── KWSP Form A ─────────────

describe('generateKwspFormA', () => {
  it('emits header + row per contributor with correct totals', () => {
    const r = generateKwspFormA([ALICE, BOB], META)
    const lines = r.csv.trim().split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('PERIOD,EMPLOYER_REF,NRIC,NAME,WAGES,EPF_EE,EPF_ER,TOTAL')
    expect(lines[1]).toBe('202604,HV-202604,850101141234,Alice Tan,5000.00,550.00,650.00,1200.00')
    expect(lines[2]).toBe('202604,HV-202604,900202151234,Bob Lim,3000.00,330.00,390.00,720.00')
    expect(r.rowCount).toBe(2)
    expect(r.totalAmount).toBe(1200 + 720)
  })

  it('strips dashes from NRIC', () => {
    const r = generateKwspFormA([ALICE], META)
    expect(r.csv).toContain('850101141234')
    expect(r.csv).not.toContain('850101-14-1234')
  })

  it('skips contributors missing NRIC and reports them', () => {
    const r = generateKwspFormA([ALICE, NRIC_MISSING], META)
    expect(r.rowCount).toBe(1)
    expect(r.skipped).toEqual([{ name: 'Carol Lee', reason: 'missing_nric' }])
  })

  it('includes zero-contribution rows (EPF-exempt staff still get filed)', () => {
    const zero: StatutoryContributor = { ...ALICE, epfEe: 0, epfEr: 0 }
    const r = generateKwspFormA([zero], META)
    expect(r.rowCount).toBe(1)
    expect(r.totalAmount).toBe(0)
  })
})

// ───────────── PERKESO SOCSO ─────────────

describe('generatePerkesoSocso', () => {
  it('emits header + rows with SOCSO breakdown', () => {
    const r = generatePerkesoSocso([ALICE], META)
    const lines = r.csv.trim().split('\r\n')
    expect(lines[0]).toBe('PERIOD,EMPLOYER_REF,NRIC,NAME,WAGES,SOCSO_EE,SOCSO_ER,TOTAL')
    expect(lines[1]).toBe('202604,HV-202604,850101141234,Alice Tan,5000.00,24.75,86.65,111.40')
    expect(r.totalAmount).toBe(111.4)
  })

  it('skips missing NRIC', () => {
    const r = generatePerkesoSocso([NRIC_MISSING], META)
    expect(r.rowCount).toBe(0)
    expect(r.skipped).toHaveLength(1)
  })
})

// ───────────── PERKESO EIS ─────────────

describe('generatePerkesoEis', () => {
  it('emits header + rows with EIS breakdown', () => {
    const r = generatePerkesoEis([ALICE, BOB], META)
    const lines = r.csv.trim().split('\r\n')
    expect(lines[0]).toBe('PERIOD,EMPLOYER_REF,NRIC,NAME,WAGES,EIS_EE,EIS_ER,TOTAL')
    expect(lines[1]).toContain('Alice Tan')
    expect(lines[1]).toContain('9.90,9.90,19.80')
    expect(r.rowCount).toBe(2)
    expect(r.totalAmount).toBe(19.8 + 11.8)
  })
})

// ───────────── LHDN CP39 ─────────────

describe('generateLhdnCp39', () => {
  it('emits header + rows only where PCB > 0', () => {
    const r = generateLhdnCp39([ALICE, BOB], META)
    const lines = r.csv.trim().split('\r\n')
    expect(lines).toHaveLength(2) // header + Alice only (Bob has PCB=0)
    expect(lines[0]).toBe('PERIOD,EMPLOYER_REF,NRIC,NAME,TAXABLE_INCOME,PCB')
    expect(lines[1]).toBe('202604,HV-202604,850101141234,Alice Tan,4450.00,120.00')
    expect(r.rowCount).toBe(1)
    expect(r.totalAmount).toBe(120)
  })

  it('skips zero-PCB contributors without flagging as missing', () => {
    const r = generateLhdnCp39([BOB], META)
    expect(r.rowCount).toBe(0)
    expect(r.skipped).toHaveLength(0)
  })

  it('flags PCB > 0 but missing NRIC', () => {
    const missing: StatutoryContributor = { ...ALICE, nric: null }
    const r = generateLhdnCp39([missing], META)
    expect(r.rowCount).toBe(0)
    expect(r.skipped).toHaveLength(1)
  })
})

// ───────────── Shared helpers ─────────────

describe('CSV escaping', () => {
  it('escapes names with commas', () => {
    const row: StatutoryContributor = { ...ALICE, fullName: 'Tan, Jr.' }
    const r = generateKwspFormA([row], META)
    expect(r.csv).toContain('"Tan, Jr."')
  })

  it('escapes double quotes inside names', () => {
    const row: StatutoryContributor = { ...ALICE, fullName: 'He "Johnny" Lim' }
    const r = generateKwspFormA([row], META)
    expect(r.csv).toContain('"He ""Johnny"" Lim"')
  })
})
