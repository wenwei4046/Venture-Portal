import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HIRING_BOARD } from '@/test/hiring-board'
import { REASONS, cameFrom, isReason, outReason, reasonLabel } from './reasons'

// Why somebody is kept in the Talent Bank (2026-10-24, IT-0008). The database keeps the same five and the same
// default by stage (mig 20261024233700): the page and the function never disagree on either.
const MIGRATION = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261024233700_talent_bank_reason.sql'), 'utf8')

describe('the reasons', () => {
  it('are the five the database keeps, in the dropdown’s order, with the words its trails write', () => {
    const check = /CHECK \(reason IN \(([^)]*)\)\)/.exec(MIGRATION)?.[1] ?? ''
    expect(REASONS.map(r => r.id)).toEqual([...check.matchAll(/'(\w+)'/g)].map(m => m[1]))
    const words = [...MIGRATION.matchAll(/WHEN '(\w+)' THEN '([^']+)'/g)].filter(m => isReason(m[1])).map(m => [m[1], m[2]])
    expect(REASONS.map(r => [r.id, r.label])).toEqual(words)
  })

  it('says one, or nothing for somebody kept before it was asked', () => {
    expect(reasonLabel('failed_interview')).toBe('Failed interview')
    expect(reasonLabel(null)).toBe('')
    expect(isReason('bored')).toBe(false)
  })

  it('a candidate leaving a stage: the one the database keeps when none is given', () => {
    expect((['shortlisted', 'appointment', 'offered', 'hired', 'rejected'] as const).map(outReason))
      .toEqual(['not_shortlisted', 'failed_interview', 'declined_offer', 'other', 'not_shortlisted'])
    const sql = /hiring_out_reason\(p_stage text\)[\s\S]*?CASE p_stage([\s\S]*?)END;/.exec(MIGRATION)?.[1] ?? ''
    for (const [, stage, reason] of sql.matchAll(/WHEN '(\w+)' THEN '(\w+)'/g)) expect(outReason(stage as never)).toBe(reason)
  })

  it('where they came from: the request and what it was for, else the Talent Bank itself', () => {
    expect(cameFrom(HIRING_BOARD, { fromRequest: 'HR-198' })).toBe('HR-198 · Senior Revenue Specialist')
    expect(cameFrom(HIRING_BOARD, { fromRequest: 'HR-001' })).toBe('HR-001')
    expect(cameFrom(HIRING_BOARD, { fromRequest: null })).toBe('Added in Talent Bank')
  })
})
