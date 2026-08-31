'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { UserRole } from '@/types'
import {
  canAccessTreasury,
  canAccessDeptPool,
  canAccessBilling,
  canAccessDirectorSalary,
  canAccessDirectorPool,
  canAccessVenturePool,
  canAccessClaims,
  canAccessHRCosting,
  canAccessReports,
  canAccessDeptReports,
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
  // Active only when ?tab= equals this value (for links into tabbed pages,
  // e.g. /settings?tab=accounts). The href should carry the same query.
  tab?: string
  // Active only when ?tab= is NOT one of these (the default-tab sibling of a
  // `tab` link, e.g. Settings default vs ?tab=accounts).
  notTab?: string[]
  // Active only when ?basis= equals this value. Dept Pool's Cash/Accrual split
  // uses ?basis= (not ?tab=) — the page reads searchParams.basis.
  basis?: string
  // Active only when ?basis= is NOT one of these (the Cash sibling of Accrual).
  notBasis?: string[]
  // Never active on these path prefixes (a sibling entry owns them,
  // e.g. Payments must not light up on /payments/new — that's Receipt's).
  notPaths?: string[]
  visible: (role: UserRole) => boolean
}

// Shared active-state test for items and group children.
function itemActive(item: NavItem, pathname: string, tabParam: string | null, basisParam: string | null): boolean {
  const path = item.href.split('?')[0]
  const pathMatch = item.exact
    ? pathname === path
    : pathname === path || pathname.startsWith(path + '/')
  if (!pathMatch) return false
  if (item.notPaths?.some((p) => pathname === p || pathname.startsWith(p + '/'))) return false
  if (item.tab !== undefined && tabParam !== item.tab) return false
  if (item.notTab && item.notTab.includes(tabParam ?? '')) return false
  if (item.basis !== undefined && basisParam !== item.basis) return false
  if (item.notBasis && item.notBasis.includes(basisParam ?? '')) return false
  return true
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
const isHRorPrincipal = (role: UserRole) => role === 'hr' || role === 'principal'

// Layout per user spec 2026-06-10 (re-grouped from the original phase layout).
const navEntries: NavEntry[] = [
  { href: '/dashboard', label: 'Overview', visible: () => true },

  // ── Daily Operations ──
  { href: '/approvals', label: 'Approvals', section: 'Daily Operations', visible: canApprove },
  // /payments/new is Receipt's own entry below — keep Payments off it.
  { href: '/payments', label: 'Payments', section: 'Daily Operations', notPaths: ['/payments/new'], visible: canAccessTreasury },
  // Receive-money form (settle invoice / record loan repayment / open an OR)
  // lives at /payments/new?mode=receipt — Finance + Principal.
  // Receipt ledger (2026-06-12): credit vouchers (HV-OR-*) only, same
  // tabs/filters as Payments; its Create receipt button opens the
  // credit-locked form at /payments/new?mode=receipt.
  { href: '/receipts', label: 'Receipt', section: 'Daily Operations', visible: canAccessTreasury },
  // /statements IS the invoices landing (Phase 7 Step 11 merge); the monthly
  // statements list lives at /statements/monthly (inside Fund In / Out below).
  { href: '/statements', label: 'Invoice', section: 'Daily Operations', exact: true, visible: canAccessTreasury },
  // Shared-expense allocator (port of the user's Apps Script, 2026-08-01):
  // HV-paid costs → headcount/percentage/equal/custom split → draft invoices.
  { href: '/billing-allocator', label: 'Billing Allocator', section: 'Daily Operations', visible: canAccessTreasury },
  // HR Costing group covers all monthly sub-pages. HR's daily workspace;
  // Principal gets the same group since the unified portal (2026-07-16) —
  // replaces the old flat /hr-costing link under Departments.
  {
    label: 'HR Costing',
    section: 'Daily Operations',
    visible: isHRorPrincipal,
    children: [
      { href: '/hr-costing', label: 'Overview', exact: true, visible: isHRorPrincipal },
      { href: '/hr-costing/payroll', label: 'Payroll', visible: isHRorPrincipal },
      { href: '/hr-costing/commission', label: 'Commission', visible: isHRorPrincipal },
      { href: '/hr-costing/payment', label: 'Payment', visible: isHRorPrincipal },
      { href: '/hr-costing/staff', label: 'Staff', visible: isHRorPrincipal },
    ],
  },
  // HR reaches Director Salary here; Principal reaches it via the Director
  // group under Departments.
  { href: '/director-salary', label: 'Director Salary', section: 'Daily Operations', visible: isHR },
  // ── Fund In / Out (its own section, flat — user 2026-06-10) ──
  { href: '/daily-bank', label: 'Daily Bank', section: 'Fund In / Out', visible: canAccessTreasury },
  { href: '/fund-in', label: 'Fund IN', section: 'Fund In / Out', visible: canAccessTreasury },
  { href: '/fund-out', label: 'Fund OUT', section: 'Fund In / Out', visible: canAccessTreasury },
  { href: '/ba', label: 'Bank BA', section: 'Fund In / Out', visible: canAccessTreasury },
  { href: '/overdue', label: 'Overdue', section: 'Fund In / Out', visible: canAccessTreasury },
  { href: '/repayment-schedule', label: 'Repayment Schedule', section: 'Fund In / Out', visible: canAccessTreasury },
  { href: '/statements/monthly', label: 'Statements', section: 'Fund In / Out', visible: canAccessTreasury },

  // ── Departments ──
  {
    label: 'Dept Pool',
    section: 'Departments',
    visible: canAccessDeptPool,
    children: [
      { href: '/dept-pool', label: 'Cash', notBasis: ['accrual'], visible: canAccessDeptPool },
      { href: '/dept-pool?basis=accrual', label: 'Accrual P&L', basis: 'accrual', visible: canAccessDeptPool },
    ],
  },
  // Venture Pool = HV holding-company cash ledger (5 txn types). Sits next to
  // Dept Pool because users navigate between "department view" and "HV view"
  // when reasoning about money flow. Not under Treasury — Loo grouped it here.
  { href: '/venture-pool', label: 'Venture Pool', section: 'Departments', visible: canAccessVenturePool },
  // OPEX shows a department's payroll breakdown (per-employee Basic / KPI /
  // Allowance / ER statutory). Dept Manager sees own dept only; Principal
  // picks any dept via the in-page switcher.
  { href: '/opex', label: 'OPEX', section: 'Departments', visible: (r) => r === 'dept_manager' || r === 'principal' },
  // Dept-manager billing workbench (2026-08-20): own-segment invoices with
  // 回款 status, 开单 (draft-only), contract tracking with expiry.
  { href: '/my-billing', label: 'My Billing', section: 'Departments', visible: (r) => r === 'dept_manager' },
  // Marketing dept_manager can create service contracts for their dept
  // (mig 207 RLS). The page self-gates on Marketing dept — other dept_managers
  // clicking this would hit notFound().
  { href: '/billing/contracts/new', label: 'New Contract', section: 'Departments', visible: (r) => r === 'dept_manager' },
  {
    label: 'Director',
    section: 'Departments',
    // Group shows when any child is visible: Principal + HR (Director Pool v2
    // dropped Finance's access, so Finance no longer sees the group at all).
    visible: (r) => canAccessDirectorSalary(r) || canAccessDirectorPool(r),
    children: [
      { href: '/director-salary', label: 'Director Salary', visible: canAccessDirectorSalary },
      { href: '/director-pool', label: 'Director Pool', visible: canAccessDirectorPool },
    ],
  },
  { href: '/claims', label: 'Claims', section: 'Departments', visible: canAccessClaims },

  // ── Reports & Admin ──
  { href: '/reports/ledger', label: 'General Ledger', section: 'Reports & Admin', visible: canAccessReports },
  {
    label: 'Reports',
    section: 'Reports & Admin',
    // dept_manager sees the group for their own-department reports (P&L / Cash
    // Flow / Debtor Aging); the whole-company reports below stay principal/finance.
    visible: canAccessDeptReports,
    children: [
      { href: '/reports/income-statement', label: 'P&L', visible: canAccessDeptReports },
      { href: '/reports/monthly-pnl', label: 'Monthly P&L', visible: canAccessDeptReports },
      { href: '/reports/cash-flow', label: 'Cash Flow', visible: canAccessDeptReports },
      { href: '/reports/monthly-cash-flow', label: 'Monthly Cash Flow', visible: canAccessDeptReports },
      { href: '/reports/receipt-payment', label: 'Receipt & Payment', visible: canAccessDeptReports },
      { href: '/reports/monthly-receipt-payment', label: 'Monthly R&P', visible: canAccessDeptReports },
      { href: '/reports/balance-sheet', label: 'Balance Sheet', visible: canAccessReports },
      { href: '/reports/trial-balance', label: 'Trial Balance', visible: canAccessReports },
      { href: '/reports/fund-summary', label: 'Fund Summary', visible: canAccessReports },
      { href: '/reports/claims', label: 'Claims Report', visible: canAccessReports },
      { href: '/reports/debtor-aging', label: 'Debtor Aging', visible: canAccessDeptReports },
      { href: '/reports/loan-aging', label: 'Loan Monitor', visible: canAccessReports },
      { href: '/reports/company-statement', label: 'Company Statement', visible: canAccessReports },
    ],
  },
  { href: '/reconciliation', label: 'Reconciliation', section: 'Reports & Admin', notPaths: ['/reconciliation/journal-entries'], visible: canAccessTreasury },
  { href: '/reconciliation/journal-entries', label: 'Journal Entries', section: 'Reports & Admin', visible: canAccessTreasury },
  { href: '/audit-log', label: 'Audit Log', section: 'Reports & Admin', visible: canAccessSettings },
  // Settings tabs flattened into the group (user 2026-06-10). Finance only
  // gets Chart of Account (the categories tab they can edit) + Base Rate
  // History; the other tabs are Principal-only.
  {
    label: 'Settings',
    section: 'Reports & Admin',
    visible: canAccessCategories,
    children: [
      { href: '/settings?tab=accounts', label: 'Chart of Account', tab: 'accounts', visible: canAccessCategories },
      // Departments management (2026-08-24): add + 转正 provision — Finance too.
      { href: '/settings?tab=departments', label: 'Departments', tab: 'departments', visible: canAccessCategories },
      { href: '/reports/base-rate', label: 'Base Rate History', visible: canAccessReports },
      { href: '/settings?tab=treasury', label: 'Treasury', tab: 'treasury', visible: canAccessSettings },
      { href: '/settings?tab=overdue', label: 'Overdue Config', tab: 'overdue', visible: canAccessSettings },
      { href: '/settings?tab=splits', label: 'Splits', tab: 'splits', visible: canAccessSettings },
      { href: '/settings?tab=directors', label: 'Directors', tab: 'directors', visible: canAccessSettings },
      { href: '/settings?tab=companies', label: 'Companies', tab: 'companies', visible: canAccessSettings },
      { href: '/settings?tab=banks', label: 'Bank Accounts', tab: 'banks', visible: canAccessSettings },
      { href: '/settings?tab=periods', label: 'Periods', tab: 'periods', visible: canAccessSettings },
      { href: '/settings?tab=simulator', label: 'Simulator', tab: 'simulator', visible: canAccessSettings },
    ],
  },
]

interface SidebarProps {
  role: UserRole
  mobileOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ role, mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const basisParam = searchParams.get('basis')
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
        open[entry.label] = entry.children.some((c) => itemActive(c, pathname, tabParam, basisParam))
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
        const match = entry.children.some((c) => itemActive(c, pathname, tabParam, basisParam))
        if (match) setGroupOpen((prev) => ({ ...prev, [entry.label]: true }))
      }
    }
  }, [pathname, tabParam]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-close the mobile drawer when the route changes (user clicked a link).
  useEffect(() => {
    if (mobileOpen && onClose) {
      onClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Desktop pin (2026-08-29 "固定钉住需要"): keeps the panel permanently open.
  // Read from localStorage AFTER mount so the server-rendered markup matches.
  const [pinned, setPinned] = useState(false)
  useEffect(() => {
    try {
      setPinned(localStorage.getItem('hv_sidebar_pinned') === '1')
    } catch {}
  }, [])
  const togglePinned = () => {
    setPinned((p) => {
      const next = !p
      try {
        localStorage.setItem('hv_sidebar_pinned', next ? '1' : '0')
      } catch {}
      return next
    })
  }

  // Roman numeral counter for labeled sections only (skip the unlabeled overview).
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
  let romanIdx = 0

  // Desktop (2026-08-29, user: "background colour 可以换一下…然后做成隐藏的,
  // 鼠标划过去才显示" + "固定钉住需要"): the sidebar rests as a slim 16px rail
  // and expands on hover — width animates in-flow so the content glides rather
  // than being overlapped. The 📌 pin keeps it permanently open (persisted in
  // localStorage, read after mount so SSR markup stays stable). The
  // `sidebar-contrast` class re-declares the palette tokens for this subtree —
  // deep espresso panel, completely apart from the cream page. Mobile drawer
  // unchanged.
  return (
    <aside
      className={
        `group/side sidebar-contrast w-[240px] shrink-0 border-r border-hairline h-full bg-surface ` +
        `fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-out ` +
        (mobileOpen ? 'translate-x-0' : '-translate-x-full') +
        ` md:relative md:translate-x-0 md:z-auto md:overflow-hidden md:transition-[width] md:duration-200 ` +
        (pinned ? 'md:w-[220px]' : 'md:w-4 md:hover:w-[220px]')
      }
      aria-label="Main navigation"
    >
      {/* Collapsed-rail hint (desktop only) — fades out once expanded. */}
      {!pinned ? (
        <div
          className="hidden md:flex absolute inset-y-0 left-0 w-4 items-center justify-center opacity-100 group-hover/side:opacity-0 transition-opacity duration-150 pointer-events-none"
          aria-hidden
        >
          <span className="font-mono text-[10px] text-muted">❯</span>
        </div>
      ) : null}
      <div
        className={
          `flex flex-col h-full w-[240px] md:w-[220px] md:transition-opacity md:duration-150 ` +
          (pinned ? 'md:opacity-100' : 'md:opacity-0 md:group-hover/side:opacity-100')
        }
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
        {/* Pin — desktop only: keep the panel open instead of hover-reveal. */}
        <button
          type="button"
          onClick={togglePinned}
          className={`hidden md:block text-base leading-none pt-1 px-1 transition-all ${
            pinned ? '' : 'opacity-35 grayscale hover:opacity-70'
          }`}
          title={pinned ? '取消固定 — 恢复滑过才显示' : '固定 sidebar — 常驻展开'}
          aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar'}
          aria-pressed={pinned}
        >
          📌
        </button>
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
                  const groupActive = entry.children.some((c) =>
                    itemActive(c, pathname, tabParam, basisParam)
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
                              const active = itemActive(child, pathname, tabParam, basisParam)
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
                const active = itemActive(item, pathname, tabParam, basisParam)
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
      </div>
    </aside>
  )
}
