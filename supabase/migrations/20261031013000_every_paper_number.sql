-- 20261031013000_every_paper_number.sql
--
-- EVERY PAPER NUMBER (2026-10-31). Checking SHAWN's bills for orders he only
-- handles for salespeople who left, a side agent's note the user passed on:
-- a bill whose Ref No. names two papers — HC-SO-2610-300 is HC9882+ZNT4864 —
-- was matched on the FIRST alone (sales_order_bill_ref takes the first number
-- in the Ref No.), so the second could be claimed on another bill and the
-- Possible double claims check would never see it. 58 of the 1,501 bills name
-- two papers or more. Worse, three documents naming the same papers in another
-- order (HC12932+HC12931+HC12933, HC12931+HC12932+HC12933, …) each took a
-- different first number and matched nothing: Fair had 9 groups to answer;
-- with every number it has 25 — none of the 9 lost, 16 never seen before
-- (HC13375 on Adrian's and Jason's bills, ZNT6351 on Adrian's and Kar Jiun's …;
-- counted on production 2026-10-31).
--
-- 1. sales_order_bill_refs(order_no, ref_no) — EVERY paper number in the Ref
--    No., in the order written, each once: the same pattern
--    sales_order_bill_ref looks for, so the first is the bill_ref the bill
--    already has. An ERP document named in the Ref No. (PG10213+HC-SO-010741)
--    is a document, not a paper: it is left out. None at all → the bill's
--    bill_ref, as before (its own number, matching only itself).
-- 2. sales_orders.bill_refs — generated from it, stored, GIN-indexed (the
--    whose-sale check that follows looks bills up by any of their papers).
--    bill_ref stays as it is: paper_no, the drops and upsells
--    (erp_sync_note_adjustment) and the answers already given read it.
-- 3. revenue_possible_double_claims — production's body (md5 cc5daca1…,
--    refused otherwise) with two changes: a bill is in the group of EACH paper
--    it names (one row per paper, so a bill naming two papers on two other
--    bills is in two groups; the page puts papers on exactly the same bills
--    together, lib/commission/double-claims.ts), and an answer covers the
--    bills it was given for under any paper they share — "these bills are
--    separate sales" is about the bills, not the number it was typed under
--    (comm_double_claim_dismissals.order_ids @> the group, its bill_ref no
--    longer asked). The three answers on production (PG10457, HC13241,
--    HC11378) each cover the same bills as before.
--    revenue_dismiss_double_claim needs no change: it reads the group's bills
--    out of this function under the paper it is handed.
--
-- Reversal: re-apply revenue_possible_double_claims from 20260926110000 (its
-- body is production's cc5daca1… as of 2026-10-31); DROP INDEX
-- sales_orders_bill_refs_idx; ALTER TABLE sales_orders DROP COLUMN bill_refs;
-- DROP FUNCTION sales_order_bill_refs(TEXT, TEXT).

BEGIN;

-- ── 0. The body this was written from ───────────────────────────────────────

DO $guard$
DECLARE
    v_md5 TEXT;
BEGIN
    SELECT md5(p.prosrc) INTO v_md5
      FROM pg_proc p
     WHERE p.oid = 'public.revenue_possible_double_claims(uuid)'::regprocedure;
    IF v_md5 IS DISTINCT FROM 'cc5daca124a33c2a4487f63415f39648' THEN
        RAISE EXCEPTION 'revenue_possible_double_claims has changed on this database (md5 %) — compare it with 20261031013000 before applying', v_md5;
    END IF;
END
$guard$;

-- ── 1. Every paper number ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sales_order_bill_refs(p_order_no TEXT, p_ref_no TEXT)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
    SELECT COALESCE(
        (SELECT ARRAY_AGG(papers.paper ORDER BY papers.first_seen)
           FROM (SELECT UPPER(REGEXP_REPLACE(m.hit[1], '[\s-]', '', 'g')) AS paper, MIN(m.n) AS first_seen
                   FROM REGEXP_MATCHES(
                            -- An ERP document named in the Ref No. is no paper.
                            REGEXP_REPLACE(COALESCE(p_ref_no, ''), '[A-Za-z]{2,4}-SO-[0-9-]+', ' ', 'gi'),
                            '([A-Za-z]{2,4}\s*-?\s*[0-9]{3,})', 'g') WITH ORDINALITY AS m(hit, n)
                  GROUP BY 1) papers),
        ARRAY[sales_order_bill_ref(p_order_no, p_ref_no)]);
$fn$;

COMMENT ON FUNCTION public.sales_order_bill_refs(TEXT, TEXT) IS
    'Every paper number in a bill''s Ref No. (HC9882+ZNT4864 → {HC9882,ZNT4864}), in the order written, each once — the pattern sales_order_bill_ref looks for, so the first is the bill''s bill_ref; an ERP document number named there (HC-SO-010741) is left out. None → {sales_order_bill_ref(order_no, ref_no)}. What sales_orders.bill_refs is generated from (20261031013000).';

REVOKE ALL ON FUNCTION public.sales_order_bill_refs(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_order_bill_refs(TEXT, TEXT) TO authenticated, service_role;

-- ── 2. sales_orders.bill_refs ────────────────────────────────────────────────

ALTER TABLE public.sales_orders
    ADD COLUMN bill_refs TEXT[]
    GENERATED ALWAYS AS (sales_order_bill_refs(order_no, sales_order_ref_no(raw->'header'))) STORED;

COMMENT ON COLUMN public.sales_orders.bill_refs IS
    'Every paper this bill is on: sales_order_bill_refs(order_no, sales_order_ref_no(raw.header)) — each number in the Ref No., the first being bill_ref — worked out by Postgres on every write (20261031013000). What revenue_possible_double_claims groups by.';

CREATE INDEX sales_orders_bill_refs_idx ON public.sales_orders USING GIN (bill_refs);

-- ── 3. revenue_possible_double_claims — production's body, every paper ──────

CREATE OR REPLACE FUNCTION public.revenue_possible_double_claims(p_sub_department_id uuid)
 RETURNS TABLE(bill_ref text, order_id uuid, order_no text, period_month date, order_date date, staff_id uuid, employee_name text, agent_name text, order_total numeric, source text, paid_by_run boolean, dismissed boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    WITH live AS (
        -- Every bill a run could pay: in its month's committed batch, not
        -- excluded, and worth something (a "refer" document at RM 0 pays nobody).
        -- The paper numbers are read from the row, not rebuilt from the raw
        -- document for every bill (20260926110000) — every one of them
        -- (20261031013000).
        SELECT o.id, o.order_no, o.period_month, o.order_date, o.staff_id, o.agent_name,
               o.order_total, o.source, o.bill_refs AS refs
          FROM sales_orders o
          JOIN sales_import_batches b ON b.id = o.batch_id
         WHERE b.sub_department_id = p_sub_department_id
           AND b.status = 'committed'
           AND NOT o.cancelled
           AND o.order_total > 0
    ), paid AS (
        -- Every bill a run has paid, wherever its row sits now.
        SELECT DISTINCT ON (o.id)
               o.id, o.order_no, r.order_period_month AS period_month, o.order_date, o.staff_id,
               o.agent_name, o.order_total, o.source, o.bill_refs AS refs
          FROM comm_order_releases r
          JOIN comm_runs c ON c.id = r.run_id AND c.status IN ('applied', 'locked')
          JOIN sales_orders o ON o.order_no = r.order_no
          JOIN sales_import_batches b ON b.id = o.batch_id
                                     AND b.sub_department_id = r.sub_department_id
         WHERE r.sub_department_id = p_sub_department_id
         ORDER BY o.id
    ), bills AS (
        SELECT l.id, l.order_no, l.period_month, l.order_date, l.staff_id, l.agent_name,
               l.order_total, l.source, l.refs, (p.id IS NOT NULL) AS paid_by_run
          FROM live l LEFT JOIN paid p ON p.id = l.id
        UNION ALL
        SELECT p.id, p.order_no, p.period_month, p.order_date, p.staff_id, p.agent_name,
               p.order_total, p.source, p.refs, TRUE
          FROM paid p
         WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = p.id)
    ), papers AS (
        -- (20261031013000) A bill is on every paper its Ref No. names.
        SELECT b.id, b.order_no, b.period_month, b.order_date, b.staff_id, b.agent_name,
               b.order_total, b.source, b.paid_by_run, r.ref
          FROM bills b
         CROSS JOIN LATERAL UNNEST(b.refs) AS r(ref)
    ), groups AS (
        SELECT p.ref, ARRAY_AGG(p.id ORDER BY p.id) AS ids
          FROM papers p
         GROUP BY p.ref
        HAVING COUNT(*) > 1
    )
    SELECT p.ref, p.id, p.order_no, p.period_month, p.order_date, p.staff_id, s.employee_name,
           p.agent_name, p.order_total, p.source, p.paid_by_run,
           -- (20261031013000) An answer is about its bills, whichever of the
           -- papers they share it was given under.
           EXISTS (
               SELECT 1 FROM comm_double_claim_dismissals d
                WHERE d.sub_department_id = p_sub_department_id
                  AND d.order_ids @> g.ids
           )
      FROM papers p
      JOIN groups g ON g.ref = p.ref
      LEFT JOIN hr_staff_costs s ON s.id = p.staff_id
     ORDER BY p.ref, p.period_month, p.order_date, p.order_no;
$function$;

COMMENT ON FUNCTION public.revenue_possible_double_claims(uuid) IS
    'Every paper number on more than one bill a run could pay or already paid, one row per (paper, bill): each bill is on every paper its Ref No. names (sales_orders.bill_refs, 20261031013000). dismissed = an answer covers these bills, under whichever paper it was given.';

COMMIT;

NOTIFY pgrst, 'reload schema';
