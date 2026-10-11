import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Profile › Your workspace, as the HR revamp's handoffs draw it (the user, 2026-10-11 — "换成 round 2"):
// 81px rows on their own #F1E7DF rules with no gap between them, a 52px circle, the sub-line 2px under the title.
const css = readFileSync(join(__dirname, 'profile.module.css'), 'utf8')
const rule = (sel: string) => css.match(new RegExp(`(?:^|\\n)${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''

describe('the workspace rows', () => {
  it('stack on the design’s light rule, a 52px circle first', () => {
    expect(rule('.workRow')).toMatch(/grid-template-columns:\s*52px minmax\(0, 1fr\) 16px/)
    expect(rule('.workRow')).toMatch(/padding:\s*14px 0/)
    expect(rule('.workRow')).toMatch(/border-bottom:\s*1px solid var\(--rv-rule\)/)
    expect(rule('.workIcon')).toMatch(/width:\s*52px;\s*height:\s*52px/)
    expect(rule('.workSub')).toMatch(/margin-top:\s*2px/)
  })

  it('leave no gap between rows, the title 6px above them', () => {
    expect(rule('.work')).not.toMatch(/gap:/)
    expect(css).toMatch(/\.work > \.h2\s*\{\s*margin-bottom:\s*6px;\s*\}/)
  })
})
