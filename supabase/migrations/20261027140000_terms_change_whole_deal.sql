-- Finance files a change of the WHOLE terms too (user 2026-10-26: "我也可能从第一笔就要开始重新算过啊" → mockup
-- terms-first-month-mockup.html → "照这个样稿做：名字用 “From the first instalment” 和 “From a later month”，Finance
-- 提交时不改 Repayment start"). Until now Treasury · Edit could only file a change from a later month
-- (file_terms_change refuses a month at or before the one the terms in force began); recalculating the whole terms —
-- from the first instalment, or from when the terms in force began if they were changed before — was the Principal's
-- alone (amend_fund_source / amend_loan, "整条重算"). Now Finance files it as well; it waits in Approvals like any filed
-- change and the Principal's approval applies it through the same whole-terms amend the Principal's own form runs.
--
--   treasury_terms_requests.whole_deal   the request recalculates the terms in force from when they began (its
--                                        effective_from), instead of starting new terms from a later month. Its
--                                        remaining_months are then the terms' periods (a loan's tenure, a fund
--                                        source's periods); no_fixed_term ends a fund source's fixed term. The
--                                        interest's-base switches belong to a later month and stay false.
--   file_terms_change(..., p_whole)      the whole terms: no month check (the month is the one the terms in force
--                                        began), the switches refused, a loan's fixed term not ended this way (its
--                                        no-fixed-term lives in its repayment terms' words — from a later month).
--   approve_terms_change                 a whole-terms request applies through amend_fund_source / amend_loan with
--                                        only what was asked: the rate, the periods (or none), compounding.

alter table treasury_terms_requests add column if not exists whole_deal boolean not null default false;
alter table treasury_terms_requests drop constraint if exists treasury_terms_requests_whole_switches;
alter table treasury_terms_requests add constraint treasury_terms_requests_whole_switches
  check (not whole_deal or (not interest_on_original and not interest_keeps_base));

-- The signature grows a parameter: the old one goes, so a call naming p_whole cannot reach a stale overload.
drop function if exists file_terms_change(text, uuid, date, numeric, integer, boolean, boolean, boolean, boolean, text);

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
  p_whole                boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_whole     boolean := coalesce(p_whole, false);
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
  v_seg_from  := coalesce(v_seg_from, v_first_due);
  if v_whole then
    -- The whole terms in force, from the month they began: the first instalment unless they were changed before.
    v_from := v_seg_from;
  else
    v_from := date_trunc('month', p_effective_from)::date;
    if v_from <= v_seg_from then
      raise exception 'Effective month % must be after the month the current terms took effect (%)',
        to_char(v_from, 'YYYY-MM'), to_char(v_seg_from, 'YYYY-MM');
    end if;
  end if;
  if exists (select 1 from treasury_terms_requests
              where record_kind = p_record_kind and record_id = p_record_id and status = 'pending') then
    raise exception 'A terms change for this deal is already waiting for the Principal — withdraw it to file another';
  end if;

  v_summary := case when v_whole then 'whole deal from ' else 'from ' end || to_char(v_from, 'YYYY-MM')
            || coalesce(' · ' || trim(to_char(p_rate * 100, 'FM990.000')) || '%/mo', '')
            || case when coalesce(p_no_fixed_term, false) then ' · no fixed term'
                    when p_remaining_months is not null and v_whole then ' · ' || p_remaining_months || ' months'
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
     interest_on_original, interest_keeps_base, reason, status, created_by, whole_deal)
  values
    (p_record_kind, p_record_id, v_from, p_rate, case when coalesce(p_no_fixed_term, false) then null else p_remaining_months end,
     p_compound_interest, coalesce(p_no_fixed_term, false), coalesce(p_interest_on_original, false),
     coalesce(p_interest_keeps_base, false), nullif(trim(p_reason), ''), 'pending', auth.uid(), v_whole)
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

  if v_r.whole_deal then
    -- The whole terms, through the amend the Principal's own form runs — only what was asked is sent.
    if v_r.record_kind = 'fund_source' then
      v_payload := jsonb_strip_nulls(jsonb_build_object('cost_rate', v_r.rate, 'compound_interest', v_r.compound_interest))
        || case when v_r.no_fixed_term then jsonb_build_object('lock_in_months', '')
                when v_r.remaining_months is not null then jsonb_build_object('lock_in_months', v_r.remaining_months)
                else '{}'::jsonb end;
      perform amend_fund_source(v_r.record_id, v_payload);
    else
      v_payload := jsonb_strip_nulls(jsonb_build_object('effective_rate', v_r.rate, 'tenure_months', v_r.remaining_months,
        'compound_interest', v_r.compound_interest));
      perform amend_loan(v_r.record_id, v_payload);
    end if;
  else
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

SELECT pg_temp.tab_guard('public.file_terms_change(text, uuid, date, numeric, integer, boolean, boolean, boolean, boolean, text, boolean)',
  $$CASE WHEN p_record_kind = 'loan' THEN ARRAY['/fund-out'] ELSE ARRAY['/fund-in'] END$$, ARRAY['treasury.edit']);
SELECT pg_temp.tab_guard('public.approve_terms_change(uuid, text)',
  $$ARRAY['/approvals']$$, ARRAY['approvals.approve', 'treasury.approve']);

revoke all on function file_terms_change(text, uuid, date, numeric, integer, boolean, boolean, boolean, boolean, text, boolean) from public, anon;
revoke all on function approve_terms_change(uuid, text) from public, anon;
grant execute on function file_terms_change(text, uuid, date, numeric, integer, boolean, boolean, boolean, boolean, text, boolean) to authenticated, service_role;
grant execute on function approve_terms_change(uuid, text) to authenticated, service_role;
