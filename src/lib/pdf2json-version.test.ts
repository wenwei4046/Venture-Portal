import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// pdf2json stays at 3.1.5 (2026-10-21). 3.2 changed the coordinates it reports without a major version: on our own
// PDFs the topmost line read y=874.89 where 3.1.5 reads 33.01, while the page's Height stayed in the old units. Bank
// reconciliation reads uploaded statements by those coordinates (lib/bank-recon-pdf.ts groups a row by y within a fixed
// tolerance and finds the columns by x), as do the PDF layout tests and the worker smoke (tools/smoke-worker-pdf.mjs).
// Moving it means re-deriving all three and checking real statements — not an `npm audit fix` in passing. Until then
// its bundled @xmldom/xmldom 0.9.6 stays (npm audit: high; reachable through a PDF a signed-in Finance user uploads),
// TODOS.md › Owed — pdf2json 3.2.
const ROOT = resolve(__dirname, '../..')
const read = (path: string) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'))

describe('pdf2json', () => {
  it('stays at exactly 3.1.5', () => {
    expect(read('package.json').dependencies['pdf2json']).toBe('3.1.5')
    expect(read('node_modules/pdf2json/package.json').version).toBe('3.1.5')
  })
})
