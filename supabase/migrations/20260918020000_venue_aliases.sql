-- 20260918020000_venue_aliases.sql
--
-- ONE PLACE, ONE ROW.
--
-- The ERP's `venue` is free text typed at the fair, and two months of it spell
-- thirty-odd places sixty different ways:
--
--     SPICE ARENA · PISA SPICE ARENA · PISA SPICE ARENA CONVENTION CENTRE
--     MID VALLEY · MIDVALLEY EXHIBITION CENTRE · MVEC SOUTHKEY
--     PAVILION BUKIT JALIL · PAVILLION BUKIT JALIL
--     ZANOTTI LIVING (KELANA JAYA) · ZANOTTI LIVING(KELANA JAYA)
--
-- Sales by venue therefore reads as more, smaller events than actually
-- happened, the organiser has to be typed once per spelling, and any ranking
-- by place — the member app's Arena is the one asking — splits one fair into
-- three.
--
-- WHY NOT NORMALISE THE STRING HARDER. Because the spellings are not typos of
-- each other in any way a rule can see. SPICE ARENA and SETIA SPICE CONVENTION
-- CENTRE share three quarters of their words and are two different halls of
-- the same Penang complex; MID VALLEY and MIDVALLEY SOUTHKEY JB are 300km
-- apart. Only somebody who was there knows. So the merge is a fact a human
-- records, not a rule the database guesses — and NOTHING is merged by this
-- migration.
--
-- HOW IT IS RECORDED. `comm_venues.canonical_key` points an alias row at the
-- row that is the real place; NULL means this row IS a real place. One level
-- only, enforced by trigger (23VEN): an alias may not point at an alias, and a
-- row other aliases point at may not become one. That keeps resolution a
-- single join for every reader, forever.
--
-- WHAT READS IT. `venue_group_key()` resolves a raw ERP venue string to the
-- key of the place it belongs to, and `revenue_month_orders` now returns that
-- key and the place's display name beside the order's own spelling — the
-- spelling stays, because it is what the document says and HR checks against
-- the document. The ORGANISER is resolved through the canonical row, so
-- naming the organiser once names it for every spelling.
--
-- Additive. Reversal: DROP TRIGGER comm_venues_alias_depth ON comm_venues;
-- DROP FUNCTION comm_venues_alias_depth, venue_group_key; ALTER TABLE
-- comm_venues DROP COLUMN canonical_key; and re-apply the previous
-- revenue_month_orders body from 20260917030000.

-- ─── 1. An alias points at the place it is ──────────────────────────────────

ALTER TABLE comm_venues ADD COLUMN IF NOT EXISTS canonical_key TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'comm_venues_canonical_key_fkey'
    ) THEN
        ALTER TABLE comm_venues
            ADD CONSTRAINT comm_venues_canonical_key_fkey
            FOREIGN KEY (canonical_key) REFERENCES comm_venues (venue_key)
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
END $$;

COMMENT ON COLUMN comm_venues.canonical_key IS
    'The venue row this spelling really is. NULL means this row is itself a place. One level only — an alias may not point at an alias.';

CREATE INDEX IF NOT EXISTS idx_comm_venues_canonical ON comm_venues (canonical_key)
 WHERE canonical_key IS NOT NULL;

-- ─── 2. One level, and no loops ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION comm_venues_alias_depth()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
    IF NEW.canonical_key IS NOT NULL THEN
        IF NEW.canonical_key = NEW.venue_key THEN
            RAISE EXCEPTION 'A venue cannot be an alias of itself'
                USING ERRCODE = '23VEN';
        END IF;
        IF EXISTS (SELECT 1 FROM comm_venues v
                    WHERE v.venue_key = NEW.canonical_key AND v.canonical_key IS NOT NULL) THEN
            RAISE EXCEPTION 'Merge into the real venue, not into another spelling of it (% is itself an alias)', NEW.canonical_key
                USING ERRCODE = '23VEN';
        END IF;
        IF EXISTS (SELECT 1 FROM comm_venues v WHERE v.canonical_key = NEW.venue_key) THEN
            RAISE EXCEPTION 'Other spellings already point at %; unmerge them before making it an alias itself', NEW.venue_key
                USING ERRCODE = '23VEN';
        END IF;
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS comm_venues_alias_depth ON comm_venues;
CREATE TRIGGER comm_venues_alias_depth
    BEFORE INSERT OR UPDATE OF canonical_key, venue_key ON comm_venues
    FOR EACH ROW
    EXECUTE FUNCTION comm_venues_alias_depth();

-- ─── 3. Raw venue → the place it belongs to ─────────────────────────────────

CREATE OR REPLACE FUNCTION venue_group_key(p_venue TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT COALESCE(
        (SELECT v.canonical_key FROM comm_venues v WHERE v.venue_key = venue_key(p_venue)),
        venue_key(p_venue)
    );
$fn$;

COMMENT ON FUNCTION venue_group_key(TEXT) IS
    'The key of the PLACE a raw ERP venue string belongs to: its canonical venue when somebody has merged the spelling, otherwise its own key.';

-- ─── 4. The month's orders carry the place, not only the spelling ───────────

DROP FUNCTION IF EXISTS revenue_month_orders(UUID, DATE);

CREATE OR REPLACE FUNCTION revenue_month_orders(p_sub_department_id UUID, p_period DATE)
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
        SELECT s.id, s.deposit_threshold_pct AS pct
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
        COALESCE(canon.organizer, own.organizer),
        o.location, o.brand_code,
        o.order_total, COALESCE(o.paid_amount, 0), o.balance,
        o.cancelled, o.erp_status, o.erp_on_hold, o.sequence_in_day,
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
              -- would show as a fat margin and the engine would disagree — it
              -- refuses to judge an incomplete bill at all.
              CASE WHEN COUNT(*) FILTER (WHERE g.commissionable AND sl.cost_amount IS NULL) > 0
                   THEN NULL
                   ELSE COALESCE(SUM(sl.cost_amount) FILTER (WHERE g.commissionable), 0) END AS margin_cost,
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
    'A month''s sales orders as the commission engine reads them: commissionable value, the margin base and its verdict (manual / cost / none), the venue as written plus the PLACE it belongs to and that place''s organiser, the Open Bill rank and the deposit-gate verdict.';

NOTIFY pgrst, 'reload schema';
