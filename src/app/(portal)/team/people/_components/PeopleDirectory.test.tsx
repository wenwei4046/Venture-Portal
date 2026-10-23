import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

// The roster as the HR revamp draws it (2026-10-10): five cards, the search
// and Active · Inactive · All, a walnut band per department that folds, a row
// per person; click for the window, right-click for Invite user · Open card.

const flash = vi.fn()
vi.mock('@/components/hrv/toast', () => ({ flash: (m: string) => flash(m) }))
vi.mock('./PersonWindow', () => ({
  default: ({ personId, onInvite }: { personId: string; onInvite?: (id: string) => void }) => (
    <div role="dialog" aria-label="window">
      WINDOW {personId}
      {onInvite ? <button type="button" onClick={() => onInvite(personId)}>window invite</button> : null}
    </div>
  ),
}))

import PeopleDirectory, { type PersonRow } from './PeopleDirectory'

const row = (over: Partial<PersonRow> & { id: string; name: string }): PersonRow => ({
  code: null, title: null, levelRank: null, levelName: null, department: 'Revenue', rankLabel: null, rankRate: null,
  active: true, resignedOn: null, accountEmail: null, accountActive: null, lastSeenAt: null, missing: [], ...over,
})
const people: PersonRow[] = [
  row({ id: 'a', name: 'Anthony', code: 'HV008', title: 'Team Leader', levelRank: 7, levelName: 'L7', rankLabel: 'Rank B', rankRate: 0.09, accountEmail: 'anthony@houzs.my', accountActive: true, lastSeenAt: '2026-10-08T03:00:00Z' }),
  row({ id: 'r', name: 'Ryan Tan', code: 'HV025', title: 'Revenue Specialist', levelRank: 3, levelName: 'L3', missing: ['NRIC', 'bank account', 'hire date'] }),
  row({ id: 'w', name: 'WENG GI', title: 'Revenue Specialist', active: false, resignedOn: '2026-09-30' }),
  row({ id: 'l', name: 'LOO WEN WEI', code: 'HV001', title: 'CHIEF EXECUTIVE OFFICER', department: 'Director' }),
]

const show = (onInvite?: (id: string) => void) => render(<PeopleDirectory people={people} unattachedAccounts={[]} canSeeActivity={false} onInvite={onInvite} />)
const rowOf = (name: string) => screen.getByText(name).closest('[role=row]') as HTMLElement

beforeEach(() => flash.mockReset())
afterEach(cleanup)

describe('the roster', () => {
  it('counts the roster in five cards and draws the handoff’s grid', () => {
    show()
    const cards = screen.getByRole('region', { name: 'The roster' })
    expect(within(cards).getByRole('group', { name: 'Active staff' })).toHaveTextContent('3')
    expect(within(cards).getByRole('group', { name: 'Active staff' })).toHaveTextContent('4 on the roster')
    expect(within(cards).getByRole('group', { name: 'Missing details' })).toHaveTextContent('1')
    expect(within(cards).getByRole('group', { name: 'Inactive' })).toHaveTextContent('1')
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Name', 'Title', 'Rank', 'Code', 'Employment', 'Last seen', ''])
    expect(rowOf('Anthony')).toHaveTextContent('Team LeaderL7B9%HV008Active')
    expect(rowOf('Ryan Tan')).toHaveTextContent('3 missing')
    expect(screen.queryByText('WENG GI')).toBeNull()
  })

  it('bands each department, folds one, and filters by employment and search', () => {
    show()
    expect(screen.getByRole('button', { name: /Director\s*1 person/ })).toBeInTheDocument()
    const revenue = screen.getByRole('button', { name: /Revenue\s*2 people · 1 incomplete/ })
    fireEvent.click(revenue)
    expect(revenue).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Anthony')).toBeNull()
    fireEvent.click(revenue)
    fireEvent.click(screen.getByRole('button', { name: /^Inactive/ }))
    expect(screen.getByText('WENG GI')).toBeInTheDocument()
    expect(rowOf('WENG GI')).toHaveTextContent('Resigned 30 Sep 2026')
    fireEvent.click(screen.getByRole('button', { name: /^All/ }))
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'hv001' } })
    expect(screen.getByText('LOO WEN WEI')).toBeInTheDocument()
    expect(screen.queryByText('Anthony')).toBeNull()
  })

  it('opens the window on a click', () => {
    show()
    fireEvent.click(rowOf('Ryan Tan'))
    expect(screen.getByRole('dialog', { name: 'window' })).toHaveTextContent('WINDOW r')
  })

  it('right-click: Invite user for somebody with no login, Open card for anybody', () => {
    const onInvite = vi.fn()
    show(onInvite)
    fireEvent.contextMenu(rowOf('Ryan Tan'))
    const menu = screen.getByRole('menu', { name: 'Ryan Tan' })
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Invite user' }))
    expect(onInvite).toHaveBeenCalledWith('r')
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.contextMenu(rowOf('Anthony'))
    fireEvent.click(within(screen.getByRole('menu', { name: 'Anthony' })).getByRole('menuitem', { name: 'Open card' }))
    expect(screen.getByRole('dialog', { name: 'window' })).toHaveTextContent('WINDOW a')
  })

  it('says why Invite user does nothing for somebody with a login, or a reader who may not invite', () => {
    show(vi.fn())
    fireEvent.contextMenu(rowOf('Anthony'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invite user' }))
    expect(flash).toHaveBeenCalledWith('Anthony already has a login')
    cleanup()
    show()
    fireEvent.contextMenu(rowOf('Ryan Tan'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invite user' }))
    expect(flash).toHaveBeenCalledWith('Inviting needs HR view › Permissions · Create')
  })

  // HR invites since 2026-10-20 — but a full-access title only from whoever manages permissions.
  it('greys Invite user for a full-access title and says why, never opening the window', () => {
    const onInvite = vi.fn()
    const held = 'CHIEF EXECUTIVE OFFICER is a full-access title (Ultimate full access): only whoever manages permissions gives it a login.'
    render(
      <PeopleDirectory
        people={people.map(p => (p.id === 'l' ? { ...p, inviteHeld: held } : p))}
        unattachedAccounts={[]}
        canSeeActivity={false}
        onInvite={onInvite}
      />,
    )
    fireEvent.contextMenu(rowOf('LOO WEN WEI'))
    const item = within(screen.getByRole('menu', { name: 'LOO WEN WEI' })).getByRole('menuitem', { name: 'Invite user' })
    expect(item).toHaveAttribute('data-quiet', 'true')
    fireEvent.click(item)
    expect(flash).toHaveBeenCalledWith(held)
    expect(onInvite).not.toHaveBeenCalled()
  })

  it('a click elsewhere or Escape puts the menu away', () => {
    show()
    fireEvent.contextMenu(rowOf('Ryan Tan'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.contextMenu(rowOf('Ryan Tan'))
    fireEvent.click(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

// 2026-10-20 — the user: "People Management 这边要多加一个 filter：这个 filter 是 drop down 来的，可以选 department，
// 用 department 来做 filter"; and "在 People Management page，我要他的名字显示全名（也就是 Last Name 加 First Name）".
describe('the department filter and the full name', () => {
  const roster: PersonRow[] = [
    row({ id: 'c', name: 'Teoh CHEA HUAN', icName: 'CHEA HUAN', code: 'HV009', department: 'Revenue Department' }),
    row({ id: 'k', name: 'KRIS', icName: 'KRIS', code: 'HV006', department: 'Revenue Department' }),
    row({ id: 'g', name: 'GONE', department: 'Revenue Department', active: false }),
    row({ id: 'l', name: 'LOO WEN WEI', icName: 'LOO WEN WEI', code: 'HV001', department: 'Director' }),
    row({ id: 'n', name: 'NOBODY', department: null }),
  ]
  const draw = () => render(<PeopleDirectory people={roster} unattachedAccounts={[]} canSeeActivity={false} />)
  const pick = (dept: string) => fireEvent.change(screen.getByRole('combobox', { name: 'Department' }), { target: { value: dept } })

  it('lists the full name, last name first, and finds them by the name on their IC too', () => {
    draw()
    expect(rowOf('Teoh CHEA HUAN')).toHaveTextContent('HV009')
    expect(rowOf('Teoh CHEA HUAN')).toHaveTextContent('TC')
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'chea huan' } })
    expect(screen.getByText('Teoh CHEA HUAN')).toBeInTheDocument()
    expect(screen.queryByText('KRIS')).toBeNull()
  })

  it('offers every department with its count, then shows the one picked — its pills counting it', () => {
    draw()
    const select = screen.getByRole('combobox', { name: 'Department' }) as HTMLSelectElement
    expect([...select.options].map(o => o.textContent)).toEqual(['All departments', 'Director · 1', 'Revenue Department · 2', '— No department · 1'])
    pick('Revenue Department')
    expect(screen.getByText('Teoh CHEA HUAN')).toBeInTheDocument()
    expect(screen.getByText('KRIS')).toBeInTheDocument()
    expect(screen.queryByText('LOO WEN WEI')).toBeNull()
    expect(screen.queryByText('NOBODY')).toBeNull()
    expect(screen.queryByRole('button', { name: /Director\s*1 person/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^Active/ })).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: /^Inactive/ })).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /^All/ })).toHaveTextContent('3')
    // The five cards stay over the whole roster.
    expect(within(screen.getByRole('region', { name: 'The roster' })).getByRole('group', { name: 'Active staff' })).toHaveTextContent('4')
    fireEvent.click(screen.getByRole('button', { name: /^Inactive/ }))
    expect(screen.getByText('GONE')).toBeInTheDocument()
    expect(screen.queryByText('KRIS')).toBeNull()
  })

  it('shows the people in no department on their own, and everybody again on All departments', () => {
    draw()
    pick('— No department')
    expect(screen.getByText('NOBODY')).toBeInTheDocument()
    expect(screen.queryByText('KRIS')).toBeNull()
    pick('')
    expect(screen.getByText('NOBODY')).toBeInTheDocument()
    expect(screen.getByText('KRIS')).toBeInTheDocument()
    expect(screen.getByText('LOO WEN WEI')).toBeInTheDocument()
  })
})

// 2026-10-22 — the user, circling the heads: "like press name, will be follow by alpahabe 排法， title will be follow
// title 高到低 按多一次就低到高". Each band is sorted by the head pressed; pressed again, the other way.
describe('a column head sorts each band', () => {
  const roster: PersonRow[] = [
    row({ id: 'c', name: 'Cara', code: 'HV008', title: 'Team Leader', levelRank: 7, levelName: 'L7' }),
    row({ id: 'w', name: 'Wendy', code: 'HV009', title: 'Team Leader', levelRank: 7, levelName: 'L7' }),
    row({ id: 'a', name: 'Ann', code: 'HV012', title: 'Revenue Specialist', levelRank: 3, levelName: 'L3' }),
    row({ id: 'b', name: 'bella', code: 'HV030', title: 'Revenue Specialist', levelRank: 3, levelName: 'L3' }),
    row({ id: 'l', name: 'LOO WEN WEI', code: 'HV001', title: 'CHIEF EXECUTIVE OFFICER', levelRank: 10, levelName: 'L10', department: 'Director' }),
  ]
  const draw = () => render(<PeopleDirectory people={roster} unattachedAccounts={[]} canSeeActivity={false} />)
  /** The names on show, top to bottom. */
  const order = () => {
    const names = ['Cara', 'Wendy', 'Ann', 'bella', 'LOO WEN WEI'].map(n => screen.getByText(n))
    return names.sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)).map(e => e.textContent)
  }
  const head = (label: string) => screen.getByRole('button', { name: label })
  const sortOf = () => Object.fromEntries(screen.getAllByRole('columnheader').slice(0, 6).map(h => [h.textContent, h.getAttribute('aria-sort')]))

  it('reads in the ladder’s order with no head sorting, every head a button', () => {
    draw()
    expect(order()).toEqual(['LOO WEN WEI', 'Cara', 'Wendy', 'Ann', 'bella'])
    expect(sortOf()).toEqual({ Name: 'none', Title: 'none', Rank: 'none', Code: 'none', Employment: 'none', 'Last seen': 'none' })
    expect(screen.getAllByRole('columnheader')[6]).not.toHaveAttribute('aria-sort')
  })

  it('Name: A→Z inside each band, case aside — pressed again, Z→A', () => {
    draw()
    fireEvent.click(head('Name'))
    expect(order()).toEqual(['LOO WEN WEI', 'Ann', 'bella', 'Cara', 'Wendy'])
    expect(sortOf()).toMatchObject({ Name: 'ascending', Title: 'none' })
    fireEvent.click(head('Name'))
    expect(order()).toEqual(['LOO WEN WEI', 'Wendy', 'Cara', 'bella', 'Ann'])
    expect(sortOf()).toMatchObject({ Name: 'descending' })
  })

  it('Title: the most senior first — pressed again, the least senior first', () => {
    draw()
    fireEvent.click(head('Name'))
    fireEvent.click(head('Title'))
    expect(order()).toEqual(['LOO WEN WEI', 'Cara', 'Wendy', 'Ann', 'bella'])
    expect(sortOf()).toMatchObject({ Name: 'none', Title: 'descending' })
    fireEvent.click(head('Title'))
    expect(order()).toEqual(['LOO WEN WEI', 'Ann', 'bella', 'Cara', 'Wendy'])
    expect(sortOf()).toMatchObject({ Title: 'ascending' })
  })

  it('Code: from HV001 up — pressed again, down', () => {
    draw()
    fireEvent.click(head('Code'))
    expect(order()).toEqual(['LOO WEN WEI', 'Cara', 'Wendy', 'Ann', 'bella'])
    fireEvent.click(head('Code'))
    expect(order()).toEqual(['LOO WEN WEI', 'bella', 'Ann', 'Wendy', 'Cara'])
  })
})

// 2026-10-23 — the user, circling the Employment chip: "for the employment status, i want go with permenant, part time
// and probation status follow by the hire date start".
describe('the Employment column', () => {
  const roster: PersonRow[] = [
    row({ id: 'p', name: 'Zack', code: 'HV052', hireDate: '2026-10-05', employmentStatus: 'probation',
      employmentChip: { label: 'Probation · 9d left', tone: 'alert', title: 'Probation ends 1 Nov 2026 · in 9 days' } }),
    row({ id: 'm', name: 'Mei', code: 'HV030', hireDate: '2024-03-01', employmentStatus: 'permanent', employmentChip: { label: 'Permanent', tone: 'ledger' } }),
    row({ id: 't', name: 'Tina', code: 'HV031', hireDate: '2026-09-01', employmentStatus: 'part_time', employmentChip: { label: 'Part time', tone: 'info' } }),
    row({ id: 'n', name: 'Nobody Set', code: 'HV032', hireDate: null, employmentStatus: null, employmentChip: { label: 'Not set', tone: 'plain' }, missing: ['hire date'] }),
    row({ id: 'g', name: 'Gone', code: 'HV004', active: false, resignedOn: '2026-09-30', hireDate: '2025-01-01', employmentStatus: 'permanent', employmentChip: null }),
  ]
  const draw = () => render(<PeopleDirectory people={roster} unattachedAccounts={[]} canSeeActivity={false} />)
  const names = () => ['Zack', 'Mei', 'Tina', 'Nobody Set'].map(n => screen.getByText(n))
    .sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)).map(e => e.textContent)

  it('reads the status where Active was, then the hire date', () => {
    draw()
    expect(rowOf('Zack')).toHaveTextContent('Probation · 9d left5 Oct 2026')
    expect(within(rowOf('Zack')).getByText('Probation · 9d left').closest('[data-tone]')).toHaveAttribute('data-tone', 'alert')
    expect(within(rowOf('Zack')).getByText('Probation · 9d left').closest('[title]')).toHaveAttribute('title', 'Probation ends 1 Nov 2026 · in 9 days')
    expect(rowOf('Mei')).toHaveTextContent('Permanent1 Mar 2024')
    expect(rowOf('Tina')).toHaveTextContent('Part time1 Sep 2026')
    expect(rowOf('Nobody Set')).toHaveTextContent('Not set1 missing')
    expect(within(rowOf('Mei')).getByTitle('Hire date')).toHaveTextContent('1 Mar 2024')
    for (const name of ['Zack', 'Mei', 'Tina', 'Nobody Set']) expect(within(rowOf(name)).queryByText('Active')).toBeNull()
  })

  it('an inactive person keeps their own chip', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /^Inactive/ }))
    expect(rowOf('Gone')).toHaveTextContent('Resigned 30 Sep 2026')
  })

  it('reads Active where the page could not say which (the directory)', () => {
    render(<PeopleDirectory people={[row({ id: 'd', name: 'Dee', hireDate: '2026-01-05' })]} unattachedAccounts={[]} canSeeActivity={false} />)
    expect(rowOf('Dee')).toHaveTextContent('Active5 Jan 2026')
  })

  it('its head sorts by the status, then the hire date — probation first', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Employment' }))
    expect(names()).toEqual(['Zack', 'Tina', 'Mei', 'Nobody Set'])
    fireEvent.click(screen.getByRole('button', { name: 'Employment' }))
    expect(names()).toEqual(['Nobody Set', 'Mei', 'Tina', 'Zack'])
  })
})
