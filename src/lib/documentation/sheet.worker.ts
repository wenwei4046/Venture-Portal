import { sheetPreview } from './sheet'

/**
 * Excel's reader, in a worker of its own (read-sheet.ts): a file somebody else
 * uploaded is read here, away from the page — a crafted workbook can neither
 * reach the page's objects nor freeze it, and a big one does not stall the drawer.
 */
self.onmessage = (e: MessageEvent<ArrayBuffer>) => {
  try {
    self.postMessage({ ok: true, sheet: sheetPreview(e.data) })
  } catch {
    self.postMessage({ ok: false })
  }
}
