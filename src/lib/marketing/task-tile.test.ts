import { describe, expect, it } from 'vitest'
import type { PlateCard } from './my-space'
import { tileCard } from './task-tile'

// 2026-11-13 — My turn / Waiting in the Workflow Builder 2a handoff's words (step 3): no Accept anywhere.

const card = (over: Partial<PlateCard>): PlateCard => ({
  key: 'p:2:accepted', trackId: 'TSK-1', projectId: 'p', title: 'Red Truck', sub: { id: 's', code: '2990', name: '2990 Home', dot: 'x', emoji: '🏠', client: false, pic: null },
  parent: null, stage: 'Stage 4/6 · Edit', due: '2026-11-11', assignee: null, nowWith: null, tone: 'waiting', label: 'In progress', action: 'open', isNew: false, dept: '',
  ...over,
})

describe('a My turn / Waiting card', () => {
  it('the meta line: project · Stage n/N stage · due date', () => {
    expect(tileCard(card({}), 'turn').meta).toBe('2990 Home · Stage 4/6 Edit · due 11 Nov')
  })
  it('My turn: Your turn; Needs your approval with Review; {n}d overdue; never Accept', () => {
    expect(tileCard(card({}), 'turn')).toMatchObject({ label: 'Your turn', act: 'open' })
    expect(tileCard(card({ key: 'p:2:todo', action: 'accept', label: 'New · just assigned' }), 'turn')).toMatchObject({ label: 'Your turn', act: 'open' })
    expect(tileCard(card({ key: 'p:2:approve', label: 'Waiting for your approval' }), 'turn')).toMatchObject({ label: 'Needs your approval', act: 'review' })
    expect(tileCard(card({ tone: 'red', label: 'Overdue 1 day' }), 'turn')).toMatchObject({ label: '1d overdue', act: 'open' })
  })
  it('Waiting: its words as they come, Open', () => {
    expect(tileCard(card({ label: 'Edit · with Ali' }), 'waiting')).toMatchObject({ label: 'Edit · with Ali', act: 'open' })
  })
})
