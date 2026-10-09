import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — Dept Pool lists each department for whoever reads them all;
// the departments added since (IT, Revenue Department) come from the registry
// the request has already primed, so the sidebar knows them without a read.

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  listSubDepartments: vi.fn(),
  REGISTRY: [
    { id: 'mk', name: 'Marketing', segmentKey: 'marketing', poolGlCode: '1030', billingModeKey: 'marketing_project', isInternal: false },
    { id: 'it', name: 'IT', segmentKey: 'it', poolGlCode: '1100', billingModeKey: 'it_attribution', isInternal: false },
    { id: 'rd', name: 'Revenue Department', segmentKey: 'revenue_department', poolGlCode: '1090', billingModeKey: 'revenue_department_attribution', isInternal: false },
  ],
}))
vi.mock('@/lib/auth', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('./revenue/_lib/sub-departments', () => ({ listSubDepartments: mocks.listSubDepartments }))
vi.mock('@/lib/dept-registry', async (orig) => ({ ...(await orig<object>()), primedRegistryRows: () => mocks.REGISTRY }))
vi.mock('@/components/layout/PortalFrame', () => ({ default: () => null }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import PortalLayout from './layout'

type FrameProps = { navData: { revenueSubDepts: unknown[]; deptPoolDepts?: Array<{ label: string }> } }
const navDataFor = async () => ((await PortalLayout({ children: null })) as ReactElement<FrameProps>).props.navData

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listSubDepartments.mockResolvedValue([{ slug: 'fair', name: 'Fair' }])
})

describe('the sidebar’s data', () => {
  it('hands Dept Pool every department, the added ones included, to whoever reads them all', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'f', role: 'finance', permissions: ['dept_pool', 'reports', 'dept_reports'] }))
    const data = await navDataFor()
    expect(data.deptPoolDepts?.map((d) => d.label)).toEqual(['Venture', 'Marketing', 'Finance', 'HR', 'Director Office', 'IT', 'Revenue Department'])
  })

  it('keeps the Revenue sub-departments beside them', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'p', role: 'principal', permissions: ['dept_pool', 'reports', 'dept_reports', 'revenue'] }))
    const data = await navDataFor()
    expect(data.revenueSubDepts).toEqual([{ slug: 'fair', name: 'Fair' }])
    expect(data.deptPoolDepts).toHaveLength(7)
  })

  it('hands a department manager none', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'm', role: 'dept_manager', permissions: ['dept_pool', 'dept_reports'] }))
    const data = await navDataFor()
    expect(data.deptPoolDepts).toBeUndefined()
  })
})
