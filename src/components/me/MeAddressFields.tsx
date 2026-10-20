'use client'

import { DsSelect, Field, TextField } from '@/components/ds/Field'
import { useMalaysia } from '@/components/address/use-malaysia'
import { MALAYSIA, choicesFor, inMalaysia, withCity, withCountry, withState, type Address } from '@/lib/address/address'
import { COUNTRIES } from '@/lib/address/countries'

/**
 * Me › Edit profile's home address (2026-10-20 — the user: "所有关联到 address 的，都要跟着我刚才上面讲的 format 给他们去填";
 * "go with state, city, postcode"): the portal's address in the app's own fields — two lines typed; in Malaysia the
 * state, its city and the city's postcode picked from Pos Malaysia's list in that order; the country, Malaysia unless
 * another is picked (`AddressFields`' steps, `lib/address/address.ts`).
 */
export default function MeAddressFields({ value, onChange, onFile = null }: {
  value: Address
  onChange: (next: Address) => void
  /** The old one-box address, while the record has no parts yet — shown above the fields to copy from. */
  onFile?: string | null
}) {
  const { data, failed } = useMalaysia()
  const malaysia = inMalaysia(value)
  const waiting = malaysia && !data
  const { states, cities, postcodes } = choicesFor(value, data)
  const set = (patch: Partial<Address>) => onChange({ ...value, ...patch })
  const options = (list: string[], empty: string) => [{ value: '', label: empty }, ...list.map(v => ({ value: v, label: v }))]
  const countries = COUNTRIES.includes(value.country || MALAYSIA) ? COUNTRIES : [value.country, ...COUNTRIES]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {onFile ? (
        <Field label="On file">
          <div data-on-file style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--ds-ink-2)', overflowWrap: 'anywhere' }}>{onFile}</div>
        </Field>
      ) : null}
      <Field label="Address line 1">
        <TextField value={value.line1} onChange={v => set({ line1: v })} ariaLabel="Address line 1" />
      </Field>
      <Field label="Address line 2" optional>
        <TextField value={value.line2} onChange={v => set({ line2: v })} ariaLabel="Address line 2" />
      </Field>
      {malaysia ? (
        <>
          <Field label="State">
            <DsSelect
              value={value.state}
              onChange={v => onChange(withState(value, v))}
              options={options(states, waiting ? (failed ? 'Could not load — try again' : 'Loading…') : 'Choose the state')}
              disabled={waiting}
              ariaLabel="State"
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 10 }}>
            <Field label="City">
              <DsSelect
                value={value.city}
                onChange={v => onChange(withCity(value, v, data))}
                options={options(cities, value.state ? 'Choose the city' : 'State first')}
                disabled={waiting || !value.state}
                ariaLabel="City"
              />
            </Field>
            <Field label="Postcode">
              <DsSelect
                value={value.postcode}
                onChange={v => set({ postcode: v })}
                options={options(postcodes, value.city ? 'Choose' : 'City first')}
                disabled={waiting || !value.city}
                ariaLabel="Postcode"
              />
            </Field>
          </div>
        </>
      ) : (
        <>
          <Field label="State">
            <TextField value={value.state} onChange={v => set({ state: v })} ariaLabel="State" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 10 }}>
            <Field label="City">
              <TextField value={value.city} onChange={v => set({ city: v })} ariaLabel="City" />
            </Field>
            <Field label="Postcode">
              <TextField value={value.postcode} onChange={v => set({ postcode: v })} ariaLabel="Postcode" />
            </Field>
          </div>
        </>
      )}
      <Field label="Country">
        <DsSelect value={value.country || MALAYSIA} onChange={v => onChange(withCountry(value, v))} options={countries} ariaLabel="Country" />
      </Field>
    </div>
  )
}
