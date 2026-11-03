-- Repayment type (user 2026-10-27: "本金支持每月固定金额或分几期，Amend terms 和新的 fund in / fund out 都一样" → the
-- mockups principal-input-mockup.html and fund-forms-desktop-mockup.html → "照这个样稿做"). A deal's principal is repaid
-- one of three ways: a fixed amount a month (new), over a number of months (what lock_in_months / tenure_months always
-- said), or none — no fixed term. And one Amend terms may end the fixed term from a later month: BI#7's two changes as
-- one request (0.833% from January at 1,000 a month; no fixed term from October, the interest kept on January's 51,000).
--
--   principal_per_month       fund_sources / loans: the fixed principal each month of the terms in force; null = equal
--                             parts of their months. With it, the months (lock_in_months / tenure_months) are what
--                             clears the principal owed when those terms began, the last month taking what is left
--                             (51,000 at 1,300: 39 × 1,300, then 300). treasury_terms_history keeps a segment's own;
--                             treasury_terms_requests what a filed change asks.
--   treasury_terms_requests.open_from   no fixed term from this month: once approved, the terms asked apply from
--                             effective_from, then their fixed term ends here with the interest kept on the same amount.
--   amend_fund_source_from / amend_loan_from (p_principal_per_month)   a change from a later month at a fixed amount; a
--                             change that asks neither an amount nor months keeps the amount a month it had.
--   amend_fund_source / amend_loan ('principal_per_month')               the whole terms at a fixed amount.
--   file_terms_change (p_principal_per_month, p_open_from) · approve_terms_change · revert_terms_change
--
-- Nothing recorded moves.

alter table fund_sources add column if not exists principal_per_month numeric(14,2);
alter table loans add column if not exists principal_per_month numeric(14,2);
alter table treasury_terms_history add column if not exists principal_per_month numeric(14,2);
alter table treasury_terms_requests add column if not exists principal_per_month numeric(14,2);
alter table treasury_terms_requests add column if not exists open_from date;

alter table fund_sources drop constraint if exists fund_sources_principal_per_month_positive;
alter table fund_sources add constraint fund_sources_principal_per_month_positive check (principal_per_month is null or principal_per_month > 0);
alter table loans drop constraint if exists loans_principal_per_month_positive;
alter table loans add constraint loans_principal_per_month_positive check (principal_per_month is null or principal_per_month > 0);
alter table treasury_terms_requests drop constraint if exists treasury_terms_requests_one_repayment;
alter table treasury_terms_requests add constraint treasury_terms_requests_one_repayment
  check (principal_per_month is null or (principal_per_month > 0 and remaining_months is null and not no_fixed_term));
alter table treasury_terms_requests drop constraint if exists treasury_terms_requests_open_after;
alter table treasury_terms_requests add constraint treasury_terms_requests_open_after
  check (open_from is null or (open_from > effective_from and not no_fixed_term));

comment on column fund_sources.principal_per_month is
  'Fixed principal each month of the terms in force (Repayment type "A fixed amount a month"); null = lock_in_months equal parts. lock_in_months then = the months that clear the principal owed when the terms began, the last taking the rest.';
comment on column loans.principal_per_month is
  'Fixed principal each month of the terms in force (Repayment type "A fixed amount a month"); null = tenure_months equal parts. tenure_months then = the months that clear the principal owed when the terms began, the last taking the rest.';
comment on column treasury_terms_history.principal_per_month is 'The segment''s own fixed principal a month (null = equal parts of its months).';
comment on column treasury_terms_requests.principal_per_month is 'A fixed principal a month asked (null = as it is, or the months asked).';
comment on column treasury_terms_requests.open_from is 'No fixed term from this month (1st), the interest kept on the same amount — applied after the terms asked from effective_from.';

-- The principal still owed when a month starts: the amount less the principal repaid before it (a fund source's
-- netting counts, as fund_source_outstanding counts it).
create or replace function terms_principal_owed(p_record_kind text, p_record_id uuid, p_month date)
returns numeric
language sql stable security definer set search_path = public as $$
  select case when p_record_kind = 'loan' then
           (select l.principal from loans l where l.id = p_record_id)
           - coalesce((select sum(r.amount) from repayments r
                        where r.loan_id = p_record_id and r.payment_type::text = 'principal' and r.payment_date < p_month), 0)
         else
           (select f.amount from fund_sources f where f.id = p_record_id)
           - coalesce((select sum(r.amount) from fund_source_repayments r
                        where r.fund_source_id = p_record_id and r.payment_type::text in ('principal', 'netting') and r.payment_date < p_month), 0)
         end
$$;

-- The months a fixed amount a month takes to clear what is owed — 1 to 120, as a number of months may be.
create or replace function terms_months_for(p_owed numeric, p_principal_per_month numeric)
returns integer
language plpgsql immutable set search_path = public as $$
declare
  v_n integer;
begin
  if p_principal_per_month is null or p_principal_per_month <= 0 then
    raise exception 'The principal a month must be above 0';
  end if;
  if p_owed is null or p_owed <= 0 then
    raise exception 'No principal is owed then to repay at a fixed amount a month';
  end if;
  v_n := ceil(p_owed / p_principal_per_month)::integer;
  if v_n > 120 then
    raise exception 'At RM % a month the RM % owed takes % months — the most is 120',
      to_char(p_principal_per_month, 'FM999,999,990.00'), to_char(p_owed, 'FM999,999,990.00'), v_n;
  end if;
  return greatest(v_n, 1);
end $$;

revoke all on function terms_principal_owed(text, uuid, date) from public, anon, authenticated;
revoke all on function terms_months_for(numeric, numeric) from public, anon;
grant execute on function terms_months_for(numeric, numeric) to authenticated, service_role;
grant execute on function terms_principal_owed(text, uuid, date) to service_role;

-- ── From a later month ──────────────────────────────────────────────────────────
drop function if exists amend_fund_source_from(uuid, date, numeric, integer, boolean, text, boolean, boolean, boolean);
create or replace function amend_fund_source_from(
  p_fund_source_id       uuid,
  p_effective_from       date,
  p_cost_rate            numeric,
  p_remaining_months     integer,
  p_compound_interest    boolean,
  p_reason               text,
  p_no_fixed_term        boolean default false,
  p_interest_on_original boolean default false,
  p_interest_keeps_base  boolean default false,
  p_principal_per_month  numeric default null
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
  v_keep        integer;
  v_ppm         numeric;
  v_owed        numeric;
  v_months      integer;
begin
  PERFORM public.tab_write_guard(ARRAY['/fund-in'], ARRAY['treasury.approve']);
  v_role := current_user_role();
  IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.approve']) THEN RAISE EXCEPTION 'amend_fund_source_from: needs Treasury · Approve' USING ERRCODE = '42501';
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
  if coalesce(p_interest_on_original, false) and coalesce(p_interest_keeps_base, false) then
    raise exception 'Interest goes on the original principal or keeps the base it had — one, not both';
  end if;
  if p_principal_per_month is not null and (coalesce(p_no_fixed_term, false) or p_remaining_months is not null) then
    raise exception 'A fixed amount a month, a number of months or no fixed term — one of them';
  end if;

  v_from      := date_trunc('month', p_effective_from)::date;
  v_start     := date_trunc('month', v_fs.effective_date)::date;
  v_first_due := coalesce(date_trunc('month', v_fs.repayment_start_month)::date, (v_start + interval '1 month')::date);
  v_seg_from  := coalesce(v_fs.terms_effective_from, v_first_due);
  if v_from <= v_seg_from then
    raise exception 'Effective month % must be after the month the current terms took effect (%) — to re-state the whole deal use Amend terms',
      to_char(v_from, 'YYYY-MM'), to_char(v_seg_from, 'YYYY-MM');
  end if;

  -- Neither months nor an amount asked: the end month as it is.
  if v_fs.lock_in_months is not null then
    v_old_end := (v_seg_from + ((v_fs.lock_in_months - 1) || ' months')::interval)::date;
    v_keep    := greatest(1, terms_months_between(v_from, v_old_end) + 1);
  else
    v_keep := null;
  end if;
  -- A fixed amount a month — asked, or kept when nothing else was: the months it takes from what is owed then.
  if p_principal_per_month is not null then
    v_ppm    := round(p_principal_per_month, 2);
    v_months := terms_months_for(terms_principal_owed('fund_source', v_fs.id, v_from), v_ppm);
  elsif p_remaining_months is null and not coalesce(p_no_fixed_term, false) and v_fs.principal_per_month is not null then
    v_ppm  := v_fs.principal_per_month;
    v_owed := terms_principal_owed('fund_source', v_fs.id, v_from);
    v_months := case when v_owed > 0 then least(120, greatest(1, ceil(v_owed / v_ppm)::integer)) else v_keep end;
  else
    v_months := coalesce(p_remaining_months, v_keep);
  end if;

  insert into treasury_terms_history
    (record_kind, record_id, valid_from, valid_to, rate, months, compound_interest, was_effective_from, was_maturity_date, reason, created_by,
     next_interest_on_original, next_interest_keeps_base, principal_per_month)
  values
    ('fund_source', v_fs.id, v_seg_from, (v_from - interval '1 month')::date,
     v_fs.cost_rate, v_fs.lock_in_months, coalesce(v_fs.compound_interest, false), v_fs.terms_effective_from, v_fs.maturity_date,
     nullif(trim(p_reason), ''), auth.uid(), coalesce(p_interest_on_original, false), coalesce(p_interest_keeps_base, false),
     v_fs.principal_per_month);

  update fund_sources set
    cost_rate            = coalesce(p_cost_rate, cost_rate),
    lock_in_months       = case when p_no_fixed_term then null else v_months end,
    principal_per_month  = case when p_no_fixed_term then null else v_ppm end,
    compound_interest    = coalesce(p_compound_interest, compound_interest),
    terms_effective_from = v_from,
    maturity_date        = case when p_no_fixed_term then null
                                when maturity_date is not null and v_months is not null
                                then (v_from + (v_months || ' months')::interval)::date
                                else maturity_date end,
    updated_at           = now()
  where id = v_fs.id;
end $$;

drop function if exists amend_loan_from(uuid, date, numeric, integer, boolean, text, boolean, boolean, boolean);
create or replace function amend_loan_from(
  p_loan_id              uuid,
  p_effective_from       date,
  p_effective_rate       numeric,
  p_remaining_months     integer,
  p_compound_interest    boolean,
  p_reason               text,
  p_no_fixed_term        boolean default false,
  p_interest_on_original boolean default false,
  p_interest_keeps_base  boolean default false,
  p_principal_per_month  numeric default null
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
  v_keep      integer;
  v_ppm       numeric;
  v_owed      numeric;
  v_months    integer;
  v_open      boolean;
  v_marker    text;
begin
  PERFORM public.tab_write_guard(ARRAY['/fund-out'], ARRAY['treasury.approve']);
  v_role := current_user_role();
  IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.approve']) THEN RAISE EXCEPTION 'amend_loan_from: needs Treasury · Approve' USING ERRCODE = '42501';
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
  if coalesce(p_interest_on_original, false) and coalesce(p_interest_keeps_base, false) then
    raise exception 'Interest goes on the original principal or keeps the base it had — one, not both';
  end if;
  if p_principal_per_month is not null and (coalesce(p_no_fixed_term, false) or p_remaining_months is not null) then
    raise exception 'A fixed amount a month, a number of months or no fixed term — one of them';
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
  -- A loan without a fixed term says so in its terms' words (tenure_months is never null).
  v_open := coalesce(v_l.repayment_terms, '') ~ '(未定|无还款方式)';

  if v_l.tenure_months is not null and v_l.tenure_months > 0 then
    v_old_end := (v_seg_from + ((v_l.tenure_months - 1) || ' months')::interval)::date;
    v_keep    := greatest(1, terms_months_between(v_from, v_old_end) + 1);
  else
    v_keep := null;
  end if;
  if p_principal_per_month is not null then
    v_ppm    := round(p_principal_per_month, 2);
    v_months := terms_months_for(terms_principal_owed('loan', v_l.id, v_from), v_ppm);
  elsif p_remaining_months is null and not coalesce(p_no_fixed_term, false) and v_l.principal_per_month is not null and not v_open then
    v_ppm  := v_l.principal_per_month;
    v_owed := terms_principal_owed('loan', v_l.id, v_from);
    v_months := case when v_owed > 0 then least(120, greatest(1, ceil(v_owed / v_ppm)::integer)) else v_keep end;
  else
    v_months := coalesce(p_remaining_months, v_keep);
  end if;

  insert into treasury_terms_history
    (record_kind, record_id, valid_from, valid_to, rate, months, compound_interest, was_effective_from, was_repayment_terms, reason, created_by,
     next_interest_on_original, next_interest_keeps_base, principal_per_month)
  values
    ('loan', v_l.id, v_seg_from, (v_from - interval '1 month')::date,
     v_l.effective_rate,
     case when v_open then null else v_l.tenure_months end,
     coalesce(v_l.compound_interest, false), v_l.terms_effective_from, v_l.repayment_terms,
     nullif(trim(p_reason), ''), auth.uid(), coalesce(p_interest_on_original, false), coalesce(p_interest_keeps_base, false),
     case when v_open then null else v_l.principal_per_month end);

  v_marker := ' · 未定还款(自 ' || to_char(v_from, 'YYYY-MM') || ' 起)';
  update loans set
    effective_rate       = coalesce(p_effective_rate, effective_rate),
    risk_premium         = coalesce(p_effective_rate - base_rate, risk_premium),
    tenure_months        = coalesce(v_months, tenure_months),
    principal_per_month  = case when p_no_fixed_term then null else v_ppm end,
    compound_interest    = coalesce(p_compound_interest, compound_interest),
    terms_effective_from = v_from,
    repayment_terms      = case when p_no_fixed_term and coalesce(repayment_terms, '') !~ '(未定|无还款方式)'
                                then coalesce(repayment_terms, '') || v_marker
                                else repayment_terms end,
    updated_at           = now()
  where id = v_l.id;
end $$;

revoke all on function amend_fund_source_from(uuid, date, numeric, integer, boolean, text, boolean, boolean, boolean, numeric) from public, anon;
revoke all on function amend_loan_from(uuid, date, numeric, integer, boolean, text, boolean, boolean, boolean, numeric) from public, anon;
grant execute on function amend_fund_source_from(uuid, date, numeric, integer, boolean, text, boolean, boolean, boolean, numeric) to authenticated, service_role;
grant execute on function amend_loan_from(uuid, date, numeric, integer, boolean, text, boolean, boolean, boolean, numeric) to authenticated, service_role;

-- ── The whole terms (production's bodies, with the amount a month) ─────────────
create or replace function amend_fund_source(p_fund_source_id uuid, p_payload jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role   user_role;
  v_fs     fund_sources%rowtype;
  v_ppm    numeric;
  v_months integer;
begin
  PERFORM public.tab_write_guard(ARRAY['/fund-in'], ARRAY['treasury.approve']);
  v_role := current_user_role();
  IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.approve']) THEN RAISE EXCEPTION 'amend_fund_source: needs Treasury · Approve' USING ERRCODE = '42501';
  end if;
  select * into v_fs from fund_sources where id = p_fund_source_id and status = 'active' for update;
  if not found then
    raise exception 'Fund source % is not active', p_fund_source_id;
  end if;
  -- A fixed amount a month: its months clear the principal the terms in force began on (the whole amount, unless they
  -- were changed before — then what was owed when they began).
  if nullif(p_payload->>'principal_per_month', '') is not null then
    if p_payload ? 'lock_in_months' then
      raise exception 'A fixed amount a month, a number of months or no fixed term — one of them';
    end if;
    v_ppm    := round((p_payload->>'principal_per_month')::numeric, 2);
    v_months := terms_months_for(
      case when v_fs.terms_effective_from is null then v_fs.amount
           else terms_principal_owed('fund_source', v_fs.id, v_fs.terms_effective_from) end,
      v_ppm);
  end if;
  update fund_sources set
    cost_rate           = coalesce((p_payload->>'cost_rate')::numeric, cost_rate),
    lock_in_months      = case when v_ppm is not null then v_months
                               when p_payload ? 'lock_in_months'
                               then nullif(p_payload->>'lock_in_months', '')::int
                               else lock_in_months end,
    principal_per_month = case when v_ppm is not null then v_ppm
                               when p_payload ? 'lock_in_months' then null
                               else principal_per_month end,
    repayment_date      = coalesce((p_payload->>'repayment_date')::date, repayment_date),
    maturity_date       = coalesce((p_payload->>'repayment_date')::date, maturity_date),
    compound_interest   = coalesce((p_payload->>'compound_interest')::boolean, compound_interest),
    notes               = coalesce(p_payload->>'notes', notes),
    updated_at          = now()
  where id = p_fund_source_id;
end $$;

create or replace function amend_loan(p_loan_id uuid, p_payload jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role   user_role;
  v_l      loans%rowtype;
  v_ppm    numeric;
  v_months integer;
begin
  PERFORM public.tab_write_guard(ARRAY['/fund-out'], ARRAY['treasury.approve']);
  v_role := current_user_role();
  IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.approve']) THEN RAISE EXCEPTION 'amend_loan: needs Treasury · Approve' USING ERRCODE = '42501';
  end if;
  select * into v_l from loans where id = p_loan_id and status = 'active' for update;
  if not found then
    raise exception 'Loan % is not active', p_loan_id;
  end if;
  if nullif(p_payload->>'principal_per_month', '') is not null then
    if nullif(p_payload->>'tenure_months', '') is not null then
      raise exception 'A fixed amount a month or a number of months — one, not both';
    end if;
    v_ppm    := round((p_payload->>'principal_per_month')::numeric, 2);
    v_months := terms_months_for(
      case when v_l.terms_effective_from is null then v_l.principal
           else terms_principal_owed('loan', v_l.id, v_l.terms_effective_from) end,
      v_ppm);
  end if;
  update loans set
    effective_rate      = coalesce((p_payload->>'effective_rate')::numeric, effective_rate),
    risk_premium        = coalesce((p_payload->>'effective_rate')::numeric - base_rate, risk_premium),
    tenure_months       = coalesce(v_months, (p_payload->>'tenure_months')::int, tenure_months),
    principal_per_month = case when v_ppm is not null then v_ppm
                               when nullif(p_payload->>'tenure_months', '') is not null then null
                               else principal_per_month end,
    disbursement_date   = coalesce((p_payload->>'disbursement_date')::date, disbursement_date),
    repayment_terms     = coalesce(p_payload->>'repayment_terms', repayment_terms),
    compound_interest   = coalesce((p_payload->>'compound_interest')::boolean, compound_interest),
    updated_at          = now()
  where id = p_loan_id;
end $$;

-- ── Undo the latest change: the amount a month comes back with the rest ───────
create or replace function revert_terms_change(p_record_kind text, p_record_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role user_role;
  v_h    treasury_terms_history%rowtype;
begin
  PERFORM public.tab_write_guard(CASE WHEN p_record_kind = 'loan' THEN ARRAY['/fund-out'] ELSE ARRAY['/fund-in'] END, ARRAY['treasury.approve']);
  v_role := current_user_role();
  IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.approve']) THEN RAISE EXCEPTION 'revert_terms_change: needs Treasury · Approve' USING ERRCODE = '42501';
  end if;
  select * into v_h from treasury_terms_history
   where record_kind = p_record_kind and record_id = p_record_id
   order by valid_from desc limit 1;
  if not found then raise exception 'No terms change to revert'; end if;

  if p_record_kind = 'fund_source' then
    update fund_sources set
      cost_rate            = v_h.rate,
      lock_in_months       = v_h.months,
      principal_per_month  = v_h.principal_per_month,
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
      principal_per_month  = v_h.principal_per_month,
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

-- ── Filed for the Principal ───────────────────────────────────────────────────
drop function if exists file_terms_change(text, uuid, date, numeric, integer, boolean, boolean, boolean, boolean, text, boolean);

create or replace function file_terms_change(
  p_record_kind          text,
  p_record_id            uuid,
  p_effective_from       date,
  p_rate                 numeric default null,
  p_remaining_months     integer default null,
  p_compound_interest    boolean default null,
  p_no_fixed_term        boolean default false,
  p_interest_on_original boolean default false,
  p_interest_keeps_base  boolean default false,
  p_reason               text default null,
  p_whole                boolean default false,
  p_principal_per_month  numeric default null,
  p_open_from            date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_whole     boolean := coalesce(p_whole, false);
  v_from      date;
  v_open      date;
  v_start     date;
  v_first_due date;
  v_seg_from  date;
  v_status    text;
  v_amount    numeric;
  v_base      numeric;
  v_ppm       numeric;
  v_label     text;
  v_summary   text;
  v_request   uuid;
  v_approval  uuid;
begin
  PERFORM public.tab_write_guard(CASE WHEN p_record_kind = 'loan' THEN ARRAY['/fund-out'] ELSE ARRAY['/fund-in'] END, ARRAY['treasury.edit']);
  IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'file_terms_change: needs Treasury · Edit' USING ERRCODE = '42501';
  end if;
  if p_record_kind is null or p_record_kind not in ('loan', 'fund_source') then
    raise exception 'Unknown record kind %', p_record_kind;
  end if;
  if p_effective_from is null and not v_whole then raise exception 'Effective month is required'; end if;
  if p_remaining_months is not null and (p_remaining_months < 1 or p_remaining_months > 120) then
    raise exception 'Remaining months must be 1–120';
  end if;
  if p_rate is not null and (p_rate < 0 or p_rate >= 1) then
    raise exception 'Rate must be between 0 and 100%%';
  end if;
  if coalesce(p_interest_on_original, false) and coalesce(p_interest_keeps_base, false) then
    raise exception 'Interest goes on the original principal or keeps the base it had — one, not both';
  end if;
  if v_whole and (coalesce(p_interest_on_original, false) or coalesce(p_interest_keeps_base, false)) then
    raise exception 'What the interest is charged on is chosen with a change from a later month';
  end if;
  if v_whole and p_record_kind = 'loan' and coalesce(p_no_fixed_term, false) then
    raise exception 'A loan''s fixed term ends with a change from a later month';
  end if;
  if p_principal_per_month is not null then
    if coalesce(p_no_fixed_term, false) or p_remaining_months is not null then
      raise exception 'A fixed amount a month, a number of months or no fixed term — one of them';
    end if;
    if p_principal_per_month <= 0 then raise exception 'The principal a month must be above 0'; end if;
    v_ppm := round(p_principal_per_month, 2);
  end if;
  if p_open_from is not null and coalesce(p_no_fixed_term, false) then
    raise exception 'No fixed term from a later month is for terms that have one until then';
  end if;

  -- The queue's title: who, the deal's [BI#…] / [LO#…] tag where its words carry one, the amount.
  if p_record_kind = 'fund_source' then
    select f.status::text, f.amount, date_trunc('month', f.effective_date)::date, f.repayment_start_month, f.terms_effective_from,
           coalesce(c.name, dp.name, nullif(f.from_freetext_name, ''), d.name, 'Fund source')
             || coalesce(' ' || (regexp_match(coalesce(f.notes, ''), '\[[^\]]{1,24}\]'))[1], '')
             || ' · RM ' || to_char(f.amount, 'FM999,999,990.00')
      into v_status, v_amount, v_start, v_first_due, v_seg_from, v_label
      from fund_sources f
      left join companies c on c.id = f.from_company_id
      left join directors d on d.id = f.from_director_id
      left join departments dp on dp.id = f.from_department_id
     where f.id = p_record_id
       for update of f;
  else
    select l.status::text, l.principal, date_trunc('month', l.disbursement_date)::date, l.repayment_start_month, l.terms_effective_from,
           coalesce(c.name, 'Loan')
             || coalesce(' ' || (regexp_match(coalesce(l.repayment_terms, ''), '\[[^\]]{1,24}\]'))[1], '')
             || ' · RM ' || to_char(l.principal, 'FM999,999,990.00'),
           l.base_rate
      into v_status, v_amount, v_start, v_first_due, v_seg_from, v_label, v_base
      from loans l
      left join companies c on c.id = l.company_id
     where l.id = p_record_id
       for update of l;
  end if;
  if v_status is null then raise exception 'That deal was not found'; end if;
  if v_status <> 'active' then raise exception 'Only an active deal''s terms can change (this one is %)', v_status; end if;
  if v_start is null then raise exception 'The deal has no start date yet'; end if;
  -- A loan's rate never goes under its base rate — amend_loan / amend_loan_from refuse it, so filing it does too.
  if p_rate is not null and v_base is not null and p_rate < v_base then
    raise exception 'Rate % is below the loan''s base rate % (risk premium cannot be negative)',
      round(p_rate * 100, 3)::text || '%', round(v_base * 100, 3)::text || '%';
  end if;

  v_first_due := coalesce(date_trunc('month', v_first_due)::date, (v_start + interval '1 month')::date);
  if v_whole then
    -- The whole terms in force, from the month they began: the first instalment unless they were changed before.
    v_from := coalesce(v_seg_from, v_first_due);
    -- A fixed amount a month clears what those terms began on — the amount itself unless they were changed before.
    if v_ppm is not null then
      perform terms_months_for(case when v_seg_from is null then v_amount else terms_principal_owed(p_record_kind, p_record_id, v_seg_from) end, v_ppm);
    end if;
  else
    v_seg_from := coalesce(v_seg_from, v_first_due);
    v_from := date_trunc('month', p_effective_from)::date;
    if v_from <= v_seg_from then
      raise exception 'Effective month % must be after the month the current terms took effect (%)',
        to_char(v_from, 'YYYY-MM'), to_char(v_seg_from, 'YYYY-MM');
    end if;
    if v_ppm is not null then
      perform terms_months_for(terms_principal_owed(p_record_kind, p_record_id, v_from), v_ppm);
    end if;
  end if;
  if p_open_from is not null then
    v_open := date_trunc('month', p_open_from)::date;
    if v_open <= v_from then
      raise exception 'No fixed term from % has to come after the month the terms start (%)', to_char(v_open, 'YYYY-MM'), to_char(v_from, 'YYYY-MM');
    end if;
  end if;
  if exists (select 1 from treasury_terms_requests
              where record_kind = p_record_kind and record_id = p_record_id and status = 'pending') then
    raise exception 'A terms change for this deal is already waiting for the Principal — withdraw it to file another';
  end if;

  v_summary := case when v_whole then 'whole deal from ' else 'from ' end || to_char(v_from, 'YYYY-MM')
            || coalesce(' · ' || trim(to_char(p_rate * 100, 'FM990.000')) || '%/mo', '')
            || case when coalesce(p_no_fixed_term, false) then ' · no fixed term'
                    when v_ppm is not null then ' · RM ' || to_char(v_ppm, 'FM999,999,990.00') || ' a month'
                    when p_remaining_months is not null and v_whole then ' · ' || p_remaining_months || ' months'
                    when p_remaining_months is not null then ' · ' || p_remaining_months || ' months left'
                    else '' end
            || case when v_open is not null then ' · no fixed term from ' || to_char(v_open, 'YYYY-MM') else '' end
            || case when p_compound_interest is true then ' · compounding'
                    when p_compound_interest is false then ' · not compounding'
                    else '' end
            || case when coalesce(p_interest_on_original, false) then ' · interest on the original principal'
                    when coalesce(p_interest_keeps_base, false) then ' · interest on the principal it was on before'
                    else '' end;

  insert into treasury_terms_requests
    (record_kind, record_id, effective_from, rate, remaining_months, compound_interest, no_fixed_term,
     interest_on_original, interest_keeps_base, reason, status, created_by, whole_deal, principal_per_month, open_from)
  values
    (p_record_kind, p_record_id, v_from, p_rate, case when coalesce(p_no_fixed_term, false) then null else p_remaining_months end,
     p_compound_interest, coalesce(p_no_fixed_term, false), coalesce(p_interest_on_original, false),
     coalesce(p_interest_keeps_base, false), nullif(trim(p_reason), ''), 'pending', auth.uid(), v_whole, v_ppm, v_open)
  returning id into v_request;

  insert into approval_requests
    (request_type, reference_id, reference_table, submitted_by, description, amount, status, workflow_state)
  values
    ('terms_change', p_record_id, case when p_record_kind = 'loan' then 'loans' else 'fund_sources' end, auth.uid(),
     'Change terms · ' || v_label || ' · ' || v_summary, v_amount, 'pending', 'submitted')
  returning id into v_approval;

  update treasury_terms_requests set approval_id = v_approval where id = v_request;
  return v_request;
end $$;

create or replace function approve_terms_change(p_approval_id uuid, p_notes text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_a       approval_requests%rowtype;
  v_r       treasury_terms_requests%rowtype;
  v_by      text;
  v_reason  text;
  v_payload jsonb;
begin
  PERFORM public.tab_write_guard(ARRAY['/approvals'], ARRAY['approvals.approve', 'treasury.approve']);
  IF NOT public.approver_may_request(auth.uid(), p_approval_id) THEN
    RAISE EXCEPTION 'approve_terms_change: you may not decide this request' USING ERRCODE = 'insufficient_privilege';
  END IF;
  select * into v_a from approval_requests where id = p_approval_id for update;
  if not found or v_a.request_type::text <> 'terms_change' then raise exception 'That is not a terms change request'; end if;
  if v_a.status <> 'pending' then raise exception 'That request was already decided'; end if;
  select * into v_r from treasury_terms_requests where approval_id = p_approval_id for update;
  if not found or v_r.status <> 'pending' then raise exception 'That terms change is no longer waiting'; end if;
  select name into v_by from users where id = v_r.created_by;
  v_reason := trim(coalesce(v_r.reason || ' ', '') || '（提交：' || coalesce(v_by, '—') || '）');

  if v_r.whole_deal then
    -- The whole terms, through the amend the Principal's own form runs — only what was asked is sent.
    if v_r.record_kind = 'fund_source' then
      v_payload := jsonb_strip_nulls(jsonb_build_object('cost_rate', v_r.rate, 'compound_interest', v_r.compound_interest,
          'principal_per_month', v_r.principal_per_month))
        || case when v_r.no_fixed_term then jsonb_build_object('lock_in_months', '')
                when v_r.remaining_months is not null then jsonb_build_object('lock_in_months', v_r.remaining_months)
                else '{}'::jsonb end;
      perform amend_fund_source(v_r.record_id, v_payload);
    else
      v_payload := jsonb_strip_nulls(jsonb_build_object('effective_rate', v_r.rate, 'tenure_months', v_r.remaining_months,
        'compound_interest', v_r.compound_interest, 'principal_per_month', v_r.principal_per_month));
      perform amend_loan(v_r.record_id, v_payload);
    end if;
  else
    -- The same amend a direct change runs, as the approver: its own checks and its history row.
    if v_r.record_kind = 'fund_source' then
      perform amend_fund_source_from(v_r.record_id, v_r.effective_from, v_r.rate, v_r.remaining_months, v_r.compound_interest,
        v_reason, v_r.no_fixed_term, v_r.interest_on_original, v_r.interest_keeps_base, v_r.principal_per_month);
    else
      perform amend_loan_from(v_r.record_id, v_r.effective_from, v_r.rate, v_r.remaining_months, v_r.compound_interest,
        v_reason, v_r.no_fixed_term, v_r.interest_on_original, v_r.interest_keeps_base, v_r.principal_per_month);
    end if;
  end if;
  -- No fixed term from a later month: the terms just applied end their fixed term there, the interest kept on the same amount.
  if v_r.open_from is not null then
    if v_r.record_kind = 'fund_source' then
      perform amend_fund_source_from(v_r.record_id, v_r.open_from, null, null, null, v_reason, true, false, true, null);
    else
      perform amend_loan_from(v_r.record_id, v_r.open_from, null, null, null, v_reason, true, false, true, null);
    end if;
  end if;

  update approval_requests
     set status = 'approved', workflow_state = 'approved', approved_by = auth.uid(), approved_at = now(),
         notes = coalesce(nullif(trim(p_notes), ''), notes), updated_at = now()
   where id = p_approval_id;
  update treasury_terms_requests
     set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_notes), '')
   where id = v_r.id;
end $$;

-- The guards the scan reads (tab-write-guards.test.ts), checked against the new signature.
CREATE OR REPLACE FUNCTION pg_temp.tab_guard(p_sig text, p_pages text, p_wants text[])
RETURNS void
LANGUAGE plpgsql AS $g$
DECLARE
  v_line text := format('PERFORM public.tab_write_guard(%s, ARRAY[%s]);', p_pages,
    array_to_string(ARRAY(SELECT quote_literal(w) FROM unnest(p_wants) w), ', '));
BEGIN
  IF position(v_line IN (SELECT prosrc FROM pg_proc WHERE oid = p_sig::regprocedure)) = 0 THEN
    RAISE EXCEPTION '% does not ask its page: % is not in its body', p_sig, v_line;
  END IF;
END
$g$;

SELECT pg_temp.tab_guard('public.file_terms_change(text, uuid, date, numeric, integer, boolean, boolean, boolean, boolean, text, boolean, numeric, date)',
  $$CASE WHEN p_record_kind = 'loan' THEN ARRAY['/fund-out'] ELSE ARRAY['/fund-in'] END$$, ARRAY['treasury.edit']);
SELECT pg_temp.tab_guard('public.approve_terms_change(uuid, text)',
  $$ARRAY['/approvals']$$, ARRAY['approvals.approve', 'treasury.approve']);
SELECT pg_temp.tab_guard('public.revert_terms_change(text, uuid)',
  $$CASE WHEN p_record_kind = 'loan' THEN ARRAY['/fund-out'] ELSE ARRAY['/fund-in'] END$$, ARRAY['treasury.approve']);
SELECT pg_temp.tab_guard('public.amend_fund_source(uuid, jsonb)',
  $$ARRAY['/fund-in']$$, ARRAY['treasury.approve']);
SELECT pg_temp.tab_guard('public.amend_loan(uuid, jsonb)',
  $$ARRAY['/fund-out']$$, ARRAY['treasury.approve']);

revoke all on function file_terms_change(text, uuid, date, numeric, integer, boolean, boolean, boolean, boolean, text, boolean, numeric, date) from public, anon;
revoke all on function approve_terms_change(uuid, text) from public, anon;
revoke all on function amend_fund_source(uuid, jsonb) from public, anon;
revoke all on function amend_loan(uuid, jsonb) from public, anon;
grant execute on function file_terms_change(text, uuid, date, numeric, integer, boolean, boolean, boolean, boolean, text, boolean, numeric, date) to authenticated, service_role;
grant execute on function approve_terms_change(uuid, text) to authenticated, service_role;
grant execute on function amend_fund_source(uuid, jsonb) to authenticated, service_role;
grant execute on function amend_loan(uuid, jsonb) to authenticated, service_role;
