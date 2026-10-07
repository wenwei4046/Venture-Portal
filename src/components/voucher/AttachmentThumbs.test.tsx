import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

// 2026-10-07 — the Approvals queue's phone panel shows a voucher's attachments
// as thumbnails (user picked B: see the bill without leaving the list). An
// image or a PDF opens in a new tab from its signed URL; any other file opens
// through the download action, as the detail page's list does.

const mocks = vi.hoisted(() => ({
  getAttachmentPreviewUrls: vi.fn(),
  getAttachmentSignedUrl: vi.fn(),
}))
vi.mock('@/app/(portal)/payments/actions', () => ({
  getAttachmentPreviewUrls: mocks.getAttachmentPreviewUrls,
  getAttachmentSignedUrl: mocks.getAttachmentSignedUrl,
}))

import AttachmentThumbs from './AttachmentThumbs'

const files = [
  { id: 'img', fileName: 'tnb-bill.jpg', fileType: 'image/jpeg' },
  { id: 'pdf', fileName: 'invoice.pdf', fileType: 'application/pdf' },
  { id: 'xls', fileName: 'workings.xlsx', fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
]
const settle = () => act(async () => { await Promise.resolve() })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getAttachmentPreviewUrls.mockResolvedValue([
    { id: 'img', url: 'https://signed/tnb-bill.jpg' },
    { id: 'pdf', url: 'https://signed/invoice.pdf' },
  ])
  mocks.getAttachmentSignedUrl.mockResolvedValue({ url: 'https://signed/workings.xlsx', fileName: 'workings.xlsx' })
})

describe('AttachmentThumbs', () => {
  it('says so when a voucher has nothing attached', () => {
    render(<AttachmentThumbs attachments={[]} />)
    expect(screen.getByText('No attachments')).toBeInTheDocument()
    expect(mocks.getAttachmentPreviewUrls).not.toHaveBeenCalled()
  })

  it('signs the previewable files once, and shows an image as its thumbnail and a PDF as a tile, each opening in a new tab', async () => {
    render(<AttachmentThumbs attachments={files} />)
    await settle()
    expect(mocks.getAttachmentPreviewUrls).toHaveBeenCalledTimes(1)
    expect(mocks.getAttachmentPreviewUrls).toHaveBeenCalledWith(['img', 'pdf'])
    const image = screen.getByRole('link', { name: 'tnb-bill.jpg' })
    expect(image).toHaveAttribute('href', 'https://signed/tnb-bill.jpg')
    expect(image).toHaveAttribute('target', '_blank')
    expect(image.querySelector('img')).toHaveAttribute('src', 'https://signed/tnb-bill.jpg')
    const pdf = screen.getByRole('link', { name: 'invoice.pdf' })
    expect(pdf).toHaveAttribute('href', 'https://signed/invoice.pdf')
    expect(pdf).toHaveTextContent('PDF')
  })

  it('opens any other file through the download action', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<AttachmentThumbs attachments={files} />)
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'workings.xlsx' }))
    await settle()
    expect(mocks.getAttachmentSignedUrl).toHaveBeenCalledWith('xls')
    expect(open).toHaveBeenCalledWith('https://signed/workings.xlsx', '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })

  it('still names a file whose preview could not be signed', async () => {
    mocks.getAttachmentPreviewUrls.mockRejectedValue(new Error('offline'))
    render(<AttachmentThumbs attachments={files.slice(0, 1)} />)
    await settle()
    expect(screen.getByRole('button', { name: 'tnb-bill.jpg' })).toBeInTheDocument()
  })
})
