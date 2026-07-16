'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchAllRows } from '@/lib/paginate'
import { assertPeriodOpen } from '@/lib/period-lock'
import {
  billingModeToCategoryCode,
  billingModeLabel,
  type BillingMode,
} from '@/lib/billing'

// ─── Generate monthly statements (Finance) ───────────────────────────────────

export async function generateStatements(formData: FormData) {
  const user = await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const periodMonth = (formData.get('period_month') as string) ?? ''
  if (!periodMonth) throw new Error('Period month is required')

  // Normalize to first of month
  const period = dayjs(periodMonth).startOf('month').format('YYYY-MM-DD')

  await assertPeriodOpen(supabase, period)

  // 1. Get all active companies
  const { data: companies, error: companiesError } = await supabase
    .from('companies')
    .select('id, name, short_code')
    .eq('is_active', true)

  if (companiesError) throw new Error(`Failed to load companies: ${companiesError.message}`)
  if (!companies || companies.length === 0) {
    throw new Error('No active companies found')
  }

  // 2. Get active fund sources (for loan interest contra lines)
  const fundSources = await fetchAllRows((lo, hi) => supabase
    .from('fund_sources')
    .select('id, from_company_id, amount, cost_rate')
    .eq('status', 'active')
    .in('source_type', ['subsidiary', 'director_loan', 'department_pool'])
    .not('from_company_id', 'is', null)
    .order('id', { ascending: true })
    .range(lo, hi))

  const loansByCompany = new Map<string, Array<{ id: string; amount: number; cost_rate: number }>>()
  for (const fs of fundSources ?? []) {
    if (!fs.from_company_id) continue
    const list = loansByCompany.get(fs.from_company_id) ?? []
    list.push({
      id: fs.id,
      amount: Number(fs.amount),
      cost_rate: Number(fs.cost_rate),
    })
    loansByCompany.set(fs.from_company_id, list)
  }

  // 2b. Get generated invoices for this period (Step 6 wiring).
  // Groups them by company so each statement can pick up its own lines.
  const periodInvoices = await fetchAllRows((lo, hi) => supabase
    .from('invoices')
    .select('id, company_id, billing_mode, total_amount')
    .eq('period_month', period)
    .order('id', { ascending: true })
    .range(lo, hi))

  const invoicesByCompany = new Map<
    string,
    Array<{ id: string; billing_mode: BillingMode; total_amount: number }>
  >()
  for (const inv of periodInvoices ?? []) {
    // Item 5: invoices billed to non-subsidiary parties (director / dept_pool /
    // freetext) don't roll into per-company statements. Skip them here.
    if (!inv.company_id) continue
    const list = invoicesByCompany.get(inv.company_id) ?? []
    list.push({
      id: inv.id,
      billing_mode: inv.billing_mode as BillingMode,
      total_amount: Number(inv.total_amount),
    })
    invoicesByCompany.set(inv.company_id, list)
  }

  let generated = 0
  let skipped = 0
  const errors: string[] = []

  // 3. For each company, upsert statement + regenerate lines
  for (const company of companies) {
    // Check if statement already exists for this period
    const { data: existing } = await supabase
      .from('monthly_statements')
      .select('id, status')
      .eq('company_id', company.id)
      .eq('period_month', period)
      .maybeSingle()

    // If already issued, skip
    if (existing && existing.status !== 'draft') {
      skipped++
      continue
    }

    let statementId = existing?.id

    if (!statementId) {
      // Create new statement
      const { data: newStatement, error: createError } = await supabase
        .from('monthly_statements')
        .insert({
          company_id: company.id,
          period_month: period,
          status: 'draft',
          total_invoice: 0,
          total_contra: 0,
          net_amount: 0,
          created_by: user.id,
        })
        .select('id')
        .single()

      if (createError) {
        errors.push(`${company.short_code}: ${createError.message}`)
        continue
      }
      statementId = newStatement.id
    } else {
      // Regenerate: clear existing lines (RLS allows delete when parent is draft)
      await supabase.from('monthly_statement_lines').delete().eq('statement_id', statementId)
    }

    // Add contra lines: loan interest (HV owes sub)
    const loans = loansByCompany.get(company.id) ?? []
    let totalContra = 0
    for (const s of loans) {
      const interest = s.amount * s.cost_rate
      if (interest <= 0) continue

      const { error: lineError } = await supabase.from('monthly_statement_lines').insert({
        statement_id: statementId,
        line_type: 'contra',
        direction: 'payable',
        category_code: 'loan_repayment',
        description: `Loan interest RM ${s.amount.toLocaleString('en-MY')} @ ${(s.cost_rate * 100).toFixed(3)}%/mo`,
        reference_id: s.id,
        reference_table: 'fund_sources',
        amount: interest,
      })

      if (lineError) {
        errors.push(`${company.short_code} contra: ${lineError.message}`)
      } else {
        totalContra += interest
      }
    }

    // Add invoice lines: one per generated invoice for this period+company.
    // category_code comes from the billing mode → category lookup helper.
    // Non-billable invoices (future) would return null and are skipped here.
    const companyInvoices = invoicesByCompany.get(company.id) ?? []
    let totalInvoice = 0
    for (const inv of companyInvoices) {
      const categoryCode = billingModeToCategoryCode(inv.billing_mode)
      if (!categoryCode) continue
      if (inv.total_amount <= 0) continue

      const { error: lineError } = await supabase.from('monthly_statement_lines').insert({
        statement_id: statementId,
        line_type: 'invoice',
        direction: 'receivable',
        category_code: categoryCode,
        description: `${billingModeLabel(inv.billing_mode)} — ${dayjs(period).format('MMM YYYY')}`,
        reference_id: inv.id,
        reference_table: 'invoices',
        amount: inv.total_amount,
      })

      if (lineError) {
        errors.push(`${company.short_code} invoice line: ${lineError.message}`)
      } else {
        totalInvoice += inv.total_amount
      }
    }

    // Update statement totals so the totals_match_net constraint is satisfied
    // and the list views show real numbers.
    const { error: totalsError } = await supabase
      .from('monthly_statements')
      .update({
        total_invoice: totalInvoice,
        total_contra: totalContra,
        net_amount: totalInvoice - totalContra,
      })
      .eq('id', statementId)
      .eq('status', 'draft')

    if (totalsError) {
      errors.push(`${company.short_code} totals update: ${totalsError.message}`)
    }

    generated++
  }

  revalidatePath('/statements')
  revalidatePath('/statements/monthly')
  revalidatePath('/dashboard')
  return {
    generated,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
    period,
  }
}

// ─── Issue statement (Finance — transitions from draft → issued) ─────────────
//
// Phase 7 Step 11: this is a pure display-only transition. Statements are
// informational — all actual money movement (loan interest → hv_fund.fund_in,
// invoice settlement → payment_voucher) happens in dedicated flows elsewhere.
// Issuing or marking paid MUST NOT write to any pool ledger.

export async function issueStatement(formData: FormData) {
  const user = await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  if (!id) throw new Error('Statement id is required')

  const { data: stmt } = await supabase
    .from('monthly_statements')
    .select('period_month')
    .eq('id', id)
    .single()
  if (stmt?.period_month) {
    await assertPeriodOpen(supabase, stmt.period_month)
  }

  const { error } = await supabase
    .from('monthly_statements')
    .update({
      status: 'issued',
      issued_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'draft')

  if (error) throw new Error(`Failed to issue statement: ${error.message}`)

  void user
  revalidatePath('/statements')
  revalidatePath('/statements/monthly')
  revalidatePath(`/statements/${id}`)
}

// ─── Mark statement paid (Finance — full payment only for MVP) ───────────────
//
// Phase 7 Step 11: display-only transition. Money already moved via the
// payment_voucher settlement flow; this just flips the status flag.
// DO NOT add any hv_fund / dept_pool / invoice_payout_pool writes here.

export async function markStatementPaid(formData: FormData) {
  const user = await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  if (!id) throw new Error('Statement id is required')

  await assertPeriodOpen(supabase, new Date())

  const { error } = await supabase
    .from('monthly_statements')
    .update({ status: 'paid' })
    .eq('id', id)
    .eq('status', 'issued')

  if (error) throw new Error(`Failed to mark paid: ${error.message}`)

  void user
  revalidatePath('/statements')
  revalidatePath('/statements/monthly')
  revalidatePath(`/statements/${id}`)
  revalidatePath('/dashboard')
}
