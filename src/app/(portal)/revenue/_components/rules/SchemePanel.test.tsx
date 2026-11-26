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
  override_includes_kpi: false,
  enable_product_revenue: true,
  enable_kpi: false,
  enable_override: true,
  enable_margin_penalty: false,
  enable_margin_incentive: false,
  enable_group_incentive: false,
  group_sales_depth: null,
  override_depth: null,
  direct_line_limit: null,
  deposit_threshold_pct: 0.3,
  default_rate_mode: 'variable',
}

const sw = (name: string) => screen.getByRole('switch', { name })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SchemePanel', () => {
  it('shows each component as a switch, in the prototype’s order, Saved until something moves', () => {
    render(<SchemePanel scheme={ir} canManage />)
    const components = screen.getAllByRole('switch').map(s => s.getAttribute('aria-label')).filter(l => l !== 'Override base includes KPI revenue')
    expect(components).toEqual([
      'Product revenue commission',
      'KPI item allowance',
      'Hierarchy override',
      // One switch since 2026-11-27 — the user: "the penalty and incentive is trigger together, make it into same button".
      'Margin incentive & penalty',
      'Group incentive package',
      'Deposit gate',
    ])
    expect(sw('Product revenue commission')).toHaveAttribute('aria-checked', 'true')
    expect(sw('KPI item allowance')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument()
  })

  it('marks a changed switch with a dot and turns Saved into Save', () => {
    render(<SchemePanel scheme={ir} canManage />)
    fireEvent.click(sw('KPI item allowance'))
    expect(sw('KPI item allowance')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getAllByLabelText('changed')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    fireEvent.click(sw('KPI item allowance'))
    expect(screen.queryByLabelText('changed')).toBeNull()
  })

  it('opens the group package’s three layer settings at 2 · 2 · 3 when it is switched on', () => {
    render(<SchemePanel scheme={ir} canManage />)
    expect(screen.queryByLabelText('Group sales layers')).toBeNull()
    fireEvent.click(sw('Group incentive package'))
    expect(screen.getByLabelText('Group sales layers')).toHaveValue(2)
    expect(screen.getByLabelText('Override layers')).toHaveValue(2)
    expect(screen.getByLabelText('Direct-line limit')).toHaveValue(3)
  })

  it('puts the layer settings back when the package is switched off again — out of sight, they bind Fair too', () => {
    render(<SchemePanel scheme={ir} canManage />)
    fireEvent.click(sw('Group incentive package'))
    fireEvent.click(sw('Group incentive package'))
    expect(screen.queryByLabelText('changed')).toBeNull()
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument()
  })

  it('saves every switch and setting in one go, then refreshes the list of sections', async () => {
    act.saveSchemeRules.mockResolvedValue({ ok: true })
    render(<SchemePanel scheme={ir} canManage />)
    fireEvent.click(sw('Margin incentive & penalty'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(act.saveSchemeRules).toHaveBeenCalledTimes(1))
    const fd = act.saveSchemeRules.mock.calls[0][0] as FormData
    expect(fd.get('scheme_id')).toBe('scheme-ir')
    // The one switch: the server sets the penalty and the incentive from it.
    expect(fd.get('enable_margin')).toBe('on')
    expect(fd.has('enable_margin_penalty')).toBe(false)
    expect(fd.has('enable_margin_incentive')).toBe(false)
    expect(fd.get('enable_kpi')).toBeNull()
    // Open Bill went (2026-10-31): neither its switch nor its basis is sent.
    expect(fd.has('enable_open_bill')).toBe(false)
    expect(fd.has('open_bill_basis')).toBe(false)
    expect(fd.get('deposit_gate_on')).toBe('on')
    expect(fd.get('deposit_threshold_pct')).toBe('30')
    expect(fd.has('revenue_cost_divisor')).toBe(false)
    expect(fd.get('default_rate_mode')).toBe('variable')
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled())
    expect(toast.flash).toHaveBeenCalledWith('Scheme rules saved — the tab list follows the switches')
  })

  it('says why a save was refused, and keeps the draft', async () => {
    act.saveSchemeRules.mockResolvedValue({ ok: false, reason: 'Give the deposit gate a threshold, or switch it off' })
    render(<SchemePanel scheme={ir} canManage />)
    fireEvent.click(sw('Margin incentive & penalty'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Give the deposit gate a threshold, or switch it off')
    expect(sw('Margin incentive & penalty')).toHaveAttribute('aria-checked', 'true')
    expect(nav.refresh).not.toHaveBeenCalled()
  })

  // 2026-10-11, the user: the cost basis is set on Product List › Costing
  // Setting only — two places for one number left nobody sure which counted.
  it('keeps the default rate mode and leaves the Revenue Team cost basis to the Product List', () => {
    render(<SchemePanel scheme={ir} canManage />)
    expect(screen.getByText('Default rate mode')).toBeInTheDocument()
    expect(screen.getByLabelText('Default rate mode')).toHaveValue('variable')
    expect(screen.queryByText(/cost basis/i)).toBeNull()
    expect(screen.queryByLabelText(/divisor/i)).toBeNull()
    expect(screen.queryByText(/unit cost/i)).toBeNull()
  })

  it('is read-only for whoever may not manage the rules', () => {
    render(<SchemePanel scheme={ir} canManage={false} />)
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull()
    expect(sw('KPI item allowance')).toBeDisabled()
    fireEvent.click(sw('KPI item allowance'))
    expect(sw('KPI item allowance')).toHaveAttribute('aria-checked', 'false')
  })

  // 2026-11-27 — the user, turning Fair's margin on with its new Akemi / Ergotex ladder: "从十二月开始"; and of the
  // penalty and the incentive: "trigger together, make it into same button".
  describe('the one margin switch and the month it starts', () => {
    const fair: SchemeRow = { ...ir, id: 'scheme-fair', enable_margin_penalty: true, enable_margin_incentive: true, margin_penalty_from: '2026-12-01' }

    it('is on while either half is — a scheme saved before they were one', () => {
      render(<SchemePanel scheme={{ ...ir, enable_margin_penalty: true }} canManage />)
      expect(sw('Margin incentive & penalty')).toHaveAttribute('aria-checked', 'true')
      cleanup()
      render(<SchemePanel scheme={{ ...ir, enable_margin_incentive: true }} canManage />)
      expect(sw('Margin incentive & penalty')).toHaveAttribute('aria-checked', 'true')
    })

    it('shows under the switch while it is on, the month it starts', () => {
      render(<SchemePanel scheme={fair} canManage />)
      expect(screen.getByLabelText('Margin starts from')).toHaveValue('2026-12')
      expect(screen.getByText('earlier months: no cut, no incentive')).toBeInTheDocument()
      cleanup()
      render(<SchemePanel scheme={ir} canManage />)
      expect(screen.queryByLabelText('Margin starts from')).toBeNull()
    })

    it('saves the month — empty for every month', async () => {
      act.saveSchemeRules.mockResolvedValue({ ok: true })
      render(<SchemePanel scheme={fair} canManage />)
      fireEvent.change(screen.getByLabelText('Margin starts from'), { target: { value: '2027-01' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(act.saveSchemeRules).toHaveBeenCalled())
      const fd = act.saveSchemeRules.mock.calls[0][0] as FormData
      expect(fd.get('margin_penalty_from')).toBe('2027-01')
      expect(fd.get('enable_margin')).toBe('on')
      fireEvent.change(screen.getByLabelText('Margin starts from'), { target: { value: '' } })
      expect(screen.getByText('every month')).toBeInTheDocument()
    })

    it('sends no month while it is off: what is stored stays', async () => {
      act.saveSchemeRules.mockResolvedValue({ ok: true })
      render(<SchemePanel scheme={fair} canManage />)
      fireEvent.click(sw('Margin incentive & penalty'))
      expect(screen.queryByLabelText('Margin starts from')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(act.saveSchemeRules).toHaveBeenCalled())
      const fd = act.saveSchemeRules.mock.calls[0][0] as FormData
      expect(fd.has('margin_penalty_from')).toBe(false)
      expect(fd.has('enable_margin')).toBe(false)
    })
  })
})
