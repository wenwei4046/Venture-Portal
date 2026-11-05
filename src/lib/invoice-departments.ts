// An invoice's lines by department (2026-11-05 — the user, on HV-INV-202610-0058's full page beside its PDF: "其实里面应该
// 有多个部门，帮我微调显示可以吗？"). A consolidated payroll invoice's lines carry their department's P&L segment
// (`invoice_lines.segment`); the PDF already printed them under each department with a subtotal, the page did not.
// One rule for both: the departments in the order their first line comes, each with its lines and their subtotal;
// an invoice whose lines carry no segment is not grouped.

const SEGMENT_LABEL: Record<string, string> = {
  hr: 'HR',
  finance: 'Finance',
  marketing: 'Marketing',
  director_office: 'Director Office',
  director: 'Director',
  it: 'IT',
  revenue_department: 'Revenue Department',
  corporate: 'Venture Office',
}

/** A segment as an invoice names its department: "Director Office"; a blank one "Other". */
export const departmentOfSegment = (segment: string | null | undefined): string => (segment ? (SEGMENT_LABEL[segment] ?? segment) : 'Other')

export interface DepartmentGroup<L> {
  segment: string
  label: string
  lines: L[]
  subtotal: number
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** The lines by department, in the order each first appears; null when no line carries a segment. */
export function linesByDepartment<L extends { amount: number; segment?: string | null }>(lines: L[]): DepartmentGroup<L>[] | null {
  if (!lines.some((l) => l.segment)) return null
  const order: string[] = []
  const by = new Map<string, L[]>()
  for (const l of lines) {
    const seg = l.segment ?? ''
    if (!by.has(seg)) {
      by.set(seg, [])
      order.push(seg)
    }
    by.get(seg)!.push(l)
  }
  return order.map((seg) => {
    const its = by.get(seg)!
    return { segment: seg, label: departmentOfSegment(seg), lines: its, subtotal: r2(its.reduce((s, l) => s + l.amount, 0)) }
  })
}
