import { describe, expect, it } from 'vitest'
import type { Scope } from './permission-matrix'
import { actionsOnPages, closedBoxes, type PageRoute, type StoredTabs } from './page-tabs'
import fixtures from '../../tests/member-sql/tab-write-open.json'

/**
 * The database's `tab_writes_open(sites)` / `tab_write_open(pages, wants)` (mig
 * 20261011220000 — plan C's database side) answer what the write gates in front of
 * a function answer in the app: the account narrowed to a gate's pages' boxes
 * (`actionsOnPages`), then one of the actions it asks still held — through any of
 * the gates. Both are held to the same table: this file asks the app,
 * tests/member-sql/validate-tab-writes.mjs asks the SQL. An action they hold none
 * of is the function's own check to refuse, so it never decides here.
 */
type Gate = { pages: PageRoute[]; wants: string[] }
type Fixture = { what: string; stored: StoredTabs | null; actions: Record<string, Scope>; open: boolean } & (Gate | { sites: Gate[] })

function appAnswer(f: Fixture): boolean {
  const gates = 'sites' in f ? f.sites : [f]
  const closed = closedBoxes(f.stored)
  let held = false
  for (const g of gates) {
    const narrowed = actionsOnPages(f.actions, closed, g.pages)
    // Held at any reach: how far it reaches is the function's own check.
    for (const cell of g.wants.map(w => w.split(':')[0]).filter(c => f.actions[c])) {
      held = true
      if (narrowed[cell]) return true
    }
  }
  return !held
}

describe('tab_writes_open and the app agree, case by case', () => {
  for (const f of fixtures as unknown as Fixture[]) {
    it(f.what, () => {
      expect(appAnswer(f)).toBe(f.open)
    })
  }
})
