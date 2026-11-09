import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

/**
 * Documents printed with their attachments (2026-11-09, the user: "我issue invoice 时可以放attachment 一起print 出来吗？
 * export pdf 也一起" → "就是invoice 后连attachment … 如果多张invoice 就 invoice + attachment, invoice + attachment";
 * Payment voucher too): each document's own pages, then its files in the order they were added — a PDF's pages as they
 * are, a JPG or PNG on an A4 page of its own. Anything else (Excel, Word, CSV) is kept with the record but not printed.
 * A file that cannot be read prints as one page saying so, so nothing goes missing without a word.
 */

export interface PrintFile {
  name: string
  type: string | null
  /** Null when the file could not be fetched. */
  bytes: Uint8Array | null
}

export interface PrintPart {
  /** The document's own PDF (an invoice or a voucher). */
  doc: Uint8Array
  files: PrintFile[]
}

export type PrintKind = 'pdf' | 'jpg' | 'png'

/** How a file prints, or null when it does not (by its type, else by its name's extension). */
export function printKind(f: { name: string; type: string | null }): PrintKind | null {
  const type = (f.type ?? '').toLowerCase()
  if (type === 'application/pdf') return 'pdf'
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpg'
  if (type === 'image/png') return 'png'
  const ext = f.name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg'
  if (ext === 'png') return 'png'
  return null
}

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 36
const CAPTION = 18

/** Helvetica writes Latin-1 only: anything else in a file's name prints as "?". */
const latin1 = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, '?')

function caption(page: PDFPage, font: PDFFont, text: string) {
  const { height: h } = page.getSize()
  page.drawText(latin1(text).slice(0, 110), { x: MARGIN, y: h - MARGIN + 6, size: 8, font, color: rgb(0.45, 0.4, 0.36) })
}

function notice(out: PDFDocument, font: PDFFont, name: string) {
  const page = out.addPage(A4)
  caption(page, font, `Attachment · ${name}`)
  page.drawText('This attachment could not be printed.', { x: MARGIN, y: A4[1] / 2, size: 12, font, color: rgb(0.2, 0.17, 0.15) })
  page.drawText('Open it from the record in the portal.', { x: MARGIN, y: A4[1] / 2 - 18, size: 10, font, color: rgb(0.45, 0.4, 0.36) })
}

/** The documents in order, each followed by its printable files. */
export async function joinWithAttachments(parts: readonly PrintPart[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  const font = await out.embedFont(StandardFonts.Helvetica)
  for (const part of parts) {
    const own = await PDFDocument.load(part.doc)
    for (const p of await out.copyPages(own, own.getPageIndices())) out.addPage(p)
    for (const f of part.files) {
      const kind = printKind(f)
      if (!kind) continue
      try {
        if (!f.bytes || f.bytes.length === 0) throw new Error('empty')
        if (kind === 'pdf') {
          const src = await PDFDocument.load(f.bytes, { ignoreEncryption: true })
          const pages = await out.copyPages(src, src.getPageIndices())
          if (pages.length === 0) throw new Error('no pages')
          for (const p of pages) out.addPage(p)
        } else {
          const img = kind === 'png' ? await out.embedPng(f.bytes) : await out.embedJpg(f.bytes)
          // Landscape pictures go on a landscape page; each fits inside the margins, never enlarged past its size.
          const size: [number, number] = img.width > img.height ? [A4[1], A4[0]] : A4
          const page = out.addPage(size)
          caption(page, font, `Attachment · ${f.name}`)
          const boxW = size[0] - MARGIN * 2
          const boxH = size[1] - MARGIN * 2 - CAPTION
          const scale = Math.min(boxW / img.width, boxH / img.height, 1)
          const w = img.width * scale
          const h = img.height * scale
          page.drawImage(img, { x: (size[0] - w) / 2, y: MARGIN + (boxH - h) / 2, width: w, height: h })
        }
      } catch {
        notice(out, font, f.name)
      }
    }
  }
  return out.save()
}
