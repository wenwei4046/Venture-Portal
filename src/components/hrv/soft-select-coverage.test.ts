import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

// Round 2's Part 1 (2026-10-11, the handoff's README 18.1 — "Soft dropdown
// (every <select>)"): every select on the pages HR's sidebar opens, and in its
// shell, is the soft dropdown's <Select>. A bare <select> there opens the
// browser's own list instead of the rounded menu. The pages are parsed, so a
// comment that mentions <select> is not one.

const ROOTS = [
  'src/app/(portal)/dashboard',
  'src/app/(portal)/hr-costing',
  'src/app/(portal)/director-salary',
  'src/app/(portal)/director-pool',
  'src/app/(portal)/revenue',
  'src/app/(portal)/claims',
  'src/app/(portal)/team',
  'src/app/(portal)/member-admin',
  'src/app/(portal)/hiring',
  'src/app/(portal)/admin',
  'src/app/(portal)/audit-log',
  'src/components/layout/HrTopBar.tsx',
  'src/components/layout/HrSidebar.tsx',
  // Finance's shell and the Finance view's kit (2026-10-14, the Finance revamp v2: its HrSelect is this Select).
  'src/components/layout/ViewSidebar.tsx',
  'src/components/layout/FinSidebar.tsx',
  'src/components/layout/AccountMenu.tsx',
  'src/components/finv',
]

function files(at: string): string[] {
  const full = path.join(process.cwd(), at)
  if (!fs.existsSync(full)) return []
  if (fs.statSync(full).isFile()) return [at]
  return fs.readdirSync(full, { withFileTypes: true }).flatMap(e => {
    const rel = path.join(at, e.name)
    if (e.isDirectory()) return files(rel)
    return /\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) ? [rel] : []
  })
}

function nativeSelects(file: string): number[] {
  const text = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const lines: number[] = []
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(sf) === 'select') {
      lines.push(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return lines
}

describe('the soft dropdown on HR’s pages', () => {
  it('finds the pages it guards', () => {
    expect(ROOTS.flatMap(files).length).toBeGreaterThan(100)
  })

  it('leaves no browser <select> on them', () => {
    const left = ROOTS.flatMap(files).flatMap(f => nativeSelects(f).map(line => `${f.replace(/\\/g, '/')}:${line}`))
    expect(left).toEqual([])
  })
})
