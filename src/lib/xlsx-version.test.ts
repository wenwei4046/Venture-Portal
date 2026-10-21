import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// SheetJS publishes its fixed releases on its own CDN only (2026-10-21): the npm registry's `xlsx` stopped at 0.18.5,
// which has a prototype pollution (GHSA-4r6h-8v6p-xvw6, fixed 0.19.3) and a ReDoS (GHSA-5pgg-2g8v-p4x9, fixed 0.20.2) —
// both reached by READING a crafted file, and the server reads uploaded spreadsheets (InfoTech staff / payroll, the ERP
// sales orders, bank statements in Reconciliation). A plain `npm i xlsx` would quietly bring 0.18.5 back.
const ROOT = resolve(__dirname, '../..')
const read = (path: string) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'))
const atLeast = (v: string, min: [number, number, number]) => {
  const [a, b, c] = v.split('.').map(Number)
  return a !== min[0] ? a > min[0] : b !== min[1] ? b > min[1] : c >= min[2]
}

describe('xlsx', () => {
  it("comes from SheetJS's CDN, at a release with both fixes", () => {
    expect(read('package.json').dependencies['xlsx']).toMatch(/^https:\/\/cdn\.sheetjs\.com\/xlsx-\d+\.\d+\.\d+\/xlsx-\d+\.\d+\.\d+\.tgz$/)
    const installed = read('node_modules/xlsx/package.json').version as string
    expect(atLeast(installed, [0, 20, 2])).toBe(true)
  })
})
