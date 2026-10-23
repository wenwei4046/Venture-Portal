import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HIRING_BOARD, TALENT_REASONS } from '@/test/hiring-board'
import type { HiringBankReason } from './types'
import { STARTING_REASONS, cameFrom, knownReason, outReason, pickable, reasonLabel, startReason, whyOrder } from './reasons'

// Why somebody is kept in the Talent Bank (2026-10-24, IT-0008) — HR's list since the same day (the user: "1, yes do
// with same", as File types). The page and the database never disagree on the five it began with, nor on the default
// a stage gives (migs 20261024233700, 20261025021500).
const read = (f: string) => readFileSync(resolve(process.cwd(), 'supabase/migrations', f), 'utf8')
const REASON_MIGRATION = read('20261024233700_talent_bank_reason.sql')
const LIST_MIGRATION = read('20261025021500_talent_bank_reasons_managed.sql')

// HR has renamed one, turned one off and added two (one of them off too).
const LIST: HiringBankReason[] = [
  { id: 'not_shortlisted', name: 'Not shortlisted', active: true, used: 2 },
  { id: 'failed_interview', name: 'Interview failed', active: true, used: 1 },
  { id: 'not_right_now', name: 'Not right now', active: false, used: 4 },
  { id: 'declined_offer', name: 'Declined offer', active: true, used: 0 },
  { id: 'other', name: 'Other', active: true, used: 0 },
  { id: 'r-salary', name: 'Salary too high', active: true, used: 1 },
  { id: 'r-moved', name: 'Moved away', active: false, used: 0 },
]

describe('the reasons', () => {
  it('begin as the five the database seeds, in its order and with its words', () => {
    const seeded = /INSERT INTO public\.hiring_bank_reasons \(id, name, sort\) VALUES([\s\S]*?);/.exec(LIST_MIGRATION)?.[1] ?? ''
    expect(STARTING_REASONS.map(r => [r.id, r.name])).toEqual([...seeded.matchAll(/\('(\w+)', '([^']+)', \d+\)/g)].map(m => [m[1], m[2]]))
    expect(TALENT_REASONS.map(r => r.id)).toEqual(STARTING_REASONS.map(r => r.id))
  })

  it('says one by HR’s words, or nothing for somebody kept before it was asked', () => {
    expect(reasonLabel(LIST, 'failed_interview')).toBe('Interview failed')
    expect(reasonLabel(LIST, 'not_right_now')).toBe('Not right now')
    expect(reasonLabel(LIST, null)).toBe('')
    expect(reasonLabel(LIST, 'gone')).toBe('')
  })

  it('a picker offers the ones that are on — and the one somebody already has, though it was turned off since', () => {
    expect(pickable(LIST).map(r => r.id)).toEqual(['not_shortlisted', 'failed_interview', 'declined_offer', 'other', 'r-salary'])
    expect(pickable(LIST, 'not_right_now').map(r => r.id)).toEqual(['not_shortlisted', 'failed_interview', 'not_right_now', 'declined_offer', 'other', 'r-salary'])
  })

  it('a form starts on the reason it wants while that one is on, else on the first that is', () => {
    expect(startReason(LIST, 'declined_offer')).toBe('declined_offer')
    expect(startReason(LIST, 'not_right_now')).toBe('not_shortlisted')
    expect(startReason([], 'not_right_now')).toBe('')
  })

  it('Not selected ▸ why? lists the ones that are on, the one their stage says first', () => {
    expect(whyOrder(LIST, 'appointment').map(r => r.name)).toEqual(['Interview failed', 'Not shortlisted', 'Declined offer', 'Other', 'Salary too high'])
    expect(whyOrder(LIST.map(r => (r.id === 'failed_interview' ? { ...r, active: false } : r)), 'appointment')[0].id).toBe('not_shortlisted')
  })

  it('a new name the list already has on is that reason — whatever its case and spaces', () => {
    expect(knownReason(LIST, '  salary TOO high ')).toBe('r-salary')
    // One turned off is named again through the database, which turns it back on.
    expect(knownReason(LIST, 'Moved away')).toBeNull()
    expect(knownReason(LIST, 'Relocating')).toBeNull()
  })

  it('a candidate leaving a stage: the one the database keeps when none is given', () => {
    expect((['shortlisted', 'appointment', 'offered', 'hired', 'rejected'] as const).map(outReason))
      .toEqual(['not_shortlisted', 'failed_interview', 'declined_offer', 'other', 'not_shortlisted'])
    const sql = /hiring_out_reason\(p_stage text\)[\s\S]*?CASE p_stage([\s\S]*?)END;/.exec(REASON_MIGRATION)?.[1] ?? ''
    for (const [, stage, reason] of sql.matchAll(/WHEN '(\w+)' THEN '(\w+)'/g)) expect(outReason(stage as never)).toBe(reason)
  })

  it('where they came from: the request and what it was for, else the Talent Bank itself', () => {
    expect(cameFrom(HIRING_BOARD, { fromRequest: 'HR-198' })).toBe('HR-198 · Senior Revenue Specialist')
    expect(cameFrom(HIRING_BOARD, { fromRequest: 'HR-001' })).toBe('HR-001')
    expect(cameFrom(HIRING_BOARD, { fromRequest: null })).toBe('Added in Talent Bank')
  })
})
