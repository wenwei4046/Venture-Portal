'use client'

import type { ComponentProps, MouseEvent } from 'react'
import Link, { useLinkStatus } from 'next/link'
import { useRouter } from 'next/navigation'
import { cancelWarmIntent, warmOnIntent } from '@/lib/nav-warm'

type WarmLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & { href: string }

/**
 * A <Link> that renders its page while the pointer rests on it, so the click
 * that follows lands on a page that is already there (lib/nav-warm.ts — one
 * link at a time, after the pointer settles, never an audited page), and that
 * sweeps a light across itself while its page is on the way.
 *
 * For the links a person picks from a rail or a list — a month on Comm Cal or
 * on HR › Payment (2026-09-26). The sidebar has the same behaviour built in.
 */
export default function WarmLink({ href, onMouseEnter, onMouseLeave, className, children, ...rest }: WarmLinkProps) {
  const router = useRouter()
  return (
    <Link
      {...rest}
      href={href}
      className={className ? `warm-link ${className}` : 'warm-link'}
      onMouseEnter={(event: MouseEvent<HTMLAnchorElement>) => {
        onMouseEnter?.(event)
        warmOnIntent(router, href)
      }}
      onMouseLeave={(event: MouseEvent<HTMLAnchorElement>) => {
        onMouseLeave?.(event)
        cancelWarmIntent()
      }}
    >
      <PendingSweep />
      {children}
    </Link>
  )
}

function PendingSweep() {
  const { pending } = useLinkStatus()
  return pending ? <span aria-hidden className="warm-link-pending nav-row-pending" /> : null
}
