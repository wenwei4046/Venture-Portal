import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HrAppData } from '@/lib/hr-app/model'
vi.mock('@/components/layout/view-as-actions', () => ({ stopViewingAsPerson: vi.fn() }))

import HrApp, { type HrAppActions } from './HrApp'

// The HR phone app's sheets (2026-10-11): a field in a sheet keeps its place
// while it is typed in. Its label was a component made afresh inside the
// sheet on every render, so React swapped the input for a new one after each
// key — "Interview" left "I", the people search kept "N" (the phone audit).

const data: HrAppData = {
  greetName: 'Grace',
  meId: 's1',
  viewingAs: null,
  today: '2026-10-11',
  staff: [
    { id: 's1', name: 'Grace Lim', title: 'HR Manager', dept: 'HR' },
    { id: 's2', name: 'Nurul Huda', title: 'HR Executive', dept: 'HR' },
  ],
  owners: [],
  hires: [],
  requests: [],
  rooms: [{ id: 'r1', name: 'Meeting Room 1', seats: 8 }],
  bookings: [],
  sources: [],
  talents: [],
  docTypes: [],
  letters: [],
  bookDepts: [{ id: 'd1', name: 'HR' }],
  parts: { requests: false, hiring: false, insights: false, talent: false, docs: false, rooms: true },
  may: { decide: false, hireApprove: false, hireEdit: false, hireCreate: false, talentEdit: false, book: true },
}

const done = vi.fn(async () => ({ ok: true as const }))
const actions = {
  hireAck: done, hireInfo: done, hireDecline: done, hireCancel: done, hireFill: done, candStage: done, candAdd: done,
  requestDecide: done, book: done, bookCancel: done, talentNotes: done, talentRemove: done,
  letterLink: vi.fn(async () => ({ ok: false as const, reason: 'none' })),
  refresh: vi.fn(),
} as unknown as HrAppActions

afterEach(cleanup)

function openBook() {
  render(<HrApp data={data} actions={actions} />)
  fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Rooms' }))
  fireEvent.click(screen.getByRole('button', { name: '+ Book' }))
}

describe('the HR app’s Book sheet', () => {
  it('keeps the same title field, focused, key after key', () => {
    openBook()
    const field = screen.getByPlaceholderText('e.g. Interview')
    field.focus()
    for (const typed of ['I', 'In', 'Int', 'Interview']) {
      fireEvent.change(screen.getByPlaceholderText('e.g. Interview'), { target: { value: typed } })
      expect(screen.getByPlaceholderText('e.g. Interview')).toBe(field)
      expect(document.activeElement).toBe(field)
    }
    expect(field).toHaveValue('Interview')
  })

  it('keeps the people search while a name is typed, and finds them', () => {
    openBook()
    const search = screen.getByPlaceholderText('Add a colleague — type a name')
    search.focus()
    fireEvent.change(search, { target: { value: 'N' } })
    fireEvent.change(screen.getByPlaceholderText('Add a colleague — type a name'), { target: { value: 'Nur' } })
    expect(screen.getByPlaceholderText('Add a colleague — type a name')).toBe(search)
    expect(document.activeElement).toBe(search)
    expect(screen.getByRole('button', { name: '+ Nurul Huda' })).toBeInTheDocument()
  })

  it('keeps a select the same field when it changes', () => {
    openBook()
    const room = screen.getByRole('combobox', { name: 'Room' })
    fireEvent.change(room, { target: { value: 'r1' } })
    expect(screen.getByRole('combobox', { name: 'Room' })).toBe(room)
    expect(room).toHaveValue('r1')
  })
})

describe('the HR app viewed as somebody', () => {
  it('says whose app it is and that nothing is saved', () => {
    render(<HrApp data={{ ...data, viewingAs: 'Nurul Huda', greetName: 'Nurul' }} actions={actions} />)
    expect(screen.getByRole('status')).toHaveTextContent('Viewing as Nurul Huda — their pages, menus and buttons. Read-only: nothing you press is saved.')
    expect(screen.getByRole('button', { name: 'Stop viewing' })).toBeInTheDocument()
  })

  it('shows no strip in your own app', () => {
    render(<HrApp data={data} actions={actions} />)
    expect(screen.queryByText(/Viewing as/)).toBeNull()
  })
})

describe('the HR app with no meeting room yet', () => {
  it('greys out + Book: there is nothing to book', () => {
    render(<HrApp data={{ ...data, rooms: [] }} actions={actions} />)
    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Rooms' }))
    expect(screen.getByRole('button', { name: '+ Book' })).toBeDisabled()
  })
})
