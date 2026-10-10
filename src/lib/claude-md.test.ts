import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// CLAUDE.md is read into every Claude Code session, whole. By 2026-10-10 it had
// grown to 244 KB — 2,543 lines, about 63k tokens, six times the size Claude
// Code warns about ("Large CLAUDE.md will impact performance") — and nearly
// all of it was the dated history of single tabs. That history moved, word for
// word, into `.claude/rules/<tab>/`: files that load only when their `paths:`
// match, and that CLAUDE.md › Rules by tab tells Claude to read before changing
// a tab and in every full scan of a change (user 2026-10-10). This keeps it so.

// Vitest runs from the repository root.
const ROOT = process.cwd()
// Claude Code's warning threshold for one instruction file, in characters.
const LIMIT = 40_000

function markdown(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return markdown(path)
    return entry.name.endsWith('.md') ? [path] : []
  })
}

const where = (path: string) => relative(ROOT, path).replace(/\\/g, '/')
const claudeMd = readFileSync(resolve(ROOT, 'CLAUDE.md'), 'utf8').replace(/\r\n/g, '\n')
const rules = markdown(resolve(ROOT, '.claude/rules')).map(path => {
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
  const front = text.match(/^---\npaths:\n((?: {2}- "[^"\n]+"\n)+)---\n/)
  return { at: where(path), paths: front ? [...front[1].matchAll(/- "([^"]+)"/g)].map(m => m[1]) : [] }
})

describe('CLAUDE.md stays small', () => {
  it(`is under ${LIMIT.toLocaleString('en')} characters — a tab's dated history goes to .claude/rules/<tab>/`, () => {
    expect([...claudeMd].length).toBeLessThan(LIMIT)
  })
})

describe('.claude/rules', () => {
  it('finds the rules files (the scan itself works)', () => {
    expect(rules.map(rule => rule.at)).toEqual(expect.arrayContaining([
      '.claude/rules/revenue/comm-cal.md',
      '.claude/rules/hr/payroll.md',
      '.claude/rules/portal-wide/permissions.md',
    ]))
  })

  it('opens every file with paths: frontmatter — a file without it loads at every launch', () => {
    expect(rules.filter(rule => rule.paths.length === 0).map(rule => rule.at)).toEqual([])
  })

  it('writes no ( ) [ ] in a pattern — glob syntax: route groups and [param] folders are *', () => {
    const bad = rules.flatMap(rule => rule.paths.filter(p => /[()[\]]/.test(p)).map(p => `${rule.at}: ${p}`))
    expect(bad).toEqual([])
  })

  it("names every file in CLAUDE.md's Rules by tab, so Claude knows to read it", () => {
    const unnamed = rules
      .filter(rule => {
        const folder = rule.at.slice(0, rule.at.lastIndexOf('/') + 1)
        const file = rule.at.slice(rule.at.lastIndexOf('/') + 1)
        return !claudeMd.includes(folder) || !claudeMd.includes(`\`${file}\``)
      })
      .map(rule => rule.at)
    expect(unnamed).toEqual([])
  })
})
