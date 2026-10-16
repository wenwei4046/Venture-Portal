import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMPANY_NAME, COMPANY_REG_NO } from './company'

// The company's full name is HOUZS Venture Holding Sdn Bhd (2026-10-16, the
// user: "holding, without s is correct", then "改成 这个houzs venture holding
// sdn bhd"). Every page and document that printed it — the documents' issuer,
// the statement's letterhead, a schedule's print, the reports' PDF header, the
// staff and director payslips, Director Salary's and Director Pool's prints,
// the Revenue app's sign-in footer, the site's description — prints it from
// one place, and nothing in src/ names the company the old way again.

// Vitest runs from the repository root.
const ROOT = process.cwd()

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.(tsx?|css)$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : []
  })
}

const where = (path: string) => relative(ROOT, path).replace(/\\/g, '/')

/** The pages and documents that print the company's full name. */
const PRINTS = [
  'src/lib/export/doc-sheet.tsx',
  'src/lib/export/pdf.tsx',
  'src/app/(paper)/statements/[id]/print/page.tsx',
  'src/components/treasury/PrintSchedule.tsx',
  'src/app/(portal)/hr-costing/payroll/[period]/[staffId]/payslip/page.tsx',
  'src/app/(portal)/director-salary/payslip/[id]/page.tsx',
  'src/app/(portal)/director-salary/[directorId]/print/page.tsx',
  'src/app/print/director-pool/page.tsx',
  'src/components/member/MemberLoginScreen.tsx',
  'src/app/layout.tsx',
]

describe('the company’s name', () => {
  it('is HOUZS Venture Holding Sdn Bhd — Holding, no s', () => {
    expect(COMPANY_NAME).toBe('HOUZS Venture Holding Sdn Bhd')
  })

  it('is printed from one place by every page and document that prints it', () => {
    const missing = PRINTS.filter(file => !readFileSync(resolve(ROOT, file), 'utf8').includes('COMPANY_NAME'))
    expect(missing).toEqual([])
  })

  // 2026-10-16 — the user: "202501008262 (1609676-A)"; the letterhead printed a made-up number before.
  it('has its real registration number on the statement’s letterhead, and the placeholder is gone', () => {
    expect(COMPANY_REG_NO).toBe('202501008262 (1609676-A)')
    expect(readFileSync(resolve(ROOT, 'src/app/(paper)/statements/[id]/print/page.tsx'), 'utf8')).toContain('Registration No. {COMPANY_REG_NO}')
    const placeholder = sources(resolve(ROOT, 'src')).filter(path => /202401000000|1234567-X/.test(readFileSync(path, 'utf8')))
    expect(placeholder.map(where)).toEqual([])
  })

  it('is never written the old way in src/ (Venture Sdn Bhd, Holdings, Sdn. Bhd.)', () => {
    const old = /HOUZS\s+Venture\s+(Holdings\s+)?Sdn|Venture\s+Holdings\s+Sdn|Venture\s+Holding\s+Sdn\.\s*Bhd/i
    const found = sources(resolve(ROOT, 'src')).flatMap(path => {
      const text = readFileSync(path, 'utf8')
      return text.split('\n').flatMap((line, i) => (old.test(line) ? [`${where(path)}:${i + 1}: ${line.trim()}`] : []))
    })
    expect(found).toEqual([])
  })
})
