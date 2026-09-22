-- 「从某月起改成无固定期限」 (user 2026-09-22, boss-approved): a 从某月起 change
-- may drop the fixed schedule — from X the deal has no monthly principal due,
-- repayments come in whatever size, and (per the user's convention A) the
-- flat interest stays base × rate on the principal owed at X.
--
--   fund sources: lock_in_months → null, maturity_date → null (never matures)
--   loans:        tenure_months is NOT NULL with a 1–120 check and is read all
--                 over the app, so a loan goes no-term the way the app already
--                 understands — a 未定还款 marker in repayment_terms
--                 (lib/treasury-schedule isLoanUnscheduled). The previous text
--                 is kept on the history row so revert restores it.

alter table treasury_terms_history add column if not exists was_repayment_terms text;

drop function if exists amend_fund_source_from(uuid, date, numeric, integer, boolean, text);
create or replace function amend_fund_source_from(
  p_fund_source_id    uuid,
  p_effective_from    date,
  p_cost_rate         numeric,
  p_remaining_months  integer,
  p_compound_interest boolean,
  p_reason            text,
  p_no_fixed_term     boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role        user_role;
  v_fs          fund_sources%rowtype;
  v_from        date;
  v_start       date;
  v_first_due   date;
  v_seg_from    date;
  v_old_end     date;
  v_months      integer;
begin
  v_role := current_user_role();
  if v_role <> 'principal' then
    raise exception 'amend_fund_source_from: unauthorized role %', v_role using errcode = 'insufficient_privilege';
  end if;
  select * into v_fs from fund_sources where id = p_fund_source_id for update;
  if not found then raise exception 'Fund source % not found', p_fund_source_id; end if;
  if v_fs.status <> 'active' then raise exception 'Fund source % is not active', p_fund_source_id; end if;
  if p_effective_from is null then raise exception 'Effective month is required'; end if;
  if p_remaining_months is not null and (p_remaining_months < 1 or p_remaining_months > 120) then
    raise exception 'Remaining months must be 1–120';
  end if;
  if p_cost_rate is not null and (p_cost_rate < 0 or p_cost_rate >= 1) then
    raise exception 'Rate must be between 0 and 100%%';
  end if;

  v_from      := date_trunc('month', p_effective_from)::date;
  v_start     := date_trunc('month', v_fs.effective_date)::date;
  v_first_due := coalesce(date_trunc('month', v_fs.repayment_start_month)::date, (v_start + interval '1 month')::date);
  v_seg_from  := coalesce(v_fs.terms_effective_from, v_first_due);
  if v_from <= v_seg_from then
    raise exception 'Effective month % must be after the month the current terms took effect (%) — to re-state the whole deal use Amend terms',
      to_char(v_from, 'YYYY-MM'), to_char(v_seg_from, 'YYYY-MM');
  end if;

  if v_fs.lock_in_months is not null then
    v_old_end := (v_seg_from + ((v_fs.lock_in_months - 1) || ' months')::interval)::date;
    v_months  := greatest(1, terms_months_between(v_from, v_old_end) + 1);
  else
    v_months := null;
  end if;

  insert into treasury_terms_history
    (record_kind, record_id, valid_from, valid_to, rate, months, compound_interest, was_effective_from, was_maturity_date, reason, created_by)
  values
    ('fund_source', v_fs.id, v_seg_from, (v_from - interval '1 month')::date,
     v_fs.cost_rate, v_fs.lock_in_months, coalesce(v_fs.compound_interest, false), v_fs.terms_effective_from, v_fs.maturity_date,
     nullif(trim(p_reason), ''), auth.uid());

  update fund_sources set
    cost_rate            = coalesce(p_cost_rate, cost_rate),
    lock_in_months       = case when p_no_fixed_term then null else coalesce(p_remaining_months, v_months) end,
    compound_interest    = coalesce(p_compound_interest, compound_interest),
    terms_effective_from = v_from,
    maturity_date        = case when p_no_fixed_term then null
                                when maturity_date is not null and coalesce(p_remaining_months, v_months) is not null
                                then (v_from + (coalesce(p_remaining_months, v_months) || ' months')::interval)::date
                                else maturity_date end,
    updated_at           = now()
  where id = v_fs.id;
end $$;

drop function if exists amend_loan_from(uuid, date, numeric, integer, boolean, text);
create or replace function amend_loan_from(
  p_loan_id           uuid,
  p_effective_from    date,
  p_effective_rate    numeric,
  p_remaining_months  integer,
  p_compound_interest boolean,
  p_reason            text,
  p_no_fixed_term     boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role      user_role;
  v_l         loans%rowtype;
  v_from      date;
  v_start     date;
  v_first_due date;
  v_seg_from  date;
  v_old_end   date;
  v_months    integer;
  v_marker    text;
begin
  v_role := current_user_role();
  if v_role <> 'principal' then
    raise exception 'amend_loan_from: unauthorized role %', v_role using errcode = 'insufficient_privilege';
  end if;
  select * into v_l from loans where id = p_loan_id for update;
  if not found then raise exception 'Loan % not found', p_loan_id; end if;
  if v_l.status <> 'active' then raise exception 'Loan % is not active', p_loan_id; end if;
  if p_effective_from is null then raise exception 'Effective month is required'; end if;
  if v_l.disbursement_date is null then raise exception 'Loan has no disbursement date yet'; end if;
  if p_remaining_months is not null and (p_remaining_months < 1 or p_remaining_months > 120) then
    raise exception 'Remaining months must be 1–120';
  end if;
  if p_effective_rate is not null and (p_effective_rate < 0 or p_effective_rate >= 1) then
    raise exception 'Rate must be between 0 and 100%%';
  end if;
  if p_effective_rate is not null and p_effective_rate < v_l.base_rate then
    raise exception 'Rate % is below the loan''s base rate % (risk premium cannot be negative)',
      round(p_effective_rate * 100, 3)::text || '%', round(v_l.base_rate * 100, 3)::text || '%';
  end if;

  v_from      := date_trunc('month', p_effective_from)::date;
  v_start     := date_trunc('month', v_l.disbursement_date)::date;
  v_first_due := coalesce(date_trunc('month', v_l.repayment_start_month)::date, (v_start + interval '1 month')::date);
  v_seg_from  := coalesce(v_l.terms_effective_from, v_first_due);
  if v_from <= v_seg_from then
    raise exception 'Effective month % must be after the month the current terms took effect (%) — to re-state the whole deal use Amend terms',
      to_char(v_from, 'YYYY-MM'), to_char(v_seg_from, 'YYYY-MM');
  end if;

  if v_l.tenure_months is not null and v_l.tenure_months > 0 then
    v_old_end := (v_seg_from + ((v_l.tenure_months - 1) || ' months')::interval)::date;
    v_months  := greatest(1, terms_months_between(v_from, v_old_end) + 1);
  else
    v_months := null;
  end if;

  insert into treasury_terms_history
    (record_kind, record_id, valid_from, valid_to, rate, months, compound_interest, was_effective_from, was_repayment_terms, reason, created_by)
  values
    ('loan', v_l.id, v_seg_from, (v_from - interval '1 month')::date,
     v_l.effective_rate,
     -- a loan already flagged 未定 had no schedule in that segment
     case when v_l.repayment_terms ~ '(未定|无还款方式)' then null else v_l.tenure_months end,
     coalesce(v_l.compound_interest, false), v_l.terms_effective_from, v_l.repayment_terms,
     nullif(trim(p_reason), ''), auth.uid());

  v_marker := ' · 未定还款(自 ' || to_char(v_from, 'YYYY-MM') || ' 起)';
  update loans set
    effective_rate       = coalesce(p_effective_rate, effective_rate),
    risk_premium         = coalesce(p_effective_rate - base_rate, risk_premium),
    tenure_months        = coalesce(p_remaining_months, v_months, tenure_months),
    compound_interest    = coalesce(p_compound_interest, compound_interest),
    terms_effective_from = v_from,
    repayment_terms      = case when p_no_fixed_term and coalesce(repayment_terms, '') !~ '(未定|无还款方式)'
                                then coalesce(repayment_terms, '') || v_marker
                                else repayment_terms end,
    updated_at           = now()
  where id = v_l.id;
end $$;

create or replace function revert_terms_change(p_record_kind text, p_record_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role user_role;
  v_h    treasury_terms_history%rowtype;
begin
  v_role := current_user_role();
  if v_role <> 'principal' then
    raise exception 'revert_terms_change: unauthorized role %', v_role using errcode = 'insufficient_privilege';
  end if;
  select * into v_h from treasury_terms_history
   where record_kind = p_record_kind and record_id = p_record_id
   order by valid_from desc limit 1;
  if not found then raise exception 'No terms change to revert'; end if;

  if p_record_kind = 'fund_source' then
    update fund_sources set
      cost_rate            = v_h.rate,
      lock_in_months       = v_h.months,
      compound_interest    = v_h.compound_interest,
      terms_effective_from = v_h.was_effective_from,
      maturity_date        = v_h.was_maturity_date,
      updated_at           = now()
    where id = p_record_id;
  elsif p_record_kind = 'loan' then
    update loans set
      effective_rate       = v_h.rate,
      risk_premium         = v_h.rate - base_rate,
      tenure_months        = coalesce(v_h.months, tenure_months),
      compound_interest    = v_h.compound_interest,
      terms_effective_from = v_h.was_effective_from,
      repayment_terms      = coalesce(v_h.was_repayment_terms, repayment_terms),
      updated_at           = now()
    where id = p_record_id;
  else
    raise exception 'Unknown record kind %', p_record_kind;
  end if;
  delete from treasury_terms_history where id = v_h.id;
end $$;

grant execute on function amend_fund_source_from(uuid, date, numeric, integer, boolean, text, boolean) to authenticated;
grant execute on function amend_loan_from(uuid, date, numeric, integer, boolean, text, boolean) to authenticated;
