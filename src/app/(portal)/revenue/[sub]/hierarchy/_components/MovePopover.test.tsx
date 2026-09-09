import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import MovePopover, { defaultRankFor } from './MovePopover'
import type { OrgPerson, OrgRank } from './OrgChart'
import type { OrgNodeInput } from '@/lib/org-layout'
import { layoutParent } from '@/lib/commission/chart-shape'
import { shelfIds } from '@/lib/commission/chart-moves'

const ranks: OrgRank[] = [
  { id: 'r-c', rankKey: 'c', titleId: 't-rs', label: 'Rank C · 6%', productRate: 0.06, canRecruit: false, sortOrder: 10 },
  { id: 'r-b', rankKey: 'b', titleId: 't-srs', label: 'Rank B · 8%', productRate: 0.08, canRecruit: true, sortOrder: 20 },
  { id: 'r-a', rankKey: 'a', titleId: 't-tl', label: 'Rank A · 10%', productRate: 0.1, canRecruit: true, sortOrder: 30 },
]

const person = (over: Partial<OrgPerson> & { staffId: string; name: string }): OrgPerson => ({
  code: null,
  titleName: 'Team Leader',
  titleId: 't-tl',
  uplineStaffId: null,
  reportsTo: null,
  rankId: 'r-a',
  rankLabel: 'Rank A',
  productRate: 0.1,
  canRecruit: true,
  rateMode: 'variable',
  placedSince: '2026-07-01',
  ...over,
})

const people: OrgPerson[] = [
  person({ staffId: 'anthony', name: 'ANTHONY' }),
  person({ staffId: 'cheahuan', name: 'CHEA HUAN' }),
  person({ staffId: 'howard', name: 'HOWARD', titleName: 'Senior Revenue Specialist', titleId: 't-srs', uplineStaffId: 'cheahuan', reportsTo: 'cheahuan', rankId: 'r-b', rankLabel: 'Rank B', productRate: 0.08 }),
  person({ staffId: 'zack', name: 'ZACK', titleName: 'Revenue Specialist', titleId: 't-rs', uplineStaffId: 'howard', reportsTo: 'howard', rankId: 'r-c', rankLabel: 'Rank C', productRate: 0.06, canRecruit: false }),
  person({ staffId: 'luis', name: 'LUIS TEO', titleName: 'Senior Revenue Specialist', titleId: 't-srs', uplineStaffId: 'anthony', reportsTo: 'anthony', rankId: 'r-b', rankLabel: 'Rank B', productRate: 0.08 }),
  person({ staffId: 'yuny', name: 'YUNY', titleName: 'Team Assistant', titleId: 't-ta', uplineStaffId: null, reportsTo: 'anthony', rankId: null, rankLabel: null, productRate: null, canRecruit: false, rateMode: null, placedSince: null }),
  person({ staffId: 'mei', name: 'MEI TING', titleName: 'Revenue Specialist', titleId: 't-rs', rankId: null, rankLabel: null, productRate: null, canRecruit: false, rateMode: null, placedSince: null }),
]
const graph: OrgNodeInput[] = people.map(p => ({ id: p.staffId, parentId: p.uplineStaffId, label: p.name }))
// As the chart builds it: anybody on no line at all (MEI TING) is on the shelf,
// not in the layout graph, and the popover lists them under "Not placed".
const shelf = shelfIds(
  people.map(p => ({ staffId: p.staffId, placed: p.rankId !== null, layoutParentId: layoutParent(p) })),
)
const layoutGraph: OrgNodeInput[] = people
  .filter(p => !shelf.has(p.staffId))
  .map(p => ({ id: p.staffId, parentId: layoutParent(p), label: p.name }))
const anchor = { left: 100, top: 100, bottom: 130 }

function setup(mover: OrgPerson, over: Partial<React.ComponentProps<typeof MovePopover>> = {}) {
  const props = {
    mover,
    people,
    ranks,
    graph,
    layoutGraph,
    anchor,
    onPick: vi.fn(),
    onClose: vi.fn(),
    ...over,
  }
  const utils = render(<MovePopover {...props} />)
  return { ...utils, props }
}

describe('MovePopover', () => {
  it('lists every tree with the current upline marked and refusals captioned', () => {
    setup(people[2]) // HOWARD, under CHEA HUAN, with ZACK below him
    expect(screen.getByText('ANTHONY’s tree')).toBeInTheDocument()
    expect(screen.getByText('CHEA HUAN’s tree')).toBeInTheDocument()
    expect(screen.getByText('Not placed')).toBeInTheDocument()

    const cheahuan = screen.getByRole('option', { name: /CHEA HUAN/ })
    expect(cheahuan).toBeDisabled()
    expect(cheahuan).toHaveTextContent('current')

    expect(screen.getByRole('option', { name: /^HOWARD/ })).toHaveTextContent('that is them')
    expect(screen.getByRole('option', { name: /ZACK/ })).toHaveTextContent('their downline')
    expect(screen.getByRole('option', { name: /YUNY/ })).toHaveTextContent('not placed')
    expect(screen.getByRole('option', { name: /ANTHONY/ })).toBeEnabled()
  })

  it('picks the upline with the mover’s own rank, and the last row detaches', () => {
    const { props } = setup(people[2])
    fireEvent.click(screen.getByRole('option', { name: /ANTHONY/ }))
    expect(props.onPick).toHaveBeenCalledWith('anthony', 'r-b')

    fireEvent.click(screen.getByRole('option', { name: /Top of their own tree/ }))
    expect(props.onPick).toHaveBeenLastCalledWith(null, 'r-b')
  })

  it('filters by name and Enter takes the first row that may be picked', () => {
    const { props } = setup(people[4]) // LUIS TEO under ANTHONY
    const box = screen.getByLabelText('Filter by name')
    fireEvent.change(box, { target: { value: 'chea' } })
    expect(screen.queryByRole('option', { name: /HOWARD/ })).toBeNull()
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(props.onPick).toHaveBeenCalledWith('cheahuan', 'r-b')
  })

  it('offers an unplaced person a rank first, defaulting to their title’s rung', () => {
    const { props } = setup(people[5]) // YUNY, Team Assistant, no position
    expect(screen.getByRole('dialog', { name: 'Place YUNY' })).toBeInTheDocument()
    const select = screen.getByLabelText('Rank to place them at') as HTMLSelectElement
    // Team Assistant is not on this ladder, so the bottom rung is offered.
    expect(select.value).toBe('r-c')
    fireEvent.change(select, { target: { value: 'r-b' } })
    fireEvent.click(screen.getByRole('option', { name: /ANTHONY/ }))
    expect(props.onPick).toHaveBeenCalledWith('anthony', 'r-b')
  })

  it('confirms a drop with a rank when the target is already chosen', () => {
    const { props } = setup(people[6], { placeUnder: 'cheahuan' }) // MEI TING dropped on CHEA HUAN
    expect(screen.getByRole('dialog').textContent).toContain('under')
    expect(screen.queryByLabelText('Filter by name')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Place' }))
    expect(props.onPick).toHaveBeenCalledWith('cheahuan', 'r-c')
  })

  it('closes on Escape', () => {
    const { props } = setup(people[2])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalled()
  })
})

describe('defaultRankFor', () => {
  it('takes the lowest rung of the title, else the ladder’s bottom rung', () => {
    expect(defaultRankFor(ranks, 't-srs')?.id).toBe('r-b')
    expect(defaultRankFor(ranks, 't-nobody')?.id).toBe('r-c')
    expect(defaultRankFor(ranks, null)?.id).toBe('r-c')
    expect(defaultRankFor([], null)).toBeNull()
  })
})
