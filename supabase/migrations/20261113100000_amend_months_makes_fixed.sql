-- A number of months asked of a loan without a fixed term makes it fixed (2026-11-13, the user on The Cont LO#6's
-- Amend terms — 60 months filed, the banner read "no fixed term": "我记得我fixed term 了不是？" → "改，填月数就转").
-- Until now a loan whose words said 未定 / 无还款方式 stayed without a fixed term whatever was asked (#808).
--   · amend_loan (the whole terms — the Principal's own and an approved filing): months other than the ones the loan
--     sits on, or an amount a month, take those words out (unless new words were sent). Months equal to the loan's own
--     (the form sends them unchanged) leave it as it is, so a filing that only re-sent them changes nothing.
--   · amend_loan_from (from a later month): months or an amount a month asked take them out from that month; the
--     history row keeps the words for the months before.
-- terms_words_fixed: the words without 未定还款 / (未定还款) / 未定还款(自 YYYY-MM 起) / 原表无还款方式 / 无还款方式; any other 未定 reads 已定 (利息/期数/方式已定).

create or replace function public.terms_words_fixed(p_words text)
returns text
language sql immutable set search_path = public as $$
  select nullif(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p_words, ''),
           '未定还款\(自 [0-9]{4}-[0-9]{2} 起\)', '', 'g'),
           '[(（]未定还款[)）]', '', 'g'),
           '原表无还款方式|无还款方式|未定还款', '', 'g'),
           '未定', '已定', 'g'),
           '(\s*·\s*)+', ' · ', 'g'),
           '^\s*·\s*|\s*·\s*$', '', 'g')), '')
$$;
revoke all on function public.terms_words_fixed(text) from public, anon;
grant execute on function public.terms_words_fixed(text) to authenticated, service_role;

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
    -- A number of months (or an amount a month) asked of a loan without a fixed term makes it fixed from the month
    -- (2026-11-13, "填月数就转"): its words lose what said so; the history row above keeps them for the months before.
    repayment_terms      = case when p_no_fixed_term and coalesce(repayment_terms, '') !~ '(未定|无还款方式)'
                                then coalesce(repayment_terms, '') || v_marker
                                when v_open and not coalesce(p_no_fixed_term, false)
                                     and (p_remaining_months is not null or p_principal_per_month is not null)
                                then public.terms_words_fixed(repayment_terms)
                                else repayment_terms end,
    updated_at           = now()
  where id = v_l.id;
end $$;

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
  -- A loan without a fixed term asked a number of months other than the one it sits on (or an amount a month) is fixed
  -- from now on (2026-11-13, "填月数就转"): its words lose what said so — unless the words themselves were sent.
  v_fixed := coalesce(v_l.repayment_terms, '') ~ '(未定|无还款方式)'
             and p_payload->>'repayment_terms' is null
             and (v_ppm is not null
                  or (nullif(p_payload->>'tenure_months', '') is not null
                      and (p_payload->>'tenure_months')::int is distinct from v_l.tenure_months));
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
SELECT pg_temp.tab_guard('public.amend_loan_from(uuid, date, numeric, integer, boolean, text, boolean, boolean, boolean, numeric)',
  $$ARRAY['/fund-out']$$, ARRAY['treasury.approve']);
