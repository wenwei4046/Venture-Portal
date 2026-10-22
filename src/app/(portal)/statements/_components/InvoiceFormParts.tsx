'use client'

import { useEffect, useRef, useState } from 'react'
import AddressFields from '@/components/address/AddressFields'
import { FIELD_LOOK, Field, Input } from '@/components/finv/Dialog'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { EMPTY_ADDRESS, addressText, cleanAddress, isEmptyAddress, type Address } from '@/lib/address/address'
import type { DirectorCtcComponents } from '@/lib/director-ctc-lines'
import { categoryGroups, hrSource, modeOptions, periodChoices, type BillKind, type InvoiceCategory } from '../_lib/invoice-form'
import { hubHrFigures } from '../invoice-actions'

// The invoice dialogs' fields (2026-10-14, the Finance revamp v2 — D10's
// inv-form): Bill to (the design's select, holding every kind of party the
// system bills), the name and contact a party typed by hand carries, the
// billing mode, the category, the month — and HR's figures, read once per
// mode and month, that a staff or director recharge fills its amounts from.

export interface DialogCompany {
  id: string
  name: string
  short_code: string
}
export interface DialogDepartment {
  id: string
  name: string
}
export interface PartyContact {
  /** The address in its six parts (2026-10-20): two lines, then State → City → Postcode picked from the list. */
  address: Address
  /** The one-box text an invoice billed before the parts keeps — shown On file, and sent as it was, until parts are picked. */
  addressOnFile: string | null
  phone: string
  email: string
}

export const EMPTY_CONTACT: PartyContact = { address: EMPTY_ADDRESS, addressOnFile: null, phone: '', email: '' }

/** What a dialog sends for a typed party's address: the parts when picked (their line put together), else the text on file. */
export function contactAddressOut(c: PartyContact): { address: string; addressParts: Address | null } {
  if (!isEmptyAddress(c.address)) {
    const parts = cleanAddress(c.address)
    return { address: addressText(parts) ?? '', addressParts: parts }
  }
  return { address: c.addressOnFile ?? '', addressParts: null }
}

/** "HOUZS Century (HC)" — the hub's way of naming a company. */
export const companyLabel = (c: DialogCompany) => (c.short_code ? `${c.name} (${c.short_code})` : c.name)

export function BillToSelect({
  id,
  value,
  onChange,
  companies,
  departments,
  disabled = false,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  companies: DialogCompany[]
  departments: DialogDepartment[]
  disabled?: boolean
}) {
  return (
    <Select id={id} round={12} className={fm.select} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">Choose who to bill</option>
      <optgroup label="Companies">
        {companies.map((c) => (
          <option key={c.id} value={`co:${c.id}`} data-search={c.short_code}>
            {companyLabel(c)}
          </option>
        ))}
      </optgroup>
      {departments.length > 0 ? (
        <optgroup label="Department pools">
          {departments.map((d) => (
            <option key={d.id} value={`dept:${d.id}`}>
              {d.name}
            </option>
          ))}
        </optgroup>
      ) : null}
      <optgroup label="By name">
        <option value="director">A director…</option>
        <option value="freetext">Someone else…</option>
      </optgroup>
    </Select>
  )
}

/** A director's name, or someone else's — with where the invoice reaches them. */
export function PartyFields({
  idPrefix,
  kind,
  name,
  onName,
  contact,
  onContact,
  disabled = false,
}: {
  idPrefix: string
  kind: BillKind | null
  name: string
  onName: (name: string) => void
  contact: PartyContact
  onContact: (contact: PartyContact) => void
  disabled?: boolean
}) {
  if (kind !== 'director' && kind !== 'freetext') return null
  return (
    <>
      <Field label={kind === 'director' ? 'Director' : 'Name'} htmlFor={`${idPrefix}-name`}>
        <Input
          id={`${idPrefix}-name`}
          value={name}
          maxLength={120}
          disabled={disabled}
          onChange={(e) => onName(e.target.value)}
          placeholder={kind === 'director' ? 'The director’s name' : 'Who the invoice is for'}
        />
      </Field>
      {kind === 'freetext' ? (
        <>
          {/* The address in six parts, State → City → Postcode picked from the list (2026-10-20). */}
          <AddressFields
            value={contact.address}
            onChange={(address) => onContact({ ...contact, address })}
            idPrefix={`${idPrefix}-address`}
            onFile={contact.addressOnFile}
            inputClassName={FIELD_LOOK.input}
            labelClassName={FIELD_LOOK.label}
            selectClassName={fm.select}
            selectRound={12}
          />
          <div className={fm.duo}>
            <Field label="Phone" htmlFor={`${idPrefix}-phone`}>
              <Input
                id={`${idPrefix}-phone`}
                value={contact.phone}
                maxLength={40}
                inputMode="tel"
                onChange={(e) => onContact({ ...contact, phone: e.target.value })}
                placeholder="012-345 6789"
              />
            </Field>
            <Field label="Email" htmlFor={`${idPrefix}-email`}>
              <Input
                id={`${idPrefix}-email`}
                type="email"
                value={contact.email}
                maxLength={120}
                inputMode="email"
                onChange={(e) => onContact({ ...contact, email: e.target.value })}
                placeholder="name@example.com"
              />
            </Field>
          </div>
        </>
      ) : null}
    </>
  )
}

export function ModeSelect({
  id,
  value,
  onChange,
  extraModes,
  keep,
  label,
  blank,
  inLine = false,
}: {
  id?: string
  value: string
  onChange: (mode: string) => void
  extraModes: ReadonlyArray<{ value: string; label: string }>
  /** An invoice's own mode, kept on offer when it is no longer one of these. */
  keep?: string | null
  label?: string
  /** A line's select starts empty: its words. */
  blank?: string
  /** In a line of the lines card. */
  inLine?: boolean
}) {
  return (
    <Select id={id} round={12} className={inLine ? fm.lineSelect : fm.select} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {blank ? <option value="">{blank}</option> : null}
      {modeOptions(extraModes, keep).map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </Select>
  )
}

export function CategorySelect({
  id,
  value,
  onChange,
  categories,
  label,
  blank = 'Choose a category',
  inLine = false,
}: {
  id?: string
  value: string
  onChange: (code: string) => void
  categories: ReadonlyArray<InvoiceCategory>
  label?: string
  blank?: string
  inLine?: boolean
}) {
  return (
    <Select id={id} round={12} className={inLine ? fm.lineSelect : fm.select} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{blank}</option>
      {categoryGroups(categories).map((g) => (
        <optgroup key={g.type} label={g.label}>
          {g.accounts.map((a) => (
            <option key={a.code} value={a.code} data-search={a.code}>
              {a.label}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  )
}

/** The month an invoice belongs to (`YYYY-MM`). */
export function PeriodSelect({ id, value, onChange, around, disabled = false }: { id: string; value: string; onChange: (month: string) => void; around: string; disabled?: boolean }) {
  return (
    <Select id={id} round={12} className={fm.select} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {periodChoices(around, value).map((p) => (
        <option key={p.value} value={p.value}>
          {p.label}
        </option>
      ))}
    </Select>
  )
}

// ── HR's figures ──

export interface StaffComponents {
  salary: number
  allowance: number
  epf: number
  socso: number
  eis: number
}

export interface HrFigure {
  amount: number
  /** The directors' CTC as HR keyed it (director attribution). */
  ctc?: DirectorCtcComponents
  /** The staff cost's parts (a shared-services department). */
  staff?: StaffComponents
}

export interface HrFigures {
  /** `mode|month`, or '' while nothing is asked. */
  key: string
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** By company id. */
  byCompany: ReadonlyMap<string, HrFigure>
  /** HR / Finance / Director Office, or "director" — what the figures are. */
  source: 'staff' | 'director' | null
}

const NONE: ReadonlyMap<string, HrFigure> = new Map()

/**
 * HR's figures for a recharge — a shared-services department's staff cost per
 * company, or the directors' CTC per company — read once for each mode and
 * month while `enabled`, and kept for the dialog's life.
 */
export function useHrFigures(enabled: boolean, mode: string, month: string): HrFigures {
  const source = hrSource(mode)
  const key = enabled && source ? `${mode}|${month}` : ''
  const cache = useRef(new Map<string, { status: 'loading' | 'ready' | 'error'; byCompany: ReadonlyMap<string, HrFigure> }>())
  const [, bump] = useState(0)

  useEffect(() => {
    if (!key || cache.current.has(key)) return
    cache.current.set(key, { status: 'loading', byCompany: NONE })
    bump((n) => n + 1)
    hubHrFigures(month, mode).then(
      (res) => {
        if (!res.ok) cache.current.set(key, { status: 'error', byCompany: NONE })
        else {
          const byCompany = new Map<string, HrFigure>()
          for (const r of res.value.staff) byCompany.set(r.companyId, { amount: r.amount, staff: { salary: r.salary, allowance: r.allowance, epf: r.epf, socso: r.socso, eis: r.eis } })
          for (const r of res.value.directors) byCompany.set(r.companyId, { amount: r.totalCtc, ctc: { basic: r.basic, kpi: r.kpi, allowance: r.allowance, epf: r.epf, socso: r.socso, eis: r.eis } })
          cache.current.set(key, { status: 'ready', byCompany })
        }
        bump((n) => n + 1)
      },
      () => {
        cache.current.set(key, { status: 'error', byCompany: NONE })
        bump((n) => n + 1)
      },
    )
  }, [key, mode, month])

  const hit = key ? cache.current.get(key) : undefined
  return { key, status: hit?.status ?? (key ? 'loading' : 'idle'), byCompany: hit?.byCompany ?? NONE, source }
}
