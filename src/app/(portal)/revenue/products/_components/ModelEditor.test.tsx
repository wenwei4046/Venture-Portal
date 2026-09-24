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

beforeEach(() => { saveModelSettings.mockReset().mockResolvedValue({ saved: 5 }); refresh.mockReset() })
afterEach(cleanup)

describe('Modular model workspace', () => {
  it('starts an unconfigured model from live SKUs and ERP allowed pools, preserving raw labels and null defaults', async () => {
    const close = vi.fn()
    render(<ModelEditor model={model()} brands={brands} options={options} onClose={close} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Offered in the Revenue calculator' }))
    expect(screen.getByRole('checkbox', { name: 'Offer SKU 2376-1S' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Offer SKU 2376-old' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Offer SKU 2376-gone' })).not.toBeChecked()
    expect(within(screen.getByRole('region', { name: 'Seat sizes (inches)' })).getAllByRole('checkbox').map(n => n.getAttribute('aria-label'))).toEqual(['Seat sizes (inches): 24', 'Seat sizes (inches): 27"', 'Seat sizes (inches): DEFAULT'])
    expect(screen.queryByRole('checkbox', { name: 'Leg height: 8"' })).not.toBeInTheDocument()
    expect(screen.getByText('+RM 0.00')).toBeInTheDocument()
    expect(screen.getByText('−RM 40.00')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save model' }))
    await waitFor(() => expect(saveModelSettings).toHaveBeenCalledWith({ erpModelId: 'model-a', offered: true, enabled: { sizes: ['24', '27"', 'DEFAULT'], leg_heights: ['6"'], specials: ['No Side Panel'] }, gift: null, calcCategory: null, brandCode: null, skuOffered: { '1S': true, '2S': true, old: false, gone: false } }))
    expect(close).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('does not replace deliberately empty selections on a configured model, and preserves explicit overrides', async () => {
    render(<ModelEditor model={model({ configured: true, enabled: { sizes: [], leg_heights: [], specials: [] }, calcOverride: 'Sofa', giftOverride: false, brandOverride: 'RIDER' })} brands={brands} options={options} onClose={vi.fn()} />)
    expect(screen.getByRole('combobox', { name: 'Calculator section' })).toHaveValue('Sofa')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Offered in the Revenue calculator' }))
    expect(screen.getByRole('checkbox', { name: 'Offer SKU 2376-1S' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Seat sizes (inches): 24' })).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Save model' }))
    await waitFor(() => expect(saveModelSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: { sizes: [], leg_heights: [], specials: [] }, calcCategory: 'Sofa', gift: false, brandCode: 'RIDER' })))
  })

  it('shows stale saved options without silently dropping them, then selects only currently allowed values', async () => {
    const m = model({ configured: true, allowed: { sizes: ['27"'], leg_heights: ['6"'], specials: [] }, enabled: { sizes: ['35'], leg_heights: [], specials: [] } })
    render(<ModelEditor model={m} brands={brands} options={options} onClose={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: 'Seat sizes (inches): 35' })).toBeChecked()
    fireEvent.change(screen.getByRole('combobox', { name: 'Free gift' }), { target: { value: 'yes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save model' }))
    await waitFor(() => expect(saveModelSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: { sizes: ['35'], leg_heights: [], specials: [] }, gift: true })))
    fireEvent.click(within(screen.getByRole('region', { name: 'Seat sizes (inches)' })).getByRole('button', { name: 'Select all' }))
    expect(screen.queryByRole('checkbox', { name: 'Seat sizes (inches): 35' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Seat sizes (inches): 27"' })).toBeChecked()
  })

  it('keeps drafts while filtering and guards switching to another model', () => {
    render(<ModularTab models={[model({ configured: true }), model({ erpId: 'model-b', code: '9999', name: 'Sofa 9999', skus: [] })]} brands={brands} options={options} />)
    fireEvent.click(screen.getByRole('button', { name: 'Configure 2376' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Offer SKU 2376-1S' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search models' }), { target: { value: '9999' } })
    expect(screen.getByRole('checkbox', { name: 'Offer SKU 2376-1S' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Configure 9999' }))
    expect(screen.getByRole('alert')).toHaveTextContent('2376 has unsaved changes')
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByRole('checkbox', { name: 'Offer SKU 2376-1S' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Configure 9999' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard and switch' }))
    expect(screen.getByRole('region', { name: 'Configure model 9999' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Offer SKU 2376-1S' })).not.toBeInTheDocument()
    expect(saveModelSettings).not.toHaveBeenCalled()
  })

  it('locks controls during save, keeps a failed draft, and allows retry', async () => {
    let reject!: (error: Error) => void
    saveModelSettings.mockImplementationOnce(() => new Promise((_resolve, rej) => { reject = rej }))
    render(<ModularTab models={[model({ configured: true }), model({ erpId: 'model-b', code: '9999', name: 'Sofa 9999' })]} brands={brands} options={options} />)
    fireEvent.click(screen.getByRole('button', { name: 'Configure 2376' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Offer SKU 2376-1S' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save model' }))
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Configure 9999' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Offer SKU 2376-2S' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Free gift' })).toBeDisabled()
    await act(async () => reject(new Error('Connection lost')))
    expect(screen.getByRole('alert')).toHaveTextContent('Connection lost')
    expect(screen.getByRole('checkbox', { name: 'Offer SKU 2376-1S' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Save model' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Save model' }))
    await waitFor(() => expect(saveModelSettings).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('status')).toHaveTextContent('2376 saved')
  })

  it('sends null defaults when clearing overrides and never writes prices with calculator settings', async () => {
    render(<ModelEditor model={model({ configured: true, giftOverride: true, calcOverride: 'Accessory', brandOverride: 'RIDER' })} brands={brands} options={options} onClose={vi.fn()} />)
    for (const name of ['Free gift', 'Calculator section', 'Margin ladder']) fireEvent.change(screen.getByRole('combobox', { name }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save model' }))
    await waitFor(() => expect(saveModelSettings).toHaveBeenCalledWith(expect.objectContaining({ gift: null, calcCategory: null, brandCode: null })))
    const payload = saveModelSettings.mock.calls[0][0]
    expect(Object.keys(payload).sort()).toEqual(['brandCode', 'calcCategory', 'enabled', 'erpModelId', 'gift', 'offered', 'skuOffered'])
  })

  it('cancels a pending model switch before saving so completion cannot close another model’s draft', async () => {
    let resolveSave!: (value: { saved: number }) => void
    saveModelSettings.mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve }))
    render(<ModularTab models={[model({ configured: true }), model({ erpId: 'model-b', code: '9999', name: 'Sofa 9999', skus: [] })]} brands={brands} options={options} />)
    fireEvent.click(screen.getByRole('button', { name: 'Configure 2376' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Offer SKU 2376-1S' }))
    fireEvent.click(screen.getByRole('button', { name: 'Configure 9999' }))
    expect(screen.getByRole('button', { name: 'Discard and switch' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Save model' }))
    expect(screen.queryByRole('button', { name: 'Discard and switch' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Configure 9999' })).toBeDisabled()
    expect(screen.getByRole('region', { name: 'Configure model 2376' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Configure model 9999' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Configure 9999' }))
    expect(screen.queryByRole('region', { name: 'Configure model 9999' })).not.toBeInTheDocument()
    await act(async () => { resolveSave({ saved: 1 }) })
    fireEvent.click(screen.getByRole('button', { name: 'Configure 9999' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Offered in the Revenue calculator' }))
    expect(screen.getByRole('region', { name: 'Configure model 9999' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Offered in the Revenue calculator' })).toBeChecked()
    expect(saveModelSettings).toHaveBeenCalledOnce()
  })

  it('identifies matrix pricing separately from its flat fallback and keeps a zero flat price visible', () => {
    render(<ModelEditor model={model({ skus: [
      sku('1S', { grid: [{ height: '24', tier: 'PRICE_2', price: 1300 }], price: 450 }),
      sku('2S', { price: 0 }),
    ] })} brands={brands} options={options} onClose={vi.fn()} />)
    expect(screen.getByText('Matrix price')).toBeInTheDocument()
    expect(screen.getByText('Fallback RM 450.00')).toBeInTheDocument()
    expect(screen.queryByText('RM 450.00', { exact: true })).not.toBeInTheDocument()
    expect(screen.getByText('RM 0.00', { exact: true })).toBeInTheDocument()
  })
})
