'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchAllRows } from '@/lib/paginate'

export interface BankTransaction {
  date: string
  description: string
  debit: number
  credit: number
  balance: number
}

export interface ReconciliationResult {
  bankBalance: number
  portalBalance: number
  difference: number
  matched: number
  unmatched: number
  bankTransactions: BankTransaction[]
}

export async function reconcileBankStatement(csvText: string): Promise<ReconciliationResult> {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  // Parse CSV (flexible: supports common Malaysian bank formats)
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) throw new Error('CSV must have at least a header and one data row')

  const header = lines[0].toLowerCase()
  const transactions: BankTransaction[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    if (cols.length < 3) continue

    // Auto-detect column layout
    let date = '', description = '', debit = 0, credit = 0, balance = 0

    if (header.includes('date') && header.includes('description')) {
      // Standard format: Date, Description, Debit, Credit, Balance
      const headerCols = parseCSVLine(lines[0].toLowerCase())
      const dateIdx = headerCols.findIndex(c => c.includes('date'))
      const descIdx = headerCols.findIndex(c => c.includes('desc'))
      const debitIdx = headerCols.findIndex(c => c.includes('debit') || c.includes('withdrawal'))
      const creditIdx = headerCols.findIndex(c => c.includes('credit') || c.includes('deposit'))
      const balIdx = headerCols.findIndex(c => c.includes('balance'))

      date = cols[dateIdx] ?? cols[0]
      description = cols[descIdx] ?? cols[1]
      debit = parseAmount(cols[debitIdx])
      credit = parseAmount(cols[creditIdx])
      balance = parseAmount(cols[balIdx])
    } else {
      // Fallback: assume Date, Description, Amount, Balance
      date = cols[0]
      description = cols[1]
      const amount = parseAmount(cols[2])
      balance = parseAmount(cols[3])
      if (amount < 0) debit = Math.abs(amount)
      else credit = amount
    }

    transactions.push({ date, description, debit, credit, balance })
  }

  if (transactions.length === 0) throw new Error('No valid transactions found in CSV')

  // Get portal balances
  const [
    { data: fundSources },
    { data: loans },
  ] = await Promise.all([
    fetchAllRows((lo, hi) => supabase.from('fund_sources').select('amount').eq('status', 'active').order('id', { ascending: true }).range(lo, hi)).then((data) => ({ data })),
    fetchAllRows((lo, hi) => supabase.from('loans').select('principal').eq('status', 'active').order('id', { ascending: true }).range(lo, hi)).then((data) => ({ data })),
  ])

  const totalDeposits = (fundSources ?? []).reduce((s, f) => s + Number(f.amount), 0)
  const totalLoans = (loans ?? []).reduce((s, l) => s + Number(l.principal), 0)
  const portalBalance = totalDeposits - totalLoans

  const bankBalance = transactions[transactions.length - 1]?.balance ?? 0

  // Simple matching: count bank transactions that have amounts matching portal records
  const portalAmounts = new Set([
    ...(fundSources ?? []).map(f => Number(f.amount)),
    ...(loans ?? []).map(l => Number(l.principal)),
  ])

  let matched = 0
  let unmatched = 0
  for (const t of transactions) {
    const amount = t.debit || t.credit
    if (portalAmounts.has(amount)) {
      matched++
    } else {
      unmatched++
    }
  }

  return {
    bankBalance,
    portalBalance,
    difference: bankBalance - portalBalance,
    matched,
    unmatched,
    bankTransactions: transactions,
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

function parseAmount(s: string | undefined): number {
  if (!s) return 0
  return parseFloat(s.replace(/[,\s]/g, '')) || 0
}
