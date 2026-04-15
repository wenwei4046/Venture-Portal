// Creates a pending loan for UI criterion B (combined card) verification.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://gixpptmfuryskbwkmiwz.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpeHBwdG1mdXJ5c2tid2ttaXd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MzgzOTAsImV4cCI6MjA5MTMxNDM5MH0.7ahinbJZ7VpxeSiOpWznmbTdc_agDQ5kNkaPqPbFe6k'

const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
const { error: signInErr } = await client.auth.signInWithPassword({
  email: 'finance@venture.my',
  password: '123456',
})
if (signInErr) throw new Error(signInErr.message)

const { data: base } = await client
  .from('base_rate_history')
  .select('base_rate')
  .not('approved_at', 'is', null)
  .order('effective_from', { ascending: false })
  .limit(1)
  .single()

const principal = Number(process.argv[2] ?? 100)
const { data: loanId, error } = await client.rpc('create_loan_with_approval', {
  p_company_id: '538a18d5-cbce-4c4a-884d-8f2f5c4f9b92', // CMI
  p_principal: principal,
  p_base_rate: Number(base.base_rate),
  p_risk_premium: 0.02,
  p_effective_rate: Number(base.base_rate) + 0.02,
  p_repayment_terms: 'Step 9 UI verify',
  p_company_name: 'CMI',
})
if (error) throw new Error(error.message)
console.log('loan_id:', loanId)
