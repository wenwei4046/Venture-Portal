-- ════════════════════════════════════════════════════════════════════════════
-- 20261013010000_erp_change_trail.sql
-- The ERP's audit trail, kept by the portal; a close gives the commission; a
-- paper keyed as several documents (2026-10-13)
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY. The user, 2026-10-12: the Houzs ERP keeps no audit trail of a sales
-- order changed before its processing date — its amount, its products, any of
-- it — yet the portal pays commission from the day the order is opened, so a
-- drop or an upsell made then was seen by nobody: "我们这边要能透过这个 API 去
-- detect，只要他开了单，任何改动只要一按 save 他的 sales order，我这边都要能
-- track 到，记录在我们自己的 audit trail 里 … 最主要的目的是拿来 track 他的
-- amount 有没有变动 … 判断是 upsell 还是 drop sales or cancelation … 如果是
-- cancellation … 这边应该能看到 … 就要 deduction". The ERP already sends the
-- whole document on every save (contract §1); the receiver wrote it over the
-- bill and kept nothing of what it had been.
--
-- 1. THE TRAIL. sales_order_erp_changes — one row per delivery that changed
--    anything the portal reads of a document: its status or hold, its amount,
--    its lines (product, variant, quantity, price), its salesperson, customer,
--    order date, venue, fair day, balance. Each row keeps the document before
--    and after, what kind of change it was — opened · upsell · drop ·
--    cancelled · deleted · on_hold · reinstated · changed — measured on what
--    EARNS (the lines in groups the scheme pays on; transport never counts),
--    and whether the commission had already been given when it came. Written
--    by the receiver for every delivery it applies or holds (a document never
--    seen before is "opened"); from this migration on, and rebuilt for the
--    held deliveries the feed has kept since 2026-09-26.
--
-- 2. A CLOSE GIVES THE COMMISSION. Since the unified payroll (2026-09-27) a
--    salesperson's close is their Complete and no run is applied any more, so
--    a bill paid that way never became "settled": the ERP's next change was
--    written over it and nothing asked — the close went on paying the old
--    figure. A bill a standing close released is now settled like a bill a run
--    paid: comm_order_releases keeps its commissionable value at the moment it
--    was released, and a later change to it — applied to the live month as
--    before — is a drop or an upsell to answer. A reopened close takes its
--    releases back, and with them the question; a change is paid only in a
--    month AFTER the one that gave the commission (23ADJ), since that month
--    already counts the bill as the ERP has it now.
--
-- 3. A PAPER KEYED AS SEVERAL DOCUMENTS. ZNT6185 was paid RM 15,700 on
--    August's claim form and keyed into the ERP as HC-SO-013384 (RM 8,000) and
--    HC-SO-013385 (RM 7,700); each document was compared with the whole paper,
--    so each looked like a drop (−7,700 and −8,000, 2026-10-12). Each document
--    now carries its own part of the paper's figure, in proportion to what it
--    held when the month was settled. A "Not a change" now SETS the figure
--    later changes are measured from (it did the same by arithmetic, only
--    while the figure it was measured against stayed put).
--
-- 4. comm_upsales says why — erp_reason (amount · cancelled · deleted ·
--    on_hold · not_counted · reinstated) — and what gave the commission —
--    settled_by (run · close · hand · frozen) and settled_period.
--
-- The receiver (ingest_erp_sales_order) is production's body (md5
-- e114d662527339a70e07fef36bacf685, as 20261012200000 left it) with four
-- swaps, refused if production changed since: v_before is declared, and read
-- once the document is found; every way out goes through
-- erp_sync_after_delivery (the trail, and the question an applied change to a
-- settled bill now asks); an applied write no longer deletes the question
-- waiting on its document (the review decides). erp_sync_note_adjustment is
-- 20261003170000's (md5 7ddd3e82c7e1eb53dcfb4f30f197a827) rewritten around
-- erp_sync_settled_basis — same rule for what the ERP says now.
--
-- Rollback, in words (the database tool refuses the keyword): re-apply
-- 20261012200000's ingest_erp_sales_order and 20261003170000's
-- erp_sync_note_adjustment; take away the triggers comm_order_releases_capture,
-- comm_order_releases_review and comm_upsales_after_settled with their
-- functions, and the helper functions this file creates; comm_upsales'
-- erp_reason, settled_period and settled_by, and comm_order_releases'
-- commissionable; the table sales_order_erp_changes with its rows in
-- permission_table_writes, permission_table_reads and audit_tables.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 0. Production's bodies, as this file was written against them ─────────

DO $guard$
DECLARE
    v_ingest TEXT := (SELECT prosrc FROM pg_proc WHERE oid = 'public.ingest_erp_sales_order(jsonb, uuid)'::REGPROCEDURE);
    v_note   TEXT := (SELECT prosrc FROM pg_proc WHERE oid = 'public.erp_sync_note_adjustment(uuid, jsonb, uuid)'::REGPROCEDURE);
BEGIN
    IF strpos(v_ingest, 'erp_sync_after_delivery(') = 0
       AND md5(v_ingest) <> 'e114d662527339a70e07fef36bacf685' THEN
        RAISE EXCEPTION 'ingest_erp_sales_order is not the body 20261012200000 left (md5 %) — production changed since this migration was written',
            md5(v_ingest);
    END IF;
    IF strpos(v_note, 'erp_sync_settled_basis(') = 0
       AND md5(v_note) <> '7ddd3e82c7e1eb53dcfb4f30f197a827' THEN
        RAISE EXCEPTION 'erp_sync_note_adjustment is not the body 20261003170000 left (md5 %) — production changed since this migration was written',
            md5(v_note);
    END IF;
END
$guard$;

-- ─── 1. The trail ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_order_erp_changes (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_department_id     UUID          NOT NULL REFERENCES public.comm_sub_departments (id) ON DELETE RESTRICT,
    -- The ERP document; its bill in the portal while there is one.
    order_no              TEXT          NOT NULL,
    order_id              UUID          REFERENCES public.sales_orders (id) ON DELETE SET NULL,
    -- The delivery that brought it (erp_sync_events), and when the ERP built it — the Save.
    event_id              UUID          REFERENCES public.erp_sync_events (id) ON DELETE SET NULL,
    saved_at              TIMESTAMPTZ,
    received_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    -- applied: written over the bill; held: its month is settled, the bill kept as it was.
    outcome               TEXT          NOT NULL,
    -- The month the portal keeps the bill in.
    period_month          DATE,
    kind                  TEXT          NOT NULL,
    total_before          NUMERIC(15, 2),
    total_after           NUMERIC(15, 2),
    commissionable_before NUMERIC(15, 2),
    commissionable_after  NUMERIC(15, 2),
    status_before         TEXT,
    status_after          TEXT,
    -- The document as the portal knew it before, and as this delivery left it
    -- (erp_order_state's shape). NULL before: a document seen for the first time.
    state_before          JSONB,
    state_after           JSONB         NOT NULL,
    -- What the commission had been given on when it came (erp_sync_settled_basis);
    -- NULL: nothing given yet — its own month counts the bill as it is now.
    settled_amount        NUMERIC(15, 2),
    settled_period        DATE,
    settled_by            TEXT,
    -- The drop or upsell it opened or moved (comm_upsales, pending at the time).
    adjustment_id         UUID,
    -- What the month's list shows: a change to what earns, or to the bill's total.
    money_moved           BOOLEAN       GENERATED ALWAYS AS (
        kind <> 'opened' AND (kind IN ('upsell', 'drop', 'cancelled', 'deleted', 'on_hold', 'reinstated')
                              OR total_before IS DISTINCT FROM total_after)) STORED,
    CONSTRAINT sales_order_erp_changes_outcome CHECK (outcome IN ('applied', 'held')),
    CONSTRAINT sales_order_erp_changes_kind CHECK (kind IN (
        'opened', 'upsell', 'drop', 'cancelled', 'deleted', 'on_hold', 'reinstated', 'changed')),
    CONSTRAINT sales_order_erp_changes_settled_by CHECK (settled_by IS NULL OR settled_by IN ('run', 'close', 'hand', 'frozen'))
);

CREATE INDEX IF NOT EXISTS sales_order_erp_changes_doc
    ON public.sales_order_erp_changes (sub_department_id, order_no, received_at DESC);
CREATE INDEX IF NOT EXISTS sales_order_erp_changes_month
    ON public.sales_order_erp_changes (sub_department_id, period_month, received_at DESC) WHERE money_moved;
CREATE INDEX IF NOT EXISTS sales_order_erp_changes_order ON public.sales_order_erp_changes (order_id);
CREATE INDEX IF NOT EXISTS sales_order_erp_changes_event ON public.sales_order_erp_changes (event_id);

COMMENT ON TABLE public.sales_order_erp_changes IS
    'The ERP''s audit trail as the portal keeps it (2026-10-13): one row per delivery of a sales order that changed what the portal reads of it — before and after, the kind of change measured on what earns (opened · upsell · drop · cancelled · deleted · on_hold · reinstated · changed), and whether its commission had already been given. Written by ingest_erp_sales_order (erp_sync_after_delivery) for every delivery it applies or holds. The ERP itself keeps no trail of an order changed before its processing date.';
COMMENT ON COLUMN public.sales_order_erp_changes.state_after IS
    'The document as this delivery left it (erp_order_state): status, onHold, deleted, total, balance, commissionable, salesperson, customer, orderDate, venue, fairDate and its lines. The next delivery is compared with it.';
COMMENT ON COLUMN public.sales_order_erp_changes.settled_amount IS
    'What the commission had already been given on when the change came (a run, a salesperson''s close, the claim form, a month closed to the feed) — NULL when nothing had: the bill''s own month counts it as it is now.';

ALTER TABLE public.sales_order_erp_changes ENABLE ROW LEVEL SECURITY;

-- HR's and the Principal's, as the delivery log (erp_sync_events).
DO $policies$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sales_order_erp_changes'
                     AND policyname = 'sales_order_erp_changes_hr_all') THEN
        CREATE POLICY sales_order_erp_changes_hr_all ON public.sales_order_erp_changes
            FOR ALL
            USING ((SELECT has_scope(ARRAY['hr'])))
            WITH CHECK ((SELECT has_scope(ARRAY['hr'])));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sales_order_erp_changes'
                     AND policyname = 'sales_order_erp_changes_principal_all') THEN
        CREATE POLICY sales_order_erp_changes_principal_all ON public.sales_order_erp_changes
            FOR ALL
            USING ((SELECT has_scope(ARRAY['admin'])))
            WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
    END IF;
END
$policies$;

REVOKE ALL ON public.sales_order_erp_changes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_order_erp_changes TO authenticated;

-- The database asks for the action too: the receiver writes it (the service
-- role; Comm Cal's Replay held under the session, as Revenue's work), and
-- whoever reads a month's bills reads it.
INSERT INTO public.permission_table_writes (table_name, command, actions) VALUES
  ('sales_order_erp_changes', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_erp_changes', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_erp_changes', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage'])
ON CONFLICT (table_name, command) DO UPDATE SET actions = EXCLUDED.actions;

SELECT public.permission_writes_guard('sales_order_erp_changes');

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('sales_order_erp_changes', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;

SELECT public.permission_reads_guard('sales_order_erp_changes');

-- A record already, like the deliveries it is made from: not kept twice.
SELECT public.audit_register('sales_order_erp_changes', 'ERP audit trail', 'Revenue', '{}', 'none',
  p_reason => 'The ERP''s audit trail as the portal keeps it — every save of a sales order the feed delivered, a record already.');

-- ─── 2. Why a drop or upsell was found, and what gave the commission ────────

ALTER TABLE public.comm_upsales
    ADD COLUMN IF NOT EXISTS erp_reason     TEXT,
    ADD COLUMN IF NOT EXISTS settled_period DATE,
    ADD COLUMN IF NOT EXISTS settled_by     TEXT;

DO $constraints$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comm_upsales_erp_reason_known') THEN
        ALTER TABLE public.comm_upsales ADD CONSTRAINT comm_upsales_erp_reason_known
            CHECK (erp_reason IS NULL OR erp_reason IN ('amount', 'cancelled', 'deleted', 'on_hold', 'not_counted', 'reinstated'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comm_upsales_settled_by_known') THEN
        ALTER TABLE public.comm_upsales ADD CONSTRAINT comm_upsales_settled_by_known
            CHECK (settled_by IS NULL OR settled_by IN ('run', 'close', 'hand', 'frozen'));
    END IF;
END
$constraints$;

COMMENT ON COLUMN public.comm_upsales.erp_reason IS
    'Why the ERP''s figure moved (2026-10-13): amount (the lines), cancelled, deleted, on_hold (a hold or back to draft), not_counted (taken out by hand), reinstated (back after one of those). NULL on a row typed by hand.';
COMMENT ON COLUMN public.comm_upsales.settled_period IS
    'The month whose pay gave the commission on the bill (a run''s or a close''s month, else the bill''s own): a change is paid only in a later month (comm_upsales_after_settled, 23ADJ).';
COMMENT ON COLUMN public.comm_upsales.settled_by IS
    'What gave the commission: run (an applied run), close (a salesperson''s standing close), hand (the claim form, under the same paper), frozen (a month closed to the feed).';

-- ─── 3. What a release paid on ──────────────────────────────────────────────

ALTER TABLE public.comm_order_releases ADD COLUMN IF NOT EXISTS commissionable NUMERIC(15, 2);

COMMENT ON COLUMN public.comm_order_releases.commissionable IS
    'The bill''s commissionable value when it was released (its lines in groups the scheme pays on, KPI items included) — what a later change of the ERP''s is measured from (comm_order_releases_capture, 2026-10-13). NULL on a release written before it: product_revenue stands in.';

-- ─── 4. The helpers ─────────────────────────────────────────────────────────

-- The sub-department's scheme in force, as erp_sync_note_adjustment always read it.
CREATE OR REPLACE FUNCTION public.erp_sync_scheme_of(p_sub_department_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT s.id
      FROM comm_schemes s
     WHERE s.sub_department_id = p_sub_department_id AND s.is_active AND s.effective_to IS NULL
     ORDER BY s.effective_from DESC
     LIMIT 1;
$fn$;

-- What a delivery's lines earn: those in groups the scheme pays on.
CREATE OR REPLACE FUNCTION public.erp_sync_lines_value(p_lines JSONB, p_scheme UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT COALESCE(ROUND(SUM(COALESCE(NULLIF(l->>'amount', '')::NUMERIC, 0)), 2), 0)
      FROM JSONB_ARRAY_ELEMENTS(CASE WHEN JSONB_TYPEOF(p_lines) = 'array' THEN p_lines ELSE '[]'::JSONB END) l
      JOIN comm_item_groups g
        ON g.scheme_id = p_scheme
       AND UPPER(BTRIM(g.item_group)) = UPPER(BTRIM(COALESCE(l->>'itemGroup', '')))
       AND g.commissionable;
$fn$;

-- What a bill's lines earn, as the portal holds them.
CREATE OR REPLACE FUNCTION public.erp_sync_bill_lines_value(p_order_id UUID, p_scheme UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT COALESCE(ROUND(SUM(l.line_amount), 2), 0)
      FROM sales_order_lines l
      JOIN comm_item_groups g
        ON g.scheme_id = p_scheme
       AND UPPER(BTRIM(g.item_group)) = UPPER(BTRIM(l.item_group))
       AND g.commissionable
     WHERE l.order_id = p_order_id;
$fn$;

-- A document as a delivery describes it — the trail's shape. Normalised the way
-- the receiver writes the bill, so the bill and a delivery of the same document
-- compare equal (erp_order_state_of_bill). What earns is nothing while the ERP
-- does not count it (cancelled, a draft, a hold, deleted).
CREATE OR REPLACE FUNCTION public.erp_order_state(p_order JSONB, p_scheme UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    WITH h AS (
        SELECT UPPER(COALESCE(NULLIF(BTRIM(p_order->>'status'), ''), 'CONFIRMED')) AS status,
               COALESCE((p_order->>'onHold')::BOOLEAN, FALSE) AS on_hold,
               COALESCE((p_order->>'deleted')::BOOLEAN, FALSE) AS deleted
    ), l AS (
        SELECT JSONB_BUILD_OBJECT(
                   'lineNo', COALESCE(NULLIF(x.line->>'lineNo', '')::INTEGER, x.ord::INTEGER),
                   'itemGroup', COALESCE(NULLIF(BTRIM(x.line->>'itemGroup'), ''), 'UNGROUPED'),
                   'itemCode', COALESCE(NULLIF(BTRIM(x.line->>'itemCode'), ''), '(none)'),
                   'description', NULLIF(x.line->>'description', ''),
                   'variant', NULLIF(x.line->>'description2', ''),
                   'qty', COALESCE(NULLIF(x.line->>'qty', '')::NUMERIC, 0),
                   'unitPrice', ROUND(COALESCE(NULLIF(x.line->>'unitPrice', '')::NUMERIC, 0), 2),
                   'amount', ROUND(COALESCE(NULLIF(x.line->>'amount', '')::NUMERIC, 0), 2)) AS line
          FROM JSONB_ARRAY_ELEMENTS(CASE WHEN JSONB_TYPEOF(p_order->'lines') = 'array' THEN p_order->'lines' ELSE '[]'::JSONB END)
               WITH ORDINALITY AS x(line, ord)
    )
    SELECT JSONB_BUILD_OBJECT(
        'status', h.status,
        'onHold', h.on_hold,
        'deleted', h.deleted,
        'total', ROUND(COALESCE(NULLIF(p_order->>'total', '')::NUMERIC, 0), 2),
        'balance', ROUND(NULLIF(p_order->>'balance', '')::NUMERIC, 2),
        'commissionable', CASE WHEN h.deleted OR h.on_hold OR h.status IN ('CANCELLED', 'DRAFT', 'ON_HOLD') THEN 0
                               ELSE erp_sync_lines_value(p_order->'lines', p_scheme) END,
        'salespersonId', NULLIF(BTRIM(p_order->>'salespersonId'), ''),
        'salesperson', COALESCE(NULLIF(BTRIM(p_order->>'salespersonName'), ''), '(no salesperson)'),
        'customer', NULLIF(p_order->>'customerName', ''),
        'orderDate', NULLIF(p_order->>'orderDate', ''),
        'venue', NULLIF(BTRIM(p_order->>'venue'), ''),
        'fairDate', NULLIF(p_order->'raw'->'fair'->>'fairDate', ''),
        'lines', COALESCE((SELECT JSONB_AGG(l.line ORDER BY (l.line->>'lineNo')::INTEGER, l.line->>'itemCode', (l.line->>'amount')::NUMERIC)
                             FROM l), '[]'::JSONB))
      FROM h;
$fn$;

-- The same shape from the bill the portal holds: the ERP's own fields only — a
-- move, Don't count or a fair moved by hand is the portal's, never the ERP's.
CREATE OR REPLACE FUNCTION public.erp_order_state_of_bill(p_order_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT JSONB_BUILD_OBJECT(
        'status', UPPER(COALESCE(NULLIF(o.erp_status, ''), 'CONFIRMED')),
        'onHold', COALESCE(o.erp_on_hold, FALSE),
        'deleted', COALESCE(o.erp_status = 'DELETED', FALSE),
        'total', ROUND(COALESCE(o.order_total, 0), 2),
        'balance', ROUND(o.balance, 2),
        'commissionable', CASE WHEN COALESCE(o.erp_on_hold, FALSE)
                                 OR UPPER(COALESCE(o.erp_status, '')) IN ('CANCELLED', 'DRAFT', 'ON_HOLD', 'DELETED') THEN 0
                               ELSE erp_sync_bill_lines_value(o.id, erp_sync_scheme_of(b.sub_department_id)) END,
        'salespersonId', o.erp_salesperson_id,
        'salesperson', o.agent_name,
        'customer', o.customer_name,
        'orderDate', o.order_date::TEXT,
        'venue', o.venue,
        'fairDate', NULLIF(o.raw->'fair'->>'fairDate', ''),
        'lines', COALESCE((
            SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                       'lineNo', l.line_no,
                       'itemGroup', l.item_group,
                       'itemCode', l.product_code,
                       'description', l.product_name,
                       'variant', l.description2,
                       'qty', l.qty,
                       'unitPrice', ROUND(COALESCE(l.unit_price, 0), 2),
                       'amount', ROUND(COALESCE(l.line_amount, 0), 2))
                   ORDER BY l.line_no, l.product_code, l.line_amount)
              FROM sales_order_lines l
             WHERE l.order_id = o.id), '[]'::JSONB))
      FROM sales_orders o
      JOIN sales_import_batches b ON b.id = o.batch_id
     WHERE o.id = p_order_id;
$fn$;

-- What kind of change one state to the next was, on what EARNS: a document
-- seen for the first time is opened; the ERP stopping counting it is a
-- cancellation, a deletion or a hold; counting it again, reinstated; else the
-- commissionable value up or down — or nothing that earns (changed).
CREATE OR REPLACE FUNCTION public.erp_order_change_kind(p_before JSONB, p_after JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
    SELECT CASE
        WHEN p_before IS NULL THEN 'opened'
        WHEN COALESCE((p_after->>'deleted')::BOOLEAN, FALSE) AND NOT COALESCE((p_before->>'deleted')::BOOLEAN, FALSE) THEN 'deleted'
        WHEN s.after_out AND NOT s.before_out THEN
            CASE WHEN UPPER(COALESCE(p_after->>'status', '')) = 'CANCELLED' THEN 'cancelled' ELSE 'on_hold' END
        WHEN s.before_out AND NOT s.after_out THEN 'reinstated'
        WHEN COALESCE((p_after->>'commissionable')::NUMERIC, 0) > COALESCE((p_before->>'commissionable')::NUMERIC, 0) THEN 'upsell'
        WHEN COALESCE((p_after->>'commissionable')::NUMERIC, 0) < COALESCE((p_before->>'commissionable')::NUMERIC, 0) THEN 'drop'
        ELSE 'changed'
    END
      FROM (SELECT
              COALESCE((p_before->>'deleted')::BOOLEAN, FALSE) OR COALESCE((p_before->>'onHold')::BOOLEAN, FALSE)
                OR UPPER(COALESCE(p_before->>'status', '')) IN ('CANCELLED', 'DRAFT', 'ON_HOLD', 'DELETED') AS before_out,
              COALESCE((p_after->>'deleted')::BOOLEAN, FALSE) OR COALESCE((p_after->>'onHold')::BOOLEAN, FALSE)
                OR UPPER(COALESCE(p_after->>'status', '')) IN ('CANCELLED', 'DRAFT', 'ON_HOLD', 'DELETED') AS after_out) s;
$fn$;

-- What the portal last knew of a document: the trail's last state, else the
-- bill as it holds it, else nothing (never seen).
CREATE OR REPLACE FUNCTION public.erp_sync_known_state(p_sub_department_id UUID, p_doc_no TEXT, p_order_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT COALESCE(
        (SELECT c.state_after
           FROM sales_order_erp_changes c
          WHERE c.sub_department_id = p_sub_department_id AND c.order_no = p_doc_no
          ORDER BY c.received_at DESC, c.saved_at DESC NULLS LAST, c.id DESC
          LIMIT 1),
        CASE WHEN p_order_id IS NOT NULL THEN erp_order_state_of_bill(p_order_id) END);
$fn$;

-- What the commission on a bill was given on, by what, in which month, to
-- whom and when — nothing while it has not been given:
--   (a) a run paid it, or a salesperson's close did (the release a standing
--       close wrote — the unified payroll applies no run): its commissionable
--       value when released;
--   (b) its month was worked out by hand: the claim form's row under the same
--       paper, shared among the paper's documents of that month in proportion
--       to what each held when the month was settled (ZNT6185: RM 15,700 =
--       HC-SO-013384's RM 8,000 + HC-SO-013385's RM 7,700);
--   (c) its month is closed to the feed: the bill as the month froze it.
CREATE OR REPLACE FUNCTION public.erp_sync_settled_basis(p_order_id UUID)
RETURNS TABLE (amount NUMERIC, period DATE, settled_by TEXT, staff_id UUID, settled_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
#variable_conflict use_column
DECLARE
    v_row    sales_orders%ROWTYPE;
    v_sub    UUID;
    v_scheme UUID;
    v_hand   UUID;
    v_staff  UUID;
    v_value  NUMERIC;
    v_docs   INTEGER;
    v_mine   NUMERIC;
    v_all    NUMERIC;
BEGIN
    SELECT * INTO v_row FROM sales_orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    SELECT b.sub_department_id INTO v_sub FROM sales_import_batches b WHERE b.id = v_row.batch_id;
    v_scheme := erp_sync_scheme_of(v_sub);
    IF v_scheme IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT COALESCE(r.commissionable, r.product_revenue)::NUMERIC, r.period_month,
           CASE WHEN c.status IN ('applied', 'locked') THEN 'run' ELSE 'close' END, r.staff_id, r.released_at
      FROM comm_order_releases r
      JOIN comm_runs c ON c.id = r.run_id
     WHERE r.sub_department_id = v_sub AND r.order_no = v_row.order_no
       AND (c.status IN ('applied', 'locked')
            OR EXISTS (SELECT 1 FROM comm_salesperson_closes k
                        WHERE k.sub_department_id = r.sub_department_id AND k.staff_id = r.staff_id
                          AND k.period_month = r.period_month AND k.reopened_at IS NULL))
     ORDER BY r.released_at DESC
     LIMIT 1;
    IF FOUND THEN
        RETURN;
    END IF;

    SELECT m.id, m.staff_id INTO v_hand, v_staff
      FROM sales_orders m
      JOIN sales_import_batches b ON b.id = m.batch_id
     WHERE b.sub_department_id = v_sub
       AND b.status = 'committed'
       AND b.source = 'file'
       AND b.period_month = v_row.period_month
       AND NOT m.cancelled
       AND m.bill_ref = v_row.bill_ref
     ORDER BY m.order_total DESC
     LIMIT 1;
    IF v_hand IS NOT NULL THEN
        v_value := erp_sync_bill_lines_value(v_hand, v_scheme);
        SELECT COUNT(*),
               SUM(CASE WHEN o.id = v_row.id THEN x.held END),
               SUM(x.held)
          INTO v_docs, v_mine, v_all
          FROM sales_orders o
          JOIN sales_import_batches b ON b.id = o.batch_id AND b.sub_department_id = v_sub
          CROSS JOIN LATERAL (SELECT CASE WHEN o.cancelled THEN 0 ELSE erp_sync_bill_lines_value(o.id, v_scheme) END AS held) x
         WHERE o.source = 'erp_sync'
           AND o.period_month = v_row.period_month
           AND o.bill_ref = v_row.bill_ref;
        RETURN QUERY SELECT
            CASE WHEN COALESCE(v_docs, 0) <= 1 THEN v_value
                 WHEN COALESCE(v_all, 0) > 0 THEN ROUND(v_value * COALESCE(v_mine, 0) / v_all, 2)
                 ELSE ROUND(v_value / v_docs, 2) END,
            v_row.period_month, 'hand'::TEXT, v_staff, '-infinity'::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM sales_import_batches b WHERE b.id = v_row.batch_id AND b.status = 'committed')
       AND erp_feed_month_closed(v_sub, v_row.period_month) THEN
        RETURN QUERY SELECT
            CASE WHEN v_row.cancelled THEN 0::NUMERIC ELSE erp_sync_bill_lines_value(v_row.id, v_scheme) END,
            v_row.period_month, 'frozen'::TEXT, v_row.staff_id, '-infinity'::TIMESTAMPTZ;
    END IF;
END;
$fn$;

-- ─── 5. What the ERP changed on a bill whose commission was given ───────────

CREATE OR REPLACE FUNCTION public.erp_sync_note_adjustment(p_order_id UUID, p_order JSONB, p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_row       sales_orders%ROWTYPE;
    v_sub       UUID;
    v_scheme    UUID;
    v_status    TEXT := UPPER(COALESCE(NULLIF(BTRIM(p_order->>'status'), ''), 'CONFIRMED'));
    v_deleted   BOOLEAN := COALESCE((p_order->>'deleted')::BOOLEAN, FALSE);
    v_on_hold   BOOLEAN := COALESCE((p_order->>'onHold')::BOOLEAN, FALSE);
    v_by_hand   BOOLEAN;
    v_new       NUMERIC(15, 2);
    v_settled   NUMERIC(15, 2);
    v_period    DATE;
    v_by        TEXT;
    v_staff     UUID;
    v_at        TIMESTAMPTZ;
    v_stand     NUMERIC(15, 2);
    v_stood_at  TIMESTAMPTZ;
    v_base      NUMERIC(15, 2);
    v_delta     NUMERIC(15, 2);
    v_reason    TEXT;
    v_month     DATE;
    v_today     DATE := (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE;
BEGIN
    SELECT * INTO v_row FROM sales_orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    SELECT b.sub_department_id INTO v_sub FROM sales_import_batches b WHERE b.id = v_row.batch_id;
    v_scheme := erp_sync_scheme_of(v_sub);
    IF v_scheme IS NULL THEN
        RETURN;
    END IF;
    v_by_hand := sales_order_excluded_by_hand(v_row.id);

    IF v_deleted OR v_status IN ('CANCELLED', 'DRAFT', 'ON_HOLD') OR v_on_hold OR v_by_hand THEN
        v_new := 0;
    ELSE
        v_new := erp_sync_lines_value(p_order->'lines', v_scheme);
    END IF;

    SELECT b.amount, b.period, b.settled_by, b.staff_id, b.settled_at
      INTO v_settled, v_period, v_by, v_staff, v_at
      FROM erp_sync_settled_basis(v_row.id) b;
    IF v_settled IS NULL OR v_staff IS NULL THEN
        DELETE FROM comm_upsales
         WHERE sub_department_id = v_sub AND erp_doc_no = v_row.order_no AND status = 'pending';
        RETURN;
    END IF;

    SELECT u.erp_amount, u.decided_at INTO v_stand, v_stood_at
      FROM comm_upsales u
     WHERE u.sub_department_id = v_sub AND u.erp_doc_no = v_row.order_no
       AND u.status = 'dismissed' AND u.erp_amount IS NOT NULL
       AND u.decided_at > v_at
     ORDER BY u.decided_at DESC
     LIMIT 1;
    IF v_stood_at IS NOT NULL THEN
        v_base := v_stand + COALESCE((
            SELECT SUM(u.amount) FROM comm_upsales u
             WHERE u.sub_department_id = v_sub AND u.erp_doc_no = v_row.order_no
               AND u.status = 'confirmed' AND u.decided_at > v_stood_at), 0);
    ELSE
        v_base := v_settled + COALESCE((
            SELECT SUM(u.amount) FROM comm_upsales u
             WHERE u.sub_department_id = v_sub AND u.erp_doc_no = v_row.order_no
               AND u.status = 'confirmed'), 0);
    END IF;
    v_delta := ROUND(v_new - v_base, 2);

    IF ABS(v_delta) < 0.01 THEN
        DELETE FROM comm_upsales
         WHERE sub_department_id = v_sub AND erp_doc_no = v_row.order_no AND status = 'pending';
        RETURN;
    END IF;

    v_reason := CASE WHEN v_deleted THEN 'deleted'
                     WHEN v_status = 'CANCELLED' THEN 'cancelled'
                     WHEN v_on_hold OR v_status IN ('ON_HOLD', 'DRAFT') THEN 'on_hold'
                     WHEN v_by_hand THEN 'not_counted'
                     WHEN ABS(v_base) < 0.01 AND v_delta > 0 THEN 'reinstated'
                     ELSE 'amount' END;
    v_month := GREATEST(DATE_TRUNC('month', v_today)::DATE,
                        (DATE_TRUNC('month', v_period) + INTERVAL '1 month')::DATE);

    INSERT INTO comm_upsales (
        sub_department_id, period_month, staff_id, amount, sold_on, original_ref, note,
        kind, status, source, erp_doc_no, erp_event_id, settled_amount, erp_amount, original_period,
        erp_reason, settled_period, settled_by, created_by)
    VALUES (
        v_sub, v_month, v_staff, v_delta, v_today, v_row.bill_ref,
        'The ERP ' || CASE v_reason WHEN 'cancelled' THEN 'cancelled ' WHEN 'deleted' THEN 'deleted '
                                    WHEN 'on_hold' THEN 'held back ' WHEN 'reinstated' THEN 'reinstated '
                                    ELSE 'changed ' END
            || v_row.order_no || ' after its commission was given in ' || TO_CHAR(v_period, 'FMMonth YYYY'),
        CASE WHEN v_delta > 0 THEN 'upsale' ELSE 'drop' END, 'pending', 'erp', v_row.order_no, p_event_id,
        v_base, v_new, v_row.period_month, v_reason, v_period, v_by, NULL)
    ON CONFLICT (sub_department_id, erp_doc_no) WHERE status = 'pending' AND erp_doc_no IS NOT NULL
    DO UPDATE SET amount          = EXCLUDED.amount,
                  kind            = EXCLUDED.kind,
                  staff_id        = EXCLUDED.staff_id,
                  period_month    = EXCLUDED.period_month,
                  sold_on         = CASE WHEN comm_upsales.amount = EXCLUDED.amount THEN comm_upsales.sold_on
                                         ELSE EXCLUDED.sold_on END,
                  original_ref    = EXCLUDED.original_ref,
                  note            = EXCLUDED.note,
                  erp_event_id    = COALESCE(EXCLUDED.erp_event_id, comm_upsales.erp_event_id),
                  settled_amount  = EXCLUDED.settled_amount,
                  erp_amount      = EXCLUDED.erp_amount,
                  original_period = EXCLUDED.original_period,
                  erp_reason      = EXCLUDED.erp_reason,
                  settled_period  = EXCLUDED.settled_period,
                  settled_by      = EXCLUDED.settled_by;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'erp_sync_note_adjustment(%): %', p_order_id, SQLERRM;
END;
$fn$;

COMMENT ON FUNCTION public.erp_sync_note_adjustment(UUID, JSONB, UUID) IS
    'What the ERP changed on a bill whose commission was given (erp_sync_settled_basis: a run, a salesperson''s standing close, the claim form''s part under the same paper, a month closed to the feed): the delivery''s commissionable amount (0 when the ERP no longer counts it, or somebody took the bill out by hand) minus that figure — moved by drops/upsells confirmed since, re-based by the latest "Not a change" since — is one pending comm_upsales row per document, payable from the month after the one that gave the commission, with why (erp_reason). Nothing given: no question. Never raises. 2026-10-13.';

-- ─── 6. The trail's writer, and what the receiver does after every delivery ─

CREATE OR REPLACE FUNCTION public.erp_sync_note_change(
    p_sub_department_id UUID,
    p_doc_no            TEXT,
    p_order_id          UUID,
    p_event_id          UUID,
    p_outcome           TEXT,
    p_period            DATE,
    p_before            JSONB,
    p_after             JSONB,
    p_saved_at          TIMESTAMPTZ,
    p_received_at       TIMESTAMPTZ DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_id      UUID;
    v_settled NUMERIC(15, 2);
    v_period  DATE;
    v_by      TEXT;
    v_adjust  UUID;
BEGIN
    IF p_after IS NULL OR p_before IS NOT DISTINCT FROM p_after THEN
        RETURN NULL;
    END IF;
    IF p_order_id IS NOT NULL THEN
        SELECT b.amount, b.period, b.settled_by INTO v_settled, v_period, v_by
          FROM erp_sync_settled_basis(p_order_id) b;
        IF v_settled IS NOT NULL THEN
            SELECT u.id INTO v_adjust
              FROM comm_upsales u
             WHERE u.sub_department_id = p_sub_department_id AND u.erp_doc_no = p_doc_no AND u.status = 'pending';
        END IF;
    END IF;

    INSERT INTO sales_order_erp_changes (
        sub_department_id, order_no, order_id, event_id, saved_at, received_at, outcome, period_month, kind,
        total_before, total_after, commissionable_before, commissionable_after, status_before, status_after,
        state_before, state_after, settled_amount, settled_period, settled_by, adjustment_id)
    VALUES (
        p_sub_department_id, p_doc_no, p_order_id, p_event_id, p_saved_at, COALESCE(p_received_at, NOW()), p_outcome,
        p_period, erp_order_change_kind(p_before, p_after),
        (p_before->>'total')::NUMERIC, (p_after->>'total')::NUMERIC,
        (p_before->>'commissionable')::NUMERIC, (p_after->>'commissionable')::NUMERIC,
        p_before->>'status', p_after->>'status',
        p_before, p_after,
        v_settled, v_period, v_by, v_adjust)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$fn$;

COMMENT ON FUNCTION public.erp_sync_note_change(UUID, TEXT, UUID, UUID, TEXT, DATE, JSONB, JSONB, TIMESTAMPTZ, TIMESTAMPTZ) IS
    'Writes one row of the ERP audit trail (sales_order_erp_changes) when the document after a delivery differs from what the portal knew before it — nothing when they are the same. Says whether its commission had been given (erp_sync_settled_basis) and which drop or upsell waits on it.';

-- Every way out of the receiver goes through here (20261013010000). For a
-- delivery it applied or held of a document the portal holds or held: the
-- question an APPLIED change asks of a bill whose commission was given (the
-- receiver asked it of a held one already), and the trail. A fault here is
-- never the delivery's: the delivery stands, the fault is a warning on its log.
CREATE OR REPLACE FUNCTION public.erp_sync_after_delivery(
    p_sub_department_id UUID,
    p_doc_no            TEXT,
    p_order             JSONB,
    p_result            JSONB,
    p_before            JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_status TEXT := p_result->>'status';
    v_event  UUID := NULLIF(p_result->>'eventId', '')::UUID;
    v_bill   UUID;
    v_period DATE;
    v_after  JSONB;
BEGIN
    IF p_doc_no IS NULL OR v_status IS NULL OR v_status NOT IN ('applied', 'held') THEN
        RETURN p_result;
    END IF;
    BEGIN
        SELECT o.id, o.period_month INTO v_bill, v_period
          FROM sales_orders o
          JOIN sales_import_batches b ON b.id = o.batch_id AND b.sub_department_id = p_sub_department_id
         WHERE o.order_no = p_doc_no AND o.source = 'erp_sync';
        IF p_before IS NULL AND v_bill IS NULL THEN
            RETURN p_result;
        END IF;
        IF COALESCE((p_order->>'deleted')::BOOLEAN, FALSE) THEN
            v_after := COALESCE(p_before, '{}'::JSONB) || JSONB_BUILD_OBJECT('deleted', TRUE, 'status', 'DELETED', 'commissionable', 0);
        ELSE
            v_after := erp_order_state(p_order, erp_sync_scheme_of(p_sub_department_id));
        END IF;
        IF v_status = 'applied' AND v_bill IS NOT NULL THEN
            PERFORM erp_sync_note_adjustment(v_bill, p_order, v_event);
        END IF;
        PERFORM erp_sync_note_change(p_sub_department_id, p_doc_no, v_bill, v_event, v_status,
                    COALESCE(v_period, NULLIF(p_result->>'periodMonth', '')::DATE),
                    p_before, v_after, NULLIF(p_order->>'snapshotAt', '')::TIMESTAMPTZ);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'erp_sync_after_delivery(%): %', p_doc_no, SQLERRM;
        IF v_event IS NOT NULL THEN
            UPDATE erp_sync_events
               SET warnings = ARRAY_APPEND(warnings, 'change_trail_failed')
             WHERE id = v_event;
        END IF;
    END;
    RETURN p_result;
END;
$fn$;

COMMENT ON FUNCTION public.erp_sync_after_delivery(UUID, TEXT, JSONB, JSONB, JSONB) IS
    'Every way out of ingest_erp_sales_order (2026-10-13): for a delivery applied or held of a document the portal holds or held, asks the drop / upsell question of an applied change to a bill whose commission was given (erp_sync_note_adjustment), and writes the ERP audit trail (erp_sync_note_change). Returns the receiver''s result unchanged; a fault is a warning (change_trail_failed) on the delivery, never the delivery''s failure.';

-- A bill's question asked again from what the portal knows of it now — when a
-- close is made or reopened (its releases come and go), and once below.
CREATE OR REPLACE FUNCTION public.erp_sync_review_order(p_sub_department_id UUID, p_order_no TEXT)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_id UUID;
BEGIN
    SELECT o.id INTO v_id
      FROM sales_orders o
      JOIN sales_import_batches b ON b.id = o.batch_id AND b.sub_department_id = p_sub_department_id
     WHERE o.order_no = p_order_no AND o.source = 'erp_sync';
    IF v_id IS NULL THEN
        RETURN;
    END IF;
    PERFORM erp_sync_note_adjustment(v_id, erp_sync_known_state(p_sub_department_id, p_order_no, v_id), NULL);
END;
$fn$;

-- ─── 7. Releases keep what they paid on, and ask again ──────────────────────
-- Both run for their trigger only, as their owner — as the close that writes
-- the releases does (comm_close_sync_payroll): whoever closes a salesperson
-- need not read the scheme's item groups for the bill's value to be kept.
-- Nobody may call them (EXECUTE is taken away below; a trigger fires without).

CREATE OR REPLACE FUNCTION public.comm_order_releases_capture()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    IF NEW.commissionable IS NULL THEN
        SELECT CASE WHEN o.cancelled THEN 0
                    ELSE erp_sync_bill_lines_value(o.id, erp_sync_scheme_of(NEW.sub_department_id)) END
          INTO NEW.commissionable
          FROM sales_orders o
          JOIN sales_import_batches b ON b.id = o.batch_id AND b.sub_department_id = NEW.sub_department_id
         WHERE o.order_no = NEW.order_no
         ORDER BY (o.source = 'erp_sync') DESC, (b.status = 'committed') DESC, o.synced_at DESC NULLS LAST
         LIMIT 1;
    END IF;
    RETURN NEW;
END;
$fn$;

CREATE OR REPLACE TRIGGER comm_order_releases_capture
    BEFORE INSERT ON public.comm_order_releases
    FOR EACH ROW EXECUTE FUNCTION public.comm_order_releases_capture();

CREATE OR REPLACE FUNCTION public.comm_order_releases_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM erp_sync_review_order(OLD.sub_department_id, OLD.order_no);
        RETURN OLD;
    END IF;
    PERFORM erp_sync_review_order(NEW.sub_department_id, NEW.order_no);
    RETURN NEW;
END;
$fn$;

CREATE OR REPLACE TRIGGER comm_order_releases_review
    AFTER INSERT OR DELETE ON public.comm_order_releases
    FOR EACH ROW EXECUTE FUNCTION public.comm_order_releases_review();

-- A change is paid in a month after the one that gave the commission: that
-- month already counts the bill as the ERP has it now.
CREATE OR REPLACE FUNCTION public.comm_upsales_after_settled()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
    IF NEW.status = 'confirmed' AND NEW.settled_period IS NOT NULL
       AND NEW.period_month <= DATE_TRUNC('month', NEW.settled_period)::DATE THEN
        RAISE EXCEPTION 'The commission on % was given in % — pay this change in a later month',
            COALESCE(NEW.erp_doc_no, NEW.original_ref), TO_CHAR(NEW.settled_period, 'FMMonth YYYY')
            USING ERRCODE = '23ADJ';
    END IF;
    RETURN NEW;
END;
$fn$;

CREATE OR REPLACE TRIGGER comm_upsales_after_settled
    BEFORE INSERT OR UPDATE ON public.comm_upsales
    FOR EACH ROW EXECUTE FUNCTION public.comm_upsales_after_settled();

-- ─── 8. The receiver: production's body, four swaps ─────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.swap_once(p_src TEXT, p_old TEXT, p_new TEXT, p_times INTEGER DEFAULT 1)
RETURNS TEXT
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_old TEXT := replace(p_old, chr(13), '');
    v_new TEXT := replace(p_new, chr(13), '');
    v_n   INTEGER := (length(p_src) - length(replace(p_src, v_old, ''))) / length(v_old);
BEGIN
    IF v_n <> p_times THEN
        RAISE EXCEPTION 'ingest_erp_sales_order: "%" is there % times, not % — production changed since this migration was written',
            left(v_old, 60), v_n, p_times;
    END IF;
    RETURN replace(p_src, v_old, v_new);
END
$fn$;

DO $swap$
DECLARE
    v_fn  REGPROCEDURE := 'public.ingest_erp_sales_order(jsonb, uuid)'::REGPROCEDURE;
    v_src TEXT := (SELECT prosrc FROM pg_proc WHERE oid = 'public.ingest_erp_sales_order(jsonb, uuid)'::REGPROCEDURE);
    v_new TEXT;
    v_n   INTEGER;
BEGIN
    IF strpos(v_src, 'erp_sync_after_delivery(') > 0 THEN
        RETURN;
    END IF;
    v_new := v_src;

    -- 1. What the portal knew of the document before this delivery.
    v_new := pg_temp.swap_once(v_new,
$old$    v_try           DATE;
BEGIN$old$,
$new$    v_try           DATE;
    -- (20261013010000) What the portal knew of the document before this delivery.
    v_before        JSONB;
BEGIN$new$);

    -- 2. Read once the document is found and known to be Fair's.
    v_new := pg_temp.swap_once(v_new,
$old$        RAISE EXCEPTION 'Existing ERP document belongs to another sub-department';
    END IF;
$old$,
$new$        RAISE EXCEPTION 'Existing ERP document belongs to another sub-department';
    END IF;
    -- (20261013010000) The ERP audit trail compares this delivery with it.
    v_before := erp_sync_known_state(v_sub_id, v_doc_no, CASE WHEN v_found THEN v_existing.id END);
$new$);

    -- 3. An applied write no longer clears the question waiting on its
    --    document: a bill a close paid still asks (erp_sync_after_delivery).
    v_new := pg_temp.swap_once(v_new,
$old$        -- (20260926020000) Written, not held: a drop or upsell waiting on this
        -- document described a settled month that is open again.
        DELETE FROM comm_upsales
         WHERE sub_department_id = v_sub_id AND erp_doc_no = v_doc_no AND status = 'pending';
$old$,
$new$        -- (20261013010000) Written, not held: whether a drop or an upsell still
        -- waits on this document is erp_sync_after_delivery's to say — a bill a
        -- salesperson's close paid asks even though its month is open.
$new$);

    -- 4. Every way out goes through erp_sync_after_delivery.
    SELECT count(*) INTO v_n FROM regexp_matches(v_new, 'RETURN erp_sync_log\(', 'g');
    IF v_n <> 9 THEN
        RAISE EXCEPTION 'ingest_erp_sales_order: % ways out through erp_sync_log, not 9 — production changed since this migration was written', v_n;
    END IF;
    v_new := regexp_replace(v_new, 'RETURN erp_sync_log\(([^;]*)\);',
        'RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, erp_sync_log(\1), v_before);', 'g');
    v_new := pg_temp.swap_once(v_new,
        'RETURN v_result;',
        'RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, v_result, v_before);', 4);
    v_new := pg_temp.swap_once(v_new,
        $old$RETURN v_result || JSONB_BUILD_OBJECT('orderId', v_order_id);$old$,
        $new$RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, v_result || JSONB_BUILD_OBJECT('orderId', v_order_id), v_before);$new$);

    SELECT count(*) INTO v_n FROM regexp_matches(v_new, 'RETURN erp_sync_after_delivery\(', 'g');
    IF v_n <> 14 THEN
        RAISE EXCEPTION 'ingest_erp_sales_order: % ways out after the swaps, not 14', v_n;
    END IF;

    EXECUTE replace(pg_get_functiondef(v_fn), v_src, v_new);

    IF (SELECT prosrc FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM v_new THEN
        RAISE EXCEPTION 'ingest_erp_sales_order did not take the swapped body';
    END IF;
END
$swap$;

COMMENT ON FUNCTION public.ingest_erp_sales_order(JSONB, UUID) IS
    'The ERP live feed''s one write: upserts one sales order (canonical shape from src/lib/erp-sync/contract.ts) into the period''s erp_sync batch, replaces its lines, re-derives the day''s Open Bill suggestions, refreshes the batch counters and logs the outcome. Every way out goes through erp_sync_after_delivery (2026-10-13): the ERP audit trail (sales_order_erp_changes) and the drop / upsell question an applied change to a bill whose commission was given asks. Never raises for a business outcome — see erp_sync_events.status.';

-- ─── 9. Who may call what ───────────────────────────────────────────────────

-- The receiver's helpers run as their caller: the service role, or HR replaying
-- held deliveries under the session (Comm Cal › Data source).
REVOKE ALL ON FUNCTION public.erp_sync_scheme_of(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_sync_lines_value(JSONB, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_sync_bill_lines_value(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_order_state(JSONB, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_order_state_of_bill(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_order_change_kind(JSONB, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_sync_known_state(UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_sync_settled_basis(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_sync_note_change(UUID, TEXT, UUID, UUID, TEXT, DATE, JSONB, JSONB, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_sync_after_delivery(UUID, TEXT, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_sync_review_order(UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.erp_sync_scheme_of(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_sync_lines_value(JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_sync_bill_lines_value(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_order_state(JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_order_state_of_bill(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_order_change_kind(JSONB, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_sync_known_state(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_sync_settled_basis(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_sync_note_change(UUID, TEXT, UUID, UUID, TEXT, DATE, JSONB, JSONB, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_sync_after_delivery(UUID, TEXT, JSONB, JSONB, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_sync_review_order(UUID, TEXT) TO authenticated, service_role;

-- Trigger functions: nobody calls them.
REVOKE ALL ON FUNCTION public.comm_order_releases_capture() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comm_order_releases_review() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comm_upsales_after_settled() FROM PUBLIC, anon, authenticated;

-- ─── 10. The trail of the held deliveries the feed kept (since 2026-09-26) ──
-- A held delivery kept its payload: each document's held deliveries, in the
-- order they came, compared one with the next — the first with the bill as
-- its settled month froze it. Applied deliveries kept no payload: their trail
-- starts with the next save.

DO $rebuild$
DECLARE
    v_sub    UUID := erp_sync_sub_department();
    v_scheme UUID;
    r        RECORD;
    v_doc    TEXT;
    v_prev   JSONB;
    v_after  JSONB;
BEGIN
    IF v_sub IS NULL OR EXISTS (SELECT 1 FROM sales_order_erp_changes WHERE sub_department_id = v_sub) THEN
        RETURN;
    END IF;
    v_scheme := erp_sync_scheme_of(v_sub);
    FOR r IN
        SELECT e.id AS event_id, e.doc_no, e.payload, e.snapshot_at, e.received_at, o.id AS order_id, o.period_month
          FROM erp_sync_events e
          JOIN sales_orders o ON o.order_no = e.doc_no AND o.source = 'erp_sync'
          JOIN sales_import_batches b ON b.id = o.batch_id AND b.sub_department_id = v_sub
         WHERE e.status = 'held' AND e.payload IS NOT NULL
         ORDER BY e.doc_no, e.received_at, e.id
    LOOP
        IF v_doc IS DISTINCT FROM r.doc_no THEN
            v_doc := r.doc_no;
            v_prev := erp_order_state_of_bill(r.order_id);
        END IF;
        IF COALESCE((r.payload->>'deleted')::BOOLEAN, FALSE) THEN
            v_after := v_prev || JSONB_BUILD_OBJECT('deleted', TRUE, 'status', 'DELETED', 'commissionable', 0);
        ELSE
            v_after := erp_order_state(r.payload, v_scheme);
        END IF;
        PERFORM erp_sync_note_change(v_sub, r.doc_no, r.order_id, r.event_id, 'held', r.period_month,
                    v_prev, v_after, r.snapshot_at, r.received_at);
        v_prev := v_after;
    END LOOP;
    -- The rebuilt rows say what the commission had been given on; which
    -- question each opened is not known any more.
    UPDATE sales_order_erp_changes SET adjustment_id = NULL WHERE sub_department_id = v_sub;
END
$rebuild$;

-- ─── 11. The questions waiting now, asked again by the rules above ──────────
-- ZNT6185's two documents stop asking (each now carries its own part of the
-- paper); every other waiting question is measured again from what the
-- portal knows of its document — its last held delivery.

DO $review$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT DISTINCT u.sub_department_id, u.erp_doc_no
          FROM comm_upsales u
         WHERE u.status = 'pending' AND u.source = 'erp' AND u.erp_doc_no IS NOT NULL
    LOOP
        PERFORM erp_sync_review_order(r.sub_department_id, r.erp_doc_no);
    END LOOP;
    -- Each rebuilt change points at the question waiting on its document, if any.
    UPDATE sales_order_erp_changes c
       SET adjustment_id = u.id
      FROM comm_upsales u
     WHERE u.sub_department_id = c.sub_department_id AND u.erp_doc_no = c.order_no AND u.status = 'pending'
       AND c.id = (SELECT c2.id FROM sales_order_erp_changes c2
                    WHERE c2.sub_department_id = c.sub_department_id AND c2.order_no = c.order_no
                    ORDER BY c2.received_at DESC, c2.id DESC LIMIT 1);
END
$review$;

NOTIFY pgrst, 'reload schema';
