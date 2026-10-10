import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SchemeRow } from '../config/types'

// Rules › Scheme rules (2026-10-10, the HR revamp): the eight components as
// switches, a dot on each one changed since the last save, Save / Saved at
// the top, and what a component needs besides its switch under its row.

const nav = vi.hoisted(() => ({ refresh: vi.fn() }))
const act = vi.hoisted(() => ({ saveSchemeRules: vi.fn() }))
const toast = vi.hoisted(() => ({ flash: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: nav.refresh }) }))
vi.mock('../../config-actions', () => act)
vi.mock('@/components/hrv/toast', () => toast)

import SchemePanel from './SchemePanel'

// IR on 2026-10-10: product revenue, override and the group package.
const ir: SchemeRow = {
  id: 'scheme-ir',
  sub_department_id: 'sub-ir',
  scheme_name: 'IR scheme',
  open_bill_basis: 'uplift_on_commission',
  override_includes_kpi: false,
  enable_product_revenue: true,
  enable_kpi: false,
  enable_open_bill: false,
  enable_override: true,
  enable_margin_penalty: false,
  enable_margin_incentive: false,
  enable_group_incentive: false,
  group_sales_depth: null,
  override_depth: null,
  direct_line_limit: null,
  deposit_threshold_pct: 0.3,
  default_rate_mode: 'variable',
  revenue_cost_divisor: 0.7,
}

const sw = (name: string) => screen.getByRole('switch', { name })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SchemePanel', () => {
  it('shows each component as a switch, in the prototype’s order, Saved until something moves', () => {
    render(<SchemePanel scheme={ir} subName="IR" canManage />)
    const components = screen.getAllByRole('switch').map(s => s.getAttribute('aria-label')).filter(l => l !== 'Override base includes KPI revenue')
    expect(components).toEqual([
      'Product revenue commission',
      'KPI item allowance',
      'Open Bill bonus',
      'Hierarchy override',
      'Below-margin penalty',
      'Monthly margin incentive',
      'Group incentive package',
      'Deposit gate',
    ])
    expect(sw('Product revenue commission')).toHaveAttribute('aria-checked', 'true')
    expect(sw('KPI item allowance')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument()
    expect(screen.getByText('Which components IR pays. A switched-off component is skipped by the engine, and the item-rule tabs it reads come and go with it.')).toBeInTheDocument()
  })

  it('marks a changed switch with a dot and turns Saved into Save', () => {
    render(<SchemePanel scheme={ir} subName="IR" canManage />)
    fireEvent.click(sw('KPI item allowance'))
    expect(sw('KPI item allowance')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getAllByLabelText('changed')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    fireEvent.click(sw('KPI item allowance'))
    expect(screen.queryByLabelText('changed')).toBeNull()
  })

  it('opens the group package’s three layer settings at 2 · 2 · 3 when it is switched on', () => {
    render(<SchemePanel scheme={ir} subName="IR" canManage />)
    expect(screen.queryByLabelText('Group sales layers')).toBeNull()
    fireEvent.click(sw('Group incentive package'))
    expect(screen.getByLabelText('Group sales layers')).toHaveValue(2)
    expect(screen.getByLabelText('Override layers')).toHaveValue(2)
    expect(screen.getByLabelText('Direct-line limit')).toHaveValue(3)
  })

  it('puts the layer settings back when the package is switched off again — out of sight, they bind Fair too', () => {
    render(<SchemePanel scheme={ir} subName="IR" canManage />)
    fireEvent.click(sw('Group incentive package'))
    fireEvent.click(sw('Group incentive package'))
    expect(screen.queryByLabelText('changed')).toBeNull()
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument()
  })

  it('saves every switch and setting in one go, then refreshes the list of sections', async () => {
    act.saveSchemeRules.mockResolvedValue({ ok: true })
    render(<SchemePanel scheme={ir} subName="IR" canManage />)
    fireEvent.click(sw('Open Bill bonus'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(act.saveSchemeRules).toHaveBeenCalledTimes(1))
    const fd = act.saveSchemeRules.mock.calls[0][0] as FormData
    expect(fd.get('scheme_id')).toBe('scheme-ir')
    expect(fd.get('enable_open_bill')).toBe('on')
    expect(fd.get('enable_kpi')).toBeNull()
    expect(fd.get('deposit_gate_on')).toBe('on')
    expect(fd.get('deposit_threshold_pct')).toBe('30')
    expect(fd.get('revenue_cost_divisor')).toBe('0.7')
    expect(fd.get('default_rate_mode')).toBe('variable')
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled())
    expect(toast.flash).toHaveBeenCalledWith('Scheme rules saved — the tab list follows the switches')
  })

  it('says why a save was refused, and keeps the draft', async () => {
    act.saveSchemeRules.mockResolvedValue({ ok: false, reason: 'Give the deposit gate a threshold, or switch it off' })
    render(<SchemePanel scheme={ir} subName="IR" canManage />)
    fireEvent.click(sw('Open Bill bonus'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Give the deposit gate a threshold, or switch it off')
    expect(sw('Open Bill bonus')).toHaveAttribute('aria-checked', 'true')
    expect(nav.refresh).not.toHaveBeenCalled()
  })

  it('is read-only for whoever may not manage the rules', () => {
    render(<SchemePanel scheme={ir} subName="IR" canManage={false} />)
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull()
    expect(sw('KPI item allowance')).toBeDisabled()
    fireEvent.click(sw('KPI item allowance'))
    expect(sw('KPI item allowance')).toHaveAttribute('aria-checked', 'false')
  })
})
