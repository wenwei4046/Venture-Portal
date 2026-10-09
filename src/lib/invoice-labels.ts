// What an invoice is called on its own page (2026-10-09, the Finance revamp —
// the user's Claude Design handoff): its billing mode in words for the
// eyebrow and the details ("INVOICE · HR ATTRIBUTION"), and who it bills with
// what kind of party that is ("HOUZS Century (HC) · Subsidiary").

const MODE_LABELS: Record<string, string> = {
  venture_attribution: 'Venture attribution',
  marketing_project: 'Marketing project',
  hr_attribution: 'HR attribution',
  finance_attribution: 'Finance attribution',
  director_office_attribution: 'Director Office OPEX',
  director_attribution: 'Director OPEX',
  revenue_department_attribution: 'Revenue Department attribution',
  it_attribution: 'IT attribution',
  non_billable: 'Non-billable',
  payroll_consolidated: 'Payroll (consolidated)',
}

/** The mode in words; a provisioned department's mode by its own label
 *  (`extraBillingModeOptions`), anything else by the words of its key. */
export function billingModeLabel(mode: string | null | undefined, extra: ReadonlyArray<{ value: string; label: string }> = []): string {
  if (!mode) return '—'
  const known = MODE_LABELS[mode] ?? extra.find((m) => m.value === mode)?.label
  if (known) return known
  const words = mode.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export interface InvoiceParty {
  name: string
  /** Subsidiary / Dept pool / Director / Free text. */
  kind: string
}

interface PartyFields {
  company_id: string | null
  billable_to_type: string | null
  billable_to_department_id: string | null
  billable_to_freetext_name: string | null
}

const KIND: Record<string, string> = { subsidiary: 'Subsidiary', dept_pool: 'Dept pool', director: 'Director', freetext: 'Free text' }

/** Who the invoice bills (mig 225: a subsidiary by company_id, a department
 *  pool by billable_to_department_id, a director or anyone else by name). */
export function invoiceParty(
  inv: PartyFields,
  companies: ReadonlyMap<string, { name: string; code: string | null }>,
  departments: ReadonlyMap<string, string>,
): InvoiceParty {
  if (inv.company_id) {
    const c = companies.get(inv.company_id)
    return { name: c ? (c.code ? `${c.name} (${c.code})` : c.name) : '—', kind: 'Subsidiary' }
  }
  if (inv.billable_to_type === 'dept_pool') {
    return { name: (inv.billable_to_department_id && departments.get(inv.billable_to_department_id)) || '—', kind: 'Dept pool' }
  }
  return { name: inv.billable_to_freetext_name || '—', kind: KIND[inv.billable_to_type ?? ''] ?? '—' }
}
