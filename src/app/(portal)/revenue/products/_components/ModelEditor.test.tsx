import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogueModel, CatalogueSku, MaintenanceOption } from '../load'

const { saveModelSettings, refresh } = vi.hoisted(() => ({ saveModelSettings: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('../../catalogue-actions', () => ({ saveModelSettings }))

import ModelEditor from './ModelEditor'
import ModularTab from './ModularTab'

function sku(id: string, extra: Partial<CatalogueSku> = {}): CatalogueSku {
  return { erpId: id, code: `2376-${id}`, description: `SOFA 2376 ${id}`, category: 'SOFA', modelId: 'model-a', modelCode: '2376', modelName: '2376', moduleCode: id, sizeCode: null, sizeLabel: null, optionLabel: id, branding: 'ZANOTTI', brand: 'ZANOTTI', active: true, removed: false, isNew: false, price: null, grid: null, offered: false, modelOffered: false, adopted: false, ...extra }
}
function model(extra: Partial<CatalogueModel> = {}): CatalogueModel {
  return { erpId: 'model-a', code: '2376', name: 'Sofa 2376', category: 'SOFA', branding: 'ZANOTTI', active: true, removed: false, isNew: false, allowed: { sizes: [], leg_heights: ['6"'], specials: null }, configured: false, offered: false, enabled: {}, gift: false, giftOverride: null, calcCategory: 'Sofa', calcOverride: null, brand: 'ZANOTTI', brandOverride: null, derivedBrand: 'ZANOTTI', skus: [sku('1S'), sku('2S'), sku('old', { active: false }), sku('gone', { removed: true })], ...extra }
}
function option(pool: string, value: string, extra: Partial<MaintenanceOption> = {}): MaintenanceOption {
  return { pool, value, label: value, sortOrder: 1, active: true, removed: false, isNew: false, price: null, ...extra }
}
const options = [
  option('sofa_sizes', 'DEFAULT', { sortOrder: 3 }), option('sofa_sizes', '27"', { sortOrder: 2 }), option('sofa_sizes', '24', { sortOrder: 1 }),
  option('sofa_sizes', 'old', { active: false }), option('sofa_sizes', 'gone', { removed: true }),
  option('sofa_leg_heights', '6"', { price: 0 }), option('sofa_leg_heights', '8"', { price: 25 }),
  option('sofa_specials', 'No Side Panel', { price: -40 }),
]
const brands = [{ code: 'ZANOTTI', name: 'Zanotti' }]
/** A sofa whose ERP branding names no brand the portal knows — the one kind Modular asks about. */
const brandless = { branding: null, brand: null, derivedBrand: null } satisfies Partial<CatalogueModel>

beforeEach(() => { saveModelSettings.mockReset().mockResolvedValue({ saved: 5 }); refresh.mockReset() })
afterEach(cleanup)

describe('Modular model workspace', () => {
  it('starts an unconfigured model from live SKUs and ERP allowed pools, preserving raw labels and null defaults', async () => {
    const close = vi.fn()
    render(<ModelEditor model={model()} brands={brands} options={options} onClose={close} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Offered in the Revenue calculator' }))
    expect(screen.getByRole('checkbox', { name: 'Offer SKU 2376-1S' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Offer SKU 2376-old' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Offer SKU 2376-gone' })).not.toBeChecked()
    expect(within(screen.getByRole('region', { name: 'Seat height' })).getAllByRole('checkbox').map(n => n.getAttribute('aria-label'))).toEqual(['Seat height: 24', 'Seat height: 27"', 'Seat height: DEFAULT'])
    expect(screen.queryByRole('checkbox', { name: 'Leg height: 8"' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveModelSettings).toHaveBeenCalledWith({ erpModelId: 'model-a', offered: true, enabled: { sizes: ['24', '27"', 'DEFAULT'], leg_heights: ['6"'], specials: ['No Side Panel'] }, gift: null, calcCategory: null, brandCode: null, skuOffered: { '1S': true, '2S': true, old: false, gone: false } }))
    expect(close).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('does not replace deliberately empty selections on a configured model, and preserves explicit overrides', async () => {
    render(<ModelEditor model={model({ configured: true, enabled: { sizes: [], leg_heights: [], specials: [] }, ...brandless, calcOverride: 'Sofa', giftOverride: false, brandOverride: 'RIDER' })} brands={brands} options={options} onClose={vi.fn()} />)
    expect(screen.getByRole('combobox', { name: 'Calculator section' })).toHaveValue('Sofa')
    fireEvent.click(screen.getByRole('switch', { name: 'Offered in the Revenue calculator' }))
    expect(screen.getByRole('checkbox', { name: 'Offer SKU 2376-1S' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Seat height: 24' })).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveModelSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: { sizes: [], leg_heights: [], specials: [] }, calcCategory: 'Sofa', gift: false, brandCode: 'RIDER' })))
  })

  // User 2026-10-06: the ladder and the section follow the brand the ERP
  // names; only a model the system cannot place is asked, and a rider (bed
  // frame, accessory …) never is — its margin follows the cart's brand.
  it('asks for a margin ladder and a calculator section only for a mattress or a sofa the ERP gives no brand', () => {
    const asked = () => ['Margin ladder', 'Calculator section'].map(name => screen.queryByRole('combobox', { name }) !== null)

    render(<ModelEditor model={model()} brands={brands} options={options} onClose={vi.fn()} />)
    expect(asked()).toEqual([false, false])
    expect(screen.getByRole('switch', { name: 'Offered in the Revenue calculator' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Free gift' })).toBeInTheDocument()
    cleanup()

    render(<ModelEditor model={model({ code: 'BOLSTER', category: 'ACCESSORY', branding: 'AKEMI', brand: null, derivedBrand: null, calcCategory: 'Accessory', skus: [] })} brands={brands} options={options} onClose={vi.fn()} />)
    expect(asked()).toEqual([false, false])
    cleanup()

    render(<ModelEditor model={model({ code: 'AURORA', category: 'MATTRESS', branding: 'MYLATEX', brand: null, derivedBrand: null, calcCategory: 'Mattress', configured: true, offered: true, skus: [] })} brands={brands} options={options} onClose={vi.fn()} />)
    expect(asked()).toEqual([true, true])
    expect(screen.getByRole('combobox', { name: 'Margin ladder' })).toHaveValue('')
    expect(screen.getByText(/The ERP branding MYLATEX is not a brand the portal knows/)).toBeInTheDocument()
    expect(screen.getByText('Offered, but members will not see it until a margin ladder is chosen.')).toBeInTheDocument()
    expect(within(screen.getByRole('combobox', { name: 'Calculator section' })).getByRole('option', { name: 'Mattress (ERP default)' })).toBeInTheDocument()
  })

  it('never sends back a pick the ERP now decides: opening is no change, and the next save clears it', async () => {
    // The loader already reads none for a branded model; the window holds the line on its own too.
    render(<ModelEditor model={model({ configured: true, calcOverride: 'Accessory', brandOverride: 'RIDER' })} brands={brands} options={options} onClose={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('No unsaved changes')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Offer SKU 2376-1S' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveModelSettings).toHaveBeenCalledWith(expect.objectContaining({ calcCategory: null, brandCode: null })))
  })

  it('shows stale saved options without silently dropping them, then selects only currently allowed values', async () => {
    const m = model({ configured: true, allowed: { sizes: ['27"'], leg_heights: ['6"'], specials: [] }, enabled: { sizes: ['35'], leg_heights: [], specials: [] } })
    render(<ModelEditor model={m} brands={brands} options={options} onClose={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: 'Seat height: 35' })).toBeChecked()
    fireEvent.change(screen.getByRole('combobox', { name: 'Free gift' }), { target: { value: 'yes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveModelSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: { sizes: ['35'], leg_heights: [], specials: [] }, gift: true })))
    fireEvent.click(within(screen.getByRole('region', { name: 'Seat height' })).getByRole('button', { name: 'Select all' }))
    expect(screen.queryByRole('checkbox', { name: 'Seat height: 35' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Seat height: 27"' })).toBeChecked()
  })

  it('lists models by category and opens one in a window that steps through the list', () => {
    render(<ModularTab models={[model({ configured: true }), model({ erpId: 'model-b', code: '9999', name: 'Sofa 9999', skus: [] }), model({ erpId: 'model-c', code: 'AMIRA', name: 'Amira', category: 'MATTRESS', skus: [] })]} brands={brands} options={options} />)
    expect(screen.getByRole('region', { name: 'Sofa models' })).toHaveTextContent('2 models')
    expect(screen.getByRole('region', { name: 'Mattress models' })).toHaveTextContent('AMIRA')
    fireEvent.click(screen.getByRole('button', { name: 'Configure 2376' }))
    expect(screen.getByRole('dialog', { name: /2376/ })).toHaveTextContent('Modular · 1 of 3')
    fireEvent.click(screen.getByRole('button', { name: 'Next model' }))
    expect(screen.getByRole('region', { name: 'Configure model 9999' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next model' }))
    expect(screen.getByRole('region', { name: 'Configure model AMIRA' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next model' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('splits a category by branding, the unbranded together last, and steps in that order', () => {
    const plain = { branding: null, brand: null, derivedBrand: null, skus: [] }
    render(<ModularTab models={[
      model({ erpId: 'm1', code: 'ALAMANDA', category: 'MATTRESS', ...plain }),
      model({ erpId: 'm2', code: 'AMIRA', category: 'MATTRESS', branding: 'DUNLOPILLO', brand: 'DUNLOP', derivedBrand: 'DUNLOP', skus: [] }),
      model({ erpId: 'm3', code: 'APEX', category: 'MATTRESS', branding: 'AKEMI', brand: 'AKEMI', derivedBrand: 'AKEMI', skus: [] }),
      model({ erpId: 'm4', code: 'CUSHION', category: 'ACCESSORY', ...plain }),
    ]} brands={[{ code: 'AKEMI', name: 'Akemi' }, { code: 'DUNLOP', name: 'Dunlopillo' }]} options={options} />)
    const mattress = screen.getByRole('region', { name: 'Mattress models' })
    expect(within(mattress).getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual(['Mattress · AKEMI', 'Mattress · DUNLOP', 'Mattress · No branding'])
    expect(within(screen.getByRole('group', { name: 'Mattress · DUNLOP' })).getByRole('button', { name: 'Configure AMIRA' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Mattress · No branding' })).getByRole('heading')).toHaveTextContent('No branding1 model')
    expect(within(screen.getByRole('region', { name: 'Accessory models' })).queryAllByRole('group')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Configure APEX' }))
    expect(screen.getByRole('dialog', { name: /APEX/ })).toHaveTextContent('Modular · 2 of 4')
    fireEvent.click(screen.getByRole('button', { name: 'Next model' }))
    expect(screen.getByRole('region', { name: 'Configure model AMIRA' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next model' }))
    expect(screen.getByRole('region', { name: 'Configure model ALAMANDA' })).toBeInTheDocument()
  })

  it('keeps drafts while filtering and guards leaving a model with unsaved changes', () => {
    render(<ModularTab models={[model({ configured: true }), model({ erpId: 'model-b', code: '9999', name: 'Sofa 9999', skus: [] })]} brands={brands} options={options} />)
    fireEvent.click(screen.getByRole('button', { name: 'Configure 2376' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Offer SKU 2376-1S' }))
    expect(screen.getByRole('status')).toHaveTextContent('1 unsaved change')
    fireEvent.click(screen.getByRole('button', { name: 'Next model' }))
    expect(screen.getByRole('alert')).toHaveTextContent('2376 has unsaved changes')
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByRole('checkbox', { name: 'Offer SKU 2376-1S' })).toBeChecked()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search models' }), { target: { value: '9999' } })
    expect(screen.getByRole('checkbox', { name: 'Offer SKU 2376-1S' })).toBeChecked()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search models' }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Configure 2376' }))
    expect(screen.getByRole('checkbox', { name: 'Offer SKU 2376-1S' })).not.toBeChecked()
    expect(saveModelSettings).not.toHaveBeenCalled()
  })

  it('locks controls during save, keeps a failed draft, and allows retry', async () => {
    let reject!: (error: Error) => void
    saveModelSettings.mockImplementationOnce(() => new Promise((_resolve, rej) => { reject = rej }))
    render(<ModularTab models={[model({ configured: true }), model({ erpId: 'model-b', code: '9999', name: 'Sofa 9999' })]} brands={brands} options={options} />)
    fireEvent.click(screen.getByRole('button', { name: 'Configure 2376' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Offer SKU 2376-1S' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next model' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Offer SKU 2376-2S' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Free gift' })).toBeDisabled()
    await act(async () => reject(new Error('Connection lost')))
    expect(screen.getByRole('alert')).toHaveTextContent('Connection lost')
    expect(screen.getByRole('checkbox', { name: 'Offer SKU 2376-1S' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveModelSettings).toHaveBeenCalledTimes(2))
    // Called is not finished: the save's transition still reads "Saving…" until it ends.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2376 saved'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sends null defaults when clearing overrides and never writes prices with calculator settings', async () => {
    render(<ModelEditor model={model({ configured: true, ...brandless, giftOverride: true, calcOverride: 'Accessory', brandOverride: 'RIDER' })} brands={brands} options={options} onClose={vi.fn()} />)
    for (const name of ['Free gift', 'Calculator section', 'Margin ladder']) fireEvent.change(screen.getByRole('combobox', { name }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveModelSettings).toHaveBeenCalledWith(expect.objectContaining({ gift: null, calcCategory: null, brandCode: null })))
    const payload = saveModelSettings.mock.calls[0][0]
    expect(Object.keys(payload).sort()).toEqual(['brandCode', 'calcCategory', 'enabled', 'erpModelId', 'gift', 'offered', 'skuOffered'])
  })

  it('saves and moves on from the guard, and Save & next opens the next model', async () => {
    render(<ModularTab models={[model({ configured: true }), model({ erpId: 'model-b', code: '9999', name: 'Sofa 9999', skus: [] }), model({ erpId: 'model-c', code: '7777', name: 'Sofa 7777', skus: [] })]} brands={brands} options={options} />)
    fireEvent.click(screen.getByRole('button', { name: 'Configure 2376' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Offer SKU 2376-1S' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next model' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Configure model 9999' })).toBeInTheDocument())
    expect(saveModelSettings).toHaveBeenCalledWith(expect.objectContaining({ erpModelId: 'model-a' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Offered in the Revenue calculator' }))
    fireEvent.click(screen.getByRole('button', { name: /Save & next/ }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Configure model 7777' })).toBeInTheDocument())
    expect(saveModelSettings).toHaveBeenLastCalledWith(expect.objectContaining({ erpModelId: 'model-b', offered: true }))
  })

  it('keeps prices out of the option picker: no price, matrix or surcharge labels', () => {
    render(<ModelEditor model={model({ skus: [
      sku('1S', { grid: [{ height: '24', tier: 'PRICE_2', price: 1300 }], price: 450 }),
      sku('2S', { price: 0 }),
      sku('3S'),
    ] })} brands={brands} options={options} onClose={vi.fn()} />)
    for (const text of [/Matrix price/, /No price/, /Fallback/, /RM /, /with matrix price/, /No surcharge/]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument()
    }
  })
})
