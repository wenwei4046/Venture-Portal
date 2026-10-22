import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ProductPick } from '@/lib/marketing/project'

// 2026-10-24 — New Project's 📦 branch (②b-1, `New Project.dc.html` step 1): a product project is the manager's; they
// pick who it is for and a product on sale, and its intake meeting minutes open next. The database's side is
// tests/member-sql/validate-marketing-product-projects.mjs.

const actions = vi.hoisted(() => ({ createMktTask: vi.fn(), startMktProduct: vi.fn() }))
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
const open = (p: ProductPick[] | null) =>
  render(<NewProject today="2026-10-24" me={null} subs={subs} people={[]} approvers={[]} holidays={[]} firstSub={null} products={p} />)

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
