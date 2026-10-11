import { beforeEach, describe, expect, it, vi } from 'vitest'

// The guest page's four calls answer a stranger (2026-10-11, the security
// review's N3): the database's refusals pass on in its words, a clash in the
// page's, and anything else — the database's own text — never.

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), pushSoon: vi.fn() }))
vi.mock('./client', () => ({ guestClient: () => ({ rpc: mocks.rpc }) }))
// A guest's booking or request tells HR (mig 20261011180000): the push goes after the answer.
vi.mock('@/lib/push/outbox', () => ({ pushSoon: mocks.pushSoon }))

import { guestBook, guestCancel, guestDay, guestHire } from './actions'

const CODE = 'hv-ABCDEFGH'
const ID = '0b5f6a1e-4c1d-4f3a-9a77-2f1d0c3b4e5a'
const failWith = (code: string, message: string) => mocks.rpc.mockResolvedValue({ data: null, error: { code, message, details: null, hint: null } })

const calls = {
  day: () => guestDay(CODE, '2026-10-12'),
  book: () => guestBook({ code: CODE, id: null, room: ID, day: '2026-10-12', from: 600, to: 660, title: 'Sync', subsidiary: ID, department: '', name: 'Wong', pax: 2, actor: null }),
  hire: () => guestHire({ code: CODE, subsidiary: ID, name: 'Wong', answers: { position: 'Driver' }, attachmentPath: null, attachmentName: null }),
  cancel: () => guestCancel(CODE, ID, 'Siti'),
}
const FALLBACKS = {
  day: 'The schedule could not be read. Please try again.',
  book: 'The room could not be booked. Please try again.',
  hire: 'The request could not be sent. Please try again.',
  cancel: 'The meeting could not be cancelled. Please try again.',
}

beforeEach(() => mocks.rpc.mockReset())

describe.each(Object.keys(calls) as Array<keyof typeof calls>)('%s', which => {
  it('passes the database’s refusal on', async () => {
    failWith('P0001', 'Too many requests from the guest link just now. Try again later.')
    expect(await calls[which]()).toEqual({ ok: false, reason: 'Too many requests from the guest link just now. Try again later.' })
    failWith('42501', 'This link is closed.')
    expect(await calls[which]()).toEqual({ ok: false, reason: 'This link is closed.' })
    failWith('22023', 'Say which company is asking')
    expect(await calls[which]()).toEqual({ ok: false, reason: 'Say which company is asking' })
  })

  it('never shows the database’s own text', async () => {
    failWith('22P02', 'invalid input syntax for type uuid: "x"')
    expect(await calls[which]()).toEqual({ ok: false, reason: FALLBACKS[which] })
    failWith('23514', 'new row for relation "meeting_room_bookings" violates check constraint "meeting_room_bookings_half_hours"')
    expect(await calls[which]()).toEqual({ ok: false, reason: FALLBACKS[which] })
    failWith('42501', `permission denied for function guest_link_${which}`)
    expect(await calls[which]()).toEqual({ ok: false, reason: FALLBACKS[which] })
  })
})

it('a clash on the slot is said as the page says it', async () => {
  failWith('23P01', 'conflicting key value violates exclusion constraint "meeting_room_bookings_no_overlap"')
  expect(await calls.book()).toEqual({ ok: false, reason: 'Someone just took that slot. Pick another time.' })
})

it('a code that is not the link’s never reaches the database', async () => {
  expect(await guestBook({ code: 'hv-WRONG', id: null, room: null, day: '', from: null, to: null, title: '', subsidiary: '', department: '', name: '', pax: 1, actor: null }))
    .toEqual({ ok: false, reason: 'This link is closed.' })
  expect(mocks.rpc).not.toHaveBeenCalled()
})
