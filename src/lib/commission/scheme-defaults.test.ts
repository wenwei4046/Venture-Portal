import { describe, expect, it } from 'vitest'
import {
  SCHEME_SWITCHES,
  blankSchemeSettings,
  copiedSchemeSettings,
  isBlankScheme,
  newSchemeSettings,
  type SchemeSettings,
} from './scheme-defaults'

/** Fair's live scheme row, as `select('*')` returns it — extra columns included. */
const fair: SchemeSettings & { id: string; scheme_name: string } = {
  id: 'ab55f0b5',
  scheme_name: 'Fair 2026',
  enable_product_revenue: true,
  enable_kpi: true,
  enable_open_bill: true,
  enable_override: true,
  enable_margin_penalty: true,
  enable_margin_incentive: true,
  override_includes_kpi: false,
  deposit_threshold_pct: '0.500000',
  open_bill_basis: 'uplift_on_commission',
  default_rate_mode: 'variable',
}

describe('newSchemeSettings', () => {
  it('start blank: every switch off and no deposit gate (user 2026-09-10)', () => {
    const blank = newSchemeSettings(null)
    for (const k of SCHEME_SWITCHES) expect(blank[k], k).toBe(false)
    expect(blank.override_includes_kpi).toBe(false)
    expect(blank.deposit_threshold_pct).toBeNull()
    expect(isBlankScheme(blank)).toBe(true)
    expect(blankSchemeSettings()).toEqual(blank)
  })

  it('follow an existing ruleset: the source switches as they are', () => {
    const copied = newSchemeSettings(fair)
    for (const k of SCHEME_SWITCHES) expect(copied[k], k).toBe(fair[k])
    expect(copied.deposit_threshold_pct).toBe('0.500000')
    expect(copied.default_rate_mode).toBe('variable')
    expect(isBlankScheme(copied)).toBe(false)
  })

  it('copies settings only, never the source row identity', () => {
    const copied = copiedSchemeSettings(fair) as unknown as Record<string, unknown>
    expect(copied).not.toHaveProperty('id')
    expect(copied).not.toHaveProperty('scheme_name')
    expect(Object.keys(copied).sort()).toEqual(
      [...SCHEME_SWITCHES, 'override_includes_kpi', 'deposit_threshold_pct', 'open_bill_basis', 'default_rate_mode'].sort(),
    )
  })

  it('a scheme with any switch on is not blank', () => {
    expect(isBlankScheme({ ...blankSchemeSettings(), enable_kpi: true })).toBe(false)
  })
})
