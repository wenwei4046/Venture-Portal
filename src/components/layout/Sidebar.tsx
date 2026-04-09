'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { UserRole } from '@/types'
import {
  canAccessTreasury,
  canAccessDeptPool,
  canAccessBilling,
  canAccessDirectorSalary,
  canAccessHRCosting,
  canAccessReports,
  canAccessSettings,
} from '@/lib/roles'

interface NavItem {
  href: string
  label: string
  visible: (role: UserRole) => boolean
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', visible: () => true },
  { href: '/fund-in', label: 'Fund IN', visible: canAccessTreasury },
  { href: '/fund-out', label: 'Fund OUT', visible: canAccessTreasury },
  { href: '/overdue', label: 'Overdue', visible: canAccessTreasury },
  { href: '/dept-pool', label: 'Dept Pool', visible: canAccessDeptPool },
  { href: '/billing', label: 'Billing', visible: canAccessBilling },
  { href: '/director-salary', label: 'Director Salary', visible: canAccessDirectorSalary },
  { href: '/hr-costing', label: 'HR Costing', visible: canAccessHRCosting },
  { href: '/reports', label: 'Reports', visible: canAccessReports },
  { href: '/settings', label: 'Settings', visible: canAccessSettings },
]

export default function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()

  const visible = navItems.filter((item) => item.visible(role))

  return (
    <div className="w-60 shrink-0 bg-gray-900 text-white flex flex-col h-full">
      <div className="px-6 py-5 border-b border-gray-700">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
          HOUZS Venture
        </p>
        <h1 className="text-base font-bold text-white">Internal Portal</h1>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visible.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-6 py-3 border-t border-gray-700">
        <p className="text-xs text-gray-500">HV Banking Portal v0.1</p>
      </div>
    </div>
  )
}
