'use client'

import Link from 'next/link'
import { formatMoney } from '@/lib/utils'
import type { UnpricedBill } from '@/lib/commission/unpriced'
import { SheetIcon } from '@/components/sheet/SheetIcon'
import c from './close-controls.module.css'

interface Props {
  bills: readonly UnpricedBill[]
  nameOf: (staffId: string) => string
  hrefOf: (bill: UnpricedBill) => string
  /** Opens the salesperson's ledger. */
  onPerson: (staffId: string) => void
  /** Inside one salesperson's ledger: their name, and no name on each bill. */
  person?: string
}

/**
 * Bills the customer has paid on while the ERP prices their goods at RM 0
 * (2026-09-27). They earn nothing until the ERP has prices, so the month says
 * so above the list — before anybody closes the salesperson at a figure that
 * leaves them out. Filling the prices in the ERP re-sends the bill and the
 * month updates by itself; nothing is typed here.
 */
export default function UnpricedBillsNotice({ bills, nameOf, hrefOf, onPerson, person }: Props) {
  if (bills.length === 0) return null
  const one = bills.length === 1
  return (
    <section className={c.unpriced} aria-label="Bills priced RM 0 in the ERP">
      <div className={c.unpricedHead}>
        <SheetIcon name="alert" />
        <div>
          <strong>{one ? '1 bill is' : `${bills.length} bills are`} paid but priced RM 0 in the ERP</strong>
          <p>
            {one ? 'It earns' : 'They earn'} no commission until the prices are filled in the ERP — the bill comes back
            by itself when it is saved there. Fill {one ? 'it' : 'them'} before closing {person ?? (one ? 'its salesperson' : 'their salespeople')}.
          </p>
        </div>
      </div>
      <ul className={c.unpricedList}>
        {bills.map(bill => (
          <li key={bill.orderId}>
            <Link href={hrefOf(bill)}>{bill.orderNo}</Link>
            {person ? null : <button type="button" className={c.quiet} onClick={() => onPerson(bill.staffId)}>{nameOf(bill.staffId)}</button>}
            <span>{bill.orderDate}</span>
            <span className={c.unpricedPaid}>paid {formatMoney(bill.paidAmount)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
