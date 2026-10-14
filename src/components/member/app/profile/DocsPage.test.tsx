import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MemberDocument } from '@/lib/documentation/member-model'
import type { Personal } from '@/lib/documentation/personal'
import DocsPage from './DocsPage'

// The Revenue app's Documentation in two (2026-10-14 — the user: "现在的 documentation 我要分成两种：一个是 company，
// 一个是 personal"): Company as before; Personal — what HR shares with the member of their own folder — its letters on
// top, folders a tap goes into ("‹" back up), files.

afterEach(cleanup)

const company: MemberDocument[] = [
  { id: 'd1', name: 'Fair handbook', fileName: 'Handbook.pdf', ext: 'PDF', contentType: 'application/pdf', size: 1, uploadedAt: '2026-10-11T02:00:00Z', seen: false },
]
const personal: Personal = {
  folders: [
    { id: 'c1', name: 'Contracts', parent: null, at: '' },
    { id: 'c2', name: '2026', parent: 'c1', at: '' },
  ],
  files: [
    { id: 'f1', ref: 'F-101', name: 'Offer.pdf', ext: 'PDF', contentType: null, size: 1, at: '2026-10-14T02:00:00Z', parent: 'c1', seen: false },
    { id: 'f2', ref: 'F-102', name: 'Renewal.pdf', ext: 'PDF', contentType: null, size: 1, at: '2026-10-14T02:00:00Z', parent: 'c2', seen: true },
  ],
  letters: [
    { id: 'l1', ref: 'D-101', typeName: 'Offer letter', name: 'Offer_zack.pdf', ext: 'PDF', contentType: null, size: 1, at: '2026-10-01T02:00:00Z', memoId: 'm1', readAt: null, acknowledgedAt: null },
  ],
}

function page(over: Partial<Parameters<typeof DocsPage>[0]> = {}) {
  const props = { docs: company, personal, message: null, personalMessage: null, opening: '', onBack: vi.fn(), onOpen: vi.fn(), onOpenPersonal: vi.fn(), ...over }
  render(<DocsPage {...props} />)
  return props
}

describe('Documentation › Company · Personal', () => {
  it('opens on Company as before; each tab says how many are new', () => {
    const p = page()
    expect(screen.getByRole('tab', { name: 'Company · 1' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Personal · 2' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText('Shared with Revenue by HR.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Fair handbook/ }))
    expect(p.onOpen).toHaveBeenCalledWith('d1')
  })

  it('Personal: the letters on top, then the folders; a tap goes into a folder and ‹ comes back', () => {
    const p = page()
    fireEvent.click(screen.getByRole('tab', { name: /Personal/ }))
    const list = within(screen.getByRole('region', { name: 'Personal' }))
    expect(list.getByText('Letters')).toBeInTheDocument()
    fireEvent.click(list.getByRole('button', { name: /Offer letter/ }))
    expect(p.onOpenPersonal).toHaveBeenCalledWith('letter', 'l1')
    expect(list.getByRole('button', { name: /Contracts/ })).toHaveTextContent('2 files')
    fireEvent.click(list.getByRole('button', { name: /Contracts/ }))
    expect(screen.getByRole('heading', { name: 'Contracts' })).toBeInTheDocument()
    expect(screen.queryByText('Letters')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Offer\.pdf/ }))
    expect(p.onOpenPersonal).toHaveBeenCalledWith('drive', 'f1')
    fireEvent.click(screen.getByRole('button', { name: /^2026/ }))
    expect(screen.getByRole('heading', { name: '2026' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Contracts' }))
    expect(screen.getByRole('heading', { name: 'Contracts' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Personal' }))
    expect(screen.getByText('Your own documents, shared with you by HR.')).toBeInTheDocument()
  })

  it('Personal empty, or still being read, or refused — says so', () => {
    page({ personal: { folders: [], files: [], letters: [] } })
    fireEvent.click(screen.getByRole('tab', { name: 'Personal' }))
    expect(screen.getByText('Nothing of yours is shared with you yet.')).toBeInTheDocument()
    cleanup()
    page({ personal: null, personalMessage: 'Documentation is not open to your account.' })
    fireEvent.click(screen.getByRole('tab', { name: 'Personal' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Documentation is not open to your account.')
  })
})
