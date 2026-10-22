-- ============================================================================
-- 20261021200000_repayment_journal_entry_link.sql
-- A loan repayment knows its own journal entry (2026-10-21 — the user, shown Void on the second of two identical
-- repayments reversing the FIRST one's entry: "选 A").
-- ============================================================================
--
-- void_loan_repayment found a repayment's entry by its loan, amount, day and type and took the OLDEST match. Of two
-- identical repayments (The Cont's LO#4, 2 Oct — keyed again on 21 Oct, its interest on 3063 Interest in Suspense where
-- the first's was on 5027 Loan Interest; removed by hand the same day, HANDOFF x) Void on the second reversed the
-- first's entry, on the first's accounts, and took the bank down by the first's bank. The amount and date amends
-- matched the same way: they refused two matches, but took a lone one even when it was another repayment's.
--
-- 1. repayments.journal_entry_id — the entry recordRepayment posted for the row (since this day the app posts the
--    entry first and writes the row with it). One entry, one repayment. A later update of it alone is bookkeeping
--    (audit_tables.ignore_columns — the link is in the INSERT's new row), so the backfill adds no line to a loan's
--    audit log.
-- 2. loan_repayment_journal_entry(id) — a repayment's own live entry: its link (refused when that is not an entry of
--    the repayment's loan, amount, day and type; NULL once reversed); with no link, the one live entry of its loan,
--    amount, day and type that no repayment is linked to — refused when there are several, NULL when there is none
--    (a repayment with no entry of its own: the [LO#] imports, OR-202606-0032's interest, the [BI#32] contra — they
--    void as before). Only the three functions below call it: no EXECUTE for anon / authenticated.
-- 3. void_loan_repayment, amend_loan_repayment, amend_loan_repayment_date (production's cda958da… / 8d5f89e5… /
--    b67c36e4…): the statement that found the entry, swapped for the helper — nothing else.
--    (pg_temp.swap_check: production's body, one statement swapped; a body already swapped is left alone.)
-- 4. Backfill: every repayment whose one live entry no other repayment matches — 63 of 153 on 2026-10-21, none
--    ambiguous. Run again, it links what the app recorded before it wrote the link itself.
-- PGlite: tests/member-sql/validate-loan-repayment-link.mjs (this migration verbatim over production's own bodies —
-- loan-repayment-production.sql, md5-checked — run on stand-in tables).

ALTER TABLE public.repayments ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES public.journal_entries(id);
CREATE UNIQUE INDEX IF NOT EXISTS repayments_journal_entry_id_key ON public.repayments (journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

COMMENT ON COLUMN public.repayments.journal_entry_id IS
  'The journal entry recordRepayment posted for this repayment — the one Void reverses and the amount / date amends correct (2026-10-21). NULL: no entry of its own (an import, a voucher''s repayment), or recorded before the link and not matched to exactly one entry.';

UPDATE public.audit_tables
   SET ignore_columns = array_append(ignore_columns, 'journal_entry_id')
 WHERE table_name = 'repayments'
   AND NOT ('journal_entry_id' = ANY (ignore_columns));

CREATE OR REPLACE FUNCTION public.loan_repayment_journal_entry(p_repayment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $fn$
DECLARE
  v_rep   repayments%ROWTYPE;
  v_je    journal_entries%ROWTYPE;
  v_found uuid[];
BEGIN
  SELECT * INTO v_rep FROM repayments WHERE id = p_repayment_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_rep.journal_entry_id IS NOT NULL THEN
    SELECT * INTO v_je FROM journal_entries WHERE id = v_rep.journal_entry_id;
    IF v_je.reference_type IS DISTINCT FROM 'repayment'
       OR v_je.reference_id IS DISTINCT FROM v_rep.loan_id
       OR v_je.total_amount IS DISTINCT FROM v_rep.amount
       OR v_je.transaction_date IS DISTINCT FROM v_rep.payment_date
       OR NOT coalesce(v_je.description ILIKE 'Loan ' || v_rep.payment_type || ' repayment%', false) THEN
      RAISE EXCEPTION 'The journal entry this repayment is linked to (%) is not its own — nothing was changed',
        coalesce(v_je.entry_no, v_rep.journal_entry_id::text);
    END IF;
    RETURN CASE WHEN v_je.is_reversed THEN NULL ELSE v_je.id END;
  END IF;

  SELECT array_agg(je.id) INTO v_found
    FROM journal_entries je
   WHERE je.reference_type = 'repayment'
     AND je.reference_id = v_rep.loan_id
     AND je.total_amount = v_rep.amount
     AND je.transaction_date = v_rep.payment_date
     AND NOT je.is_reversed
     AND je.description ILIKE 'Loan ' || v_rep.payment_type || ' repayment%'
     AND NOT EXISTS (SELECT 1 FROM repayments r WHERE r.journal_entry_id = je.id);
  IF cardinality(v_found) > 1 THEN
    RAISE EXCEPTION 'Several journal entries match this repayment and it is linked to none of them — nothing was changed';
  END IF;
  RETURN v_found[1];
END
$fn$;

COMMENT ON FUNCTION public.loan_repayment_journal_entry(uuid) IS
  'A loan repayment''s own live journal entry — its link, or (no link) the one live entry of its loan, amount, day and type no repayment is linked to; refuses a link that is not its own and several matches. Called by void_loan_repayment and the two amends (mig 20261021200000).';

REVOKE ALL ON FUNCTION public.loan_repayment_journal_entry(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.loan_repayment_journal_entry(uuid) TO service_role;

CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  -- The old statement, every run of whitespace matching any run.
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

SELECT pg_temp.swap_check('public.void_loan_repayment(uuid)',
  $q$SELECT je.id, je.entry_no, je.segment, je.description INTO v_je
    FROM journal_entries je
    WHERE je.reference_type = 'repayment'
      AND je.reference_id = v_rep.loan_id
      AND je.total_amount = v_rep.amount
      AND je.transaction_date = v_rep.payment_date
      AND je.is_reversed = false
      AND je.description LIKE 'Loan ' || v_rep.payment_type || ' repayment%'
    ORDER BY je.created_at
    LIMIT 1;$q$,
  $q$SELECT je.id, je.entry_no, je.segment, je.description INTO v_je
    FROM journal_entries je
    WHERE je.id = (SELECT public.loan_repayment_journal_entry(p_repayment_id));$q$);

SELECT pg_temp.swap_check('public.amend_loan_repayment(uuid,numeric,text)',
  $q$SELECT je.id INTO STRICT v_je_id
          FROM journal_entries je
         WHERE je.reference_type = 'repayment'
           AND je.reference_id = v_r.loan_id
           AND NOT je.is_reversed
           AND je.transaction_date = v_r.payment_date
           AND je.total_amount = v_old
           AND je.description ILIKE 'Loan ' || v_r.payment_type || ' repayment%';$q$,
  $q$SELECT je.id INTO STRICT v_je_id
          FROM journal_entries je
         WHERE je.id = (SELECT public.loan_repayment_journal_entry(p_repayment_id));$q$);

SELECT pg_temp.swap_check('public.amend_loan_repayment_date(uuid,date,text)',
  $q$SELECT je.id INTO STRICT v_je_id
          FROM journal_entries je
         WHERE je.reference_type = 'repayment'
           AND je.reference_id = v_r.loan_id
           AND NOT je.is_reversed
           AND je.transaction_date = v_old
           AND je.total_amount = v_r.amount
           AND je.description ILIKE 'Loan ' || v_r.payment_type || ' repayment%';$q$,
  $q$SELECT je.id INTO STRICT v_je_id
          FROM journal_entries je
         WHERE je.id = (SELECT public.loan_repayment_journal_entry(p_repayment_id));$q$);

WITH candidates AS (
  SELECT r.id AS repayment_id, je.id AS entry_id
    FROM public.repayments r
    JOIN public.journal_entries je
      ON je.reference_type = 'repayment'
     AND je.reference_id = r.loan_id
     AND je.total_amount = r.amount
     AND je.transaction_date = r.payment_date
     AND NOT je.is_reversed
     AND je.description ILIKE 'Loan ' || r.payment_type || ' repayment%'
   WHERE r.journal_entry_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.repayments x WHERE x.journal_entry_id = je.id)
), one_to_one AS (
  SELECT c.repayment_id, c.entry_id
    FROM candidates c
   WHERE (SELECT count(*) FROM candidates c2 WHERE c2.repayment_id = c.repayment_id) = 1
     AND (SELECT count(*) FROM candidates c3 WHERE c3.entry_id = c.entry_id) = 1
)
UPDATE public.repayments r
   SET journal_entry_id = o.entry_id
  FROM one_to_one o
 WHERE r.id = o.repayment_id;
