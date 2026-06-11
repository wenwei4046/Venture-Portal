-- Manual JVs always landed in segment 'unallocated' (journal_entries.segment
-- column default) — invisible in every per-department report view. User
-- request 2026-06-12 ("jv也要写部门"): the JV form now carries a segment
-- picker; both RPCs accept p_segment (default stays 'unallocated' so a JV
-- that is a pure top-level adjustment behaves exactly as before).
--
-- DROP before CREATE: adding a defaulted parameter would otherwise leave the
-- old 3/4-arg overload behind and make PostgREST rpc() calls ambiguous.
-- (Applied via MCP apply_migration on 2026-06-12; file kept for repo parity.)

DROP FUNCTION IF EXISTS public.create_manual_journal_voucher(date, text, jsonb);
DROP FUNCTION IF EXISTS public.update_manual_journal_voucher(uuid, date, text, jsonb);

CREATE FUNCTION public.create_manual_journal_voucher(
  p_transaction_date date,
  p_description text,
  p_lines jsonb,
  p_segment text DEFAULT 'unallocated'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role user_role; v_entry_id uuid; v_seq bigint; v_entry_no text;
  v_segment gl_segment;
  v_td numeric := 0; v_tc numeric := 0; v_line jsonb; v_d numeric; v_c numeric; v_n int := 0;
BEGIN
  v_role := current_user_role();
  IF v_role NOT IN ('principal','finance') THEN RAISE EXCEPTION 'Access denied: only Finance/Principal can post journal vouchers'; END IF;
  IF p_description IS NULL OR btrim(p_description) = '' THEN RAISE EXCEPTION 'Description is required'; END IF;

  BEGIN
    v_segment := COALESCE(NULLIF(btrim(p_segment), ''), 'unallocated')::gl_segment;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid segment "%" — must be one of the GL segments', p_segment;
  END;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_d := COALESCE((v_line->>'debit')::numeric,0); v_c := COALESCE((v_line->>'credit')::numeric,0);
    IF (v_d > 0) = (v_c > 0) THEN RAISE EXCEPTION 'Each line must have exactly one of debit/credit > 0'; END IF;
    v_td := v_td + v_d; v_tc := v_tc + v_c; v_n := v_n + 1;
  END LOOP;
  IF v_n < 2 THEN RAISE EXCEPTION 'A journal voucher needs at least 2 lines'; END IF;
  IF v_td <> v_tc THEN RAISE EXCEPTION 'Not balanced: debit % <> credit %', v_td, v_tc; END IF;
  IF v_td <= 0 THEN RAISE EXCEPTION 'Total must be > 0'; END IF;

  v_seq := nextval('journal_entry_no_seq');
  v_entry_no := format('JE-%s-%s', to_char(p_transaction_date,'YYYYMM'), lpad(v_seq::text,4,'0'));

  INSERT INTO journal_entries (entry_no, transaction_date, period_month, description, reference_type, total_amount, created_by, segment)
  VALUES (v_entry_no, p_transaction_date, date_trunc('month',p_transaction_date)::date, p_description, 'manual_jv', v_td, auth.uid(), v_segment)
  RETURNING id INTO v_entry_id;

  INSERT INTO journal_lines (entry_id, account_code, debit, credit, description)
  SELECT v_entry_id, (l->>'account_code'),
    CASE WHEN COALESCE((l->>'debit')::numeric,0) > 0 THEN (l->>'debit')::numeric END,
    CASE WHEN COALESCE((l->>'credit')::numeric,0) > 0 THEN (l->>'credit')::numeric END,
    NULLIF(btrim(COALESCE(l->>'description','')),'')
  FROM jsonb_array_elements(p_lines) AS l;

  RETURN v_entry_id;
END $function$;

CREATE FUNCTION public.update_manual_journal_voucher(
  p_entry_id uuid,
  p_transaction_date date,
  p_description text,
  p_lines jsonb,
  p_segment text DEFAULT 'unallocated'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role user_role; v_ref text; v_segment gl_segment;
  v_td numeric := 0; v_tc numeric := 0; v_line jsonb; v_d numeric; v_c numeric; v_n int := 0;
BEGIN
  v_role := current_user_role();
  IF v_role NOT IN ('principal','finance') THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT reference_type INTO v_ref FROM journal_entries WHERE id = p_entry_id;
  IF v_ref IS NULL THEN RAISE EXCEPTION 'Journal entry not found'; END IF;
  IF v_ref <> 'manual_jv' THEN RAISE EXCEPTION 'Only manual journal vouchers can be edited (this one is auto-posted: %)', v_ref; END IF;
  IF p_description IS NULL OR btrim(p_description) = '' THEN RAISE EXCEPTION 'Description is required'; END IF;

  BEGIN
    v_segment := COALESCE(NULLIF(btrim(p_segment), ''), 'unallocated')::gl_segment;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid segment "%" — must be one of the GL segments', p_segment;
  END;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_d := COALESCE((v_line->>'debit')::numeric,0); v_c := COALESCE((v_line->>'credit')::numeric,0);
    IF (v_d > 0) = (v_c > 0) THEN RAISE EXCEPTION 'Each line must have exactly one of debit/credit > 0'; END IF;
    v_td := v_td + v_d; v_tc := v_tc + v_c; v_n := v_n + 1;
  END LOOP;
  IF v_n < 2 THEN RAISE EXCEPTION 'A journal voucher needs at least 2 lines'; END IF;
  IF v_td <> v_tc THEN RAISE EXCEPTION 'Not balanced: debit % <> credit %', v_td, v_tc; END IF;

  DELETE FROM journal_lines WHERE entry_id = p_entry_id;
  INSERT INTO journal_lines (entry_id, account_code, debit, credit, description)
  SELECT p_entry_id, (l->>'account_code'),
    CASE WHEN COALESCE((l->>'debit')::numeric,0) > 0 THEN (l->>'debit')::numeric END,
    CASE WHEN COALESCE((l->>'credit')::numeric,0) > 0 THEN (l->>'credit')::numeric END,
    NULLIF(btrim(COALESCE(l->>'description','')),'')
  FROM jsonb_array_elements(p_lines) AS l;

  UPDATE journal_entries
  SET transaction_date = p_transaction_date,
      period_month = date_trunc('month',p_transaction_date)::date,
      description = p_description,
      total_amount = v_td,
      segment = v_segment
  WHERE id = p_entry_id;
END $function$;
