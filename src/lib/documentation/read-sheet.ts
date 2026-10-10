import type { SheetPreview } from './sheet-view'

/** A sheet that has not answered in this long is not drawn ("No preview…"). */
export const SHEET_READ_MS = 20_000

type Answer = { ok: true; sheet: SheetPreview } | { ok: false }

/**
 * Reads a spreadsheet for Documentation's View in its own worker
 * (sheet.worker.ts) — Excel's reader is loaded there, only when a sheet is
 * opened, and the worker ends with the answer, the time limit, or `signal`.
 */
export function readSheet(data: ArrayBuffer, signal: AbortSignal): Promise<SheetPreview> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('stopped'))
      return
    }
    const worker = new Worker(new URL('./sheet.worker.ts', import.meta.url))
    const end = (outcome: () => void) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', stop)
      worker.terminate()
      outcome()
    }
    const stop = () => end(() => reject(new Error('stopped')))
    const timer = setTimeout(() => end(() => reject(new Error('too slow'))), SHEET_READ_MS)
    signal.addEventListener('abort', stop)
    worker.onmessage = (e: MessageEvent<Answer>) => {
      const answer = e.data
      end(() => (answer.ok ? resolve(answer.sheet) : reject(new Error('unreadable'))))
    }
    worker.onerror = () => end(() => reject(new Error('unreadable')))
    worker.postMessage(data, [data])
  })
}
