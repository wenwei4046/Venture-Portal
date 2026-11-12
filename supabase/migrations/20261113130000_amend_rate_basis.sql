-- Amend terms may take the rate per year (2026-11-13, the user: "要可以年息" on the sample
-- mockups/amend-annual-rate-mockup.html, A — "当年息显示"). Until now a deal's rate was amended in the basis it was agreed
-- in; now Rate has Per month / Per year, and a deal amended per year is said per year from then on ("12.000% /yr ·
-- 1.000% /mo"). The maths is untouched: the stored rate is always the month's (mig 20261104190000).
--   · set_deal_rate_basis — the Principal's own change (Treasury · Approve), after the amend itself.
--   · treasury_terms_requests.rate_basis + set_terms_request_rate_basis — a change Finance files says how its rate was
--     typed (the one who filed it, while it waits); approve_terms_change writes it onto the deal with the terms.
-- A deal's basis is only how its rate is said — Revert leaves it as it is.

ALTER TABLE public.treasury_terms_requests ADD COLUMN IF NOT EXISTS rate_basis text
  CONSTRAINT treasury_terms_requests_rate_basis_valid CHECK (rate_basis IS NULL OR rate_basis IN ('month', 'year'));

create or replace function public.set_deal_rate_basis(p_record_kind text, p_record_id uuid, p_basis text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  PERFORM public.tab_write_guard(CASE WHEN p_record_kind = 'loan' THEN ARRAY['/fund-out'] ELSE ARRAY['/fund-in'] END, ARRAY['treasury.approve']);
  IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['treasury.approve']) THEN
    RAISE EXCEPTION 'set_deal_rate_basis: needs Treasury · Approve' USING ERRCODE = '42501';
  END IF;
  if p_basis is null or p_basis not in ('month', 'year') then raise exception 'A rate is per month or per year'; end if;
  if p_record_kind = 'loan' then
    update loans set rate_basis = p_basis, updated_at = now() where id = p_record_id and status = 'active';
  elsif p_record_kind = 'fund_source' then
    update fund_sources set rate_basis = p_basis, updated_at = now() where id = p_record_id and status = 'active';
  else
    raise exception 'Unknown record kind %', p_record_kind;
  end if;
  if not found then raise exception 'That deal was not found, or is not active'; end if;
end $$;

create or replace function public.set_terms_request_rate_basis(p_record_kind text, p_request uuid, p_basis text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  PERFORM public.tab_write_guard(CASE WHEN p_record_kind = 'loan' THEN ARRAY['/fund-out'] ELSE ARRAY['/fund-in'] END, ARRAY['treasury.edit']);
  IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['treasury.edit']) THEN
    RAISE EXCEPTION 'set_terms_request_rate_basis: needs Treasury · Edit' USING ERRCODE = '42501';
  END IF;
  if p_basis is not null and p_basis not in ('month', 'year') then raise exception 'A rate is per month or per year'; end if;
  update treasury_terms_requests set rate_basis = p_basis
   where id = p_request and record_kind = p_record_kind and status = 'pending' and created_by = auth.uid();
  if not found then raise exception 'That terms change is not yours, or no longer waiting'; end if;
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

  -- The rate typed per month or per year (2026-11-13, "要可以年息" → A): the deal is said that way from now on.
  if v_r.rate_basis is not null then
    if v_r.record_kind = 'fund_source' then
      update fund_sources set rate_basis = v_r.rate_basis where id = v_r.record_id;
    else
      update loans set rate_basis = v_r.rate_basis where id = v_r.record_id;
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

SELECT pg_temp.tab_guard('public.set_deal_rate_basis(text, uuid, text)',
  $$CASE WHEN p_record_kind = 'loan' THEN ARRAY['/fund-out'] ELSE ARRAY['/fund-in'] END$$, ARRAY['treasury.approve']);
SELECT pg_temp.tab_guard('public.set_terms_request_rate_basis(text, uuid, text)',
  $$CASE WHEN p_record_kind = 'loan' THEN ARRAY['/fund-out'] ELSE ARRAY['/fund-in'] END$$, ARRAY['treasury.edit']);
SELECT pg_temp.tab_guard('public.approve_terms_change(uuid, text)',
  $$ARRAY['/approvals']$$, ARRAY['approvals.approve', 'treasury.approve']);

revoke all on function public.set_deal_rate_basis(text, uuid, text) from public, anon;
revoke all on function public.set_terms_request_rate_basis(text, uuid, text) from public, anon;
grant execute on function public.set_deal_rate_basis(text, uuid, text) to authenticated, service_role;
grant execute on function public.set_terms_request_rate_basis(text, uuid, text) to authenticated, service_role;
