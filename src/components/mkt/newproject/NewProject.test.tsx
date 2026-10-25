import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ProductPick } from '@/lib/marketing/project'

// 2026-10-23 — New Project's 📦 branch (②b-1, `New Project.dc.html` step 1): a product project is the manager's; they
// pick who it is for and a product on sale, and its intake meeting minutes open next. The database's side is
// tests/member-sql/validate-marketing-product-projects.mjs.

const actions = vi.hoisted(() => ({
  createMktTask: vi.fn(), startMktProduct: vi.fn(), addMktClient: vi.fn(), saveMktDraft: vi.fn(), openMktDraft: vi.fn(), dropMktDraft: vi.fn(),
}))
vi.mock('@/lib/marketing/actions', () => actions)
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import NewProject from './NewProject'

const subs = [
  { id: 'sub-car', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, pic: 'Kelvin' },
  { id: 'sub-mvs', code: 'MVS', name: 'Mattress Villa', dot: 'y', emoji: '🛏️', client: false, pic: null },
]
const products = [
  { id: 'pr-a', code: 'P-001', name: 'Social Media Package A', kind: 'recurring', version: 2, note: '4 posts + 2 videos / month', description: '', actions: 3,
    intake: { id: 't1', name: 'Kickoff', version: 1, fields: 7 }, price: 3000 },
  { id: 'pr-b', code: 'P-002', name: 'Brand refresh', kind: 'one', version: 1, note: '', description: '', actions: 1,
    intake: { id: 't2', name: 'Brief', version: 2, fields: 1 }, price: 8000 },
] as ProductPick[]
const open = (p: ProductPick[] | null, add: { canAddSub?: boolean; addFirst?: boolean } = {}) =>
  render(<NewProject today="2026-10-24" me={null} subs={subs} people={[]} approvers={[]} holidays={[]} firstSub={null} products={p} {...add} />)

beforeEach(() => {
  for (const f of [...Object.values(actions), ...Object.values(router)]) f.mockReset()
  // A draft kept as it is typed (mig 20261025211000): the first save makes d1, each after it counts on.
  let rev = 0
  actions.saveMktDraft.mockImplementation(async () => ({ ok: true, id: 'd1', rev: ++rev, at: '2026-10-25T05:07:00Z' }))
  actions.dropMktDraft.mockResolvedValue({ ok: true })
  window.history.replaceState(null, '', '/marketing/new')
})

describe('New Project’s product projects', () => {
  it('are the manager’s: for anyone else the card stays off', () => {
    open(null)
    const card = screen.getByRole('radio', { name: /Product project/ })
    expect(card.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('Manager only')).toBeTruthy()
    fireEvent.click(card)
    expect(card.getAttribute('aria-checked')).toBe('false')
  })

  it('the manager picks who it is for and a product on sale, and its intake minutes open', async () => {
    open(products)
    fireEvent.click(screen.getByRole('radio', { name: /Product project/ }))
    expect(screen.getByRole('radio', { name: /Social Media Package A/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Recurring monthly')).toBeTruthy()
    expect(screen.getByText('7 intake fields · 3 actions')).toBeTruthy()
    expect(screen.getByText('Carres · Social Media Package A · RM 3,000.00 a month · Kickoff minutes')).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: /Mattress Villa/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Brand refresh/ }))
    expect(screen.getByText('Mattress Villa · Brand refresh · RM 8,000.00 · Brief minutes')).toBeTruthy()

    actions.startMktProduct.mockResolvedValue({ ok: true, id: 'p9', track: 'MKT-MVS-2610-001' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open meeting minutes →' }))
    })
    // The answer is awaited after the call: wait for what it does, not for the call (2026-10-23 — such waits raced on CI).
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/marketing/projects/MKT-MVS-2610-001'))
    expect(actions.startMktProduct).toHaveBeenCalledWith('sub-mvs', 'pr-b', 8000, null, null)
    expect(actions.createMktTask).not.toHaveBeenCalled()
  })

  it('says why when it cannot start one', async () => {
    open(products)
    fireEvent.click(screen.getByRole('radio', { name: /Product project/ }))
    actions.startMktProduct.mockResolvedValue({ ok: false, reason: 'That product is not on sale today.' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open meeting minutes →' }))
    })
    expect(await screen.findByText('That product is not on sale today.')).toBeTruthy()
    expect(router.push).not.toHaveBeenCalled()
  })

  // ②b-2b — the user's answer 43: the amount is typed when the project is made (a quote), the list price offered.
  it('its amount: the list price offered, the quote typed sent instead — none, nothing starts', async () => {
    open([...products, { ...products[1], id: 'pr-c', name: 'Event day', price: null }])
    fireEvent.click(screen.getByRole('radio', { name: /Product project/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Brand refresh/ }))
    const amount = screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement
    expect(amount.value).toBe('8000')
    expect(screen.queryByRole('button', { name: /List price/ })).toBeNull()
    fireEvent.change(amount, { target: { value: '7500.50' } })
    expect(screen.getByText('Carres · Brand refresh · RM 7,500.50 · Brief minutes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'List price RM 8,000.00' }))
    expect((screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement).value).toBe('8000')
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), { target: { value: '7500.50' } })
    actions.startMktProduct.mockResolvedValue({ ok: true, id: 'p9', track: 'MKT-CAR-2610-001' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open meeting minutes →' }))
    })
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/marketing/projects/MKT-CAR-2610-001'))
    // The quote typed made a draft, or not yet: it is dropped once the project is made.
    expect(actions.startMktProduct.mock.calls[0].slice(0, 4)).toEqual(['sub-car', 'pr-b', 7500.5, null])

    fireEvent.click(screen.getByRole('radio', { name: /Event day/ }))
    expect((screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement).value).toBe('')
    expect(screen.getByText('Give it its amount')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open meeting minutes →' })).toHaveProperty('disabled', true)
  })

  it('with nothing on sale, points to the Product Builder', () => {
    open([])
    fireEvent.click(screen.getByRole('radio', { name: /Product project/ }))
    expect(screen.getByText('No products on sale')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Product Builder →' }).getAttribute('href')).toBe('/marketing/products')
    expect(screen.getByRole('button', { name: 'Open meeting minutes →' })).toHaveProperty('disabled', true)
  })
})

// 2026-10-23 — ④-1: Marketing's own clients ("+ Add subsidiary", the handoff's Add & select) — the manager's.
describe('New Project’s + Add subsidiary', () => {
  it('is the manager’s: nobody else sees the +', () => {
    open(products)
    expect(screen.queryByRole('button', { name: 'Add subsidiary' })).toBeNull()
  })

  it('adds a client with its PIC and picks it at once', async () => {
    open(products, { canAddSub: true })
    fireEvent.click(screen.getByRole('button', { name: 'Add subsidiary' }))
    const save = screen.getByRole('button', { name: 'Add & select' })
    expect(save).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Company or client name' }), { target: { value: 'Acme Furniture' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'PIC name' }), { target: { value: 'Mr Tan' } })
    actions.addMktClient.mockResolvedValue({ ok: true, sub: { id: 'sub-acme', code: 'ACME', name: 'Acme Furniture', dot: 'z', emoji: '🏢', client: true, pic: 'Mr Tan' } })
    await act(async () => {
      fireEvent.click(save)
    })
    await waitFor(() => expect(screen.getByRole('radio', { name: /Acme Furniture/ }).getAttribute('aria-checked')).toBe('true'))
    expect(actions.addMktClient).toHaveBeenCalledWith('Acme Furniture', 'Mr Tan', null)
    expect(screen.getByText('PIC · Mr Tan')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Company or client name' })).toBeNull()
  })

  // ②b-2b — the user's answer 50: Marketing fills an outside client's billing details when adding it.
  it('adds a client with its billing details, asked for on the + — what they would refuse said first', async () => {
    open(products, { canAddSub: true, addFirst: true })
    fireEvent.change(screen.getByRole('textbox', { name: 'Company or client name' }), { target: { value: 'Red Truck' } })
    expect(screen.queryByRole('textbox', { name: 'Billing name' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+ Billing details' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Billing name' }), { target: { value: 'Red Truck Sdn Bhd' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Billing email' }), { target: { value: 'accounts' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Billing phone' }), { target: { value: '+60 3-8888 1234' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add & select' }))
    })
    expect((await screen.findByRole('alert')).textContent).toBe('An email address, like name@company.com')
    expect(actions.addMktClient).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Billing email' }), { target: { value: 'accounts@redtruck.my' } })
    actions.addMktClient.mockResolvedValue({ ok: true, sub: { id: 'sub-rt', code: 'REDT', name: 'Red Truck', dot: 'z', emoji: '🏢', client: true, pic: null } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add & select' }))
    })
    await waitFor(() => expect(screen.getByRole('radio', { name: /Red Truck/ }).getAttribute('aria-checked')).toBe('true'))
    expect(actions.addMktClient).toHaveBeenCalledWith('Red Truck', '', { name: 'Red Truck Sdn Bhd', address: null, phone: '+60 3-8888 1234', email: 'accounts@redtruck.my' })
  })

  it('says why when it cannot, and keeps what was typed', async () => {
    open(products, { canAddSub: true, addFirst: true })
    fireEvent.change(screen.getByRole('textbox', { name: 'Company or client name' }), { target: { value: 'Carres' } })
    actions.addMktClient.mockResolvedValue({ ok: false, reason: 'Carres is on the list already.' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add & select' }))
    })
    expect((await screen.findByRole('alert')).textContent).toBe('Carres is on the list already.')
    expect((screen.getByRole('textbox', { name: 'Company or client name' }) as HTMLInputElement).value).toBe('Carres')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('textbox', { name: 'Company or client name' })).toBeNull()
  })
})

// 2026-10-25 — ④-4c (the user's answer 23): New Project opened from another project (?from=) keeps it — × opens it
// from nowhere.
describe('New Project opened from another project', () => {
  const FROM = { id: 'p0', trackId: 'TSK-CAR-2610-004', title: 'Banner for the fair' }
  const MEI = { id: 's1', first: 'Mei', hint: '', group: 'SOCIAL MEDIA SPECIALIST' }
  const openFrom = (p: ProductPick[] | null) =>
    render(<NewProject today="2026-10-24" me="s1" subs={subs} people={[MEI]} approvers={[]} holidays={[]} firstSub="sub-car" products={p} from={FROM} />)
  // One stage, Mei's: the starter's other two taken off.
  const oneStage = () => {
    for (const name of [/Publish/, /Redesign/]) {
      fireEvent.click(screen.getAllByRole('button', { name }).find(b => b.getAttribute('tabindex') === '0')!)
      fireEvent.click(screen.getByRole('button', { name: 'Remove stage' }))
    }
  }

  it('says which — its Track ID a link to it — and a product project started keeps it', async () => {
    openFrom(products)
    expect(screen.getByRole('link', { name: 'TSK-CAR-2610-004' }).getAttribute('href')).toBe('/marketing/projects/TSK-CAR-2610-004')
    expect(screen.getByText('Banner for the fair')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /Product project/ }))
    actions.startMktProduct.mockResolvedValue({ ok: true, id: 'p9', track: 'MKT-CAR-2610-001' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open meeting minutes →' }))
    })
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/marketing/projects/MKT-CAR-2610-001'))
    expect(actions.startMktProduct).toHaveBeenCalledWith('sub-car', 'pr-a', 3000, 'p0', null)
  })

  it('a quick task keeps it too — and once × takes it off, it is opened from nowhere', async () => {
    openFrom(null)
    oneStage()
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Amend 11\.11 ad/), { target: { value: 'Resize for Instagram' } })
    actions.createMktTask.mockResolvedValue({ ok: true, id: 't9', track: 'TSK-CAR-2610-009', open: 't9' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create task & open →' }))
    })
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/marketing/projects/t9'))
    expect(actions.createMktTask.mock.calls[0][0]).toMatchObject({ sub: 'sub-car', kind: 'quick', title: 'Resize for Instagram', from: 'p0' })

    fireEvent.click(screen.getByRole('button', { name: 'Not from TSK-CAR-2610-004' }))
    expect(screen.queryByText('Banner for the fair')).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create task & open →' }))
    })
    await waitFor(() => expect(actions.createMktTask).toHaveBeenCalledTimes(2))
    expect(actions.createMktTask.mock.calls[1][0]).toMatchObject({ from: null })
  })
})

// 2026-10-25 — New Project kept as a draft while it is typed (mig 20261025211000; the user: "一有输入就会自动进 draft（草稿）
// 那边，这样的话内容就不会丢了"). The database's side is tests/member-sql/validate-marketing-new-drafts.mjs.
describe('New Project kept as a draft', () => {
  const MEI = { id: 's1', first: 'Mei', hint: '', group: 'SOCIAL MEDIA SPECIALIST' }
  type Extra = { drafts?: { id: string; rev: number; mode: 'task' | 'recurring' | 'product' | null; title: string; sub: string | null; product: string | null; updatedAt: string }[];
    draft?: { id: string; rev: number; data: unknown; at: string } | null }
  const openNew = (extra: Extra = {}) =>
    render(<NewProject today="2026-10-24" me="s1" subs={subs} people={[MEI]} approvers={[]} holidays={[]} firstSub="sub-car" products={null} {...extra} />)
  const titleBox = () => screen.getByPlaceholderText(/e\.g\. Amend 11\.11 ad/) as HTMLInputElement
  const LATER = { timeout: 3000 }
  // One stage, Mei's: the starter's other two taken off.
  const oneStage = () => {
    for (const name of [/Publish/, /Redesign/]) {
      fireEvent.click(screen.getAllByRole('button', { name }).find(b => b.getAttribute('tabindex') === '0')!)
      fireEvent.click(screen.getByRole('button', { name: 'Remove stage' }))
    }
  }

  it('nothing typed, nothing kept: picking who it is for or what is being started is no draft', async () => {
    openNew()
    fireEvent.click(screen.getByRole('radio', { name: /Mattress Villa/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Recurring task/ }))
    await new Promise(r => setTimeout(r, 900))
    expect(actions.saveMktDraft).not.toHaveBeenCalled()
    expect(screen.queryByText(/Draft saved/)).toBeNull()
  })

  it('the first thing typed starts one — the address names it — and each change after is kept on its count', async () => {
    openNew()
    fireEvent.change(titleBox(), { target: { value: 'Raya banner' } })
    await waitFor(() => expect(actions.saveMktDraft).toHaveBeenCalledTimes(1), LATER)
    const [id, rev, data] = actions.saveMktDraft.mock.calls[0]
    expect([id, rev]).toEqual([null, null])
    expect(data).toMatchObject({ v: 1, sub: 'sub-car', mode: 'task', title: 'Raya banner', source: null })
    expect(await screen.findByText('Draft saved · 25 Oct 13:07')).toBeTruthy()
    expect(window.location.search).toBe('?draft=d1')

    fireEvent.click(screen.getByRole('radio', { name: /Mattress Villa/ }))
    await waitFor(() => expect(actions.saveMktDraft).toHaveBeenCalledTimes(2), LATER)
    expect(actions.saveMktDraft.mock.calls[1].slice(0, 2)).toEqual(['d1', 1])
    expect(actions.saveMktDraft.mock.calls[1][2]).toMatchObject({ sub: 'sub-mvs', title: 'Raya banner' })
  })

  it('made into its task, the draft goes with it — a save asked meanwhile is not sent', async () => {
    openNew()
    oneStage()
    fireEvent.change(titleBox(), { target: { value: 'Raya banner' } })
    await waitFor(() => expect(actions.saveMktDraft).toHaveBeenCalledTimes(1), LATER)
    fireEvent.change(titleBox(), { target: { value: 'Raya banner v2' } })
    actions.createMktTask.mockResolvedValue({ ok: true, id: 't9', track: 'TSK-CAR-2610-009', open: 't9' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create task & open →' }))
    })
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/marketing/projects/t9'))
    expect(actions.createMktTask.mock.calls[0][0]).toMatchObject({ title: 'Raya banner v2', draft: 'd1' })
    await new Promise(r => setTimeout(r, 900))
    expect(actions.saveMktDraft).toHaveBeenCalledTimes(1)
  })

  it('not made: what is typed is kept again', async () => {
    openNew()
    oneStage()
    fireEvent.change(titleBox(), { target: { value: 'Raya banner' } })
    actions.createMktTask.mockResolvedValue({ ok: false, reason: 'Pick who the task is for.' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create task & open →' }))
    })
    expect(await screen.findByText('Pick who the task is for.')).toBeTruthy()
    await waitFor(() => expect(actions.saveMktDraft).toHaveBeenCalledTimes(1), LATER)
    expect(actions.saveMktDraft.mock.calls[0][2]).toMatchObject({ title: 'Raya banner' })
  })

  it('a draft opened puts its form back, and saves on its own count', async () => {
    openNew({ draft: { id: 'd9', rev: 3, at: '2026-10-25T04:00:00Z', data: { v: 1, mode: 'recurring', sub: 'sub-mvs', title: 'Weekly reel', brief: 'Every Monday' } } })
    expect(titleBox().value).toBe('Weekly reel')
    expect(screen.getByRole('radio', { name: /Recurring task/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: /Mattress Villa/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Draft saved · 25 Oct 12:00')).toBeTruthy()
    fireEvent.change(titleBox(), { target: { value: 'Weekly reel 2' } })
    await waitFor(() => expect(actions.saveMktDraft).toHaveBeenCalledTimes(1), LATER)
    expect(actions.saveMktDraft.mock.calls[0].slice(0, 2)).toEqual(['d9', 3])
  })

  it('a product project’s draft, for somebody who may not start one, opens as a quick task — a subsidiary gone, the first', () => {
    openNew({ draft: { id: 'd9', rev: 1, at: '', data: { v: 1, mode: 'product', sub: 'gone', title: 'x' } } })
    expect(screen.getByRole('radio', { name: /Quick task/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: /Carres/ }).getAttribute('aria-checked')).toBe('true')
  })

  it('another window saved it since: not kept, Reload — and nothing more is sent', async () => {
    actions.saveMktDraft.mockResolvedValue({ ok: false, reason: 'This draft was changed in another window since you opened it — reload to see it.' })
    openNew({ draft: { id: 'd9', rev: 3, at: '', data: { v: 1, title: 'Weekly reel' } } })
    fireEvent.change(titleBox(), { target: { value: 'Weekly reel 2' } })
    expect(await screen.findByRole('alert', {}, LATER)).toBeTruthy()
    expect(screen.getByText(/Draft not saved · This draft was changed in another window/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    fireEvent.change(titleBox(), { target: { value: 'Weekly reel 3' } })
    await new Promise(r => setTimeout(r, 900))
    expect(actions.saveMktDraft).toHaveBeenCalledTimes(1)
  })

  it('the other drafts: listed, one opened in this one’s place — this one put back on the list — or discarded, asked first', async () => {
    const drafts = [
      { id: 'd1', rev: 1, mode: 'task' as const, title: 'Raya banner', sub: 'sub-car', product: null, updatedAt: '2026-10-25T05:07:00Z' },
      { id: 'd2', rev: 4, mode: 'recurring' as const, title: '', sub: 'sub-mvs', product: null, updatedAt: '2026-10-24T09:30:00Z' },
    ]
    openNew({ drafts, draft: { id: 'd1', rev: 1, at: '2026-10-25T05:07:00Z', data: { v: 1, title: 'Raya banner' } } })
    const list = screen.getByRole('region', { name: 'Drafts' })
    expect(list.textContent).toContain('Drafts · 1')
    expect(list.textContent).toContain('Untitled recurring task')
    expect(list.textContent).toContain('Mattress Villa · saved 24 Oct 17:30')
    expect(list.textContent).not.toContain('Raya banner')

    actions.openMktDraft.mockResolvedValue({ ok: true, id: 'd2', rev: 4, at: '2026-10-24T09:30:00Z', data: { v: 1, mode: 'recurring', sub: 'sub-mvs', title: 'Daily reel' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    })
    await waitFor(() => expect(titleBox().value).toBe('Daily reel'))
    expect(actions.openMktDraft).toHaveBeenCalledWith('d2')
    expect(window.location.search).toBe('?draft=d2')
    expect(screen.getByRole('region', { name: 'Drafts' }).textContent).toContain('Raya banner')

    fireEvent.click(screen.getByRole('button', { name: 'Discard Raya banner' }))
    expect(actions.dropMktDraft).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    })
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Drafts' })).toBeNull())
    expect(actions.dropMktDraft).toHaveBeenCalledWith('d1')
    expect(titleBox().value).toBe('Daily reel')
  })

  it('the one open discarded, asked first: the form starts again blank, the address names none', async () => {
    openNew({ draft: { id: 'd9', rev: 2, at: '', data: { v: 1, title: 'Weekly reel' } } })
    window.history.replaceState(null, '', '/marketing/new?draft=d9')
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(actions.dropMktDraft).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))
    })
    await waitFor(() => expect(titleBox().value).toBe(''))
    expect(actions.dropMktDraft).toHaveBeenCalledWith('d9')
    expect(window.location.search).toBe('')
    expect(screen.queryByText(/Draft saved/)).toBeNull()
  })
})

// 2026-10-25 — ②a-3: a task written with meeting minutes, there and then (the user's answers 52–55). The database's side is
// tests/member-sql/validate-marketing-task-minutes.mjs.
describe('New Project’s meeting minutes', () => {
  const MEI = { id: 's1', first: 'Mei', hint: '', group: 'SOCIAL MEDIA SPECIALIST' }
  const TEAM = [
    { id: 's1', user: 'u1', full: 'MEI LING', first: 'Mei', title: 'SOCIAL MEDIA SPECIALIST', team: null, role: null, color: null, capacity: 5 },
    { id: 's2', user: 'u2', full: 'ALI HASSAN', first: 'Ali', title: 'GRAPHIC DESIGNER', team: null, role: null, color: null, capacity: 5 },
  ]
  const PICKS = [
    { id: 't1', name: 'Kickoff', version: 2, rules: { sign: true, pic: false, picAll: false, project: true, file: true, lock: true }, fields: [
      { key: 'a', name: 'Project', type: 'Project link' as const, req: false, pic: false, lock: true },
      { key: 'b', name: 'Attendees', type: 'People' as const, req: false, pic: false, lock: true },
      { key: 'c', name: 'Agenda', type: 'Long text' as const, req: true, pic: true, lock: false },
      { key: 'd', name: 'Signatures', type: 'Signature' as const, req: false, pic: false, lock: false },
    ] },
    { id: 't2', name: 'Quick brief', version: 1, rules: { sign: false, pic: false, picAll: false, project: true, file: false, lock: false }, fields: [
      { key: 'e', name: 'Project', type: 'Project link' as const, req: false, pic: false, lock: true },
      { key: 'f', name: 'Attendees', type: 'People' as const, req: false, pic: false, lock: true },
      { key: 'g', name: 'Points', type: 'Long text' as const, req: true, pic: false, lock: false },
    ] },
  ]
  const openNew = (minutesPicks = PICKS, p: ProductPick[] | null = null) =>
    render(<NewProject today="2026-10-24" me="s1" subs={subs} people={[MEI]} approvers={[]} holidays={[]} firstSub="sub-car" products={p}
      minutesPicks={minutesPicks} team={TEAM} />)
  const oneStage = () => {
    for (const name of [/Publish/, /Redesign/]) {
      fireEvent.click(screen.getAllByRole('button', { name }).find(b => b.getAttribute('tabindex') === '0')!)
      fireEvent.click(screen.getByRole('button', { name: 'Remove stage' }))
    }
  }
  const create = () => screen.getByRole('button', { name: 'Create task & open →' })

  it('Use meeting minutes: the first template picked, its fields to fill in, the attendees starting as whoever starts it', () => {
    openNew()
    expect(screen.queryByRole('radiogroup', { name: 'Meeting minutes' })).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Use meeting minutes' }))
    expect(screen.getByRole('radio', { name: /Kickoff/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('v2 · 4 fields')).toBeTruthy()
    const box = screen.getByLabelText('Kickoff minutes')
    expect(box.textContent).toContain('Agenda')
    expect(box.textContent).toContain('TSK-CAR-… · This task')
    expect(screen.getByRole('button', { name: 'Remove Mei' })).toBeTruthy()
    expect(screen.queryByPlaceholderText(/What to change, where/)).toBeNull()
  })

  it('made only once its required fields are filled in — the minutes sent, nothing written beside them', async () => {
    openNew()
    oneStage()
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Amend 11\.11 ad/), { target: { value: 'Raya push' } })
    fireEvent.change(screen.getByPlaceholderText(/What to change, where/), { target: { value: 'Written first' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Use meeting minutes' }))
    expect(screen.getByText('Agenda is empty')).toBeTruthy()
    expect(create()).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Agenda' }), { target: { value: 'Raya visuals' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Meeting notes' }), { target: { value: 'Ali sends drafts' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign' }))
    expect(create()).toHaveProperty('disabled', false)
    actions.createMktTask.mockResolvedValue({ ok: true, id: 't9', track: 'TSK-CAR-2610-009', open: 't9' })
    await act(async () => {
      fireEvent.click(create())
    })
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/marketing/projects/t9'))
    expect(actions.createMktTask.mock.calls[0][0]).toMatchObject({
      title: 'Raya push', brief: '',
      minutes: { template: 't1', vals: { Attendees: ['s1'], Agenda: 'Raya visuals' }, notes: 'Ali sends drafts', sign: true },
    })
  })

  it('another template picked: its own fields — what the first held never sent; back to Write it here, no minutes', async () => {
    openNew()
    oneStage()
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Amend 11\.11 ad/), { target: { value: 'Banner' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Use meeting minutes' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Agenda' }), { target: { value: 'Old' } })
    fireEvent.click(screen.getByRole('radio', { name: /Quick brief/ }))
    expect(screen.getByText('Points is empty')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Points' }), { target: { value: 'New price' } })
    actions.createMktTask.mockResolvedValue({ ok: true, id: 't9', track: 'TSK-CAR-2610-009', open: 't9' })
    await act(async () => {
      fireEvent.click(create())
    })
    await waitFor(() => expect(actions.createMktTask).toHaveBeenCalledTimes(1))
    expect(actions.createMktTask.mock.calls[0][0].minutes).toEqual({ template: 't2', vals: { Attendees: ['s1'], Points: 'New price' }, notes: '', sign: false, pic: null })
  })

  // ②a-4 — the PIC approving the minutes (the user's answers 52, 53): chosen on New Project, the work waiting for them.
  const INTAKE = { ...PICKS[1], id: 't3', name: 'Client intake', rules: { ...PICKS[1].rules, pic: true } }
  it('a template whose rule asks the PIC: on, the subsidiary’s PIC named — their WhatsApp asked, then sent with the minutes', async () => {
    openNew([...PICKS, INTAKE])
    oneStage()
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Amend 11\.11 ad/), { target: { value: 'Banner' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Use meeting minutes' }))
    expect(screen.getByRole('switch', { name: 'PIC approves these minutes' }).getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('radio', { name: /Client intake/ }))
    expect(screen.getByRole('switch', { name: 'PIC approves these minutes' }).getAttribute('aria-checked')).toBe('true')
    expect((screen.getByRole('textbox', { name: /PIC name/ }) as HTMLInputElement).value).toBe('Kelvin')
    fireEvent.change(screen.getByRole('textbox', { name: 'Points' }), { target: { value: 'New price' } })
    expect(screen.getByText('Add the PIC’s WhatsApp')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: /PIC WhatsApp/ }), { target: { value: '012-345 6789' } })
    expect(screen.getByText('Carres · Quick task · 1 stage · starts once Kelvin (PIC) approves')).toBeTruthy()
    actions.createMktTask.mockResolvedValue({ ok: true, id: 't9', track: 'TSK-CAR-2610-009', open: 't9' })
    await act(async () => {
      fireEvent.click(create())
    })
    await waitFor(() => expect(actions.createMktTask).toHaveBeenCalledTimes(1))
    expect(actions.createMktTask.mock.calls[0][0].minutes.pic).toEqual({ name: 'Kelvin', whatsapp: '012-345 6789' })
  })

  it('turned off: nobody approves them — the work starts at once; turned on by hand for any template', () => {
    openNew([...PICKS, INTAKE])
    oneStage()
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Amend 11\.11 ad/), { target: { value: 'Banner' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Use meeting minutes' }))
    fireEvent.click(screen.getByRole('radio', { name: /Client intake/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Points' }), { target: { value: 'New price' } })
    fireEvent.click(screen.getByRole('switch', { name: 'PIC approves these minutes' }))
    expect(screen.queryByRole('textbox', { name: /PIC name/ })).toBeNull()
    expect(screen.getByText(/^Carres · Quick task · 1 stage · finishes/)).toBeTruthy()
    // Kickoff's rule does not ask it: off, until turned on.
    fireEvent.click(screen.getByRole('radio', { name: /Kickoff/ }))
    expect(screen.getByRole('switch', { name: 'PIC approves these minutes' }).getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('switch', { name: 'PIC approves these minutes' }))
    expect((screen.getByRole('textbox', { name: /PIC name/ }) as HTMLInputElement).value).toBe('Kelvin')
  })

  it('another subsidiary: its PIC instead — unless typed by hand; a second PIC named asks their WhatsApp too', () => {
    openNew([...PICKS, INTAKE])
    oneStage()
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Amend 11\.11 ad/), { target: { value: 'Banner' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Use meeting minutes' }))
    fireEvent.click(screen.getByRole('radio', { name: /Client intake/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Points' }), { target: { value: 'New price' } })
    fireEvent.click(screen.getByRole('radio', { name: /Mattress Villa/ }))
    expect((screen.getByRole('textbox', { name: /PIC name/ }) as HTMLInputElement).value).toBe('')
    expect(screen.getByText('Name the PIC')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: /PIC name/ }), { target: { value: 'Mr Lim' } })
    fireEvent.change(screen.getByRole('textbox', { name: /PIC WhatsApp/ }), { target: { value: '012-345 6789' } })
    fireEvent.click(screen.getByRole('radio', { name: /Carres/ }))
    expect((screen.getByRole('textbox', { name: /PIC name/ }) as HTMLInputElement).value).toBe('Mr Lim')
    fireEvent.click(screen.getByRole('button', { name: '+ Second PIC' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Second PIC(?! WhatsApp)/ }), { target: { value: 'Hana' } })
    expect(screen.getByText('Add the second PIC’s WhatsApp')).toBeTruthy()
  })

  // ②a-5 — a stage the PIC approves (the user's answer 52): 🔗 PIC via link in the builder, the PIC named once.
  const levelOne = () => screen.getAllByRole('button', { name: /No approval|PIC via link/ }).find(b => b.getAttribute('aria-expanded') !== null)!
  const picLevel = () => {
    fireEvent.click(levelOne())
    fireEvent.click(screen.getByRole('button', { name: /PIC via link/ }))
  }
  it('🔗 PIC via link on a stage: the subsidiary’s PIC named under the stages — their WhatsApp asked — sent as the task’s PIC', async () => {
    openNew()
    oneStage()
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Amend 11\.11 ad/), { target: { value: 'Banner' } })
    fireEvent.change(screen.getByPlaceholderText(/What to change, where/), { target: { value: 'New price' } })
    expect(screen.queryByLabelText('PIC')).toBeNull()
    expect(screen.getByText('0×')).toBeTruthy()
    picLevel()
    expect(levelOne().textContent).toContain('Kelvin (PIC)')
    expect(screen.getByText('1×')).toBeTruthy()
    expect((screen.getByRole('textbox', { name: /PIC name/ }) as HTMLInputElement).value).toBe('Kelvin')
    expect(screen.getByLabelText('PIC').textContent).toContain('PIC WhatsApp')
    expect(screen.getByText('Add the PIC’s WhatsApp')).toBeTruthy()
    expect(create()).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByPlaceholderText('Department words only — no names, no prices'), { target: { value: 'Check the new price' } })
    fireEvent.change(screen.getByRole('textbox', { name: /PIC WhatsApp/ }), { target: { value: '012-345 6789' } })
    expect(create()).toHaveProperty('disabled', false)
    actions.createMktTask.mockResolvedValue({ ok: true, id: 't9', track: 'TSK-CAR-2610-009', open: 't9' })
    await act(async () => {
      fireEvent.click(create())
    })
    await waitFor(() => expect(actions.createMktTask).toHaveBeenCalledTimes(1))
    const sent = actions.createMktTask.mock.calls[0][0]
    expect([sent.pic, sent.minutes, sent.stages[0].appr, sent.stages[0].picText]).toEqual([{ name: 'Kelvin', whatsapp: '012-345 6789' }, null, ['pic'], 'Check the new price'])
  })

  it('two PICs: either one’s approval or both — and the minutes theirs too, the PICs under them, named once', async () => {
    openNew([...PICKS, INTAKE])
    oneStage()
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Amend 11\.11 ad/), { target: { value: 'Banner' } })
    fireEvent.change(screen.getByPlaceholderText(/What to change, where/), { target: { value: 'New price' } })
    picLevel()
    expect(screen.queryByRole('button', { name: /make it both/ })).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: /PIC WhatsApp/ }), { target: { value: '012-345 6789' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Second PIC' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Second PIC(?! WhatsApp)/ }), { target: { value: 'Hana' } })
    fireEvent.change(screen.getByRole('textbox', { name: /^Second PIC WhatsApp/ }), { target: { value: '013-999 8888' } })
    expect(levelOne().textContent).toContain('Kelvin or Hana (PIC)')
    fireEvent.click(screen.getByRole('button', { name: 'Either PIC approves — make it both' }))
    expect(screen.getByRole('button', { name: 'Both PICs approve — make it either' }).getAttribute('aria-pressed')).toBe('true')
    expect(levelOne().textContent).toContain('Kelvin and Hana (PIC)')
    // Their minutes too: the PICs move under them, as typed — the stages' box goes.
    fireEvent.click(screen.getByRole('radio', { name: 'Use meeting minutes' }))
    fireEvent.click(screen.getByRole('radio', { name: /Client intake/ }))
    expect(screen.queryByLabelText('PIC')).toBeNull()
    expect((screen.getByRole('textbox', { name: /^Second PIC(?! WhatsApp)/ }) as HTMLInputElement).value).toBe('Hana')
    fireEvent.change(screen.getByRole('textbox', { name: 'Points' }), { target: { value: 'New price' } })
    actions.createMktTask.mockResolvedValue({ ok: true, id: 't9', track: 'TSK-CAR-2610-009', open: 't9' })
    await act(async () => {
      fireEvent.click(create())
    })
    await waitFor(() => expect(actions.createMktTask).toHaveBeenCalledTimes(1))
    const sent = actions.createMktTask.mock.calls[0][0]
    expect([sent.pic, sent.minutes.pic, sent.stages[0].appr]).toEqual([null, { name: 'Kelvin', whatsapp: '012-345 6789', name2: 'Hana', whatsapp2: '013-999 8888' }, ['pic:all']])
  })

  it('back to Write it here: what is written is sent, no minutes', async () => {
    openNew()
    oneStage()
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Amend 11\.11 ad/), { target: { value: 'Banner' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Use meeting minutes' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Write it here' }))
    fireEvent.change(screen.getByPlaceholderText(/What to change, where/), { target: { value: 'New price' } })
    actions.createMktTask.mockResolvedValue({ ok: true, id: 't9', track: 'TSK-CAR-2610-009', open: 't9' })
    await act(async () => {
      fireEvent.click(create())
    })
    await waitFor(() => expect(actions.createMktTask).toHaveBeenCalledTimes(1))
    expect(actions.createMktTask.mock.calls[0][0]).toMatchObject({ brief: 'New price', minutes: null })
  })

  it('none published: said — the manager pointed to the Minutes Builder — and nothing is made', () => {
    openNew([])
    fireEvent.click(screen.getByRole('radio', { name: 'Use meeting minutes' }))
    expect(screen.getByText('No meeting minutes published')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Minutes Builder →' })).toBeNull()
    expect(screen.getByText('Add a task title')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Amend 11\.11 ad/), { target: { value: 'Banner' } })
    expect(screen.getByText('Pick the meeting minutes')).toBeTruthy()
    cleanup()
    openNew([], [])
    fireEvent.click(screen.getByRole('radio', { name: 'Use meeting minutes' }))
    expect(screen.getByRole('link', { name: 'Minutes Builder →' }).getAttribute('href')).toBe('/marketing/minutes')
  })

  it('kept in the draft as typed — picking a template alone keeps nothing', async () => {
    openNew()
    fireEvent.click(screen.getByRole('radio', { name: 'Use meeting minutes' }))
    await new Promise(r => setTimeout(r, 900))
    expect(actions.saveMktDraft).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Agenda' }), { target: { value: 'Raya visuals' } })
    await waitFor(() => expect(actions.saveMktDraft).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(actions.saveMktDraft.mock.calls[0][2]).toMatchObject({ req: 'minutes', minutes: { template: 't1', vals: { Attendees: ['s1'], Agenda: 'Raya visuals' } } })
  })

  it('a draft written with minutes opens with them', () => {
    render(<NewProject today="2026-10-24" me="s1" subs={subs} people={[MEI]} approvers={[]} holidays={[]} firstSub="sub-car" products={null}
      minutesPicks={PICKS} team={TEAM}
      draft={{ id: 'd9', rev: 1, at: '', data: { v: 1, title: 'Raya', req: 'minutes', minutes: { template: 't2', vals: { Attendees: ['s2'], Points: 'Kept' }, notes: '', sign: false } } }} />)
    expect(screen.getByRole('radio', { name: /Quick brief/ }).getAttribute('aria-checked')).toBe('true')
    expect((screen.getByRole('textbox', { name: 'Points' }) as HTMLTextAreaElement).value).toBe('Kept')
    expect(screen.getByRole('button', { name: 'Remove Ali' })).toBeTruthy()
  })
})
