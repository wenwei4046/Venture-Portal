-- 「从某月起生效」 — change a loan's / fund source's rate, remaining months or
-- compounding from a chosen month WITHOUT re-stating the months before it
-- (user 2026-09-21). Until now amend_loan / amend_fund_source rewrote the one
-- set of terms every engine reads from day one.
--
-- Model: the record's own columns always hold the terms in force NOW;
-- treasury_terms_history keeps each earlier segment with the months it
-- governed (valid_from .. valid_to, inclusive, month-starts). `terms_effective_from`
-- on the record = the month the current terms took effect (null = day one).
-- lib/treasury-terms.ts turns the two into segments: a later segment is
-- re-based on the principal ACTUALLY still owed at its first month.
--
-- Nothing recorded moves (PVs, repayment rows, GL). Principal-only, like the
-- whole-life amends.

create table if not exists treasury_terms_history (
  id                 uuid primary key default gen_random_uuid(),
  record_kind        text not null check (record_kind in ('loan', 'fund_source')),
  record_id          uuid not null,
  valid_from         date not null,                 -- first installment month governed
  valid_to           date not null,                 -- last month governed (inclusive)
  rate               numeric(12, 6) not null,
  months             integer,                       -- the segment's installment count from valid_from; null = no fixed term
  compound_interest  boolean not null default false,
  was_effective_from date,                          -- record.terms_effective_from while this segment was current (null = original terms)
  was_maturity_date  date,                          -- fund_sources.maturity_date at the time (restored on revert)
  reason             text,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  check (valid_to >= valid_from)
);
create index if not exists treasury_terms_history_record_idx on treasury_terms_history (record_kind, record_id, valid_from);

alter table treasury_terms_history enable row level security;
drop policy if exists tth_select on treasury_terms_history;
create policy tth_select on treasury_terms_history for select using ((select has_scope(array['treasury'::text])));
-- No direct insert / update / delete: the RPCs below (security definer) are the only writers.

alter table loans        add column if not exists terms_effective_from date;
alter table fund_sources add column if not exists terms_effective_from date;
comment on column loans.terms_effective_from        is 'Month (1st) the current effective_rate / tenure_months / compound took effect; null = unchanged since disbursement. Earlier segments: treasury_terms_history.';
comment on column fund_sources.terms_effective_from is 'Month (1st) the current cost_rate / lock_in_months / compound took effect; null = unchanged since the effective date. Earlier segments: treasury_terms_history.';

-- Whole months from a to b (b >= a), counting month starts.
create or replace function terms_months_between(a date, b date)
returns integer language sql immutable as $$
  select (extract(year from b)::int - extract(year from a)::int) * 12 + (extract(month from b)::int - extract(month from a)::int)
$$;

create or replace function amend_fund_source_from(
  p_fund_source_id    uuid,
  p_effective_from    date,
  p_cost_rate         numeric,
  p_remaining_months  integer,
  p_compound_interest boolean,
  p_reason            text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role        user_role;
  v_fs          fund_sources%rowtype;
  v_from        date;   -- X (month start)
  v_start       date;   -- the record's month
  v_first_due   date;   -- first installment month
  v_seg_from    date;   -- first month of the CURRENT segment (installment space)
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

  -- Months the current plan still had from X, when the caller keeps the end month.
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
    lock_in_months       = coalesce(p_remaining_months, v_months),
    compound_interest    = coalesce(p_compound_interest, compound_interest),
    terms_effective_from = v_from,
    -- Only a deal that already carried a maturity keeps one (mark_matured_fund_sources flips status on it).
    maturity_date        = case when maturity_date is not null and coalesce(p_remaining_months, v_months) is not null
                                then (v_from + (coalesce(p_remaining_months, v_months) || ' months')::interval)::date
                                else maturity_date end,
    updated_at           = now()
  where id = v_fs.id;
end $$;

create or replace function amend_loan_from(
  p_loan_id           uuid,
  p_effective_from    date,
  p_effective_rate    numeric,
  p_remaining_months  integer,
  p_compound_interest boolean,
  p_reason            text
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
    (record_kind, record_id, valid_from, valid_to, rate, months, compound_interest, was_effective_from, reason, created_by)
  values
    ('loan', v_l.id, v_seg_from, (v_from - interval '1 month')::date,
     v_l.effective_rate, v_l.tenure_months, coalesce(v_l.compound_interest, false), v_l.terms_effective_from,
     nullif(trim(p_reason), ''), auth.uid());

  update loans set
    effective_rate       = coalesce(p_effective_rate, effective_rate),
    risk_premium         = coalesce(p_effective_rate - base_rate, risk_premium),
    tenure_months        = coalesce(p_remaining_months, v_months, tenure_months),
    compound_interest    = coalesce(p_compound_interest, compound_interest),
    terms_effective_from = v_from,
    updated_at           = now()
  where id = v_l.id;
end $$;

-- Undo the most recent change: the latest history segment becomes the current
-- terms again and its row is removed. Principal-only.
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
      updated_at           = now()
    where id = p_record_id;
  else
    raise exception 'Unknown record kind %', p_record_kind;
  end if;
  delete from treasury_terms_history where id = v_h.id;
end $$;

grant execute on function amend_fund_source_from(uuid, date, numeric, integer, boolean, text) to authenticated;
grant execute on function amend_loan_from(uuid, date, numeric, integer, boolean, text) to authenticated;
grant execute on function revert_terms_change(text, uuid) to authenticated;
grant execute on function terms_months_between(date, date) to authenticated;

-- (Applied live as two steps on 2026-09-21 — terms_effective_from, then
--  terms_effective_from_maturity_fix which added was_maturity_date and the
--  maturity handling above; this file is the merged final state.)
