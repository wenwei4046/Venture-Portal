import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRowsAsWritten } from '@/lib/paginate'

// What the monthly Statements read (2026-10-15, lifted out of their two pages
// so the Finance phone app reads the very same): every month's statements with
// their companies, and one statement with its invoice and contra lines.

export interface StatementRow {
  id: string
  period_month: string
  company_id: string
  status: string
  total_invoice: number
  total_contra: number
  net_amount: number
  created_at: string
}

/** Every month's statements (a few rows a month), newest month first, and the companies by id. */
export async function readStatementList(supabase: SupabaseClient): Promise<{ statements: StatementRow[]; companies: Map<string, { name: string; code: string | null }> }> {
  const [statementList, { data: companies }] = await Promise.all([
    fetchAllRowsAsWritten((page) => {
      const q = supabase
        .from('monthly_statements')
        .select('id, period_month, company_id, status, total_invoice, total_contra, net_amount, created_at')
        .order('period_month', { ascending: false })
        .order('created_at', { ascending: false })
      return page ? q.order('id').range(page.from, page.to) : q
    }, 'monthly_statements'),
    supabase.from('companies').select('id, name, short_code'),
  ])
  return {
    statements: statementList as StatementRow[],
    companies: new Map(((companies ?? []) as Array<{ id: string; name: string; short_code: string | null }>).map((c) => [c.id, { name: c.name, code: c.short_code }])),
  }
}

export interface StatementLine {
  id: string
  line_type: string
  category_code: string
  description: string | null
  amount: number
}

export interface StatementRead {
  statement: StatementRow & { issued_at: string | null }
  company: { name: string; short_code: string | null } | null
  invoiceLines: StatementLine[]
  contraLines: StatementLine[]
}

/** One statement as its page reads it; null when there is none. */
export async function readStatement(supabase: SupabaseClient, id: string): Promise<StatementRead | null> {
  const { data: statement, error } = await supabase.from('monthly_statements').select('*').eq('id', id).single()
  if (error || !statement) return null
  const [{ data: company }, { data: lines }] = await Promise.all([
    supabase.from('companies').select('name, short_code').eq('id', statement.company_id).single(),
    supabase.from('monthly_statement_lines').select('*').eq('statement_id', statement.id).order('line_type').order('created_at'),
  ])
  const lineList = (lines ?? []) as StatementLine[]
  return {
    statement: statement as StatementRead['statement'],
    company: (company as StatementRead['company']) ?? null,
    invoiceLines: lineList.filter((l) => l.line_type === 'invoice'),
    contraLines: lineList.filter((l) => l.line_type === 'contra'),
  }
}

/** A statement line's category in words. */
export function statementCategory(code: string): string {
  const labels: Record<string, string> = {
    hr_pool: 'HR Pool',
    finance_staff: 'Finance Staff',
    marketing_project: 'Marketing Project',
    rent: 'Rent',
    utility: 'Utility',
    loan_repayment: 'Loan Repayment',
    loan_interest: 'Loan Interest',
    loan_principal: 'Loan Principal',
    other: 'Other',
  }
  return labels[code] ?? code
}
