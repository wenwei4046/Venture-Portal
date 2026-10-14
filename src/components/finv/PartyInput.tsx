'use client'

import { useState } from 'react'
import { useEscape } from '@/components/hrv/overlay'
import { Input } from './Dialog'
import f from './form.module.css'

// A party's name (2026-10-14, the Finance revamp v2 — D07's *Pay to*, D09's
// *Received from*): typed freely, with the companies it matches under it in the
// soft menu's look — picking one links the voucher to that company, as the
// form page's Company select did. Typed past the linked name, it is a party of
// its own again.

export interface PartyCompany {
  id: string
  name: string
  short_code: string
}

export function PartyInput({
  id,
  value,
  placeholder,
  readOnly = false,
  companies,
  companyId,
  onChange,
}: {
  id: string
  value: string
  placeholder: string
  readOnly?: boolean
  companies: PartyCompany[]
  companyId: string
  onChange: (name: string, companyId: string) => void
}) {
  const [focused, setFocused] = useState(false)
  const [keyAt, setKeyAt] = useState(-1)
  const q = value.trim().toLowerCase()
  const linked = companies.find((co) => co.id === companyId) ?? null
  const matches = q && !readOnly ? companies.filter((co) => co.name.toLowerCase().includes(q) || co.short_code.toLowerCase().includes(q)).slice(0, 6) : []
  const listOpen = focused && matches.length > 0 && !(linked && linked.name === value)
  useEscape(listOpen, () => setFocused(false))
  const listId = `${id}-list`

  const pick = (co: PartyCompany) => {
    onChange(co.name, co.id)
    setFocused(false)
    setKeyAt(-1)
  }
  return (
    <div className={f.suggestWrap}>
      <Input
        id={id}
        value={value}
        readOnly={readOnly}
        className={readOnly ? f.fixed : undefined}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={listOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const name = e.target.value
          // Still the linked company's name: still linked. Typed past it: a party of its own.
          onChange(name, linked && linked.name === name ? linked.id : '')
          setFocused(true)
          setKeyAt(-1)
        }}
        onKeyDown={(e) => {
          if (!listOpen) return
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            const step = e.key === 'ArrowDown' ? 1 : -1
            setKeyAt((i) => (i + step + matches.length) % matches.length)
          } else if (e.key === 'Enter' && keyAt >= 0 && matches[keyAt]) {
            e.preventDefault()
            pick(matches[keyAt])
          }
        }}
      />
      {listOpen ? (
        <div id={listId} className={f.suggest} role="listbox">
          {matches.map((co, i) => (
            <button
              key={co.id}
              type="button"
              role="option"
              aria-selected={i === keyAt}
              className={f.suggestItem}
              data-key={i === keyAt ? 'true' : undefined}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(co)
              }}
            >
              <span>{co.name}</span>
              {co.short_code ? <span className={f.suggestCode}>{co.short_code}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
