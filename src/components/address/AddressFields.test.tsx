import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AddressFields from './AddressFields'
import { EMPTY_ADDRESS, type Address } from '@/lib/address/address'

// An address filled in the portal's one way (2026-10-20 — the user: "不是填的，应该都是选的"; "go with state, city,
// postcode"): State, then City, then Postcode, each from the official list; typed only abroad.

function Host({ start = EMPTY_ADDRESS, was, onFile }: { start?: Address; was?: Address; onFile?: string | null }) {
  const [value, setValue] = useState(start)
  return (
    <>
      <AddressFields value={value} onChange={setValue} idPrefix="t" was={was} onFile={onFile} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  )
}

const valueNow = () => JSON.parse(screen.getByTestId('value').textContent ?? '{}') as Address
const field = (key: keyof Address) => document.getElementById(`t-${key}`) as HTMLSelectElement | HTMLInputElement
const choices = (key: keyof Address) => Array.from((field(key) as HTMLSelectElement).options).map(o => o.value).filter(Boolean)
const pick = (key: keyof Address, value: string) => fireEvent.change(field(key), { target: { value } })
const ready = () => waitFor(() => expect(field('state')).not.toBeDisabled())

const CHEA: Address = { line1: 'No 83, Jalan Jambu 3', line2: '', postcode: '14000', city: 'Bukit Mertajam', state: 'Pulau Pinang', country: 'Malaysia' }

describe('AddressFields', () => {
  it('picks the state, then its city, then the city’s postcode — each waits for the one before', async () => {
    render(<Host />)
    expect(field('state')).toBeDisabled()
    await ready()
    expect(choices('state')).toHaveLength(16)
    expect(field('city')).toBeDisabled()
    expect(field('postcode')).toBeDisabled()

    pick('state', 'Pulau Pinang')
    expect(field('city')).not.toBeDisabled()
    expect(choices('city')).toContain('Bukit Mertajam')
    expect(field('postcode')).toBeDisabled()

    pick('city', 'Bukit Mertajam')
    expect(choices('postcode')).toEqual(['14000', '14007', '14009', '14020'])
    pick('postcode', '14020')
    fireEvent.change(field('line1'), { target: { value: 'No 83, Jalan Jambu 3' } })
    expect(valueNow()).toEqual({ ...CHEA, postcode: '14020' })
  })

  it('starts the city and postcode again on a new state; picks the postcode of a city that has one', async () => {
    render(<Host start={CHEA} />)
    await ready()
    pick('state', 'Johor')
    expect(valueNow()).toMatchObject({ state: 'Johor', city: '', postcode: '' })
    pick('city', 'Rengit')
    expect(valueNow()).toMatchObject({ state: 'Johor', city: 'Rengit', postcode: '83100' })
  })

  it('types the state, city and postcode abroad — and clears the three Malaysia’s list gave', async () => {
    render(<Host start={CHEA} />)
    await ready()
    pick('country', 'Singapore')
    expect(valueNow()).toMatchObject({ line1: CHEA.line1, state: '', city: '', postcode: '', country: 'Singapore' })
    for (const key of ['state', 'city', 'postcode'] as const) expect(field(key).tagName).toBe('INPUT')
    fireEvent.change(field('city'), { target: { value: 'Singapore' } })
    fireEvent.change(field('postcode'), { target: { value: '048616' } })
    expect(valueNow()).toMatchObject({ city: 'Singapore', postcode: '048616', country: 'Singapore' })
  })

  it('marks a changed part, and shows the old one-box address while the record has no parts', async () => {
    render(<Host was={EMPTY_ADDRESS} onFile="83 Jalan Jambu 3, Machang Bubok 14000 BM Penang" />)
    expect(screen.getByText('On file')).toBeInTheDocument()
    expect(screen.getByText('83 Jalan Jambu 3, Machang Bubok 14000 BM Penang')).toBeInTheDocument()
    await ready()
    fireEvent.change(field('line1'), { target: { value: 'No 83' } })
    expect(field('line1')).toHaveAttribute('data-dirty', 'true')
    expect(field('line2')).not.toHaveAttribute('data-dirty')
    expect(field('country')).not.toHaveAttribute('data-dirty')
  })

  it('draws in the host form’s own classes — Add person’s labels, fields and bare selects', async () => {
    render(
      <AddressFields value={CHEA} onChange={() => {}} idPrefix="t" inputClassName="host-input" selectClassName="host-select" selectBare labelClassName="host-label" gap={16} />,
    )
    await ready()
    expect(field('line1')).toHaveClass('host-input')
    expect(field('state')).toHaveClass('host-select')
    expect(document.querySelector('label[for="t-line1"]')).toHaveClass('host-label')
    expect(document.querySelector('label[for="t-state"]')?.textContent).toBe('1State')
    expect((field('line1').closest('[data-stacked], div[style]') as HTMLElement | null)?.style.gap).toBe('16px')
  })

  it('keeps a value on file that the list has not, so nothing is lost on opening', async () => {
    render(<Host start={{ ...CHEA, state: 'Penang', city: 'BM', postcode: '14000' }} />)
    await ready()
    expect((field('state') as HTMLSelectElement).value).toBe('Penang')
    expect(choices('state')[0]).toBe('Penang')
    expect((field('city') as HTMLSelectElement).value).toBe('BM')
  })

  // 2026-10-20, Finance's invoice dialogs: portaled to <body>, outside the sheet — the steps lost their orange disc and
  // the waiting fields their grey; a third of the dialog is too narrow for *Choose the state*.
  it('carries its own palette, and asks for each part in a word that fits a third of a dialog', async () => {
    render(<Host />)
    expect(field('line1').closest('.hrv-overlay')).not.toBeNull()
    await ready()
    const empty = (key: keyof Address) => (field(key) as HTMLSelectElement).options[0].textContent
    expect([empty('state'), empty('city'), empty('postcode')]).toEqual(['Choose', 'State first', 'City first'])
    pick('state', 'Pulau Pinang')
    pick('city', 'Bukit Mertajam')
    expect([empty('city'), empty('postcode')]).toEqual(['Choose', 'Choose'])
  })
})
