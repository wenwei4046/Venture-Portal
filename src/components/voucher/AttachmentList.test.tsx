import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(portal)/payments/actions', () => ({
  getAttachmentSignedUrl: vi.fn(),
  getAttachmentPreviewUrls: vi.fn(async () => []),
  deleteVoucherAttachment: vi.fn(),
}))

import AttachmentList from './AttachmentList'

const file = (id: string, uploaded_at: string) => ({
  id, file_name: `${id}.pdf`, file_type: 'application/pdf', file_size: 2048, description: null, uploaded_at,
})
// Each file is a padded block inside the list's bordered box.
const rowOf = (name: string) => screen.getByText(name).closest('div.px-5') as HTMLElement

beforeEach(() => vi.clearAllMocks())

// 2026-10-05: a file added to a voucher after the Principal decided it is marked.
describe('AttachmentList', () => {
  it('marks what was added after the voucher was decided — and only that', () => {
    render(
      <AttachmentList
        attachments={[file('before', '2026-10-04T10:00:00Z'), file('after', '2026-10-05T02:00:00Z')]}
        lateAfter="2026-10-04T13:23:40Z"
      />,
    )
    expect(screen.getAllByText('事后补上')).toHaveLength(1)
    expect(rowOf('after.pdf')).toHaveTextContent('事后补上')
    expect(rowOf('before.pdf')).not.toHaveTextContent('事后补上')
  })

  it('marks nothing when the voucher was never decided, or when no decision time is given', () => {
    const { unmount } = render(<AttachmentList attachments={[file('a', '2026-10-05T02:00:00Z')]} />)
    expect(screen.queryByText('事后补上')).toBeNull()
    unmount()
    render(<AttachmentList attachments={[file('a', '2026-10-05T02:00:00Z')]} lateAfter={null} />)
    expect(screen.queryByText('事后补上')).toBeNull()
  })

  it('offers 删除 only when the caller allows it', () => {
    const { unmount } = render(<AttachmentList attachments={[file('a', '2026-10-05T02:00:00Z')]} canDelete />)
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument()
    unmount()
    render(<AttachmentList attachments={[file('a', '2026-10-05T02:00:00Z')]} lateAfter="2026-10-04T13:23:40Z" />)
    expect(screen.queryByRole('button', { name: /删除/ })).toBeNull()
  })
})
