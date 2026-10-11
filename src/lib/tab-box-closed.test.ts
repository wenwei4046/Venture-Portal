import { describe, expect, it } from 'vitest'
import { closedBoxes, type StoredTabs } from './page-tabs'
import fixtures from '../../tests/member-sql/tab-box-closed.json'

/**
 * The database's `tab_box_closed(tab, action)` (mig 20261011150000 — the
 * Revenue app's ticks bind in the database too, review L6) is the twin of
 * `closedBoxes` for one box. Both are held to the same table: this file asks
 * closedBoxes, tests/member-sql/validate-meeting-rooms.mjs asks the SQL.
 */
type Fixture = { what: string; stored: StoredTabs | null; view: boolean; create: boolean }

describe('closedBoxes and its database twin agree, box by box', () => {
  for (const f of fixtures as Fixture[]) {
    it(f.what, () => {
      const closed = closedBoxes(f.stored)
      expect({ view: closed.includes('rev.rooms.view'), create: closed.includes('rev.rooms.create') }).toEqual({ view: f.view, create: f.create })
    })
  }
})
