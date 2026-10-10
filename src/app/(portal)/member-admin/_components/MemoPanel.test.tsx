import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminMemberData } from '@/lib/member/server'

// Member services › Publish memo (2026-10-10, the HR revamp): Title, Body and
// the audience; sent from People & Culture, in force today, acknowledged; each
// published memo says how many read it.

const action = vi.hoisted(() => vi.fn())
vi.mock('@/app/(member)/member/actions', () => ({ adminMemberAction: action }))
const flash = vi.fn()
vi.mock('@/components/hrv/toast', () => ({ flash: (m: string) => flash(m) }))

import MemoPanel from './MemoPanel'

const FAIR = '71709f7e-9f7c-4e28-80cf-ce21be336995'
const IR = 'ff85d03e-59f6-4738-a4f2-09643c54f622'
const data: AdminMemberData = {
  canManageRequests: true, canPublishMemos: true, canConfigureProducts: false, requests: [], products: [], candidates: [], titles: [], uplines: [], events: [],
  departments: [{ id: FAIR, name: 'Fair', capacity: null, occupied: 0, reserved: 0 }, { id: IR, name: 'IR', capacity: null, occupied: 0, reserved: 0 }],
  memos: [{ id: 'm1', title: 'October brand weeks are open', body: 'b', sender: 'People & Culture', publishedAt: '2026-10-01T02:00:00Z', effectiveAt: '2026-10-01',
    version: 1, requiresAck: true, readAt: null, acknowledgedAt: null, departments: ['Fair', 'IR'] }],
}

beforeEach(() => {
  action.mockReset().mockResolvedValue({ ok: true, data: {} })
  flash.mockReset()
})
afterEach(cleanup)

describe('MemoPanel', () => {
  it('lists what was published and how many read it', () => {
    render(<MemoPanel data={data} reads={{ m1: { read: 18, acknowledged: 12 } }} />)
    expect(screen.getByText('October brand weeks are open')).toBeInTheDocument()
    expect(screen.getByText('Fair, IR · read by 18')).toBeInTheDocument()
    expect(screen.getByText('1 Oct')).toBeInTheDocument()
    // Fair is ticked to start with.
    expect(screen.getByRole('button', { name: '☑ Fair' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('needs a title, a body and a department', async () => {
    render(<MemoPanel data={data} reads={null} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    })
    expect(action).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Add a title, a body and at least one department.')
  })

  it('publishes from People & Culture to the departments ticked', async () => {
    render(<MemoPanel data={data} reads={null} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Claim forms: new Airbnb cap' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Body' }), { target: { value: 'From today the cap is RM 220 a night.' } })
    fireEvent.click(screen.getByRole('button', { name: '☐ IR' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    })
    expect(action).toHaveBeenCalledWith(expect.objectContaining({
      action: 'publish_memo', title: 'Claim forms: new Airbnb cap', body: 'From today the cap is RM 220 a night.', sender: 'People & Culture',
      requiresAck: true, departments: [FAIR, IR], version: 1, effectiveAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    }))
    expect(flash).toHaveBeenCalledWith('Memo published to Fair, IR')
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('')
  })
})
