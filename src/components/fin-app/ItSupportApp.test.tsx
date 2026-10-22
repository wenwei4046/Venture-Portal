import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

const mocks = vi.hoisted(() => ({
  user: { viewingAs: undefined as { id: string; name: string } | undefined },
  account: { permissions: ['it_requests'], actions: {} as Record<string, 'all'> },
  replace: vi.fn(),
  canStepBack: vi.fn(() => false),
  setIntent: vi.fn(),
  fetchMyItRequests: vi.fn(),
  fetchItDesk: vi.fn(),
  fetchItRequest: vi.fn(),
  signItFiles: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  redirect: (href: string) => { throw new Error(`redirect:${href}`) },
}))
vi.mock('@/lib/auth', () => ({ requireAuth: async () => mocks.user, getAccountUser: async () => mocks.account }))
vi.mock('@/lib/it-requests/actions', () => ({
  fetchMyItRequests: mocks.fetchMyItRequests, fetchItDesk: mocks.fetchItDesk,
  fetchItRequest: mocks.fetchItRequest, signItFiles: mocks.signItFiles,
}))
vi.mock('./nav', () => ({ canStepBack: mocks.canStepBack, setIntent: mocks.setIntent }))
vi.mock('./AppScreen', () => ({
  default: ({ head, children }: { head: { title: string; backLabel: string; onBack: () => void }; children: ReactNode }) => (
    <main>
      <button onClick={head.onBack}>Back to {head.backLabel}</button>
      <h1>{head.title}</h1>
      {children}
    </main>
  ),
}))
vi.mock('@/components/it-support/ItSupport', () => ({
  default: ({ app, initialId, readOnly, desk, canEdit, initialRequests }: {
    app: string; initialId?: string; readOnly?: boolean; desk?: boolean; canEdit?: boolean; initialRequests?: unknown[]
  }) => (
    <div data-testid="support" data-app={app} data-id={initialId} data-readonly={String(!!readOnly)}
      data-desk={String(!!desk)} data-edit={String(!!canEdit)} data-count={initialRequests?.length} />
  ),
}))

import ItSupportApp from './ItSupportApp'
import PortalPage from '@/app/(portal)/it-support/page'
import FinancePage from '@/app/(fin-app)/fin-app/it-support/page'
import DeskPage from '@/app/(portal)/it-requests/page'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.user.viewingAs = undefined
  mocks.account.actions = {}
  mocks.canStepBack.mockReturnValue(false)
  mocks.fetchMyItRequests.mockResolvedValue({ ok: true, data: [{ id: 'test-request', files: [] }] })
  mocks.fetchItDesk.mockResolvedValue({ ok: true, data: [{ id: 'test-request', files: [] }] })
  mocks.fetchItRequest.mockResolvedValue({ ok: true, data: null })
  mocks.signItFiles.mockResolvedValue({ ok: true, data: {} })
})

describe('IT support in its own host', () => {
  it.each([
    ['portal', PortalPage],
    ['finance', FinancePage],
  ] as const)('%s opens the notification’s request with its own source app', async (app, Page) => {
    render(await Page({ searchParams: Promise.resolve({ it: 'test-request' }) }))
    const support = screen.getByTestId('support')
    expect(support).toHaveAttribute('data-app', app)
    expect(support).toHaveAttribute('data-id', 'test-request')
    expect(support).toHaveAttribute('data-readonly', 'false')
    expect(support).toHaveAttribute('data-count', '1')
    expect(mocks.fetchMyItRequests).toHaveBeenCalledOnce()
    expect(mocks.fetchItRequest).not.toHaveBeenCalled()
  })

  it.each([
    ['/dashboard', PortalPage],
    ['/fin-app/profile', FinancePage],
    ['/dashboard', DeskPage],
  ] as const)('leaves view-as for %s before mounting private account requests', async (place, Page) => {
    mocks.user.viewingAs = { id: 'other', name: 'Other' }
    await expect(Page({ searchParams: Promise.resolve({ it: 'private-request' }) })).rejects.toThrow(`redirect:${place}`)
    expect(mocks.fetchMyItRequests).not.toHaveBeenCalled()
    expect(mocks.fetchItDesk).not.toHaveBeenCalled()
  })

  it('refuses the desktop desk before reading it when the account has no IT View', async () => {
    await expect(DeskPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirect:/dashboard')
    expect(mocks.fetchItDesk).not.toHaveBeenCalled()
  })

  it.each([false, true])('keeps desk Edit separate from View (Edit: %s)', async edit => {
    mocks.account.actions = { 'it_requests.view': 'all', ...(edit ? { 'it_requests.edit': 'all' as const } : {}) }
    render(await DeskPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('support')).toHaveAttribute('data-desk', 'true')
    expect(screen.getByTestId('support')).toHaveAttribute('data-edit', String(edit))
    expect(mocks.fetchItDesk).toHaveBeenCalledOnce()
    expect(mocks.fetchMyItRequests).not.toHaveBeenCalled()
  })

  it('returns a directly opened Finance request to Profile', () => {
    render(<ItSupportApp initialId="test-request" />)
    fireEvent.click(screen.getByRole('button', { name: 'Back to Profile' }))
    expect(mocks.setIntent).toHaveBeenCalledWith('pop')
    expect(mocks.replace).toHaveBeenCalledWith('/fin-app/profile')
  })

  it('returns to the previous app screen when opened from Profile', () => {
    mocks.canStepBack.mockReturnValue(true)
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    render(<ItSupportApp />)
    fireEvent.click(screen.getByRole('button', { name: 'Back to Profile' }))
    expect(back).toHaveBeenCalledOnce()
    expect(mocks.replace).not.toHaveBeenCalled()
    back.mockRestore()
  })
})
