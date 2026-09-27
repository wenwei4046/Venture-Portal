import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogueSku } from '../load'

const { saveSkuPrices, refresh } = vi.hoisted(() => ({ saveSkuPrices: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('../../catalogue-actions', () => ({ saveSkuPrices }))

import SkuMasterTab from './SkuMasterTab'

function sku(overrides: Partial<CatalogueSku> = {}): CatalogueSku {
  return {
    erpId: 'sofa-a', code: '2376-1S', description: 'SOFA 2376 1S', category: 'SOFA',
    modelId: 'model-a', modelCode: '2376', modelName: '2376', moduleCode: '1S',
    sizeCode: null, sizeLabel: null, optionLabel: '1S', branding: null, brand: 'ZANOTTI',
    active: true, removed: false, isNew: false, price: 450,
    grid: [
      { height: '24', tier: 'PRICE_1', price: 800 },
      { height: '24', tier: 'PRICE_2', price: 900 },
      { height: 'Default', tier: 'PRICE_1', price: 666 },
      { height: 'DEFAULT', tier: 'PRICE_2', price: 777 },
      { height: 'default', tier: 'PRICE_3', price: 888 },
      { height: '75CM', tier: 'PRICE_2', price: 850 },
    ],
    offered: false, modelOffered: false, adopted: false,
    ...overrides,
  }
}

const fixtures = [
  sku(),
  sku({ erpId: 'sofa-b', code: '9999-1S', description: 'SOFA 9999 1S', modelId: 'model-b', modelCode: '9999', modelName: '9999', price: null, grid: [{ height: '25"', tier: 'PRICE_2', price: 555 }] }),
  sku({ erpId: 'bed', code: 'BED-K', description: 'BEDFRAME KING', category: 'BEDFRAME', modelId: 'bed-model', modelCode: 'B100', modelName: 'B100', price: 100, grid: null }),
]

function openSofa() {
  fireEvent.click(screen.getByRole('button', { name: 'Sofa' }))
}

function chooseModel(value: string) {
  fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), { target: { value } })
}

function changePrice(label: string, value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } })
}

function headers() {
  return screen.getAllByRole('columnheader').map(h => h.textContent)
}

function dragColumn(from: string, to: string) {
  fireEvent.dragStart(screen.getByRole('columnheader', { name: from }))
  fireEvent.dragOver(screen.getByRole('columnheader', { name: to }))
  fireEvent.drop(screen.getByRole('columnheader', { name: to }))
}

/** The Product List's layout cookies are scoped to its path. */
function onProductList() {
  window.history.replaceState(null, '', '/revenue/products')
  for (const name of document.cookie.split(/;\s*/).map(part => part.split('=')[0])) {
    if (name.startsWith('vp-cols.')) document.cookie = `${name}=; Path=/revenue/products; Max-Age=0`
  }
}

beforeEach(() => {
  saveSkuPrices.mockReset().mockResolvedValue({ saved: 1 })
  refresh.mockReset()
  onProductList()
})
afterEach(cleanup)

describe('SKU Master price workspace', () => {
  it.each([
    { source: 'ERP sizes', sofaSizes: ['24', 'DEFAULT', '25"'] },
    { source: 'saved history alone', sofaSizes: ['24', '25"'] },
  ])('hides DEFAULT from $source, keeps visible size order and resets the model when switching categories', ({ sofaSizes }) => {
    render(<SkuMasterTab skus={fixtures} sofaSizes={sofaSizes} />)
    fireEvent.click(within(screen.getByText('2376-1S').closest('tr')!).getByRole('button', { name: 'View prices' }))
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('model-a')
    expect(screen.getByRole('button', { name: 'P2' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('9999-1S')).not.toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual([
      'Product code', 'Description', 'Model', 'Category', 'PRICE_TIER',
      '24', '25"', '75CM',
    ])
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Prices' }))
    expect(screen.queryByRole('textbox', { name: /default|fallback/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /default|fallback|status/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    chooseModel('model-b')
    expect(screen.queryByText('2376-1S')).not.toBeInTheDocument()
    expect(screen.getByText('9999-1S')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '2376' } })
    expect(screen.getByText('No SKUs match these filters.')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Bedframe' }))
    expect(screen.getByText('BED-K')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual([
      'Product code', 'Description', 'Model', 'Size', 'Brand', 'Price',
    ])
    expect(screen.queryByRole('combobox', { name: 'Model' })).not.toBeInTheDocument()
    openSofa()
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('')
    expect(screen.getByText('2376-1S')).toBeInTheDocument()
    expect(screen.getByText('9999-1S')).toBeInTheDocument()
  })

  it('saves drafts across models, tiers and categories while preserving raw labels, hidden defaults and flat fallbacks', async () => {
    saveSkuPrices.mockResolvedValue({ saved: 3 })
    render(<SkuMasterTab skus={fixtures} sofaSizes={['24', 'DEFAULT', '25"']} />)
    openSofa()
    chooseModel('model-a')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Prices' }))
    changePrice('2376-1S at 24 PRICE_2', '1250')
    fireEvent.click(screen.getByRole('button', { name: 'P1' }))
    changePrice('2376-1S at 24 PRICE_1', '')
    changePrice('2376-1S at 75CM PRICE_1', '1300')
    fireEvent.click(screen.getByRole('button', { name: 'P3' }))
    changePrice('2376-1S at 25" PRICE_3', '0')
    chooseModel('model-b')
    changePrice('9999-1S at 24 PRICE_3', '650')
    chooseModel('model-a')
    expect(screen.getByRole('textbox', { name: '2376-1S at 25" PRICE_3' })).toHaveValue('0')
    fireEvent.click(screen.getByRole('button', { name: 'P1' }))
    expect(screen.getByRole('textbox', { name: '2376-1S at 24 PRICE_1' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: '2376-1S at 75CM PRICE_1' })).toHaveValue('1300')
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    changePrice('BED-K price', '0')
    fireEvent.click(screen.getByRole('button', { name: 'Save 3 SKUs' }))
    await waitFor(() => expect(saveSkuPrices).toHaveBeenCalledTimes(1))
    expect(saveSkuPrices).toHaveBeenCalledWith([
      { erpId: 'sofa-a', price: '450', grid: [
        { height: '24', tier: 'PRICE_1', price: '' },
        { height: '24', tier: 'PRICE_2', price: '1250' },
        { height: 'Default', tier: 'PRICE_1', price: '666' },
        { height: 'DEFAULT', tier: 'PRICE_2', price: '777' },
        { height: 'default', tier: 'PRICE_3', price: '888' },
        { height: '75CM', tier: 'PRICE_2', price: '850' },
        { height: '75CM', tier: 'PRICE_1', price: '1300' },
        { height: '25"', tier: 'PRICE_3', price: '0' },
      ] },
      { erpId: 'sofa-b', price: null, grid: [
        { height: '25"', tier: 'PRICE_2', price: '555' },
        { height: '24', tier: 'PRICE_3', price: '650' },
      ] },
      { erpId: 'bed', price: '0', grid: null },
    ])
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    expect(screen.getByRole('status')).toHaveTextContent('3 SKUs saved')
  })

  it('preserves drafts after a failed save and discards them on Cancel', async () => {
    saveSkuPrices.mockRejectedValueOnce(new Error('Save failed'))
    render(<SkuMasterTab skus={fixtures} sofaSizes={['24', 'DEFAULT']} />)
    openSofa()
    chooseModel('model-a')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Prices' }))
    changePrice('2376-1S at 24 PRICE_2', '1234')
    changePrice('2376-1S at 75CM PRICE_2', '')
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 SKU' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed')
    expect(screen.getByRole('textbox', { name: '2376-1S at 24 PRICE_2' })).toHaveValue('1234')
    expect(screen.getByRole('textbox', { name: '2376-1S at 75CM PRICE_2' })).toHaveValue('')
    // The error lands inside the save; Cancel stays disabled until its transition has ended.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Prices' }))
    expect(screen.getByRole('textbox', { name: '2376-1S at 24 PRICE_2' })).toHaveValue('900')
    expect(screen.getByRole('textbox', { name: '2376-1S at 75CM PRICE_2' })).toHaveValue('850')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('filters mattresses and bed frames by model too, but not a category where every SKU is its own model', () => {
    const flat = (erpId: string, category: string, code: string, modelCode: string) =>
      sku({ erpId, code, description: `${category} ${code}`, category, modelId: `id-${modelCode}`, modelCode, modelName: modelCode, grid: null, price: 1000 })
    render(<SkuMasterTab sofaSizes={['24']} skus={[
      ...fixtures,
      flat('m1', 'MATTRESS', 'AKKA-K', 'AKKA'), flat('m2', 'MATTRESS', 'AKKA-Q', 'AKKA'), flat('m3', 'MATTRESS', 'ZEN-K', 'ZEN'),
      flat('b2', 'BEDFRAME', 'B200-K', 'B200'),
      flat('a1', 'ACCESSORY', 'PILLOW', 'ACC-PILLOW'), flat('a2', 'ACCESSORY', 'BOLSTER', 'ACC-BOLSTER'),
    ]} />)
    expect(screen.queryByRole('combobox', { name: 'Model' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mattress' }))
    expect(within(screen.getByRole('combobox', { name: 'Model' })).getAllByRole('option').map(o => o.textContent))
      .toEqual(['All models', 'AKKA', 'ZEN'])
    expect(screen.queryByRole('group', { name: 'Fabric tier' })).not.toBeInTheDocument()
    chooseModel('id-AKKA')
    expect(screen.getByText('AKKA-Q')).toBeInTheDocument()
    expect(screen.queryByText('ZEN-K')).not.toBeInTheDocument()
    expect(screen.getByText(/· Model AKKA/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Bedframe' }))
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('')
    chooseModel('id-B200')
    expect(screen.getByText('B200-K')).toBeInTheDocument()
    expect(screen.queryByText('BED-K')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Accessory' }))
    expect(screen.queryByRole('combobox', { name: 'Model' })).not.toBeInTheDocument()
    expect(screen.getByText('PILLOW')).toBeInTheDocument()
    expect(screen.getByText('BOLSTER')).toBeInTheDocument()
  })

  it('lets the reader rearrange the columns, apart for the sofa sheet, without losing a typed price', async () => {
    render(<SkuMasterTab skus={fixtures} sofaSizes={['24']} />)
    expect(screen.getByRole('region', { name: 'SKU prices table' }).closest('.sku-stage')).toContainElement(
      screen.getByRole('button', { name: 'Edit Prices' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit Prices' }))
    changePrice('BED-K price', '120')
    dragColumn('Price', 'Product code')
    expect(headers()).toEqual(['Price', 'Product code', 'Description', 'Model', 'Size', 'Brand'])
    expect(screen.getByRole('columnheader', { name: 'Price' })).toHaveClass('sku-frozen-column')
    expect(screen.getByRole('textbox', { name: 'BED-K price' })).toHaveValue('120')

    openSofa()
    expect(headers().slice(0, 5)).toEqual(['Product code', 'Description', 'Model', 'Category', 'PRICE_TIER'])
    dragColumn('Model', 'Product code')
    expect(headers().slice(0, 5)).toEqual(['Model', 'Product code', 'Description', 'Category', 'PRICE_TIER'])

    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(headers()).toEqual(['Price', 'Product code', 'Description', 'Model', 'Size', 'Brand'])
    expect(screen.getByRole('textbox', { name: 'BED-K price' })).toHaveValue('120')
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 SKU' }))
    await waitFor(() => expect(saveSkuPrices).toHaveBeenCalledWith([{ erpId: 'bed', price: '120', grid: null }]))

    fireEvent.click(screen.getByRole('button', { name: 'Reset columns' }))
    expect(headers()).toEqual(['Product code', 'Description', 'Model', 'Size', 'Brand', 'Price'])
    openSofa()
    expect(headers().slice(0, 5)).toEqual(['Model', 'Product code', 'Description', 'Category', 'PRICE_TIER'])
  })

  it('loads more rows inside the table and searches the entire catalogue', () => {
    const many = Array.from({ length: 305 }, (_, i) => sku({ erpId: `sku-${i}`, code: `SKU-${i}`, description: `Product ${i}`, grid: null }))
    render(<SkuMasterTab skus={many} sofaSizes={['24']} />)
    expect(screen.queryByText('SKU-304')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show 5 more' }))
    expect(screen.getByText('SKU-304')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'SKU-304' } })
    expect(screen.getByText('SKU-304')).toBeInTheDocument()
    expect(screen.queryByText('SKU-0')).not.toBeInTheDocument()
    expect(screen.getByText('1 of 1 SKUs shown')).toBeInTheDocument()
  })
})
