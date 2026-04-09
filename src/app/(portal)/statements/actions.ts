'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

// ─── Generate monthly statements (Finance) ───────────────────────────────────

export async function generateStatements(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const periodMonth = (formData.get('period_month') as string) ?? ''
  if (!periodMonth) throw new Error('Period month is required')

  // Normalize to first of month
  const period = dayjs(periodMonth).startOf('month').format('YYYY-MM-DD')

  // 1. Get all active companies
  const { data: companies, error: companiesError } = await supabase
    .from('companies')
    .select('id, name, short_code')
    .eq('is_active', true)

  if (companiesError) throw new Error(`Failed to load companies: ${companiesError.message}`)
  if (!companies || companies.length === 0) {
    throw new Error('No active companies found')
  }

  // 2. Get active fund sources (for savings_interest contra lines)
  const { data: fundSources } = await supabase
    .from('fund_sources')
    .select('id, from_company_id, amount, cost_rate')
    .eq('status', 'active')
    .eq('source_type', 'subsidiary_savings')
    .not('from_company_id', 'is', null)

  const savingsByCompany = new Map<string, Array<{ id: string; amount: number; cost_rate: number }>>()
  for (const fs of fundSources ?? []) {
    if (!fs.from_company_id) continue
    const list = savingsByCompany.get(fs.from_company_id) ?? []
    list.push({
      id: fs.id,
      amount: Number(fs.amount),
      cost_rate: Number(fs.cost_rate),
    })
    savingsByCompany.set(fs.from_company_id, list)
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

    // Add contra lines: savings interest (HV owes sub)
    const savings = savingsByCompany.get(company.id) ?? []
    for (const s of savings) {
      const interest = s.amount * s.cost_rate
      if (interest <= 0) continue

      const { error: lineError } = await supabase.from('monthly_statement_lines').insert({
        statement_id: statementId,
        line_type: 'contra',
        direction: 'payable',
        category_code: 'savings_interest',
        description: `Savings interest RM ${s.amount.toLocaleString('en-MY')} @ ${(s.cost_rate * 100).toFixed(3)}%/mo`,
        reference_id: s.id,
        reference_table: 'fund_sources',
        amount: interest,
      })

      if (lineError) {
        errors.push(`${company.short_code} contra: ${lineError.message}`)
      }
    }

    // Phase 2: invoice lines from billing module (HR pool, finance attribution, marketing, rent, utility)
    // For now, statement only has savings_interest contra lines.

    generated++
  }

  revalidatePath('/statements')
  revalidatePath('/dashboard')
  return {
    generated,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
    period,
  }
}

// ─── Issue statement (Finance — transitions from draft → issued) ─────────────

export async function issueStatement(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  if (!id) throw new Error('Statement id is required')

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
  revalidatePath(`/statements/${id}`)
}

// ─── Mark statement paid (Finance — full payment only for MVP) ───────────────

export async function markStatementPaid(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  if (!id) throw new Error('Statement id is required')

  const { error } = await supabase
    .from('monthly_statements')
    .update({ status: 'paid' })
    .eq('id', id)
    .eq('status', 'issued')

  if (error) throw new Error(`Failed to mark paid: ${error.message}`)

  void user
  revalidatePath('/statements')
  revalidatePath(`/statements/${id}`)
  revalidatePath('/dashboard')
}
