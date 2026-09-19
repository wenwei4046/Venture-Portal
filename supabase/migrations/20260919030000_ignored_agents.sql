-- ============================================================================
-- THE PEOPLE WHO ARE NOT OURS (2026-09-19)
--
-- The feed names whoever the ERP put on the document, and the portal can only
-- place a name a human has matched once (comm_agent_aliases). Every other name
-- goes red on Comm Cal and STAYS red: twelve of them the day this was written,
-- 27 orders, RM 111,453. Ten of those twelve can never be matched -
--
--   * five are AutoCount import stubs. The ERP's cutover opened a salesperson
--     record from the agent string on each old document and called it
--     ACIMP-<name>; they were never employees.
--   * three are ex-colleagues who still carry an ERP employee number.
--   * two are ONE director's two ERP identities (SD-LOO and EMP-0004). His
--     sales are real; they are simply not the Fair scheme's to pay.
--
-- A red name means "answer this". A red name that can never be answered is
-- worse than no list at all, because every month somebody has to work out
-- again which of the reds are real work. So "this is not our salesperson" is
-- an answer worth storing - and once stored their orders are OUT: out of the
-- month's sales, out of the venue and person breakdowns, out of the engine,
-- exactly as an ERP-cancelled bill is (user, 2026-09-19).
--
-- WHY A TRIGGER, not four lines inside ingest_erp_sales_order: the ERP
-- re-pushes a whole document on every save, and a file import writes the same
-- table. The answer has to survive both without either of them knowing it
-- exists - the same reason sales_order_lines_fill_cost is a trigger.
--
-- WHY A REASON COLUMN: `cancelled` has always meant "earns nothing", and the
-- orders board reads the ERP's own status to say why. An ignored bill is
-- DELIVERED in the ERP and still earns nothing, so without a reason of its own
-- the board would call a perfectly live bill cancelled.
-- ============================================================================

-- --- 1. The list ------------------------------------------------------------

CREATE TABLE comm_ignored_agents (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_key          TEXT NOT NULL UNIQUE,
    agent_name_sample  TEXT NOT NULL,
    erp_salesperson_id TEXT,
    note               TEXT,
    created_by         UUID REFERENCES users(id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Not unique, deliberately: comm_agent_aliases must hold one id at most once
-- because a match has a target and two targets would be a contradiction. An
-- ignore has no target, so the same person arriving under two spellings can
-- sit here twice - both rows say the same thing.
CREATE INDEX idx_comm_ignored_agents_erp ON comm_ignored_agents (erp_salesperson_id);

COMMENT ON TABLE comm_ignored_agents IS
    'ERP salespeople who are not ours to pay - import stubs, ex-colleagues, a director selling outside the scheme. The twin of comm_agent_aliases: that one says who a name IS, this one says the name will never be anybody. Their orders are excluded on arrival by trigger.';
COMMENT ON COLUMN comm_ignored_agents.agent_key IS
    'UPPER(collapse-whitespace(name)), the same key comm_agent_aliases and sales_orders use.';
COMMENT ON COLUMN comm_ignored_agents.erp_salesperson_id IS
    'The ERP''s own salesperson id, when the delivery carried one. Matched first, so a rename in the ERP does not un-ignore the person.';
COMMENT ON COLUMN comm_ignored_agents.note IS
    'Why, in the words of whoever decided - "ex-colleague", "AutoCount import stub", "director, not Fair".';

ALTER TABLE comm_ignored_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY comm_ignored_agents_hr_all ON comm_ignored_agents FOR ALL
    USING ((SELECT has_scope(ARRAY['hr']))) WITH CHECK ((SELECT has_scope(ARRAY['hr'])));
CREATE POLICY comm_ignored_agents_principal_all ON comm_ignored_agents FOR ALL
    USING ((SELECT has_scope(ARRAY['admin']))) WITH CHECK ((SELECT has_scope(ARRAY['admin'])));

-- --- 2. Why a bill earns nothing, when the ERP is not the reason ------------

ALTER TABLE sales_orders ADD COLUMN excluded_reason TEXT;

COMMENT ON COLUMN sales_orders.excluded_reason IS
    'Why this bill is excluded when the ERP is not the one saying so. Only value today: ignored_agent. NULL for an ERP-side exclusion - erp_status and erp_on_hold already say that in the ERP''s own words.';

-- --- 3. Is this name on the list --------------------------------------------
--
-- SECURITY DEFINER because the trigger below must reach the same verdict for
-- every writer: the service-role receiver, an HR session, a Principal session.
-- A reader without the scope would otherwise decide "not ignored" and let the
-- orders back in.

CREATE OR REPLACE FUNCTION erp_sync_agent_ignored(p_agent_key TEXT, p_erp_salesperson_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM comm_ignored_agents g
         WHERE (NULLIF(BTRIM(p_erp_salesperson_id), '') IS NOT NULL
                AND g.erp_salesperson_id = BTRIM(p_erp_salesperson_id))
            OR (NULLIF(BTRIM(p_agent_key), '') IS NOT NULL
                AND g.agent_key = UPPER(REGEXP_REPLACE(BTRIM(p_agent_key), '\s+', ' ', 'g')))
    );
$$;

COMMENT ON FUNCTION erp_sync_agent_ignored(TEXT, TEXT) IS
    'True when this ERP salesperson is one we will never pay. The ERP id is asked first so a rename on their side does not quietly un-ignore them.';

REVOKE ALL ON FUNCTION erp_sync_agent_ignored(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION erp_sync_agent_ignored(TEXT, TEXT) TO service_role, authenticated;

-- --- 4. Applied on arrival, whichever path wrote the row --------------------

CREATE OR REPLACE FUNCTION sales_orders_apply_ignored_agent()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF erp_sync_agent_ignored(NEW.agent_key, NEW.erp_salesperson_id) THEN
        NEW.cancelled := TRUE;
        NEW.excluded_reason := 'ignored_agent';
    ELSIF NEW.excluded_reason = 'ignored_agent' THEN
        -- Un-ignored since the row was last written. Whoever un-ignored them
        -- recomputes `cancelled` from the ERP's status; the stale reason must
        -- not outlive it.
        NEW.excluded_reason := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER sales_orders_ignored_agent
    BEFORE INSERT OR UPDATE ON sales_orders
    FOR EACH ROW EXECUTE FUNCTION sales_orders_apply_ignored_agent();

COMMENT ON FUNCTION sales_orders_apply_ignored_agent() IS
    'An ignored salesperson''s bill is excluded no matter who wrote it - the live receiver, a replay, a file import. The ERP re-pushes a document on every save, so this cannot live in the ingest alone.';

-- --- 5. Say a name is not ours ----------------------------------------------

CREATE OR REPLACE FUNCTION erp_sync_ignore_agent(
    p_agent_key TEXT,
    p_erp_salesperson_id TEXT DEFAULT NULL,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_key      TEXT := UPPER(REGEXP_REPLACE(BTRIM(COALESCE(p_agent_key, '')), '\s+', ' ', 'g'));
    v_sp_id    TEXT := NULLIF(BTRIM(p_erp_salesperson_id), '');
    v_sub      UUID;
    v_sample   TEXT;
    v_locked   DATE[];
    v_orders   INTEGER := 0;
    v_locked_orders INTEGER := 0;
    r          RECORD;
BEGIN
    IF v_key = '' AND v_sp_id IS NULL THEN
        RAISE EXCEPTION 'Nothing to ignore';
    END IF;
    -- A delivery with an id but no usable name is still a person to ignore.
    IF v_key = '' THEN v_key := 'ERP:' || v_sp_id; END IF;

    -- A matched name is somebody's pay. Ignoring it would take their orders
    -- away from them silently, so it is refused outright.
    IF EXISTS (
        SELECT 1 FROM comm_agent_aliases a
         WHERE a.agent_key = v_key
            OR (v_sp_id IS NOT NULL AND a.erp_salesperson_id = v_sp_id)
    ) THEN
        RAISE EXCEPTION 'That name is matched to a salesperson - it is somebody''s pay, not a stray'
            USING ERRCODE = '23IGN';
    END IF;

    v_sub := erp_sync_sub_department();

    SELECT agent_name INTO v_sample
      FROM sales_orders
     WHERE agent_key = v_key OR (v_sp_id IS NOT NULL AND erp_salesperson_id = v_sp_id)
     ORDER BY synced_at DESC NULLS LAST
     LIMIT 1;

    INSERT INTO comm_ignored_agents (agent_key, agent_name_sample, erp_salesperson_id, note, created_by)
    VALUES (v_key, COALESCE(v_sample, v_key), v_sp_id, NULLIF(BTRIM(p_note), ''), auth.uid())
    ON CONFLICT (agent_key) DO UPDATE
        SET erp_salesperson_id = COALESCE(EXCLUDED.erp_salesperson_id, comm_ignored_agents.erp_salesperson_id),
            note = COALESCE(EXCLUDED.note, comm_ignored_agents.note);

    -- A month whose run has paid does not move, for the same reason a match
    -- does not move it: the money is out.
    SELECT COALESCE(ARRAY_AGG(m) FILTER (WHERE commission_order_period_locked(v_sub, m)), '{}')
      INTO v_locked
      FROM (SELECT DISTINCT period_month AS m
              FROM sales_orders
             WHERE agent_key = v_key OR (v_sp_id IS NOT NULL AND erp_salesperson_id = v_sp_id)) months;

    UPDATE sales_orders
       SET cancelled = TRUE, excluded_reason = 'ignored_agent'
     WHERE (agent_key = v_key OR (v_sp_id IS NOT NULL AND erp_salesperson_id = v_sp_id))
       AND period_month <> ALL (v_locked)
       AND excluded_reason IS DISTINCT FROM 'ignored_agent';
    GET DIAGNOSTICS v_orders = ROW_COUNT;

    SELECT COUNT(*) INTO v_locked_orders
      FROM sales_orders
     WHERE (agent_key = v_key OR (v_sp_id IS NOT NULL AND erp_salesperson_id = v_sp_id))
       AND period_month = ANY (v_locked);

    FOR r IN
        SELECT DISTINCT batch_id FROM sales_orders
         WHERE (agent_key = v_key OR (v_sp_id IS NOT NULL AND erp_salesperson_id = v_sp_id))
           AND batch_id IS NOT NULL
    LOOP
        PERFORM erp_sync_refresh_batch(r.batch_id);
    END LOOP;

    RETURN JSONB_BUILD_OBJECT('ordersExcluded', v_orders, 'ordersLocked', v_locked_orders);
END;
$$;

COMMENT ON FUNCTION erp_sync_ignore_agent(TEXT, TEXT, TEXT) IS
    'Record that an ERP salesperson is not ours and take their bills out of the month. Refuses a name that is matched to somebody - that is pay, not a stray. A month whose run has paid keeps its bills.';

REVOKE ALL ON FUNCTION erp_sync_ignore_agent(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION erp_sync_ignore_agent(TEXT, TEXT, TEXT) TO service_role, authenticated;

-- --- 6. Take it back --------------------------------------------------------

CREATE OR REPLACE FUNCTION erp_sync_unignore_agent(p_agent_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_key    TEXT := UPPER(REGEXP_REPLACE(BTRIM(COALESCE(p_agent_key, '')), '\s+', ' ', 'g'));
    v_sub    UUID;
    v_sp_id  TEXT;
    v_locked DATE[];
    v_orders INTEGER := 0;
    r        RECORD;
BEGIN
    IF v_key = '' THEN RAISE EXCEPTION 'Nothing to restore'; END IF;
    SELECT erp_salesperson_id INTO v_sp_id FROM comm_ignored_agents WHERE agent_key = v_key;
    DELETE FROM comm_ignored_agents WHERE agent_key = v_key;
    v_sub := erp_sync_sub_department();

    SELECT COALESCE(ARRAY_AGG(m) FILTER (WHERE commission_order_period_locked(v_sub, m)), '{}')
      INTO v_locked
      FROM (SELECT DISTINCT period_month AS m
              FROM sales_orders
             WHERE agent_key = v_key OR (v_sp_id IS NOT NULL AND erp_salesperson_id = v_sp_id)) months;

    -- Back to whatever the ERP says about the document itself. The trigger
    -- clears the reason on its way through.
    UPDATE sales_orders
       SET cancelled = (COALESCE(erp_status, '') IN ('CANCELLED', 'DRAFT', 'ON_HOLD') OR erp_on_hold)
     WHERE (agent_key = v_key OR (v_sp_id IS NOT NULL AND erp_salesperson_id = v_sp_id))
       AND excluded_reason = 'ignored_agent'
       AND period_month <> ALL (v_locked);
    GET DIAGNOSTICS v_orders = ROW_COUNT;

    FOR r IN
        SELECT DISTINCT batch_id FROM sales_orders
         WHERE (agent_key = v_key OR (v_sp_id IS NOT NULL AND erp_salesperson_id = v_sp_id))
           AND batch_id IS NOT NULL
    LOOP
        PERFORM erp_sync_refresh_batch(r.batch_id);
    END LOOP;

    RETURN JSONB_BUILD_OBJECT('ordersRestored', v_orders);
END;
$$;

COMMENT ON FUNCTION erp_sync_unignore_agent(TEXT) IS
    'Undo an ignore: the bills go back to whatever the ERP says about them, and the name returns to the unplaced list.';

REVOKE ALL ON FUNCTION erp_sync_unignore_agent(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION erp_sync_unignore_agent(TEXT) TO service_role, authenticated;

-- --- 7. What the panel shows below the red list -----------------------------

CREATE OR REPLACE FUNCTION erp_sync_ignored_agents()
RETURNS TABLE (agent_key TEXT, agent_name TEXT, erp_salesperson_id TEXT, note TEXT, orders BIGINT, total NUMERIC)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT g.agent_key,
           g.agent_name_sample,
           g.erp_salesperson_id,
           g.note,
           COUNT(o.id),
           COALESCE(SUM(o.order_total), 0)
      FROM comm_ignored_agents g
      LEFT JOIN sales_orders o
             ON o.excluded_reason = 'ignored_agent'
            AND (o.agent_key = g.agent_key
                 OR (g.erp_salesperson_id IS NOT NULL AND o.erp_salesperson_id = g.erp_salesperson_id))
     GROUP BY g.agent_key, g.agent_name_sample, g.erp_salesperson_id, g.note
     ORDER BY COALESCE(SUM(o.order_total), 0) DESC, g.agent_key;
$$;

COMMENT ON FUNCTION erp_sync_ignored_agents() IS
    'The names somebody has said are not ours, with what they cost the month. Shown under the unplaced list so an ignore is visible and can be taken back.';

REVOKE ALL ON FUNCTION erp_sync_ignored_agents() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION erp_sync_ignored_agents() TO service_role, authenticated;

-- --- 8. The orders board learns the new reason ------------------------------
--
-- Unchanged from 20260918040000 but for one column: excluded_reason, so the
-- board can say "not our salesperson" instead of calling a DELIVERED bill
-- cancelled. Dropped and recreated because the return type grows.

DROP FUNCTION IF EXISTS revenue_month_orders(UUID, DATE);

CREATE FUNCTION revenue_month_orders(p_sub_department_id UUID, p_period DATE)
RETURNS TABLE (
    order_id            UUID,
    order_no            TEXT,
    order_date          DATE,
    event_date          DATE,
    customer_name       TEXT,
    debtor_code         TEXT,
    venue               TEXT,
    venue_group_key     TEXT,
    venue_group_name    TEXT,
    organizer           TEXT,
    location            TEXT,
    brand_code          TEXT,
    order_total         NUMERIC,
    paid_amount         NUMERIC,
    balance             NUMERIC,
    cancelled           BOOLEAN,
    excluded_reason     TEXT,
    erp_status          TEXT,
    erp_on_hold         BOOLEAN,
    sequence_in_day     INTEGER,
    staff_id            UUID,
    employee_name       TEXT,
    employee_code       TEXT,
    agent_name          TEXT,
    line_count          INTEGER,
    line_amount         NUMERIC,
    commissionable      NUMERIC,
    margin_revenue      NUMERIC,
    margin_cost         NUMERIC,
    margin_pct          NUMERIC,
    margin_source       TEXT,
    lines_without_cost  INTEGER,
    lines_without_brand INTEGER,
    open_bill_rank      SMALLINT,
    open_bill_auto      BOOLEAN,
    deposit_required    NUMERIC,
    deposit_met         BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    WITH scheme AS (
        SELECT s.id,
               s.deposit_threshold_pct AS pct,
               CASE WHEN COALESCE(s.revenue_cost_divisor, 1) > 0
                    THEN s.revenue_cost_divisor ELSE 1 END AS cost_divisor
          FROM comm_schemes s
         WHERE s.sub_department_id = p_sub_department_id AND s.is_active
         ORDER BY s.effective_from DESC
         LIMIT 1
    ), batch AS (
        SELECT b.id
          FROM sales_import_batches b
         WHERE b.sub_department_id = p_sub_department_id
           AND b.period_month = p_period
           AND b.status = 'committed'
    )
    SELECT
        o.id, o.order_no, o.order_date, o.event_date, o.customer_name, o.debtor_code,
        o.venue,
        -- The spelling stays on the row; the PLACE is what groups and filters.
        COALESCE(own.canonical_key, own.venue_key, venue_key(o.venue)),
        COALESCE(canon.display_name, own.display_name),
        -- The organiser belongs to THIS month's fair, not to the hall: the
        -- same venue has a different organiser from month to month.
        venue_event_organiser(o.venue, p_period),
        o.location, o.brand_code,
        o.order_total, COALESCE(o.paid_amount, 0), o.balance,
        o.cancelled, o.excluded_reason, o.erp_status, o.erp_on_hold, o.sequence_in_day,
        o.staff_id, st.employee_name, st.employee_code, o.agent_name,
        COALESCE(l.n, 0)::INTEGER,
        COALESCE(l.amount, 0),
        COALESCE(l.commissionable, 0),
        COALESCE(l.margin_revenue, 0),
        l.margin_cost,
        CASE
            WHEN o.manual_margin_pct IS NOT NULL THEN o.manual_margin_pct
            WHEN l.margin_cost IS NULL OR COALESCE(l.margin_revenue, 0) <= 0 THEN NULL
            ELSE ROUND((l.margin_revenue - l.margin_cost) / l.margin_revenue, 6)
        END,
        CASE
            WHEN o.manual_margin_pct IS NOT NULL THEN 'manual'
            WHEN l.margin_cost IS NULL OR COALESCE(l.margin_revenue, 0) <= 0 THEN 'none'
            ELSE 'cost'
        END,
        COALESCE(l.no_cost, 0)::INTEGER,
        COALESCE(l.no_brand, 0)::INTEGER,
        t.bill_rank, t.auto_suggested,
        CASE WHEN sc.pct IS NULL THEN NULL ELSE ROUND(o.order_total * sc.pct, 2) END,
        CASE WHEN sc.pct IS NULL THEN TRUE
             ELSE COALESCE(o.paid_amount, 0) + 0.005 >= o.order_total * sc.pct END
      FROM sales_orders o
      JOIN batch ON batch.id = o.batch_id
      CROSS JOIN scheme sc
      LEFT JOIN hr_staff_costs st ON st.id = o.staff_id
      LEFT JOIN comm_venues own ON own.venue_key = venue_key(o.venue)
      LEFT JOIN comm_venues canon ON canon.venue_key = own.canonical_key
      LEFT JOIN LATERAL (
          SELECT
              COUNT(*) AS n,
              SUM(sl.line_amount) AS amount,
              -- What the rate is paid on: a commissionable group, not a KPI item.
              SUM(sl.line_amount) FILTER (WHERE g.commissionable AND k.product_code IS NULL) AS commissionable,
              -- The margin base is wider: every line in a commissionable group,
              -- KPI giveaways included, because a free pillow has real cost and
              -- that is exactly how giving it away is meant to hurt the margin.
              SUM(sl.line_amount) FILTER (WHERE g.commissionable) AS margin_revenue,
              -- NULL when ANY line of that base has no cost. A partial cost
              -- would show as a fat margin and the engine would disagree - it
              -- refuses to judge an incomplete bill at all.
              --
              -- Divided by the scheme's cost basis, exactly as marginBase()
              -- divides it: this is the cost the MARGIN is taken on, not the
              -- cost on the invoice.
              CASE WHEN COUNT(*) FILTER (WHERE g.commissionable AND sl.cost_amount IS NULL) > 0
                   THEN NULL
                   ELSE ROUND(
                        COALESCE(SUM(sl.cost_amount / sc.cost_divisor) FILTER (WHERE g.commissionable), 0),
                        2) END AS margin_cost,
              COUNT(*) FILTER (WHERE sl.cost_amount IS NULL) AS no_cost,
              COUNT(*) FILTER (WHERE sl.brand_code IS NULL) AS no_brand
            FROM sales_order_lines sl
            LEFT JOIN comm_item_groups g
                   ON g.scheme_id = sc.id
                  AND UPPER(BTRIM(g.item_group)) = UPPER(BTRIM(sl.item_group))
            LEFT JOIN comm_kpi_items k
                   ON k.scheme_id = sc.id
                  AND UPPER(BTRIM(k.product_code)) = UPPER(BTRIM(sl.product_code))
           WHERE sl.order_id = o.id
      ) l ON TRUE
      LEFT JOIN sales_order_open_bill_tags t ON t.order_id = o.id
     ORDER BY o.order_date, o.sequence_in_day NULLS LAST, o.order_no;
$fn$;

COMMENT ON FUNCTION revenue_month_orders(UUID, DATE) IS
    'A month''s sales orders as the commission engine reads them: commissionable value, the margin base and its verdict (manual / cost / none) on the scheme''s cost basis (revenue_cost_divisor), the venue as written plus the PLACE it belongs to and the organiser of THAT MONTH''S fair there, the Open Bill rank, the deposit-gate verdict, and why an excluded bill is excluded when the ERP is not the reason.';

NOTIFY pgrst, 'reload schema';
