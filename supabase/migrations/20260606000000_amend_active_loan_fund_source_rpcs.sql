-- Self-service editing of ACTIVE loans / fund sources by Principal, applied
-- directly (Principal is the top approval authority). Only the keys present in
-- p_payload are changed; everything else is left intact.
-- (Applied via MCP apply_migration on 2026-06-06; file kept for repo parity.)

create or replace function amend_loan(p_loan_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_role user_role;
begin
  v_role := current_user_role();
  if v_role <> 'principal' then
    raise exception 'amend_loan: unauthorized role %', v_role using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from loans where id = p_loan_id and status = 'active') then
    raise exception 'Loan % is not active', p_loan_id;
  end if;
  update loans set
    effective_rate    = coalesce((p_payload->>'effective_rate')::numeric, effective_rate),
    risk_premium      = coalesce((p_payload->>'effective_rate')::numeric - base_rate, risk_premium),
    tenure_months     = coalesce((p_payload->>'tenure_months')::int, tenure_months),
    disbursement_date = coalesce((p_payload->>'disbursement_date')::date, disbursement_date),
    repayment_terms   = coalesce(p_payload->>'repayment_terms', repayment_terms),
    compound_interest = coalesce((p_payload->>'compound_interest')::boolean, compound_interest),
    updated_at        = now()
  where id = p_loan_id;
end $$;

create or replace function amend_fund_source(p_fund_source_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_role user_role;
begin
  v_role := current_user_role();
  if v_role <> 'principal' then
    raise exception 'amend_fund_source: unauthorized role %', v_role using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from fund_sources where id = p_fund_source_id and status = 'active') then
    raise exception 'Fund source % is not active', p_fund_source_id;
  end if;
  update fund_sources set
    cost_rate         = coalesce((p_payload->>'cost_rate')::numeric, cost_rate),
    lock_in_months    = case when p_payload ? 'lock_in_months'
                             then nullif(p_payload->>'lock_in_months', '')::int
                             else lock_in_months end,
    repayment_date    = coalesce((p_payload->>'repayment_date')::date, repayment_date),
    maturity_date     = coalesce((p_payload->>'repayment_date')::date, maturity_date),
    compound_interest = coalesce((p_payload->>'compound_interest')::boolean, compound_interest),
    notes             = coalesce(p_payload->>'notes', notes),
    updated_at        = now()
  where id = p_fund_source_id;
end $$;

grant execute on function amend_loan(uuid, jsonb) to authenticated;
grant execute on function amend_fund_source(uuid, jsonb) to authenticated;
