'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { UserRole } from '@/types'
import {
  canAccessTreasury,
  canAccessDeptPool,
  canAccessBilling,
  canAccessDirectorSalary,
  canAccessDirectorPool,
  canAccessClaims,
  canAccessHRCosting,
  canAccessReports,
  canAccessSettings,
  canAccessCategories,
  canApprove,
} from '@/lib/roles'

interface NavItem {
  href: string
  label: string
  section?: string
  // Match the path exactly. Use for parent-overview links whose href is a
  // strict prefix of sibling child hrefs (e.g. HR Costing > Overview).
  exact?: boolean
  visible: (role: UserRole) => boolean
}

interface NavGroup {
  label: string
  section?: string
  visible: (role: UserRole) => boolean
  children: NavItem[]
}

type NavEntry = NavItem | NavGroup

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry
}

const isHR = (role: UserRole) => role === 'hr'
const isPrincipalOrFinance = (role: UserRole) =>
  role === 'principal' || role === 'finance'

const navEntries: NavEntry[] = [
  { href: '/dashboard', label: 'Overview', visible: () => true },

  // ── Daily Operations ──
  { href: '/approvals', label: 'Approvals', section: 'Daily Operations', visible: canApprove },
  { href: '/payments', label: 'Payments', section: 'Daily Operations', visible: canAccessTreasury },
  {
    label: 'Loan',
    section: 'Daily Operations',
    visible: canAccessTreasury,
    children: [
      { href: '/fund-in', label: 'Fund IN', visible: canAccessTreasury },
      { href: '/fund-out', label: 'Fund OUT', visible: canAccessTreasury },
      { href: '/overdue', label: 'Overdue', visible: canAccessTreasury },
    ],
  },
  { href: '/statements', label: 'Statements', section: 'Daily Operations', visible: canAccessTreasury },
  { href: '/reconciliation', label: 'Reconciliation', section: 'Daily Operations', visible: canAccessTreasury },
  // HR sees HR Costing as an expandable group covering all monthly sub-pages.
  // Principal sees a flat /hr-costing link in the Departments section below.
  {
    label: 'HR Costing',
    section: 'Daily Operations',
    visible: isHR,
    children: [
      { href: '/hr-costing', label: 'Overview', exact: true, visible: isHR },
      { href: '/hr-costing/payroll', label: 'Payroll', visible: isHR },
      { href: '/hr-costing/payment', label: 'Payment', visible: isHR },
      { href: '/hr-costing/staff', label: 'Staff', visible: isHR },
    ],
  },
  { href: '/director-salary', label: 'Director Salary', section: 'Daily Operations', visible: isHR },

  // ── Departments ──
  { href: '/dept-pool', label: 'Dept Pool', section: 'Departments', visible: canAccessDeptPool },
  // OPEX is a dept_manager-only view of their own department's payroll
  // breakdown (per-employee Basic / KPI / Allowance / ER statutory).
  { href: '/opex', label: 'OPEX', section: 'Departments', visible: (r) => r === 'dept_manager' },
  // Marketing dept_manager can create service contracts for their dept
  // (mig 207 RLS). The page self-gates on Marketing dept — other dept_managers
  // clicking this would hit notFound().
  { href: '/billing/contracts/new', label: 'New Contract', section: 'Departments', visible: (r) => r === 'dept_manager' },
  { href: '/hr-costing', label: 'HR Costing', section: 'Departments', visible: (r) => r === 'principal' },
  // Phase 7 Step 11: Billing merged into Statements → Invoices sub-tab.
  // Legacy /billing URL still redirects for external bookmarks.
  {
    label: 'Director',
    section: 'Departments',
    visible: isPrincipalOrFinance,
    children: [
      { href: '/director-salary', label: 'Director Salary', visible: canAccessDirectorSalary },
      { href: '/director-pool', label: 'Director Pool', visible: canAccessDirectorPool },
    ],
  },
  { href: '/claims', label: 'Claims', section: 'Departments', visible: canAccessClaims },

  // ── Reports & Admin ──
  { href: '/reports', label: 'Reports', section: 'Reports & Admin', visible: canAccessReports },
  { href: '/audit-log', label: 'Audit Log', section: 'Reports & Admin', visible: canAccessSettings },
  // Finance lands on the Categories tab (the only one they can edit); Principal sees all tabs.
  { href: '/settings', label: 'Settings', section: 'Reports & Admin', visible: canAccessCategories },
]

interface SidebarProps {
  role: UserRole
  mobileOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ role, mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const visible = navEntries.filter((entry) => entry.visible(role))

  // Group consecutive entries by section label so we can render dividers.
  const sections: { label: string | null; entries: NavEntry[] }[] = []
  for (const entry of visible) {
    const sec = entry.section ?? null
    const last = sections[sections.length - 1]
    if (last && last.label === sec) {
      last.entries.push(entry)
    } else {
      sections.push({ label: sec, entries: [entry] })
    }
  }

  // Track which groups are open. Auto-open if current path matches a child.
  const getInitialOpen = () => {
    const open: Record<string, boolean> = {}
    for (const entry of visible) {
      if (isGroup(entry)) {
        open[entry.label] = entry.children.some(
          (c) => pathname === c.href || pathname.startsWith(c.href + '/')
        )
      }
    }
    return open
  }
  const [groupOpen, setGroupOpen] = useState(getInitialOpen)

  function toggleGroup(label: string) {
    setGroupOpen((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  // Eagerly prefetch ALL visible routes on mount for instant navigation
  useEffect(() => {
    visible.forEach((entry) => {
      if (isGroup(entry)) {
        entry.children.forEach((child) => {
          if (child.href !== pathname) router.prefetch(child.href)
        })
      } else if (entry.href !== pathname) {
        router.prefetch(entry.href)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open group when navigating to a child page
  useEffect(() => {
    for (const entry of visible) {
      if (isGroup(entry)) {
        const match = entry.children.some(
          (c) => pathname === c.href || pathname.startsWith(c.href + '/')
        )
        if (match) setGroupOpen((prev) => ({ ...prev, [entry.label]: true }))
      }
    }
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-close the mobile drawer when the route changes (user clicked a link).
  useEffect(() => {
    if (mobileOpen && onClose) {
      onClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Roman numeral counter for labeled sections only (skip the unlabeled overview).
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
  let romanIdx = 0

  return (
    <aside
      className={
        `w-[240px] shrink-0 border-r border-hairline flex flex-col h-full ` +
        `fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-out ` +
        (mobileOpen ? 'translate-x-0' : '-translate-x-full') +
        ` md:relative md:translate-x-0 md:transition-none md:w-[220px] md:z-auto`
      }
      style={{
        background:
          'linear-gradient(180deg, rgb(var(--surface-2) / 0.55) 0%, rgb(var(--paper)) 180px)',
      }}
      aria-label="Main navigation"
    >
      {/* Brand mark */}
      <div className="px-6 pt-7 pb-5 flex items-start justify-between relative">
        <div>
          <div className="font-serif text-[30px] leading-none tracking-[-0.015em] text-ink">
            HOUZS
            <br />
            <span className="italic text-ink">Venture</span>
            <span className="text-accent ml-1">·</span>
          </div>
          <p className="font-serif italic text-[12.5px] text-graphite mt-1 tracking-[0.01em]">
            INTERNAL LEDGER · <span className="text-accent not-italic font-sans tracking-wider text-[10.5px]">内部账册</span>
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
        {/* Gradient underline — ink fading to transparent */}
        <span
          aria-hidden
          className="absolute left-6 right-6 bottom-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, rgb(var(--ink)) 0%, rgb(var(--hairline)) 40%, transparent 100%)',
          }}
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {sections.map((section, sectionIndex) => {
          const roman = section.label ? ROMAN[romanIdx++] : null
          return (
            <div
              key={section.label ?? '__top'}
              className={sectionIndex === 0 ? 'mt-1' : 'mt-5'}
            >
              {section.label ? (
                <div className="flex items-baseline gap-2 px-3 pt-1 pb-2">
                  <span className="font-serif italic text-[11px] text-accent tracking-[0.02em]">
                    {roman}.
                  </span>
                  <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                    {section.label}
                  </span>
                  <span
                    aria-hidden
                    className="flex-1 h-px bg-hairline -translate-y-[3px]"
                  />
                </div>
              ) : null}
              {section.entries.map((entry) => {
                if (isGroup(entry)) {
                  const groupActive = entry.children.some(
                    (c) =>
                      pathname === c.href || pathname.startsWith(c.href + '/')
                  )
                  const isOpen = !!groupOpen[entry.label]
                  return (
                    <div key={entry.label}>
                      <button
                        type="button"
                        onClick={() => toggleGroup(entry.label)}
                        className={
                          groupActive && !isOpen
                            ? 'nav-link relative w-full flex items-center justify-between pl-[18px] pr-3 py-[7px] mb-0.5 rounded-md bg-accent-bg text-accent font-serif italic text-[15.5px]'
                            : 'nav-link relative w-full flex items-center justify-between pl-[18px] pr-3 py-1.5 mb-0.5 rounded-md text-graphite hover:bg-surface-2 hover:text-ink text-[13px] font-sans tracking-[0.005em]'
                        }
                      >
                        <span
                          aria-hidden
                          className={
                            groupActive && !isOpen
                              ? 'absolute left-[6px] top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-sm bg-accent'
                              : 'absolute left-[8px] top-1/2 -translate-y-1/2 w-[3px] h-[3px] rounded-full bg-muted opacity-40'
                          }
                        />
                        {entry.label}
                        <span
                          className={`text-[10px] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        >
                          ▼
                        </span>
                      </button>
                      {isOpen ? (
                        <div className="ml-3 border-l border-hairline pl-2">
                          {entry.children
                            .filter((c) => c.visible(role))
                            .map((child) => {
                              const active = child.exact
                                ? pathname === child.href
                                : pathname === child.href ||
                                  pathname.startsWith(child.href + '/')
                              return (
                                <Link
                                  key={child.href}
                                  href={child.href}
                                  className={
                                    active
                                      ? 'nav-link relative block pl-[18px] pr-3 py-[5px] mb-0.5 rounded-md bg-accent-bg text-accent font-serif italic text-[14px]'
                                      : 'nav-link relative block pl-[18px] pr-3 py-1 mb-0.5 rounded-md text-graphite hover:bg-surface-2 hover:text-ink text-[12.5px] font-sans tracking-[0.005em]'
                                  }
                                >
                                  <span
                                    aria-hidden
                                    className={
                                      active
                                        ? 'absolute left-[6px] top-1/2 -translate-y-1/2 w-[3px] h-3 rounded-sm bg-accent'
                                        : 'absolute left-[8px] top-1/2 -translate-y-1/2 w-[3px] h-[3px] rounded-full bg-muted opacity-40'
                                    }
                                  />
                                  {child.label}
                                </Link>
                              )
                            })}
                        </div>
                      ) : null}
                    </div>
                  )
                }

                const item = entry as NavItem
                const active =
                  pathname === item.href ||
                  pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      active
                        ? 'nav-link relative block pl-[18px] pr-3 py-[7px] mb-0.5 rounded-md bg-accent-bg text-accent font-serif italic text-[15.5px]'
                        : 'nav-link relative block pl-[18px] pr-3 py-1.5 mb-0.5 rounded-md text-graphite hover:bg-surface-2 hover:text-ink text-[13px] font-sans tracking-[0.005em]'
                    }
                  >
                    <span
                      aria-hidden
                      className={
                        active
                          ? 'absolute left-[6px] top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-sm bg-accent'
                          : 'absolute left-[8px] top-1/2 -translate-y-1/2 w-[3px] h-[3px] rounded-full bg-muted opacity-40'
                      }
                    />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-hairline">
        <p className="text-[11px] text-muted font-mono leading-relaxed">
          HV Portal v0.3
          <br />
          Phase 3 Shipped
        </p>
      </div>
    </aside>
  )
}
