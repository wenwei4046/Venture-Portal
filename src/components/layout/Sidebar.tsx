'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { UserRole } from '@/types'
import {
  canAccessTreasury,
  canAccessDeptPool,
  canAccessBilling,
  canAccessDirectorSalary,
  canAccessHRCosting,
  canAccessClaims,
  canAccessReports,
  canAccessSettings,
  canApprove,
} from '@/lib/roles'

interface NavItem {
  href: string
  label: string
  visible: (role: UserRole) => boolean
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Overview', visible: () => true },
  { href: '/fund-in', label: 'Fund IN', visible: canAccessTreasury },
  { href: '/fund-out', label: 'Fund OUT', visible: canAccessTreasury },
  { href: '/overdue', label: 'Overdue', visible: canAccessTreasury },
  { href: '/statements', label: 'Statements', visible: canAccessTreasury },
  { href: '/payments', label: 'Payments', visible: canAccessTreasury },
  { href: '/approvals', label: 'Approvals', visible: canApprove },
  { href: '/dept-pool', label: 'Dept Pool', visible: canAccessDeptPool },
  { href: '/billing', label: 'Billing', visible: canAccessBilling },
  { href: '/director-salary', label: 'Director Salary', visible: canAccessDirectorSalary },
  { href: '/director-pool', label: 'Director Pool', visible: canAccessDirectorSalary },
  { href: '/hr-costing', label: 'HR Costing', visible: canAccessHRCosting },
  { href: '/claims', label: 'Claims', visible: canAccessClaims },
  { href: '/reconciliation', label: 'Reconciliation', visible: canAccessTreasury },
  { href: '/reports', label: 'Reports', visible: canAccessReports },
  { href: '/audit-log', label: 'Audit Log', visible: canAccessSettings },
  { href: '/settings', label: 'Settings', visible: canAccessSettings },
]

interface SidebarProps {
  role: UserRole
  mobileOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ role, mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const visible = navItems.filter((item) => item.visible(role))

  // Eagerly prefetch ALL visible routes on mount for instant navigation
  useEffect(() => {
    visible.forEach((item) => {
      if (item.href !== pathname) {
        router.prefetch(item.href)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-close the mobile drawer when the route changes (user clicked a link).
  useEffect(() => {
    if (mobileOpen && onClose) {
      onClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <aside
      className={
        // Desktop (md+): static 220px column, always visible.
        // Mobile: fixed-position drawer, slides in from the left when mobileOpen.
        `w-[240px] shrink-0 bg-paper border-r border-hairline flex flex-col h-full ` +
        `fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-out ` +
        (mobileOpen ? 'translate-x-0' : '-translate-x-full') +
        ` md:relative md:translate-x-0 md:transition-none md:w-[220px] md:z-auto`
      }
      aria-label="Main navigation"
    >
      {/* Brand mark */}
      <div className="px-6 pt-7 pb-5 border-b border-hairline flex items-start justify-between">
        <div>
          <div className="font-serif text-[24px] leading-[1.1] text-ink">
            HOUZS
            <br />
            <span className="italic text-accent">Venture</span>
          </div>
          <p className="text-[11px] text-muted mt-1.5 tracking-wider">
            INTERNAL LEDGER · 内部账册
          </p>
        </div>
        {/* Close button — mobile only */}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="md:hidden text-muted hover:text-ink text-2xl leading-none pt-1 px-2"
            aria-label="Close navigation"
          >
            ×
          </button>
        ) : null}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {visible.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? 'nav-link block px-3 py-2 mb-0.5 rounded-md bg-accent-bg text-accent font-serif italic text-[15px]'
                  : 'nav-link block px-3 py-2 mb-0.5 rounded-md text-graphite hover:bg-surface-2 hover:text-ink text-sm font-sans'
              }
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-hairline">
        <p className="text-[11px] text-muted font-mono">
          HV Portal v0.3
          <br />
          Phase 3 Shipped
        </p>
      </div>
    </aside>
  )
}
