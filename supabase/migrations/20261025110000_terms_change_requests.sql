-- A terms change filed for the Principal (user 2026-10-24: "finance manager 可以改条款，但是经过principal approve
-- 不就可以了？" → shown it as filed / approved / applied → "可以"). Amend terms needs Treasury · Approve, which is also
-- what approves vouchers, loans and fund sources — so Finance (Treasury · Edit) could not change a deal's terms at
-- all. Now Finance files the change; it waits in Approvals; the Principal approves it and only then is it applied,
-- by the same amend_fund_source_from / amend_loan_from a direct change runs. One person files, another approves.
--
--   treasury_terms_requests   what was asked: the deal, the month, the rate / months left / no fixed term / the
--                             interest's base, the reason; pending → approved | rejected | withdrawn. At most one
--                             pending per deal. Read as treasury_terms_history is (Treasury scope); written only
--                             by the RPCs below.
--   approval_requests         one row per request, request_type 'terms_change', referencing the DEAL (fund_sources
--                             / loans) so the queue opens it; the request row keeps its approval_id. The type has
--                             no domain (approval_domain() leaves it NULL), so only the queue's own Approve — the
--                             Principal — decides it, and never on their own filing unless the owner kind.
--   file_terms_change         Treasury · Edit. Checks the change as the amend would (an active deal, a month after
--                             the current terms', the ranges, one interest base, a loan's base rate), refuses a
--                             second pending one.
--   approve_terms_change      the approver: applies the change through the amend RPC and marks both rows approved
--                             in one transaction — if the amend refuses, nothing is approved. The history row's
--                             reason carries who filed it; its created_by is the approver.
--   reject_terms_change       the approver: both rows rejected, the note kept; the deal untouched.
--   withdraw_terms_change     whoever filed it (or the queue's Approve): the request withdrawn, its approval closed.

alter type approval_request_type add value if not exists 'terms_change';

create table if not exists treasury_terms_requests (
  id                   uuid primary key default gen_random_uuid(),
  record_kind          text not null check (record_kind in ('loan', 'fund_source')),
  record_id            uuid not null,
  effective_from       date not null,                  -- the month the change takes effect (a month start)
  rate                 numeric(12, 6),                 -- null = the rate as it is
  remaining_months     integer,                        -- null = the end month as it is
  compound_interest    boolean,                        -- null = as it is
  no_fixed_term        boolean not null default false,
  interest_on_original boolean not null default false,
  interest_keeps_base  boolean not null default false,
  reason               text,
  status               text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  approval_id          uuid references approval_requests (id),
  created_by           uuid,
  created_at           timestamptz not null default now(),
  decided_by           uuid,
  decided_at           timestamptz,
  decision_note        text,
  check (not (interest_on_original and interest_keeps_base))
);
create unique index if not exists treasury_terms_requests_one_pending
  on treasury_terms_requests (record_kind, record_id) where status = 'pending';
create index if not exists treasury_terms_requests_record_idx on treasury_terms_requests (record_kind, record_id, created_at desc);
create index if not exists treasury_terms_requests_approval_idx on treasury_terms_requests (approval_id);

alter table treasury_terms_requests enable row level security;
drop policy if exists ttr_select on treasury_terms_requests;
create policy ttr_select on treasury_terms_requests for select using ((select has_scope(array['treasury'::text])));
-- No insert / update / delete policy: the RPCs below (security definer) are the only writers — and the signed in
-- are given the read alone (the schema's default privileges would hand them every write).
revoke all on treasury_terms_requests from public, anon, authenticated;
grant select on treasury_terms_requests to authenticated;

-- The database asks for the action too (permission_table_reads): the deal's page reads it (Treasury · View), Amend
-- terms (· Edit, · Approve); the Approvals request reads it for whoever may.
INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('treasury_terms_requests', ARRAY['treasury.approve', 'treasury.edit', 'treasury.view'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;

SELECT public.permission_reads_guard('treasury_terms_requests');

-- A record already, like the history it feeds: not kept twice.
SELECT public.audit_register('treasury_terms_requests', 'Loan and fund terms changes filed', 'Treasury', '{}', 'none',
  p_reason => 'A deal''s terms change Finance files for the Principal; its approval request and the change it makes to the deal are recorded.');

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
  p_reason               text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_from      date;
  v_start     date;
  v_first_due date;
  v_seg_from  date;
  v_status    text;
  v_amount    numeric;
  v_base      numeric;
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
  if p_effective_from is null then raise exception 'Effective month is required'; end if;
  if p_remaining_months is not null and (p_remaining_months < 1 or p_remaining_months > 120) then
    raise exception 'Remaining months must be 1–120';
  end if;
  if p_rate is not null and (p_rate < 0 or p_rate >= 1) then
    raise exception 'Rate must be between 0 and 100%%';
  end if;
  if coalesce(p_interest_on_original, false) and coalesce(p_interest_keeps_base, false) then
    raise exception 'Interest goes on the original principal or keeps the base it had — one, not both';
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
  -- A loan's rate never goes under its base rate — amend_loan_from refuses it, so filing it does too.
  if p_rate is not null and v_base is not null and p_rate < v_base then
    raise exception 'Rate % is below the loan''s base rate % (risk premium cannot be negative)',
      round(p_rate * 100, 3)::text || '%', round(v_base * 100, 3)::text || '%';
  end if;

  v_from      := date_trunc('month', p_effective_from)::date;
  v_first_due := coalesce(date_trunc('month', v_first_due)::date, (v_start + interval '1 month')::date);
  v_seg_from  := coalesce(v_seg_from, v_first_due);
  if v_from <= v_seg_from then
    raise exception 'Effective month % must be after the month the current terms took effect (%)',
      to_char(v_from, 'YYYY-MM'), to_char(v_seg_from, 'YYYY-MM');
  end if;
  if exists (select 1 from treasury_terms_requests
              where record_kind = p_record_kind and record_id = p_record_id and status = 'pending') then
    raise exception 'A terms change for this deal is already waiting for the Principal — withdraw it to file another';
  end if;

  v_summary := 'from ' || to_char(v_from, 'YYYY-MM')
            || coalesce(' · ' || trim(to_char(p_rate * 100, 'FM990.000')) || '%/mo', '')
            || case when coalesce(p_no_fixed_term, false) then ' · no fixed term'
                    when p_remaining_months is not null then ' · ' || p_remaining_months || ' months left'
                    else '' end
            || case when p_compound_interest is true then ' · compounding'
                    when p_compound_interest is false then ' · not compounding'
                    else '' end
            || case when coalesce(p_interest_on_original, false) then ' · interest on the original principal'
                    when coalesce(p_interest_keeps_base, false) then ' · interest on the principal it was on before'
                    else '' end;

  insert into treasury_terms_requests
    (record_kind, record_id, effective_from, rate, remaining_months, compound_interest, no_fixed_term,
     interest_on_original, interest_keeps_base, reason, status, created_by)
  values
    (p_record_kind, p_record_id, v_from, p_rate, case when coalesce(p_no_fixed_term, false) then null else p_remaining_months end,
     p_compound_interest, coalesce(p_no_fixed_term, false), coalesce(p_interest_on_original, false),
     coalesce(p_interest_keeps_base, false), nullif(trim(p_reason), ''), 'pending', auth.uid())
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
  v_a  approval_requests%rowtype;
  v_r  treasury_terms_requests%rowtype;
  v_by text;
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

  -- The same amend a direct change runs, as the approver: its own checks and its history row.
  if v_r.record_kind = 'fund_source' then
    perform amend_fund_source_from(v_r.record_id, v_r.effective_from, v_r.rate, v_r.remaining_months, v_r.compound_interest,
      trim(coalesce(v_r.reason || ' ', '') || '（提交：' || coalesce(v_by, '—') || '）'),
      v_r.no_fixed_term, v_r.interest_on_original, v_r.interest_keeps_base);
  else
    perform amend_loan_from(v_r.record_id, v_r.effective_from, v_r.rate, v_r.remaining_months, v_r.compound_interest,
      trim(coalesce(v_r.reason || ' ', '') || '（提交：' || coalesce(v_by, '—') || '）'),
      v_r.no_fixed_term, v_r.interest_on_original, v_r.interest_keeps_base);
  end if;

  update approval_requests
     set status = 'approved', workflow_state = 'approved', approved_by = auth.uid(), approved_at = now(),
         notes = coalesce(nullif(trim(p_notes), ''), notes), updated_at = now()
   where id = p_approval_id;
  update treasury_terms_requests
     set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_notes), '')
   where id = v_r.id;
end $$;

create or replace function reject_terms_change(p_approval_id uuid, p_notes text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_a approval_requests%rowtype;
  v_r treasury_terms_requests%rowtype;
begin
  PERFORM public.tab_write_guard(ARRAY['/approvals'], ARRAY['approvals.approve', 'treasury.approve']);
  IF NOT public.approver_may_request(auth.uid(), p_approval_id) THEN
    RAISE EXCEPTION 'reject_terms_change: you may not decide this request' USING ERRCODE = 'insufficient_privilege';
  END IF;
  select * into v_a from approval_requests where id = p_approval_id for update;
  if not found or v_a.request_type::text <> 'terms_change' then raise exception 'That is not a terms change request'; end if;
  if v_a.status <> 'pending' then raise exception 'That request was already decided'; end if;
  select * into v_r from treasury_terms_requests where approval_id = p_approval_id for update;
  if not found or v_r.status <> 'pending' then raise exception 'That terms change is no longer waiting'; end if;

  update approval_requests
     set status = 'rejected', workflow_state = 'rejected', approved_by = auth.uid(), approved_at = now(),
         notes = coalesce(nullif(trim(p_notes), ''), notes), updated_at = now()
   where id = p_approval_id;
  update treasury_terms_requests
     set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_notes), '')
   where id = v_r.id;
end $$;

create or replace function withdraw_terms_change(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_r treasury_terms_requests%rowtype;
begin
  select * into v_r from treasury_terms_requests where id = p_request_id for update;
  if not found then raise exception 'That terms change was not found'; end if;
  PERFORM public.tab_write_guard(CASE WHEN v_r.record_kind = 'loan' THEN ARRAY['/fund-out'] ELSE ARRAY['/fund-in'] END, ARRAY['treasury.edit', 'treasury.approve']);
  IF auth.uid() IS NOT NULL
     AND v_r.created_by IS DISTINCT FROM auth.uid()
     AND NOT public.has_any_action(ARRAY['approvals.approve']) THEN
    RAISE EXCEPTION 'withdraw_terms_change: only whoever filed it, or the Principal, may withdraw it' USING ERRCODE = '42501';
  END IF;
  if v_r.status <> 'pending' then raise exception 'That terms change is no longer waiting'; end if;

  update treasury_terms_requests
     set status = 'withdrawn', decided_by = auth.uid(), decided_at = now()
   where id = v_r.id;
  update approval_requests
     set status = 'rejected', workflow_state = 'rejected', approved_by = auth.uid(), approved_at = now(),
         notes = case when v_r.created_by is not distinct from auth.uid() then 'Withdrawn by whoever filed it' else 'Withdrawn by the Principal' end,
         updated_at = now()
   where id = v_r.approval_id and status = 'pending';
end $$;

-- The guards the scan reads (tab-write-guards.test.ts): each write asks the pages in the database that the app's gate
-- in front of it names — the deal's own (Fund IN / Fund OUT) to file and withdraw, Approvals to decide. The bodies
-- above carry them already; this only checks they are there.
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

SELECT pg_temp.tab_guard('public.file_terms_change(text, uuid, date, numeric, integer, boolean, boolean, boolean, boolean, text)',
  $$CASE WHEN p_record_kind = 'loan' THEN ARRAY['/fund-out'] ELSE ARRAY['/fund-in'] END$$, ARRAY['treasury.edit']);
SELECT pg_temp.tab_guard('public.withdraw_terms_change(uuid)',
  $$CASE WHEN v_r.record_kind = 'loan' THEN ARRAY['/fund-out'] ELSE ARRAY['/fund-in'] END$$, ARRAY['treasury.edit', 'treasury.approve']);
SELECT pg_temp.tab_guard('public.approve_terms_change(uuid, text)',
  $$ARRAY['/approvals']$$, ARRAY['approvals.approve', 'treasury.approve']);
SELECT pg_temp.tab_guard('public.reject_terms_change(uuid, text)',
  $$ARRAY['/approvals']$$, ARRAY['approvals.approve', 'treasury.approve']);

revoke all on function file_terms_change(text, uuid, date, numeric, integer, boolean, boolean, boolean, boolean, text) from public, anon;
revoke all on function approve_terms_change(uuid, text) from public, anon;
revoke all on function reject_terms_change(uuid, text) from public, anon;
revoke all on function withdraw_terms_change(uuid) from public, anon;
grant execute on function file_terms_change(text, uuid, date, numeric, integer, boolean, boolean, boolean, boolean, text) to authenticated, service_role;
grant execute on function approve_terms_change(uuid, text) to authenticated, service_role;
grant execute on function reject_terms_change(uuid, text) to authenticated, service_role;
grant execute on function withdraw_terms_change(uuid) to authenticated, service_role;
