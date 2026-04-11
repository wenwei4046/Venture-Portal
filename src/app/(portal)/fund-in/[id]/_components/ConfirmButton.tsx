'use client'

import type { ReactNode } from 'react'

interface Props {
  /** Hidden fund-source id passed through to the server action */
  id: string
  /** Server action bound to the surrounding form */
  action: (formData: FormData) => void | Promise<void>
  /** Browser `confirm()` prompt — Finance reads this before the button fires */
  confirmMessage: string
  className?: string
  children: ReactNode
}

/**
 * Thin client wrapper around a server-action form that intercepts submit with
 * a native confirm() dialog. Used on the fund-source detail page for the
 * "Mark as repaid" step so Finance can't fire it by accident — repayment
 * is a one-way door (recomputes paid-capital pool + weighted cost).
 *
 * Not a general-purpose component: the hidden `id` field is hard-coded
 * because every form on this page submits against a single fund source.
 */
export function ConfirmButton({
  id,
  action,
  confirmMessage,
  className,
  children,
}: Props) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  )
}
