import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

// 2026-10-10 — the handoff's "Generate invoices", the primary in the page
// head: one draft invoice per company for every unbilled allocation of the
// month (the old strip's button, moved). On the list it shows while Records is
// open; on a record's own page whenever the record is unbilled.

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), generateAllocatorInvoices: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }))
vi.mock('../actions', () => ({ generateAllocatorInvoices: mocks.generateAllocatorInvoices }))

import AllocGenerateButton from './AllocGenerateButton'
import { AllocatorShell, useAllocatorShell } from './AllocatorShell'

beforeEach(() => vi.clearAllMocks())

function TabSwitch() {
  const shell = useAllocatorShell()
  return (
    <button type="button" onClick={() => shell?.setTab(shell.tab === 'records' ? 'calc' : 'records')}>
      switch tab
    </button>
  )
}

describe('Generate invoices in the allocator’s head', () => {
  it('raises the month’s drafts and says what it made and what it skipped', async () => {
    mocks.generateAllocatorInvoices.mockResolvedValue({
      created: [{ company: '2990', invoiceNo: 'HV-INV-202609-0041' }],
      skipped: [{ company: 'CAR', reason: 'a draft' }],
    })
    render(<AllocGenerateButton period="2026-09" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Generate invoices' }))
    })
    expect(mocks.generateAllocatorInvoices).toHaveBeenCalledWith('2026-09')
    expect(await screen.findByText('✓ 2990 → HV-INV-202609-0041')).toBeInTheDocument()
    expect(screen.getByText('– CAR skipped: already has a draft')).toBeInTheDocument()
    expect(mocks.refresh).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/HV-INV-202609-0041/)).toBeNull()
  })

  it('says why when it cannot', async () => {
    mocks.generateAllocatorInvoices.mockResolvedValue({ error: 'Period is locked' })
    render(<AllocGenerateButton period="2026-09" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Generate invoices' }))
    })
    expect(await screen.findByText('Period is locked')).toBeInTheDocument()
  })

  it('on the list, shows only while Records is the open tab', () => {
    render(
      <AllocatorShell initialTab="records">
        <AllocGenerateButton period="2026-09" onlyOnRecords />
        <TabSwitch />
      </AllocatorShell>,
    )
    expect(screen.getByRole('button', { name: 'Generate invoices' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'switch tab' }))
    expect(screen.queryByRole('button', { name: 'Generate invoices' })).toBeNull()
  })
})
