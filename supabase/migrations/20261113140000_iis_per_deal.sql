-- Interest in suspense, one account per deal (2026-11-13 — docs/superpowers/specs/2026-11-13-iis-per-deal-design.md;
-- the user's method, memory iis-method-decided; the catch-up preview confirmed: "改损益的地方没有问题", "感觉是对的",
-- "直接做完 … 做完就merge").
--
--   · Every live deal gets its own account under its counterparty account and, when it bears interest, an IIS account
--     under its counterparty's interest-in-suspense account. Codes are four digits in their type's range (the chart's
--     rule): a loan in suspense 3100-3399 (not: 3400-3499), its IIS 3500-3899; a fund source in suspense 4300-4599
--     (not: 4600-4699), its IIS 4700-4999 — the next free one, so a code says where its interest goes;
--     the parent (3053, 3063, 4056, 4064 …) groups them. A loan keeps
--     them in loans.gl_account_code / iis_account_code; a fund source's own account is its account_code, its IIS
--     iis_account_code.
--   · ensure_deal_accounts gives a deal its accounts — at go-live for the live ones (parked: not yet under their
--     counterparty, which keeps posting until the catch-up has emptied it), then for each new deal once live.
--   · iis_post writes the month-end run's (and the catch-up's) entries and remembers in iis_postings what went into
--     suspense and what left it, so a run posts only what is new.
--   · A fund contra posts to the deals' own accounts once they have them.
-- No existing entry is changed; the opening balance stays as it is (the user: "不想弄乱").

ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS gl_account_code varchar REFERENCES public.chart_of_accounts(code);
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS iis_account_code varchar REFERENCES public.chart_of_accounts(code);
ALTER TABLE public.fund_sources ADD COLUMN IF NOT EXISTS iis_account_code varchar REFERENCES public.chart_of_accounts(code);
COMMENT ON COLUMN public.loans.gl_account_code IS 'The deal''s own account (IIS, 2026-11-13); null = the borrower''s 305x as before.';
COMMENT ON COLUMN public.loans.iis_account_code IS 'The deal''s interest-in-suspense account; null = not in suspense (0%, LO#19).';
COMMENT ON COLUMN public.fund_sources.iis_account_code IS 'The deal''s interest-in-suspense account; null = not in suspense (0%, BI#19).';

-- Go-live: null until the catch-up is posted; from then on new deals get their accounts as they start.
CREATE TABLE IF NOT EXISTS public.iis_settings (
  id        boolean PRIMARY KEY DEFAULT true CHECK (id),
  live_from date
);
INSERT INTO public.iis_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.iis_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.iis_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.iis_settings TO service_role;

-- What went into suspense (accrual) and what left it (recognition), deal by deal, month by month.
CREATE TABLE IF NOT EXISTS public.iis_postings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_kind        text NOT NULL CHECK (deal_kind IN ('loan', 'fund_source')),
  deal_id          uuid NOT NULL,
  month            date NOT NULL CHECK (month = date_trunc('month', month)::date),
  kind             text NOT NULL CHECK (kind IN ('accrual', 'recognition')),
  amount           numeric(15, 2) NOT NULL,
  journal_entry_id uuid REFERENCES public.journal_entries(id),
  created_by       uuid REFERENCES public.users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS iis_postings_deal ON public.iis_postings (deal_kind, deal_id, month);
ALTER TABLE public.iis_postings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.iis_postings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.iis_postings TO service_role;

SELECT public.audit_register('iis_postings', 'Interest in suspense postings', 'Treasury', '{treasury}', p_labels => '{deal_kind,month,kind}');
SELECT public.audit_register('iis_settings', 'Interest in suspense go-live', 'Treasury', '{}', 'none',
  p_reason => 'One row: the go-live date, set once by the go-live');


-- A deal's accounts: its own under its counterparty and, bearing interest, its IIS. Parked (p_park) they are made
-- without their parent, for the go-live's catch-up; else only once IIS is live. Answers {account, iis}.
CREATE OR REPLACE FUNCTION public.ensure_deal_accounts(p_kind text, p_id uuid, p_park boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_live     date;
  v_code     text;
  v_iis      text;
  v_cp       text;
  v_party    text;
  v_short    text;
  v_initials text;
  v_rate     numeric;
  v_words    text;
  v_amount   numeric;
  v_start    date;
  v_tag      text;
  v_iisroot  text;
  v_iiscp    text;
  v_label    text;
  v_insusp   boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.has_any_action(ARRAY['treasury.create', 'treasury.edit', 'treasury.approve', 'approvals.approve']), false) THEN
    RAISE EXCEPTION 'ensure_deal_accounts: needs Treasury' USING ERRCODE = '42501';
  END IF;
  SELECT live_from INTO v_live FROM iis_settings;
  IF v_live IS NULL AND NOT coalesce(p_park, false) THEN
    RETURN NULL;
  END IF;

  IF p_kind = 'loan' THEN
    SELECT l.gl_account_code, l.iis_account_code, co.name, co.short_code, l.effective_rate, coalesce(l.repayment_terms, ''), l.principal, l.disbursement_date
      INTO v_code, v_iis, v_party, v_short, v_rate, v_words, v_amount, v_start
      FROM loans l JOIN companies co ON co.id = l.company_id WHERE l.id = p_id FOR UPDATE OF l;
    IF NOT FOUND THEN RAISE EXCEPTION 'Loan % not found', p_id; END IF;
    IF v_code IS NOT NULL THEN RETURN jsonb_build_object('account', v_code, 'iis', v_iis); END IF;
    SELECT code INTO v_cp FROM chart_of_accounts
     WHERE parent_code = '3020' AND is_active AND code NOT BETWEEN '3100' AND '3899'
       AND (name ILIKE '%' || v_party || '%' OR (v_short IS NOT NULL AND name ILIKE '%' || v_short || '%'))
     ORDER BY code LIMIT 1;
    IF v_cp IS NULL THEN
      RAISE EXCEPTION 'No account under 3020 Loans Receivable for % — add "Amount due from - %" first', v_party, v_party;
    END IF;
    v_iisroot := '3060';
  ELSIF p_kind = 'fund_source' THEN
    SELECT f.account_code, f.iis_account_code,
           coalesce(c.name, d.name, dp.name, nullif(f.from_freetext_name, ''), 'Fund source'), c.short_code,
           CASE WHEN d.name IS NOT NULL THEN (SELECT string_agg(left(w, 1), '' ORDER BY o) FROM unnest((string_to_array(btrim(d.name), ' '))[2:]) WITH ORDINALITY AS t(w, o)) END,
           f.cost_rate, coalesce(f.notes, ''), f.amount, f.effective_date
      INTO v_cp, v_iis, v_party, v_short, v_initials, v_rate, v_words, v_amount, v_start
      FROM fund_sources f
      LEFT JOIN companies c ON c.id = f.from_company_id
      LEFT JOIN directors d ON d.id = f.from_director_id
      LEFT JOIN departments dp ON dp.id = f.from_department_id
     WHERE f.id = p_id FOR UPDATE OF f;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fund source % not found', p_id; END IF;
    IF v_cp IS NULL THEN RAISE EXCEPTION 'The fund source has no account'; END IF;
    IF v_cp BETWEEN '4300' AND '4699' THEN RETURN jsonb_build_object('account', v_cp, 'iis', v_iis); END IF;
    v_iisroot := '4060';
  ELSE
    RAISE EXCEPTION 'Unknown deal kind %', p_kind;
  END IF;

  v_tag := (regexp_match(v_words, '\[(?:LO|BI)[^\]]*\]'))[1];
  v_label := left(coalesce(v_tag || ' · ', '') || v_party || ' · RM ' || to_char(v_amount, 'FM999,999,990.00') || ' · ' || to_char(v_start, 'YYYY-MM-DD'), 120);

  -- The deal's own account: the next free code of its range — in suspense or not, so the code says where its interest goes.
  v_insusp := coalesce(v_rate, 0) > 0 AND v_words !~ '\[(LO|BI)#19\]';
  SELECT n::text INTO v_code FROM generate_series(
           CASE WHEN p_kind = 'loan' THEN CASE WHEN v_insusp THEN 3100 ELSE 3400 END ELSE CASE WHEN v_insusp THEN 4300 ELSE 4600 END END,
           CASE WHEN p_kind = 'loan' THEN CASE WHEN v_insusp THEN 3399 ELSE 3499 END ELSE CASE WHEN v_insusp THEN 4599 ELSE 4699 END END) n
   WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = n::text) ORDER BY n LIMIT 1;
  IF v_code IS NULL THEN RAISE EXCEPTION 'No free code left for a deal account'; END IF;
  INSERT INTO chart_of_accounts (code, name, type, parent_code, is_active, sort_order, cash_flow_category, is_internal_fund)
  SELECT v_code, v_label, cp.type, CASE WHEN p_park THEN NULL ELSE v_cp END, true, cp.sort_order, cp.cash_flow_category, cp.is_internal_fund
    FROM chart_of_accounts cp WHERE cp.code = v_cp;

  -- Bearing interest (not the back-to-back LO#19 / BI#19): its IIS account under the counterparty's IIS account.
  IF v_insusp THEN
    SELECT code INTO v_iiscp FROM chart_of_accounts
     WHERE parent_code = v_iisroot AND name ILIKE '%interest in suspense%'
       AND code NOT BETWEEN '3500' AND '3899' AND code NOT BETWEEN '4700' AND '4999'
       AND (name ILIKE '%' || v_party || '%' OR (v_short IS NOT NULL AND name ILIKE '%' || v_short || '%')
            OR (v_initials IS NOT NULL AND name ~* ('director ' || v_initials || '$')))
     ORDER BY code LIMIT 1;
    IF v_iiscp IS NULL THEN
      SELECT left(v_iisroot, 3) || n INTO v_iiscp FROM generate_series(1, 9) n
       WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = left(v_iisroot, 3) || n) ORDER BY n LIMIT 1;
      IF v_iiscp IS NULL THEN RAISE EXCEPTION 'No free code under % for %''s interest in suspense', v_iisroot, v_party; END IF;
      INSERT INTO chart_of_accounts (code, name, type, parent_code, is_active, sort_order, cash_flow_category, is_internal_fund)
      SELECT v_iiscp, 'Interest in Suspense - ' || CASE WHEN p_kind = 'loan' THEN 'Recv' ELSE 'Pay' END || ' - ' || v_party,
             r.type, v_iisroot, true, r.sort_order, r.cash_flow_category, r.is_internal_fund
        FROM chart_of_accounts r WHERE r.code = v_iisroot;
    END IF;
    SELECT n::text INTO v_iis FROM generate_series(CASE WHEN p_kind = 'loan' THEN 3500 ELSE 4700 END, CASE WHEN p_kind = 'loan' THEN 3899 ELSE 4999 END) n
     WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = n::text) ORDER BY n LIMIT 1;
    IF v_iis IS NULL THEN RAISE EXCEPTION 'No free code left for an IIS account'; END IF;
    INSERT INTO chart_of_accounts (code, name, type, parent_code, is_active, sort_order, cash_flow_category, is_internal_fund)
    SELECT v_iis, left(coalesce(v_tag || ' IIS · ', 'IIS · ') || v_party || ' · RM ' || to_char(v_amount, 'FM999,999,990.00'), 120),
           r.type, CASE WHEN p_park THEN NULL ELSE v_iiscp END, true, r.sort_order, r.cash_flow_category, r.is_internal_fund
      FROM chart_of_accounts r WHERE r.code = v_iiscp;
  END IF;

  IF p_kind = 'loan' THEN
    UPDATE loans SET gl_account_code = v_code, iis_account_code = v_iis, updated_at = now() WHERE id = p_id;
  ELSE
    UPDATE fund_sources SET account_code = v_code, iis_account_code = v_iis, updated_at = now() WHERE id = p_id;
  END IF;
  RETURN jsonb_build_object('account', v_code, 'iis', v_iis);
END
$fn$;


-- What iis_postings holds, deal by deal: interest put in suspense to date, and what left it, month by month.
CREATE OR REPLACE FUNCTION public.iis_posted()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE WHEN auth.uid() IS NULL OR coalesce(public.has_any_action(ARRAY['treasury.view', 'treasury.approve']), false) THEN
    coalesce((SELECT jsonb_agg(jsonb_build_object('kind', d.deal_kind, 'id', d.deal_id,
               'accrued', (SELECT coalesce(sum(amount), 0) FROM iis_postings p WHERE p.deal_kind = d.deal_kind AND p.deal_id = d.deal_id AND p.kind = 'accrual'),
               'last_accrual', (SELECT to_char(max(month), 'YYYY-MM') FROM iis_postings p WHERE p.deal_kind = d.deal_kind AND p.deal_id = d.deal_id AND p.kind = 'accrual'),
               'recognized', (SELECT coalesce(jsonb_object_agg(to_char(m.month, 'YYYY-MM'), m.amt), '{}'::jsonb)
                                FROM (SELECT month, sum(amount) amt FROM iis_postings p WHERE p.deal_kind = d.deal_kind AND p.deal_id = d.deal_id AND p.kind = 'recognition' GROUP BY month) m)))
               FROM (SELECT DISTINCT deal_kind, deal_id FROM iis_postings) d), '[]'::jsonb)
  ELSE '[]'::jsonb END
$fn$;

-- The go-live date (null: IIS is not live yet).
CREATE OR REPLACE FUNCTION public.iis_live_from()
RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$ SELECT live_from FROM iis_settings $fn$;


-- Posts the month-end run's (or the catch-up's) entries, one a deal, and keeps what each put into and took out of
-- suspense. Each row: {kind, id, month 'YYYY-MM', date, description, reference_type, accrual, recognition, lines}.
CREATE OR REPLACE FUNCTION public.iis_post(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r      jsonb;
  v_je   uuid;
  v_out  jsonb := '[]'::jsonb;
  v_ref  text;
  v_mon  date;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/fund-out', '/fund-in'], ARRAY['treasury.approve']);
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.has_any_action(ARRAY['treasury.approve']), false) THEN
    RAISE EXCEPTION 'iis_post: needs Treasury · Approve' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Nothing to post'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_ref := coalesce(r ->> 'reference_type', 'iis_month');
    IF v_ref NOT IN ('iis_month', 'iis_catchup') THEN RAISE EXCEPTION 'Unknown reference type %', v_ref; END IF;
    IF r ->> 'kind' NOT IN ('loan', 'fund_source') THEN RAISE EXCEPTION 'Unknown deal kind'; END IF;
    v_mon := ((r ->> 'month') || '-01')::date;
    v_je := NULL;
    IF jsonb_array_length(coalesce(r -> 'lines', '[]'::jsonb)) > 0 THEN
      v_je := post_journal_entry((r ->> 'date')::date, left(coalesce(r ->> 'description', 'Interest in suspense'), 240), v_ref,
                                 (r ->> 'id')::uuid, coalesce(auth.uid(), nullif(r ->> 'created_by', '')::uuid), r -> 'lines');
    END IF;
    IF coalesce((r ->> 'accrual')::numeric, 0) <> 0 THEN
      INSERT INTO iis_postings (deal_kind, deal_id, month, kind, amount, journal_entry_id, created_by)
      VALUES (r ->> 'kind', (r ->> 'id')::uuid, v_mon, 'accrual', round((r ->> 'accrual')::numeric, 2), v_je, coalesce(auth.uid(), nullif(r ->> 'created_by', '')::uuid));
    END IF;
    IF coalesce((r ->> 'recognition')::numeric, 0) <> 0 THEN
      INSERT INTO iis_postings (deal_kind, deal_id, month, kind, amount, journal_entry_id, created_by)
      VALUES (r ->> 'kind', (r ->> 'id')::uuid, coalesce(((r ->> 'recognition_month') || '-01')::date, v_mon), 'recognition',
              round((r ->> 'recognition')::numeric, 2), v_je, coalesce(auth.uid(), nullif(r ->> 'created_by', '')::uuid));
    END IF;
    v_out := v_out || jsonb_build_object('id', r ->> 'id', 'journal_entry_id', v_je);
  END LOOP;
  RETURN v_out;
END
$fn$;

create or replace function approve_fund_contra(p_approval_id uuid, p_notes text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_a      approval_requests%rowtype;
  v_c      fund_contras%rowtype;
  v        record;
  v_lines  jsonb := '[]'::jsonb;
  v_leaf   text;
  v_acct   text;
  v_je     uuid;
  v_note   text;
  v_label  text;
begin
  PERFORM public.tab_write_guard(ARRAY['/approvals'], ARRAY['approvals.approve', 'treasury.approve']);
  IF NOT public.approver_may_request(auth.uid(), p_approval_id) THEN
    RAISE EXCEPTION 'approve_fund_contra: you may not decide this request' USING ERRCODE = 'insufficient_privilege';
  END IF;
  select * into v_a from approval_requests where id = p_approval_id for update;
  if not found or v_a.request_type::text <> 'fund_contra' then raise exception 'That is not a fund contra request'; end if;
  if v_a.status <> 'pending' then raise exception 'That request was already decided'; end if;
  select * into v_c from fund_contras where approval_id = p_approval_id for update;
  if not found or v_c.status <> 'pending' then raise exception 'That contra is no longer waiting'; end if;

  -- The deals as they stand now: still live, still owing what the contra takes off.
  perform 1 from loans where id in (select loan_id from fund_contra_lines where contra_id = v_c.id) for update;
  perform 1 from fund_sources where id in (select fund_source_id from fund_contra_lines where contra_id = v_c.id) for update;
  perform fund_contra_check_lines(v_c.id);

  select string_agg(fund_contra_deal_label('loan', loan_id), ', ' order by loan_id) filter (where side = 'loan')
           || ' ↔ ' ||
         string_agg(fund_contra_deal_label('source', fund_source_id), ', ' order by fund_source_id) filter (where side = 'source')
    into v_label from fund_contra_lines where contra_id = v_c.id;
  v_note := 'Contra ' || v_label || coalesce(' — ' || v_c.notes, '');

  -- The journal entry: the loans' side credited, the fund sources' side debited.
  for v in select * from fund_contra_lines where contra_id = v_c.id order by side, id loop
    if v.side = 'loan' then
      if v.principal > 0 then
        -- A deal with its own account (IIS, 2026-11-13) posts there; else the borrower's account, as before.
        select gl_account_code into v_leaf from loans where id = v.loan_id;
        if v_leaf is null then
        select coa.code into v_leaf
          from loans l join companies co on co.id = l.company_id
          join chart_of_accounts coa on coa.parent_code = '3020' and coa.type = 'asset' and coa.is_active
               and (coa.name ilike '%' || co.name || '%' or coa.name ilike '%' || co.short_code || '%')
         where l.id = v.loan_id
         limit 1;
        end if;
        if v_leaf is null then
          raise exception 'No account under 3020 Loans Receivable for %', fund_contra_deal_label('loan', v.loan_id);
        end if;
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', v_leaf, 'debit', 0, 'credit', v.principal,
          'description', 'Contra — loan principal · ' || fund_contra_deal_label('loan', v.loan_id)));
      end if;
      if v.interest > 0 then
        -- In suspense, the interest comes off the deal's own account; the month-end run moves it IIS → 5027.
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code',
          coalesce((select case when iis_account_code is not null then gl_account_code end from loans where id = v.loan_id), '5027'), 'debit', 0, 'credit', v.interest,
          'description', 'Contra — loan interest · ' || fund_contra_deal_label('loan', v.loan_id)));
      end if;
    else
      if v.principal > 0 then
        select account_code into v_acct from fund_sources where id = v.fund_source_id;
        if v_acct is null then raise exception '% has no account', fund_contra_deal_label('source', v.fund_source_id); end if;
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', v_acct, 'debit', v.principal, 'credit', 0,
          'description', 'Contra — fund source principal · ' || fund_contra_deal_label('source', v.fund_source_id)));
      end if;
      if v.interest > 0 then
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code',
          coalesce((select case when iis_account_code is not null then account_code end from fund_sources where id = v.fund_source_id), '6000'), 'debit', v.interest, 'credit', 0,
          'description', 'Contra — fund source interest · ' || fund_contra_deal_label('source', v.fund_source_id)));
      end if;
    end if;
  end loop;
  v_je := post_journal_entry(v_c.contra_date, left(v_note, 240), 'fund_contra', v_c.id, auth.uid(), v_lines);

  -- Each side's repayment rows, and the Venture Pool rows a cash repayment would have written.
  for v in select * from fund_contra_lines where contra_id = v_c.id order by side, id loop
    if v.side = 'loan' then
      if v.principal > 0 then
        insert into repayments (loan_id, amount, payment_type, payment_date, notes, created_by, fund_contra_id)
        values (v.loan_id, v.principal, 'principal', v_c.contra_date, left(v_note, 500), auth.uid(), v_c.id);
        insert into venture_pool (transaction_type, amount, description, reference_id, reference_table, created_by)
        values ('loan_repayment_in', v.principal, 'Contra — loan principal · ' || fund_contra_deal_label('loan', v.loan_id), v.loan_id, 'loans', auth.uid());
      end if;
      if v.interest > 0 then
        insert into repayments (loan_id, amount, payment_type, payment_date, notes, created_by, fund_contra_id)
        values (v.loan_id, v.interest, 'interest', v_c.contra_date, left(v_note, 500), auth.uid(), v_c.id);
      end if;
    else
      if v.principal > 0 then
        insert into fund_source_repayments (fund_source_id, amount, payment_type, payment_date, notes, created_by, fund_contra_id)
        values (v.fund_source_id, v.principal, 'netting', v_c.contra_date, left(v_note, 500), auth.uid(), v_c.id);
      end if;
      if v.interest > 0 then
        insert into fund_source_repayments (fund_source_id, amount, payment_type, payment_date, notes, created_by, fund_contra_id)
        values (v.fund_source_id, v.interest, 'interest', v_c.contra_date, left(v_note, 500), auth.uid(), v_c.id);
      end if;
      insert into venture_pool (transaction_type, amount, description, reference_id, reference_table, created_by)
      values ('expense_out', v.principal + v.interest, 'Contra — fund source repaid · ' || fund_contra_deal_label('source', v.fund_source_id), v.fund_source_id, 'fund_sources', auth.uid());
    end if;
  end loop;

  update approval_requests
     set status = 'approved', workflow_state = 'approved', approved_by = auth.uid(), approved_at = now(),
         notes = coalesce(nullif(trim(p_notes), ''), notes), updated_at = now()
   where id = p_approval_id;
  update fund_contras
     set status = 'approved', journal_entry_id = v_je, decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_notes), '')
   where id = v_c.id;
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

SELECT pg_temp.tab_guard('public.iis_post(jsonb)', $$ARRAY['/fund-out', '/fund-in']$$, ARRAY['treasury.approve']);
SELECT pg_temp.tab_guard('public.approve_fund_contra(uuid, text)', $$ARRAY['/approvals']$$, ARRAY['approvals.approve', 'treasury.approve']);

REVOKE ALL ON FUNCTION public.ensure_deal_accounts(text, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iis_posted() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iis_live_from() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iis_post(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_deal_accounts(text, uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iis_posted() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iis_live_from() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iis_post(jsonb) TO authenticated, service_role;
