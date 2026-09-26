import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import RunControls from './RunControls'

vi.mock('../../../run-actions', () => ({ computeRun: vi.fn(), reopenRun: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

afterEach(cleanup)

const props = { period: '2026-08-01', subDepartmentId: 'fair', runId: null, status: 'none' as const, warningCount: 0, hasImport: true }

describe('RunControls', () => {
  it('offers no compute for a month settled by hand — it would sync its commission to payroll', () => {
    render(<RunControls {...props} settledBefore="September 2026" />)
    expect(screen.queryByRole('button', { name: /Compute/ })).toBeNull()
    expect(screen.getByText(/Settled by hand — the portal pays from September 2026/)).toBeVisible()
  })

  it('computes a month the portal pays', () => {
    render(<RunControls {...props} period="2026-09-01" />)
    expect(screen.getByRole('button', { name: 'Compute & sync payroll' })).toBeEnabled()
  })
})
