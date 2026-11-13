import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { PlateCard, PlateColumn } from '@/lib/marketing/my-space'
import TaskTile from './TaskTile'

// 2026-11-13 — My Space's 👉 My turn / ⏳ Waiting on others (Workflow Builder 2a handoff, step 3): the whole card opens
// the task; an approval says "Needs your approval" with an orange Review; a late card and the count go red; no Accept.

const sub = { id: 's', code: '2990', name: '2990 Home', dot: 'oklch(0.62 0.12 295)', emoji: '🏠', client: false, pic: null }
const card = (over: Partial<PlateCard>): PlateCard => ({
  key: 'p1:3:accepted', trackId: 'TSK-2990-2611-018', projectId: 'p1', title: 'Red Truck · Reels video', sub, parent: null, stage: 'Stage 4/6 · Edit',
  due: '2026-11-11', assignee: null, nowWith: null, tone: 'waiting', label: 'In progress', action: 'open', isNew: false, dept: '', ...over,
})
const col = (key: PlateColumn['key'], cards: PlateCard[]): PlateColumn => ({
  key, emoji: key === 'turn' ? '👉' : '⏳', title: key === 'turn' ? 'My turn' : 'Waiting on others', cards, anyRed: cards.some(c => c.tone === 'red'),
})

describe('My turn', () => {
  it('your turn: the meta line, Open, the whole card a link to the task — never Accept', () => {
    render(<TaskTile column={col('turn', [card({ key: 'p1:3:todo', action: 'accept', label: 'New · just assigned' })])} wide={false} />)
    expect(screen.getByText('2990 Home · Stage 4/6 Edit · due 11 Nov')).toBeTruthy()
    expect(screen.getByText('Your turn')).toBeTruthy()
    expect(screen.queryByText('Accept')).toBeNull()
    expect(screen.getByRole('link', { name: 'Open Red Truck · Reels video' }).getAttribute('href')).toBe('/marketing/projects/TSK-2990-2611-018')
    expect(screen.getByRole('link', { name: 'Open' })).toBeTruthy()
  })
  it('an approval: Needs your approval and an orange Review', () => {
    render(<TaskTile column={col('turn', [card({ key: 'p1:3:approve', label: 'Waiting for your approval' })])} wide={false} />)
    expect(screen.getByText('Needs your approval')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Review' }).className).toMatch(/act/)
  })
  it('late: the card red, its words "{n}d overdue", the count red', () => {
    const { container } = render(<TaskTile column={col('turn', [card({ tone: 'red', label: 'Overdue 1 day' })])} wide={false} />)
    expect(screen.getByText('1d overdue')).toBeTruthy()
    expect(container.querySelector('[class*="cardRed"]')).toBeTruthy()
    expect(screen.getByText('1').className).toMatch(/countRed/)
  })
})

describe('Waiting on others', () => {
  it('"{stage} · with {person}", calm, Open', () => {
    render(<TaskTile column={col('waiting', [card({ label: 'Edit · with Ali' })])} wide={false} />)
    const status = screen.getByText('Edit · with Ali')
    expect(status.className).toMatch(/calm/)
    expect(within(status.closest('[class*="card"]') as HTMLElement).getByRole('link', { name: 'Open' })).toBeTruthy()
  })
  it('nothing: Nothing here right now', () => {
    render(<TaskTile column={col('waiting', [])} wide={false} />)
    expect(screen.getByText('Nothing here right now')).toBeTruthy()
  })
})
