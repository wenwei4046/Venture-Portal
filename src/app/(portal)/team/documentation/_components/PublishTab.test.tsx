import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Documentation, Published } from '@/lib/documentation/model'

const actions = vi.hoisted(() => ({ addPublishType: vi.fn(), deletePublishType: vi.fn(), publishDocumentation: vi.fn(), withdrawMemo: vi.fn() }))
const { flash } = vi.hoisted(() => ({ flash: vi.fn() }))
vi.mock('@/lib/documentation/actions', () => actions)
vi.mock('@/lib/documentation/upload', () => ({ uploadDocumentationFile: vi.fn() }))
vi.mock('@/components/hrv/toast', () => ({ flash }))

import PublishTab from './PublishTab'

// Publish's Withdraw (2026-10-11, the user: "加"): a published memo is taken away
// from everyone it reached — asked twice, as Delete is — and waits greyed under
// "Show withdrawn" with what it had reached.

const memo = (over: Partial<Published>): Published => ({
  id: 'p1', kind: 'Memo', title: 'House rules', publishedAt: '2026-10-06T02:00:00Z', audience: 'Revenue · everyone', subDepartments: [],
  attachmentName: 'Rules.pdf', saved: false, recipients: 12, acknowledged: 9,
  withdrawnAt: null, withdrawnBy: null, withdrawnNote: null, attachmentDeletedAt: null, ...over,
})

const DATA: Documentation = {
  departments: [{ id: 'rev', name: 'Revenue Department', people: 1 }],
  people: [{ id: 'zack', name: 'Zack', code: 'HV010', title: 'Senior Revenue Specialist', departmentId: 'rev' }],
  documents: [],
  letterTypes: [{ id: 'warn', name: 'Warning letter', compulsory: false, count: 0 }],
  letters: [],
  publishTypes: [{ id: 'm', name: 'Memo', builtin: true }, { id: 'l', name: 'Letter', builtin: true }],
  published: [
    memo({}),
    memo({
      id: 'p0', title: 'Old notice', publishedAt: '2026-10-01T02:00:00Z', recipients: 0, acknowledged: 0,
      withdrawnAt: '2026-10-11T03:00:00Z', withdrawnBy: 'Grace Lim', withdrawnNote: 'Had reached 12 people · 9 acknowledged',
      attachmentDeletedAt: '2026-10-11T03:00:05Z',
    }),
  ],
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset()
  actions.withdrawMemo.mockResolvedValue({ ok: true, title: 'House rules', reached: 12 })
  flash.mockReset()
})
afterEach(cleanup)

const list = () => within(screen.getByRole('region', { name: 'Published' }))
const view = (can = { create: true, edit: true }) => render(<PublishTab data={DATA} can={can} />)

describe('Documentation › Publish › Withdraw', () => {
  it('lists the memos still out; the withdrawn one waits behind “Show withdrawn”', () => {
    view()
    expect(list().getByText('House rules')).toBeInTheDocument()
    expect(list().queryByText('Old notice')).toBeNull()
    expect(list().getByRole('button', { name: 'Show withdrawn (1)' })).toBeInTheDocument()
  })

  it('asks once more, then withdraws and says how many no longer see it', async () => {
    view()
    fireEvent.click(list().getByRole('button', { name: 'Withdraw House rules' }))
    expect(actions.withdrawMemo).not.toHaveBeenCalled()
    const armed = list().getByRole('button', { name: 'Confirm withdrawing House rules' })
    expect(armed).toHaveAttribute('data-armed', 'true')
    expect(armed).toHaveTextContent('Confirm withdraw')
    fireEvent.click(armed)
    await waitFor(() => expect(actions.withdrawMemo).toHaveBeenCalledWith('p1'))
    expect(flash).toHaveBeenCalledWith('House rules withdrawn · 12 people no longer see it')
  })

  it('one person, nobody, and a refusal, in words', async () => {
    view()
    const go = async () => {
      fireEvent.click(list().getByRole('button', { name: 'Withdraw House rules' }))
      fireEvent.click(list().getByRole('button', { name: 'Confirm withdrawing House rules' }))
      await waitFor(() => expect(flash).toHaveBeenCalled())
      const said = flash.mock.calls.at(-1)?.[0]
      flash.mockReset()
      return said
    }
    actions.withdrawMemo.mockResolvedValue({ ok: true, title: 'House rules', reached: 1 })
    expect(await go()).toBe('House rules withdrawn · 1 person no longer sees it')
    actions.withdrawMemo.mockResolvedValue({ ok: true, title: 'House rules', reached: 0 })
    expect(await go()).toBe('House rules withdrawn · nobody sees it any more')
    actions.withdrawMemo.mockResolvedValue({ ok: false, reason: 'It is already withdrawn.' })
    expect(await go()).toBe('It is already withdrawn.')
  })

  it('without Documentation · Edit there is nothing to withdraw', () => {
    view({ create: true, edit: false })
    expect(list().queryByRole('button', { name: /^Withdraw/ })).toBeNull()
  })

  it('a withdrawn memo shows greyed with its line, nothing to press', () => {
    view()
    fireEvent.click(list().getByRole('button', { name: 'Show withdrawn (1)' }))
    const row = list().getByText('Old notice').closest('[data-gone]')!
    expect(row).toHaveAttribute('data-gone', 'true')
    expect(within(row as HTMLElement).getByText('Withdrawn 11 Oct by Grace Lim · Had reached 12 people · 9 acknowledged · attachment deleted')).toBeInTheDocument()
    expect(within(row as HTMLElement).queryByRole('button')).toBeNull()
    expect(list().getByRole('button', { name: 'Hide withdrawn (1)' })).toBeInTheDocument()
  })
})
