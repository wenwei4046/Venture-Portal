'use client'

import React, { useState } from 'react'
import { formatMoney } from '@/lib/utils'
import type { RevenueGroup } from '@/lib/cfo-reports'

export function RevenueGroups({ groups, subtotal }: { groups: RevenueGroup[]; subtotal: number }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  return (
    <div>
      <h3 className="font-serif italic text-accent text-sm mb-2">Revenue</h3>
      {groups.length === 0 ? (
        <p className="font-serif italic text-muted text-xs">No revenue.</p>
      ) : (
        <table className="ledger-table">
          <tbody>
            {groups.map((g) => {
              const key = g.accountCode || g.accountName
              const expandable = g.items.length > 1 || g.items[0]?.label !== g.accountName
              const isOpen = open.has(key)
              return (
                <React.Fragment key={key}>
                  <tr
                    className={expandable ? 'cursor-pointer' : ''}
                    onClick={expandable ? () => toggle(key) : undefined}
                    role={expandable ? 'button' : undefined}
                    tabIndex={expandable ? 0 : undefined}
                    aria-expanded={expandable ? isOpen : undefined}
                    onKeyDown={
                      expandable
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              toggle(key)
                            }
                          }
                        : undefined
                    }
                  >
                    <td className="text-sm">
                      {expandable ? (
                        <span className="font-mono text-xs text-graphite mr-1">
                          {isOpen ? '▾' : '▸'}
                        </span>
                      ) : null}
                      {g.accountName}
                    </td>
                    <td className="num text-ledger">
                      {g.subtotal < 0
                        ? <span className="neg">{formatMoney(g.subtotal)}</span>
                        : formatMoney(g.subtotal)}
                    </td>
                  </tr>
                  {isOpen
                    ? g.items.map((it, i) => (
                        <tr key={`${key}::${i}::${it.label}`} className="text-graphite">
                          <td className="text-sm pl-6">{it.label}</td>
                          <td className="num text-ledger">
                            {it.amount < 0
                              ? <span className="neg">{formatMoney(it.amount)}</span>
                              : formatMoney(it.amount)}
                          </td>
                        </tr>
                      ))
                    : null}
                </React.Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-hairline">
              <td className="font-serif italic text-graphite text-sm">Subtotal</td>
              <td className="num font-semibold text-ledger">{formatMoney(subtotal)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}
