-- Months asked of a loan without a fixed term make it fixed — the months it already holds too (2026-11-13, the user on
-- The Cont LO#7, 51 months filed over the 51 it holds, the banner still "no fixed term": "这个还是一样？").
-- 20261113100000 left the loan as it was when the whole terms asked the months it held, taking them for the form
-- re-sending them; the form sends months only when Repayment type › A number of months was picked, so that was wrong.

create or replace function amend_loan(p_loan_id uuid, p_payload jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role   user_role;
  v_l      loans%rowtype;
  v_ppm    numeric;
  v_months integer;
  v_fixed  boolean;
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
  -- A loan without a fixed term asked a number of months (or an amount a month) is fixed from now on (2026-11-13,
  -- "填月数就转"): its words lose what said so — unless the words themselves were sent. Months are sent only when
  -- Repayment type › A number of months was picked, so the months the loan already holds count too (LO#7's 51).
  v_fixed := coalesce(v_l.repayment_terms, '') ~ '(未定|无还款方式)'
             and p_payload->>'repayment_terms' is null
             and (v_ppm is not null
                  or nullif(p_payload->>'tenure_months', '') is not null);
  update loans set
    effective_rate      = coalesce((p_payload->>'effective_rate')::numeric, effective_rate),
    risk_premium        = coalesce((p_payload->>'effective_rate')::numeric - base_rate, risk_premium),
    tenure_months       = coalesce(v_months, (p_payload->>'tenure_months')::int, tenure_months),
    principal_per_month = case when v_ppm is not null then v_ppm
                               when nullif(p_payload->>'tenure_months', '') is not null then null
                               else principal_per_month end,
    disbursement_date   = coalesce((p_payload->>'disbursement_date')::date, disbursement_date),
    repayment_terms     = case when v_fixed then public.terms_words_fixed(repayment_terms)
                               else coalesce(p_payload->>'repayment_terms', repayment_terms) end,
    compound_interest   = coalesce((p_payload->>'compound_interest')::boolean, compound_interest),
    updated_at          = now()
  where id = p_loan_id;
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

SELECT pg_temp.tab_guard('public.amend_loan(uuid, jsonb)',
  $$ARRAY['/fund-out']$$, ARRAY['treasury.approve']);
