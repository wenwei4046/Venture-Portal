'use client'

import { Select } from '@/components/hrv/select'
import { ADDRESS_LABELS, MALAYSIA, choicesFor, inMalaysia, withCity, withCountry, withState, type Address } from '@/lib/address/address'
import { COUNTRIES } from '@/lib/address/countries'
import { useMalaysia } from './use-malaysia'
import s from './address-fields.module.css'

/**
 * An address, filled in the portal's one way (2026-10-20 — the user: "填写的 format 要区分成 address 1、address 2、postcode、
 * state、city，国家 default 是 Malaysia"; "不是填的，应该都是选的"; "go with state, city, postcode"): two lines typed, then
 * in Malaysia the state, its city and the city's postcode, each picked from the official list in that order (a long
 * list searches as you type — the soft dropdown), and the country, Malaysia unless another is picked. Abroad the
 * three are typed. A city with one postcode picks it at once.
 *
 * Controlled: the host keeps the value, and `was` — the address as it was drawn — turns a changed part peach. The
 * host's own field and label classes can draw it, so it looks like the page it is on. The Me app's own is
 * `MeAddressFields` (its design-system fields), the same steps.
 */
export default function AddressFields({
  value,
  onChange,
  idPrefix,
  was,
  disabled = false,
  onFile = null,
  inputClassName = '',
  selectClassName = '',
  labelClassName = '',
  selectBare = false,
  gap,
  stacked = false,
}: {
  value: Address
  onChange: (next: Address) => void
  /** Each field's id is `${idPrefix}-line1` … so a label, a test or a refusal can find it. */
  idPrefix: string
  /** The address as it was drawn: a part that differs wears data-dirty. */
  was?: Address
  disabled?: boolean
  /** The old one-box address, while the record has no parts yet — shown above the fields to copy from. */
  onFile?: string | null
  /** The host form's own text-field classes, drawn INSTEAD of the kit's box (Add person's fields). */
  inputClassName?: string
  /** The host's own select classes, over the soft dropdown's box — or, with `selectBare`, instead of it. */
  selectClassName?: string
  /** Draw the selects in the host's classes alone (Add person's own fields are `<Select bare>`). */
  selectBare?: boolean
  /** The host's own label classes, instead of the kit's small capitals. */
  labelClassName?: string
  /** The space between the fields, in px, where the host's own grid differs (12). */
  gap?: number
  /** One field to a row (a phone, a narrow window). */
  stacked?: boolean
}) {
  const { data, failed } = useMalaysia()
  const malaysia = inMalaysia(value)
  const waiting = malaysia && !data
  const { states, cities, postcodes } = choicesFor(value, data)
  const set = (patch: Partial<Address>) => onChange({ ...value, ...patch })
  const dirty = (key: keyof Address) => (was && value[key].trim() !== was[key].trim() ? 'true' : undefined)
  const id = (key: keyof Address) => `${idPrefix}-${key}`
  // A postcode reads in figures once there is one — the hint before it stays in words.
  const mono = (key: keyof Address) => (key === 'postcode' && value.postcode ? s.mono : '')
  const selectClass = `${s.field} ${selectBare ? '' : s.select} ${selectClassName}`

  const label = (key: keyof Address, step?: number) => (
    <label htmlFor={id(key)} className={labelClassName || s.label}>
      {step ? (
        <span className={s.step} aria-hidden="true">
          {step}
        </span>
      ) : null}
      {ADDRESS_LABELS[key]}
    </label>
  )
  const text = (key: 'line1' | 'line2' | 'state' | 'city' | 'postcode', autoComplete: string, max: number) => (
    <input
      id={id(key)}
      className={`${s.field} ${inputClassName || s.input} ${mono(key)}`}
      value={value[key]}
      onChange={e => set({ [key]: e.target.value })}
      maxLength={max}
      autoComplete={autoComplete}
      disabled={disabled}
      data-dirty={dirty(key)}
    />
  )
  const pick = (key: 'state' | 'city' | 'postcode', list: string[], empty: string, onPick: (v: string) => void, off: boolean) => (
    <Select
      bare={selectBare}
      id={id(key)}
      className={`${selectClass} ${mono(key)}`}
      value={value[key]}
      onChange={e => onPick(e.target.value)}
      disabled={disabled || waiting || off}
      data-dirty={dirty(key)}
    >
      <option value="">{empty}</option>
      {list.map(v => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </Select>
  )

  return (
    <div className={s.fields} data-stacked={stacked ? 'true' : undefined} style={gap === undefined ? undefined : { gap }}>
      {onFile ? (
        <div className={s.onFile}>
          <span className={s.onFileLabel}>On file</span>
          <span className={s.onFileText}>{onFile}</span>
        </div>
      ) : null}
      <div className={s.wide}>
        {label('line1')}
        {text('line1', 'address-line1', 200)}
      </div>
      <div className={s.wide}>
        {label('line2')}
        {text('line2', 'address-line2', 200)}
      </div>

      {malaysia ? (
        <>
          <div className={s.part}>
            {label('state', 1)}
            {pick('state', states, waiting ? (failed ? 'Could not load — reload' : 'Loading…') : 'Choose the state', v => onChange(withState(value, v)), false)}
          </div>
          <div className={s.part}>
            {label('city', 2)}
            {pick('city', cities, value.state ? 'Choose the city' : 'State first', v => onChange(withCity(value, v, data)), !value.state)}
          </div>
          <div className={s.part}>
            {label('postcode', 3)}
            {pick('postcode', postcodes, value.city ? 'Choose' : 'City first', v => set({ postcode: v }), !value.city)}
          </div>
        </>
      ) : (
        <>
          <div className={s.part}>
            {label('state')}
            {text('state', 'address-level1', 120)}
          </div>
          <div className={s.part}>
            {label('city')}
            {text('city', 'address-level2', 120)}
          </div>
          <div className={s.part}>
            {label('postcode')}
            {text('postcode', 'postal-code', 120)}
          </div>
        </>
      )}

      <div className={s.part}>
        {label('country')}
        <Select
          bare={selectBare}
          id={id('country')}
          className={selectClass}
          value={value.country || MALAYSIA}
          onChange={e => onChange(withCountry(value, e.target.value))}
          disabled={disabled}
          data-dirty={dirty('country')}
        >
          {(COUNTRIES.includes(value.country || MALAYSIA) ? COUNTRIES : [value.country, ...COUNTRIES]).map(v => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>
      </div>
    </div>
  )
}
