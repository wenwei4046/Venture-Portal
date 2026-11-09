import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { joinWithAttachments, printKind } from './attachments-pdf'

// A 1×1 PNG and a 2×1 one (landscape).
const PNG_1x1 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

async function pdfOf(pages: number, size: [number, number] = [595.28, 841.89]): Promise<Uint8Array> {
  const d = await PDFDocument.create()
  for (let i = 0; i < pages; i++) d.addPage(size)
  return d.save()
}

const sizes = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => Math.round(p.getWidth()))

describe('printKind', () => {
  it('prints PDFs, JPGs and PNGs — by type, else by the name', () => {
    expect(printKind({ name: 'a.bin', type: 'application/pdf' })).toBe('pdf')
    expect(printKind({ name: 'photo.JPEG', type: null })).toBe('jpg')
    expect(printKind({ name: 'x', type: 'image/png' })).toBe('png')
    expect(printKind({ name: 'sheet.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })).toBeNull()
    expect(printKind({ name: 'memo.docx', type: null })).toBeNull()
  })
})

describe('joinWithAttachments', () => {
  it('each document, then its own files in order: invoice + files, invoice + files', async () => {
    const inv1 = await pdfOf(1, [500, 700])
    const inv2 = await pdfOf(1, [510, 700])
    const agreement = await pdfOf(3, [300, 400])
    const out = await joinWithAttachments([
      { doc: inv1, files: [{ name: 'Agreement.pdf', type: 'application/pdf', bytes: agreement }, { name: 'Meter.png', type: 'image/png', bytes: PNG_1x1 }] },
      { doc: inv2, files: [{ name: 'Usage.xlsx', type: null, bytes: new Uint8Array([1, 2]) }] },
    ])
    // inv1 (500), the agreement's 3 pages (300), the picture on A4 (595), inv2 (510); the Excel file is not printed.
    expect(await sizes(out)).toEqual([500, 300, 300, 300, 595, 510])
  })

  it('a file that cannot be read prints one page saying so', async () => {
    const out = await joinWithAttachments([
      { doc: await pdfOf(1, [500, 700]), files: [{ name: 'Broken.pdf', type: 'application/pdf', bytes: new Uint8Array([1, 2, 3]) }, { name: '收据.jpg', type: 'image/jpeg', bytes: null }] },
    ])
    expect(await sizes(out)).toEqual([500, 595, 595])
  })

  it('without files it is the documents as they were', async () => {
    const out = await joinWithAttachments([{ doc: await pdfOf(2, [400, 600]), files: [] }])
    expect(await sizes(out)).toEqual([400, 400])
  })
})
