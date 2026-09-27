'use client'

import type { ComponentProps, MouseEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { previousEntryIs } from '@/lib/history-entry'

type ReturnLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & { href: string }

/**
 * A "← back to …" link that IS Back when the page it names is the one the
 * reader came from (2026-09-27): a plain left click then steps back through
 * the tab's history — the ledger returns exactly as it was left, and Back
 * after it goes where it went before rather than to this page again. Opened
 * any other way (a new tab, a shared link, a reload) it is an ordinary link
 * to the same place, and a middle- or modified click always is.
 */
export default function ReturnLink({ href, onClick, children, ...rest }: ReturnLinkProps) {
  const router = useRouter()
  return (
    <Link
      {...rest}
      href={href}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event)
        if (event.defaultPrevented || event.button !== 0) return
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        if (!previousEntryIs(href)) return
        event.preventDefault()
        router.back()
      }}
    >
      {children}
    </Link>
  )
}
