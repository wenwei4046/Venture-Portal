'use client'

import { Children, Fragment, isValidElement, useState, type ReactElement, type ReactNode } from 'react'

/**
 * A `<tr>` that knows how to fold itself for a phone.
 *
 * The portal has 40-odd hand-rolled `<table className="ledger-table">` blocks
 * whose cells are built inline from a `.map()`. Rewriting each into a column
 * config would mean re-deriving forty tables' worth of desktop rendering that
 * is already correct — so this takes the opposite approach: the existing
 * markup stays, and each demoted cell is annotated in place.
 *
 *   <LedgerRow>
 *     <td>{v.voucher_no}</td>
 *     <td className="m-hide" data-label="日期">{date}</td>
 *     <td className="m-hide" data-label="收款人">{v.payee}</td>
 *     <td className="num">{formatMoney(v.amount)}</td>
 *   </LedgerRow>
 *
 * Below 768px the `.m-hide` cells drop out of the grid (CSS, in globals.css)
 * and reappear as a label/value panel under the row when the chevron is
 * tapped. At and above 768px the chevron cell and the panel are `display:
 * none`, so the desktop table renders exactly as it did before.
 *
 * `data-label` is what the panel titles each value with; it falls back to the
 * cell's own `title` and then to a dash. Cells without `.m-hide` are untouched.
 *
 * Rows that navigate on click should keep doing so — put the link inside a
 * kept cell as before. The chevron has its own tap target and stops
 * propagation, so the two do not fight.
 */

interface Props {
  children: ReactNode
  className?: string
  /** Forwarded to the visible <tr> (e.g. onClick for row navigation). */
  onClick?: React.MouseEventHandler<HTMLTableRowElement>
  /** Set when the row's cells are already phone-narrow and no panel is wanted. */
  noCollapse?: boolean
}

type CellProps = {
  className?: string
  children?: ReactNode
  'data-label'?: string
  title?: string
}

export default function LedgerRow({ children, className, onClick, noCollapse }: Props) {
  const [open, setOpen] = useState(false)

  const cells = Children.toArray(children).filter(isValidElement) as ReactElement<CellProps>[]
  const hidden = noCollapse
    ? []
    : cells.filter((c) => (c.props.className ?? '').split(/\s+/).includes('m-hide'))

  const visibleCount = cells.length - hidden.length

  return (
    <Fragment>
      <tr className={className} onClick={onClick}>
        {children}
        {hidden.length > 0 ? (
          <td className="lt-toggle">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setOpen((o) => !o)
              }}
              aria-expanded={open}
              aria-label={open ? '收起明细' : '展开明细'}
              className="flex items-center justify-center w-9 h-9 -my-2 -mr-2 text-graphite"
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform duration-120 ${open ? 'rotate-180' : ''}`}
                aria-hidden
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </td>
        ) : null}
      </tr>

      {hidden.length > 0 && open ? (
        <tr className="lt-detail">
          <td colSpan={visibleCount + 1}>
            <dl className="lt-detail-list">
              {hidden.map((cell, i) => {
                const label = cell.props['data-label'] ?? cell.props.title
                return (
                  // An unlabelled cell (an action link, say) takes the full
                  // width rather than showing a dash where its term would be.
                  <div key={i} className={label ? undefined : 'lt-wide'}>
                    {label ? <dt>{label}</dt> : null}
                    <dd className={(cell.props.className ?? '').includes('num') ? 'num' : undefined}>
                      {cell.props.children}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </td>
        </tr>
      ) : null}
    </Fragment>
  )
}
