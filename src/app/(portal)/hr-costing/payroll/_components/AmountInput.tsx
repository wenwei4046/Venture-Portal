'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatAmount, parseAmount } from '@/lib/payroll-grid'

interface Props {
  value: number
  onChange: (value: number) => void
  /** 2 for money, 1 for days and hours. */
  decimals?: number
  disabled?: boolean
  /** Differs from what is saved — tinted so the eye finds it before Save. */
  dirty?: boolean
  className?: string
  'aria-label': string
  'aria-invalid'?: boolean
}

/**
 * An editable payroll figure: shows `3,000.00` like the computed cells next
 * to it, takes whatever the user types while focused, and formats again on
 * blur. Controlled from the row's number state, so the same figure shown in
 * the row and in the paycheck window stays one figure — when the other view
 * changes it, this one re-syncs as long as it is not the one being typed in.
 */
export default function AmountInput({
  value,
  onChange,
  decimals = 2,
  disabled,
  dirty,
  className,
  ...rest
}: Props) {
  const [text, setText] = useState(() => formatAmount(value, decimals))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(formatAmount(value, decimals))
  }, [value, decimals, focused])

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      disabled={disabled}
      className={cn('pg-in', dirty && 'dirty', !dirty && value === 0 && 'zero', className)}
      onFocus={e => {
        setFocused(true)
        e.currentTarget.select()
      }}
      onChange={e => {
        const t = e.target.value
        setText(t)
        const n = parseAmount(t)
        if (n !== null) onChange(n)
      }}
      onBlur={() => {
        setFocused(false)
        setText(formatAmount(value, decimals))
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      {...rest}
    />
  )
}
