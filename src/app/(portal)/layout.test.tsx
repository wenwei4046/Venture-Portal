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
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requireAuth: mocks.requireAuth }))
vi.mock('./revenue/_lib/sub-departments', () => ({ listSubDepartments: mocks.listSubDepartments }))
vi.mock('@/lib/dept-registry', async (orig) => ({ ...(await orig<object>()), primedRegistryRows: () => mocks.REGISTRY }))
vi.mock('@/components/layout/PortalFrame', () => ({ default: () => null }))
const nav = vi.hoisted(() => ({ redirect: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: nav.redirect }))
// The fold of HR's sidebar and the Revenue sub-department last picked are cookies (2026-10-10);
// whether it is a phone is the browser's own words (2026-10-14: Finance's shell is the computer's).
const jar = vi.hoisted(() => ({ values: {} as Record<string, string>, ua: '' }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (k: string) => (k in jar.values ? { value: jar.values[k] } : undefined) }),
  headers: async () => ({ get: (k: string) => (k === 'user-agent' ? jar.ua : null) }),
}))
// Whether the login is a person's own (2026-10-12): the database's answer, read beside the nav.
const login = vi.hoisted(() => ({ personal: false }))
vi.mock('@/lib/account/personal-login', () => ({ loginIsPersonal: async () => login.personal }))

import PortalLayout from './layout'

type FrameProps = {
  user: { id: string; personalLogin?: boolean }
  navData: { revenueSubDepts: unknown[]; revenueSub?: string | null; deptPoolDepts?: Array<{ label: string }> }
  hrNavCollapsed?: boolean
  phone?: boolean
}
const frameFor = async () => ((await PortalLayout({ children: null })) as ReactElement<FrameProps>).props
const navDataFor = async () => ((await PortalLayout({ children: null })) as ReactElement<FrameProps>).props.navData

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listSubDepartments.mockResolvedValue([{ slug: 'fair', name: 'Fair' }])
  login.personal = false
})

describe('the account the shell is drawn for', () => {
  it('marks a personal login, so Admin lists Change password; a shared one stays unmarked (2026-10-12)', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'carrie', role: 'finance', permissions: ['treasury'] }))
    expect((await frameFor()).user.personalLogin).toBeUndefined()
    login.personal = true
    expect((await frameFor()).user).toMatchObject({ id: 'carrie', personalLogin: true })
  })
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
    expect(data.revenueSub).toBe('fair')
    expect(data.deptPoolDepts).toHaveLength(7)
  })

  it('hands whoever does not read the reports none', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 's', role: 'staff', permissions: ['dept_pool', 'dept_reports'] }))
    const data = await navDataFor()
    expect(data.deptPoolDepts).toBeUndefined()
  })

  it('opens Revenue on the sub-department last picked, else the home one (2026-10-10)', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'p', role: 'principal', permissions: ['revenue'] }))
    mocks.listSubDepartments.mockResolvedValue([
      { slug: 'fair', name: 'Fair', isHome: true },
      { slug: 'ir', name: 'IR', isHome: false },
    ])
    expect((await navDataFor()).revenueSub).toBe('fair')
    jar.values['vp-rev-sub'] = 'ir'
    expect((await navDataFor()).revenueSub).toBe('ir')
    jar.values['vp-rev-sub'] = 'gone'
    expect((await navDataFor()).revenueSub).toBe('fair')
  })

  it('folds HR’s sidebar and Finance’s (2026-10-14) from their cookie, never the Principal’s own', async () => {
    jar.values['vp-hr-nav'] = 'collapsed'
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'h', role: 'hr', permissions: ['team'] }))
    expect((await frameFor()).hrNavCollapsed).toBe(true)
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'f', role: 'finance', permissions: ['treasury'] }))
    expect((await frameFor()).hrNavCollapsed).toBe(true)
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'p', role: 'principal', permissions: ['treasury'] }))
    expect((await frameFor()).hrNavCollapsed).toBe(false)
    delete jar.values['vp-hr-nav']
  })

  it('tells the shell when it is a phone', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'p', role: 'principal', permissions: ['treasury'] }))
    jar.ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36'
    expect((await frameFor()).phone).toBe(false)
    jar.ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'
    expect((await frameFor()).phone).toBe(true)
    expect(nav.redirect).not.toHaveBeenCalled()
    jar.ua = ''
  })

  it('sends Finance’s view on a phone to the Finance app (2026-10-16) — on a computer it stays', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'f', role: 'finance', permissions: ['treasury'] }))
    jar.ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36'
    await frameFor()
    expect(nav.redirect).not.toHaveBeenCalled()
    jar.ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    await frameFor()
    expect(nav.redirect).toHaveBeenCalledWith('/fin-app')
    jar.ua = ''
  })
})
