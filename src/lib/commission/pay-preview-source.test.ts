import { describe, expect, it } from 'vitest'
import { payPreviewSource } from './pay-preview-source'

const run = { id: 'run-oct' }

describe('payPreviewSource', () => {
  // Regression 2026-11-10: closing YUNY, the first close of October Fair, opened
  // an empty draft run; the preview read it as the run and blanked everybody's
  // Salary calculation ("Payroll inputs are not set for this person").
  it('reads an empty run (the draft a first close opens) as no run', () => {
    expect(payPreviewSource(run, 0, true)).toBe('before_run')
  })

  it('reads a run that holds statements as the run', () => {
    expect(payPreviewSource(run, 26, true)).toBe('run')
    expect(payPreviewSource(run, 26, false)).toBe('run')
  })

  it('previews from the payroll inputs while the month has no run', () => {
    expect(payPreviewSource(null, 0, true)).toBe('before_run')
  })

  it('leaves a board that does not preview without a run as it was', () => {
    expect(payPreviewSource(null, 0, false)).toBe('none')
    expect(payPreviewSource(run, 0, false)).toBe('run')
  })
})
