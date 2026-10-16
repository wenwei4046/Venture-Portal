import { describe, expect, it } from 'vitest'
import type { DepartmentMode } from '@/lib/department-mode'
import { SEGMENT_KEY, departmentsModel, segmentKeyOf, slugOf, type DeptInput } from './departments-model'

// Profile › Admin › Departments in the Finance phone app (2026-10-15, part
// E3b): Settings › Departments as the desktop reads it — the departments, the
// cost centers, the bill-backs; each department's segment, pool, billing mode,
// mode and bill-back in words.

const ROWS: DeptInput[] = [
  { id: 'hr', name: 'HR', is_internal: false, segment_key: 'hr', pool_gl_code: '1010', billing_mode_key: 'hr_attribution', own_share_billback: true },
  { id: 'mkt', name: 'Marketing', is_internal: false, segment_key: 'marketing', pool_gl_code: '1030', billing_mode_key: 'marketing_project', own_share_billback: false },
  { id: 'vo', name: 'Venture Office', is_internal: true, segment_key: 'venture', pool_gl_code: null, billing_mode_key: null, own_share_billback: false },
  { id: 'ops', name: 'Operations', is_internal: false, segment_key: null, pool_gl_code: null, billing_mode_key: null, own_share_billback: false },
]
const mode = (id: string, name: string, costModel: 'cost_center' | 'centralized', isInternal = false): DepartmentMode => ({
  id, name, segmentKey: id, isInternal, costModel, openSplitPeople: 0, canSwitch: true,
})
const MODES = [mode('hr', 'HR', 'cost_center'), mode('mkt', 'Marketing', 'centralized'), mode('vo', 'Venture Office', 'cost_center', true)]
const POOLS = { '1010': 'Dept Pool - HR', '1030': 'Dept Pool - Marketing' }

describe('Departments on the phone', () => {
  it('opens on the departments, the cost centers and the bill-backs (the desktop’s cards)', () => {
    const m = departmentsModel(ROWS, MODES, POOLS)
    expect(m.hero).toEqual({ value: '3', label: 'Departments · 1 cost center' })
    expect(m.chip).toBe('1 bill back salary')
    expect(m.cards.map((c) => [c.label, c.sub, c.value])).toEqual([
      ['Departments', '2 full · 1 light', '4 departments'],
      ['Bill back salary', 'Of 2 full departments', '1 department'],
    ])
  })

  it('says each department in words — a light one books under Venture, the internal one bills back nothing', () => {
    const [hr, mkt, vo, ops] = departmentsModel(ROWS, MODES, POOLS).depts
    expect(hr).toMatchObject({ segment: 'hr', pool: '1010 · Dept Pool - HR', billsBack: true, billback: true, kind: 'Full department', full: true })
    expect(hr.mode?.costModel).toBe('cost_center')
    expect(mkt).toMatchObject({ billsBack: true, billback: false })
    expect(vo).toMatchObject({ kind: 'Internal', billsBack: false, mode: null })
    expect(ops).toMatchObject({ segment: 'Venture (light)', pool: '—', billing: '—', kind: 'Light · books under Venture', full: false, billsBack: false, mode: null })
  })

  it('suggests a segment key from the name and takes only one the database takes', () => {
    expect(slugOf('Revenue Department')).toBe('revenue_department')
    expect(slugOf('  R&D / Labs ')).toBe('r_d_labs')
    expect(segmentKeyOf('Ops-Team')).toBe('ops_team')
    expect(SEGMENT_KEY.test('operations')).toBe(true)
    expect(SEGMENT_KEY.test('op')).toBe(false)
    expect(SEGMENT_KEY.test('1ops')).toBe(false)
  })
})
