import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import MovePopover from './MovePopover'
import type { OrgPerson } from './OrgChart'
import type { OrgNodeInput } from '@/lib/org-layout'
import { shelfIds } from '@/lib/commission/chart-moves'

const person = (over: Partial<OrgPerson> & { staffId: string; name: string }): OrgPerson => ({
  code: null,
  titleName: 'Team Leader',
  titleId: 't-tl',
  levelRank: 5,
  levelName: 'Manager',
  uplineStaffId: null,
  rankId: 'r-a',
  rankLabel: 'Rank A',
  productRate: 0.1,
  canRecruit: true,
  rateMode: 'variable',
  placedSince: '2026-07-01',
  ...over,
})

const srs = { titleName: 'Senior Revenue Specialist', titleId: 't-srs', levelRank: 3, levelName: 'Senior Executive', rankId: 'r-b', rankLabel: 'Rank B', productRate: 0.08 } as const
const rs = { titleName: 'Revenue Specialist', titleId: 't-rs', levelRank: 2, levelName: 'Executive', rankId: 'r-c', rankLabel: 'Rank C', productRate: 0.06, canRecruit: false } as const

const people: OrgPerson[] = [
  person({ staffId: 'anthony', name: 'ANTHONY' }),
  person({ staffId: 'cheahuan', name: 'CHEA HUAN' }),
  person({ staffId: 'howard', name: 'HOWARD', ...srs, uplineStaffId: 'cheahuan' }),
  person({ staffId: 'zack', name: 'ZACK', ...rs, uplineStaffId: 'howard' }),
  person({ staffId: 'luis', name: 'LUIS TEO', ...srs, uplineStaffId: 'anthony' }),
  // A title with no rung on this ladder: no rank yet, and nobody may earn under them.
  person({ staffId: 'yuny', name: 'YUNY', titleName: 'Team Assistant', titleId: 't-ta', levelRank: 4, levelName: 'Senior', uplineStaffId: 'anthony', canRecruit: false, rankId: null, rankLabel: null, productRate: null, rateMode: null, placedSince: null }),
  // On no line at all: reports to nobody, nobody under them, cannot lead.
  person({ staffId: 'mei', name: 'MEI TING', ...rs, uplineStaffId: null }),
]
const graph: OrgNodeInput[] = people.map(p => ({ id: p.staffId, parentId: p.uplineStaffId, label: p.name }))
// As the chart builds it: the shelf is not in the graph the popover lists by tree.
const shelf = shelfIds(people.map(p => ({ staffId: p.staffId, parentId: p.uplineStaffId, canRecruit: p.canRecruit })))
const treeGraph = graph.filter(n => !shelf.has(n.id))
const anchor = { left: 100, top: 100, bottom: 130 }

function setup(mover: OrgPerson) {
  const props = { mover, people, graph: treeGraph, anchor, onPick: vi.fn(), onClose: vi.fn() }
  const utils = render(<MovePopover {...props} />)
  return { ...utils, props }
}

describe('MovePopover', () => {
  it('lists every tree with the current upline marked and refusals captioned', () => {
    setup(people[2]) // HOWARD, under CHEA HUAN, with ZACK below him
    expect(screen.getByText('ANTHONY’s tree')).toBeInTheDocument()
    expect(screen.getByText('CHEA HUAN’s tree')).toBeInTheDocument()
    expect(screen.getByText('On no line')).toBeInTheDocument()

    const cheahuan = screen.getByRole('option', { name: /CHEA HUAN/ })
    expect(cheahuan).toBeDisabled()
    expect(cheahuan).toHaveTextContent('current')

    expect(screen.getByRole('option', { name: /^HOWARD/ })).toHaveTextContent('that is them')
    expect(screen.getByRole('option', { name: /ZACK/ })).toHaveTextContent('their downline')
    expect(screen.getByRole('option', { name: /YUNY/ })).toHaveTextContent('no downlines')
    expect(screen.getByRole('option', { name: /MEI TING/ })).toHaveTextContent('no downlines')
    expect(screen.getByRole('option', { name: /ANTHONY/ })).toBeEnabled()
  })

  it('greys a title the ladder ranks below the mover’s', () => {
    setup(people[0]) // ANTHONY, a Manager
    expect(screen.getByRole('option', { name: /^HOWARD/ })).toHaveTextContent('lower title')
    expect(screen.getByRole('option', { name: /CHEA HUAN/ })).toBeEnabled()
  })

  it('picks the upline, and the last row detaches', () => {
    const { props } = setup(people[2])
    fireEvent.click(screen.getByRole('option', { name: /ANTHONY/ }))
    expect(props.onPick).toHaveBeenCalledWith('anthony')

    fireEvent.click(screen.getByRole('option', { name: /Top of their own tree/ }))
    expect(props.onPick).toHaveBeenLastCalledWith(null)
  })

  it('marks the top row current for somebody already reporting to nobody', () => {
    setup(people[0])
    const top = screen.getByRole('option', { name: /Top of their own tree/ })
    expect(top).toBeDisabled()
    expect(top).toHaveTextContent('current')
  })

  it('filters by name and Enter takes the first row that may be picked', () => {
    const { props } = setup(people[4]) // LUIS TEO under ANTHONY
    const box = screen.getByLabelText('Filter by name')
    fireEvent.change(box, { target: { value: 'chea' } })
    expect(screen.queryByRole('option', { name: /HOWARD/ })).toBeNull()
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(props.onPick).toHaveBeenCalledWith('cheahuan')
  })

  it('closes on Escape', () => {
    const { props } = setup(people[2])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalled()
  })
})

describe('Revenue Specialist recruiting follows the sub-department configuration', () => {
  function setupSpecialists(canRecruit: boolean, existingDirects: number) {
    const specialist = { ...rs, canRecruit, directLineLimit: 3 }
    const mover = person({ staffId: 'mover', name: 'MOVER', ...specialist, directLineCount: 1 })
    const roster = [
      mover,
      person({ staffId: 'peer', name: 'PEER', ...specialist, directLineCount: existingDirects }),
      person({ staffId: 'child', name: 'CHILD', ...specialist, uplineStaffId: 'mover', directLineCount: 1 }),
      person({ staffId: 'grandchild', name: 'GRANDCHILD', ...specialist, uplineStaffId: 'child', directLineCount: 0 }),
      ...Array.from({ length: existingDirects }, (_, index) => person({
        staffId: `existing-${index}`, name: `EXISTING ${index + 1}`, ...specialist, uplineStaffId: 'peer', directLineCount: 0,
      })),
    ]
    const graph = roster.map(person => ({ id: person.staffId, parentId: person.uplineStaffId, label: person.name }))
    const onPick = vi.fn()
    render(<MovePopover mover={mover} people={roster} graph={graph} anchor={anchor} onPick={onPick} onClose={vi.fn()} />)
    return { onPick }
  }

  it('offers an IR specialist peer with an open third slot while retaining self and descendant refusals', () => {
    const { onPick } = setupSpecialists(true, 2)
    const peer = screen.getByRole('option', { name: /^PEER/ })
    expect(peer).toBeEnabled()
    expect(peer).toHaveTextContent('Revenue Specialist')
    expect(peer).toHaveTextContent('2/3 directs')
    fireEvent.click(peer)
    expect(onPick).toHaveBeenCalledWith('peer')

    const self = screen.getByRole('option', { name: /^MOVER/ })
    const child = screen.getByRole('option', { name: /^CHILD/ })
    const grandchild = screen.getByRole('option', { name: /^GRANDCHILD/ })
    expect(self).toBeDisabled()
    expect(self).toHaveTextContent('that is them')
    for (const descendant of [child, grandchild]) {
      expect(descendant).toBeDisabled()
      expect(descendant).toHaveTextContent('their downline')
    }
    fireEvent.click(self)
    fireEvent.click(child)
    fireEvent.click(grandchild)
    expect(onPick).toHaveBeenCalledTimes(1)
  })

  it('refuses a fourth direct under an IR specialist even though the title may recruit', () => {
    const { onPick } = setupSpecialists(true, 3)
    const peer = screen.getByRole('option', { name: /^PEER/ })
    expect(peer).toBeDisabled()
    expect(peer).toHaveTextContent('3/3 directs')
    expect(peer).toHaveTextContent('direct lines full')
    fireEvent.click(peer)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('continues refusing the same specialist title when Fair supplies canRecruit=false', () => {
    const { onPick } = setupSpecialists(false, 0)
    const peer = screen.getByRole('option', { name: /^PEER/ })
    expect(peer).toBeDisabled()
    expect(peer).toHaveTextContent('Revenue Specialist')
    expect(peer).toHaveTextContent('no downlines')
    fireEvent.click(peer)
    expect(onPick).not.toHaveBeenCalled()
  })
})
