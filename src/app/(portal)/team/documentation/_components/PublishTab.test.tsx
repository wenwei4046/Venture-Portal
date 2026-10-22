import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PNG } from '@/test/signature'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Documentation, Published } from '@/lib/documentation/model'

const actions = vi.hoisted(() => ({
  addPublishType: vi.fn(), deletePublishType: vi.fn(), publishDocumentation: vi.fn(), withdrawMemo: vi.fn(), previewPublished: vi.fn(),
}))
const memoActions = vi.hoisted(() => ({ openMemoFile: vi.fn(), markMyMemo: vi.fn() }))
const { flash } = vi.hoisted(() => ({ flash: vi.fn() }))
vi.mock('@/lib/documentation/actions', () => actions)
vi.mock('@/lib/memos/actions', () => memoActions)
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

// Publish › Preview (2026-10-12 — the user: "因为我已经发过了这个 memo，我可以 preview，就 preview 这个 memo 是长怎样的"):
// a published memo as its people read it, its file, and where each of them stands.
describe('Documentation › Publish › Preview', () => {
  const preview = {
    id: 'p1', title: 'House rules', body: 'Please read the rules.\n\nThey start on Monday.', sender: 'People & Culture', kind: 'Memo',
    publishedAt: '2026-10-12T09:44:13Z', requiresAck: true, attachment: { name: 'Rules.pdf', type: 'application/pdf' }, withdrawnAt: null,
    people: [
      { staffId: 'kris', name: 'KRIS', department: 'Revenue', hasLogin: true, readAt: '2026-10-12T09:44:39Z', acknowledgedAt: null, signature: null },
      { staffId: 'zack', name: 'Zack', department: 'Revenue', hasLogin: false, readAt: null, acknowledgedAt: null, signature: null },
      { staffId: 'loo', name: 'LOO WEN WEI', department: 'Director', hasLogin: true, readAt: '2026-10-12T09:50:00Z', acknowledgedAt: '2026-10-12T09:51:00Z', signature: PNG },
    ],
  }

  it('a memo still out has Preview; a withdrawn one does not', () => {
    view()
    expect(list().getByRole('button', { name: 'Preview House rules' })).toBeInTheDocument()
    fireEvent.click(list().getByRole('button', { name: 'Show withdrawn (1)' }))
    const row = list().getByText('Old notice').closest('[data-gone]') as HTMLElement
    expect(within(row).queryByRole('button', { name: /Preview/ })).toBeNull()
  })

  it('opens the memo as it reads — from, title, each paragraph, its file — and who has it', async () => {
    actions.previewPublished.mockResolvedValue({ ok: true, preview })
    view({ create: false, edit: false })
    fireEvent.click(list().getByRole('button', { name: 'Preview House rules' }))
    const drawer = await screen.findByRole('dialog', { name: 'House rules' })
    expect(actions.previewPublished).toHaveBeenCalledWith('p1')
    const card = within(drawer).getByRole('article', { name: 'House rules, as it reads' })
    expect(within(card).getByText('Please read the rules.')).toBeInTheDocument()
    expect(within(card).getByText('They start on Monday.')).toBeInTheDocument()
    expect(within(card).getByText('Rules.pdf')).toBeInTheDocument()
    expect(within(card).getByText('PDF')).toBeInTheDocument()
    // 2026-10-20: each person signs before they acknowledge.
    expect(within(card).getByText(/Each person signs and taps Acknowledge once/)).toBeInTheDocument()
    expect(within(card).getByText(/their signature, name and time are recorded for HR/)).toBeInTheDocument()

    fireEvent.click(within(drawer).getByRole('tab', { name: /Who has it/ }))
    expect(within(drawer).getByText('1 of 3 acknowledged · 1 has no login yet')).toBeInTheDocument()
    expect(within(drawer).getByText('Acknowledged')).toBeInTheDocument()
    expect(within(drawer).getByText('Opened')).toBeInTheDocument()
    expect(within(drawer).getByText('No login yet')).toBeInTheDocument()
    // …and the signature beside whoever acknowledged — nobody else's.
    expect(within(drawer).getByRole('img', { name: "LOO WEN WEI's signature" })).toHaveAttribute('src', PNG)
    expect(within(drawer).getAllByRole('img')).toHaveLength(1)
  })

  it('its file opens from the preview, a short link made at the press', async () => {
    actions.previewPublished.mockResolvedValue({ ok: true, preview })
    memoActions.openMemoFile.mockResolvedValue({ ok: false, reason: 'This file was withdrawn.' })
    const opened = { opener: {} as unknown, location: { href: '' }, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(opened as unknown as Window)
    view()
    fireEvent.click(list().getByRole('button', { name: 'Preview House rules' }))
    const drawer = await screen.findByRole('dialog', { name: 'House rules' })
    fireEvent.click(within(drawer).getByRole('button', { name: 'View' }))
    await waitFor(() => expect(memoActions.openMemoFile).toHaveBeenCalledWith('p1', 'view'))
    await waitFor(() => expect(flash).toHaveBeenCalledWith('This file was withdrawn.'))
    expect(opened.close).toHaveBeenCalled()
    open.mockRestore()
  })

  it('says so when it cannot be opened', async () => {
    actions.previewPublished.mockResolvedValue({ ok: false, reason: 'That memo is not there any more.' })
    view()
    fireEvent.click(list().getByRole('button', { name: 'Preview House rules' }))
    expect(await screen.findByText('That memo is not there any more.')).toBeInTheDocument()
  })
})
