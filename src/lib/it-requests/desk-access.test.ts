import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Everybody's IT requests are the Principal's and Ultimate full access's only (2026-10-20 — the user, told that a
// seller's screenshot of Today or My income shows their pay to whoever reads the list: "change to just principal or
// ulitmate full access permission user log in can view"). Not the Revenue Director, whose title does not tick Salary.
const SQL = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261021020000_it_requests_permission.sql'), 'utf8')

describe('who holds IT requests', () => {
  it('the Principal login by default and the Ultimate full access template — nobody else', () => {
    expect([...SQL.matchAll(/INSERT INTO public\.role_default_permissions[^;]*;/g)].map(m => m[0]))
      .toEqual([expect.stringContaining("VALUES ('principal', 'it_requests')")])
    expect([...SQL.matchAll(/WHERE (?:t\.)?key (=|IN) ([^\n;]+)/g)].map(m => `${m[1]} ${m[2].trim()}`))
      .toEqual(["= 'ultimate'", "= 'ultimate'", "= 'ultimate'"])
    expect(SQL).not.toMatch(/revenue_director|'full'/)
  })
})
