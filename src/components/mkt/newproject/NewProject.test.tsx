import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ProductPick } from '@/lib/marketing/project'

// 2026-10-24 — New Project's 📦 branch (②b-1, `New Project.dc.html` step 1): a product project is the manager's; they
// pick who it is for and a product on sale, and its intake meeting minutes open next. The database's side is
// tests/member-sql/validate-marketing-product-projects.mjs.

const actions = vi.hoisted(() => ({ createMktTask: vi.fn(), startMktProduct: vi.fn(), addMktClient: vi.fn() }))
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
    intake: { id: 't1', name: 'Kickoff', version: 1, fields: 7 } },
  { id: 'pr-b', code: 'P-002', name: 'Brand refresh', kind: 'one', version: 1, note: '', description: '', actions: 1,
    intake: { id: 't2', name: 'Brief', version: 2, fields: 1 } },
] as ProductPick[]
const open = (p: ProductPick[] | null, add: { canAddSub?: boolean; addFirst?: boolean } = {}) =>
  render(<NewProject today="2026-10-24" me={null} subs={subs} people={[]} approvers={[]} holidays={[]} firstSub={null} products={p} {...add} />)

beforeEach(() => {
  for (const f of [...Object.values(actions), ...Object.values(router)]) f.mockReset()
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
    expect(screen.getByText('Carres · Social Media Package A · Kickoff minutes')).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: /Mattress Villa/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Brand refresh/ }))
    expect(screen.getByText('Mattress Villa · Brand refresh · Brief minutes')).toBeTruthy()

    actions.startMktProduct.mockResolvedValue({ ok: true, id: 'p9', track: 'MKT-MVS-2610-001' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open meeting minutes →' }))
    })
    await waitFor(() => expect(actions.startMktProduct).toHaveBeenCalledWith('sub-mvs', 'pr-b'))
    expect(router.push).toHaveBeenCalledWith('/marketing/projects/MKT-MVS-2610-001')
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
    await waitFor(() => expect(actions.addMktClient).toHaveBeenCalledWith('Acme Furniture', 'Mr Tan'))
    expect(screen.getByRole('radio', { name: /Acme Furniture/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('PIC · Mr Tan')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Company or client name' })).toBeNull()
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
