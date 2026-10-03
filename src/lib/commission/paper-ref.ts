/**
 * The paper beside the document (2026-10-03).
 *
 * A fair sale starts on a handwritten bill — HC13369 — and the back office
 * keys it into the ERP days later as a sales order with a number of its own,
 * HC-SO-2609-400, typing the paper's number into the order's Ref No. A bill in
 * the portal is the ERP's document; its Ref No. is how anybody checks it back
 * against the paper, and the paper number in it is what the double-claim check
 * matches on (`paper_no(sales_orders)`, mig 20261003170000).
 *
 * The Ref No. is free text: "HC13369", "HC 3749", "HC12443+HC11589" (one
 * customer's other papers after its own), "Refer HC8978", or nothing usable at
 * all ("-", "ZNT", "6760"). The check reads the FIRST paper number in it as the
 * bill's own; a bill whose Ref No. names none cannot be matched with anything.
 */

export type PaperRef =
  /**
   * `text` is the Ref No. as the ERP has it — or, for a bill worked out by
   * hand, its own number, which is the paper's. `checkedAs` is set only when
   * the Ref No. says more than the one number the check matches on.
   */
  | { kind: 'paper'; text: string; checkedAs: string | null }
  /** A Ref No. that names no paper number: the check cannot match the bill. */
  | { kind: 'unreadable'; text: string }
  /** No Ref No. on the ERP document: the check cannot match the bill. */
  | { kind: 'missing' }

/** As `sales_order_bill_ref` folds a paper number: upper case, no spaces or dashes. */
function fold(text: string): string {
  return text.toUpperCase().replace(/[\s-]/g, '')
}

/**
 * What a bill's Ref No. says, from `revenue_month_orders`' `ref_no` (the ERP's
 * Ref No. as typed) and `paper_no` (the number the check reads from it).
 */
export function paperRef(refNo: string | null | undefined, paperNo: string | null | undefined): PaperRef {
  const ref = refNo?.trim() || null
  if (paperNo) {
    const text = ref ?? paperNo
    return { kind: 'paper', text, checkedAs: fold(text) === paperNo ? null : paperNo }
  }
  return ref ? { kind: 'unreadable', text: ref } : { kind: 'missing' }
}
