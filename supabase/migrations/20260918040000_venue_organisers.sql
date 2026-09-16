-- 20260918040000_venue_organisers.sql
--
-- WHO RAN THE FAIR: A REGISTER OF ORGANISERS, AND ONE ANSWER PER MONTH.
--
-- The ERP names the venue on every sales order and says nothing about the
-- organiser (checked against every delivery the portal holds: `header.venue`
-- and an always-empty `header.venue_id`, no promoter, host or organiser field
-- anywhere). So the organiser is the portal's own fact — and until now it was
-- a free-text column on `comm_venues`, one value per place, forever.
--
-- THAT IS THE WRONG SHAPE, and the user said so plainly (2026-09-17): "same
-- venue will have different organiser". HOMEDEC rents SPICE ARENA this
-- quarter; somebody else rents the same hall next quarter. A single global
-- column cannot hold both, and worse, correcting it rewrites history — every
-- month that venue ever sold at silently changes organiser.
--
-- So the organiser moves onto the FAIR: one row per (place, month).
--
--   comm_organisers     the register. Typed once, picked from a dropdown
--                       everywhere else, so "HOMEDEC" / "Homedec" / "HomeDec"
--                       cannot become three organisers with a third of the
--                       sales each.
--   comm_venue_events   (place, month) -> organiser. The fact. Keyed on the
--                       CANONICAL venue, so merging two spellings keeps one
--                       answer per month rather than two.
--
-- WHY MONTH AND NOT A DATE RANGE. Because the ERP sends no event dates —
-- `fair_events` with real start/end dates is a design the user has explicitly
-- deferred until the ERP can identify an event. A month is the grain
-- everything else in Revenue already uses (the batch, the run, the payroll),
-- and it is the grain the user asked to pick at ("so i can pick by monthly").
-- The one case it cannot express is two organisers at one venue inside one
-- month; the surrogate id and the UNIQUE constraint (rather than a composite
-- primary key) are here so that day is an ALTER, not a rewrite.
--
-- WHAT THE ERP MAY SEND LATER. The user expects the feed to eventually carry
-- venue and organiser together: "以后 ERP 那边 send 过来的时候，应该就是 venue
-- 跟着 organizer 一起带过来的… 现在只是作为预防措施；下次如果 detect 失败，at
-- least 还可以 manually 去改". So `sales_orders_register_organiser` reads the
-- organiser out of the delivery the portal already stores verbatim
-- (`sales_orders.raw -> header`) under any of the eight names it might
-- plausibly arrive as, and fills the month's answer in. Two rules make it
-- safe to leave switched on:
--
--   * it never overwrites a HUMAN's pick (`source = 'manual'` wins), and
--   * it never invents an organiser. A name the register has never heard of is
--     kept verbatim in `erp_organiser_text` for somebody to look at, which is
--     the "detect failed, change it by hand" case the user asked for.
--
-- It is dormant today: no delivery carries the field, so the trigger probes
-- one JSONB key and returns. Nothing in `ingest_erp_sales_order` (318 lines)
-- had to be touched to get this, which is the point of putting it in a trigger.
--
-- `comm_venues.organizer` is SUPERSEDED, not dropped: its one real value
-- (SPICE ARENA = HOMEDEC) is migrated into the two new tables below, and the
-- column is left in place with a comment, because dropping a column ahead of
-- the code that reads it has broken this production database before.
--
-- Additive. Reversal:
--   DROP TRIGGER sales_orders_register_organiser ON sales_orders;
--   DROP TRIGGER comm_venues_merge_events ON comm_venues;
--   DROP FUNCTION sales_orders_register_organiser, comm_venues_merge_events,
--                 revenue_venue_register, venue_event_organiser,
--                 erp_header_organiser, organiser_key;
--   DROP TABLE comm_venue_events; DROP TABLE comm_organisers;
--   and re-apply the revenue_month_orders body from 20260918030000.

-- ─── 1. The matching key, so one organiser is one organiser ─────────────────

CREATE OR REPLACE FUNCTION organiser_key(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT NULLIF(UPPER(REGEXP_REPLACE(BTRIM(COALESCE(p_name, '')), '\s+', ' ', 'g')), '');
$fn$;

COMMENT ON FUNCTION organiser_key(TEXT) IS
    'The matching key for an organiser name: upper case, single spaces, blank becomes NULL. The twin of venue_key(), and of organiserKey() in src/lib/organisers.ts.';

-- ─── 2. The organiser register ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comm_organisers (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    notes      TEXT,
    -- An organiser that has stopped running fairs drops out of the dropdowns
    -- without touching the months it already explains. Deleting one is refused
    -- by comm_venue_events.organiser_id (ON DELETE RESTRICT) for that reason.
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT comm_organisers_name_not_blank CHECK (BTRIM(name) <> '')
);

COMMENT ON TABLE comm_organisers IS
    'Who runs fairs: the portal''s own register of event organisers (HOMEDEC and the like). The ERP sends nothing about the organiser, so every name here is typed on Revenue -> Venues and then PICKED beside a venue, never retyped.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_organisers_key
    ON comm_organisers (organiser_key(name));

ALTER TABLE comm_organisers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comm_organisers_principal_all ON comm_organisers;
CREATE POLICY comm_organisers_principal_all ON comm_organisers FOR ALL
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
DROP POLICY IF EXISTS comm_organisers_hr_all ON comm_organisers;
CREATE POLICY comm_organisers_hr_all ON comm_organisers FOR ALL
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

-- ─── 3. The fair: one place, one month, one organiser ───────────────────────

CREATE TABLE IF NOT EXISTS comm_venue_events (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_key          TEXT NOT NULL
                       REFERENCES comm_venues (venue_key) ON UPDATE CASCADE ON DELETE CASCADE,
    period_month       DATE NOT NULL,
    organiser_id       UUID REFERENCES comm_organisers (id) ON DELETE RESTRICT,
    notes              TEXT,
    -- What the feed said, verbatim, matched or not. The only way a human can
    -- see that the ERP disagrees with the register, or names somebody it has
    -- never heard of.
    erp_organiser_text TEXT,
    source             TEXT NOT NULL DEFAULT 'manual'
                       CHECK (source IN ('manual', 'erp')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT comm_venue_events_month_is_first
        CHECK (period_month = DATE_TRUNC('month', period_month)::DATE),
    -- UNIQUE rather than the primary key: the day the ERP can identify an
    -- event, this becomes a date range and the constraint is what drops.
    CONSTRAINT uq_comm_venue_events UNIQUE (venue_key, period_month)
);

COMMENT ON TABLE comm_venue_events IS
    'The fair: which organiser ran a venue in a given month. One row per (canonical venue, month) — the same venue can have a different organiser every month, which is why the organiser is not a column on comm_venues.';
COMMENT ON COLUMN comm_venue_events.source IS
    'manual = a human picked it on Revenue -> Venues or the month page; erp = the feed named it. The feed never overwrites manual.';
COMMENT ON COLUMN comm_venue_events.erp_organiser_text IS
    'The organiser exactly as the ERP delivery spelled it, kept even when the register has no such name, so a failed match can be fixed by hand.';

CREATE INDEX IF NOT EXISTS idx_comm_venue_events_month
    ON comm_venue_events (period_month);
CREATE INDEX IF NOT EXISTS idx_comm_venue_events_organiser
    ON comm_venue_events (organiser_id) WHERE organiser_id IS NOT NULL;

ALTER TABLE comm_venue_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comm_venue_events_principal_all ON comm_venue_events;
CREATE POLICY comm_venue_events_principal_all ON comm_venue_events FOR ALL
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
DROP POLICY IF EXISTS comm_venue_events_hr_all ON comm_venue_events;
CREATE POLICY comm_venue_events_hr_all ON comm_venue_events FOR ALL
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

-- An event belongs to the PLACE, never to one of its spellings. The writers
-- all resolve the key first; this is the guard that makes it true anyway.
CREATE OR REPLACE FUNCTION comm_venue_events_canonical()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_canonical TEXT;
BEGIN
    SELECT v.canonical_key INTO v_canonical
      FROM comm_venues v WHERE v.venue_key = NEW.venue_key;
    IF v_canonical IS NOT NULL THEN
        NEW.venue_key := v_canonical;
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS comm_venue_events_canonical ON comm_venue_events;
CREATE TRIGGER comm_venue_events_canonical
    BEFORE INSERT OR UPDATE OF venue_key ON comm_venue_events
    FOR EACH ROW
    EXECUTE FUNCTION comm_venue_events_canonical();

-- Merging two spellings after their months are named must not orphan the
-- organiser: the alias's months move onto the place, and the place keeps its
-- own answer wherever it already has one.
CREATE OR REPLACE FUNCTION comm_venues_merge_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
    IF NEW.canonical_key IS NOT NULL AND NEW.canonical_key IS DISTINCT FROM OLD.canonical_key THEN
        UPDATE comm_venue_events e
           SET venue_key = NEW.canonical_key
         WHERE e.venue_key = NEW.venue_key
           AND NOT EXISTS (
               SELECT 1 FROM comm_venue_events x
                WHERE x.venue_key = NEW.canonical_key
                  AND x.period_month = e.period_month);
        DELETE FROM comm_venue_events e WHERE e.venue_key = NEW.venue_key;
    END IF;
    RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS comm_venues_merge_events ON comm_venues;
CREATE TRIGGER comm_venues_merge_events
    AFTER UPDATE OF canonical_key ON comm_venues
    FOR EACH ROW
    EXECUTE FUNCTION comm_venues_merge_events();

-- ─── 4. The one lookup ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION venue_event_organiser(p_venue TEXT, p_period DATE)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT og.name
      FROM comm_venue_events e
      JOIN comm_organisers og ON og.id = e.organiser_id
     WHERE e.venue_key = venue_group_key(p_venue)
       AND e.period_month = DATE_TRUNC('month', p_period)::DATE;
$fn$;

COMMENT ON FUNCTION venue_event_organiser(TEXT, DATE) IS
    'Who ran the fair: the organiser named for the PLACE a raw ERP venue string belongs to, in the month of p_period. The single resolution rule — revenue_month_orders and the order page both read it here rather than joining it two different ways.';

-- ─── 5. What the ERP may start sending ──────────────────────────────────────

CREATE OR REPLACE FUNCTION erp_header_organiser(p_raw JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT NULLIF(BTRIM(COALESCE(
        p_raw -> 'header' ->> 'organiser',
        p_raw -> 'header' ->> 'organizer',
        p_raw -> 'header' ->> 'event_organiser',
        p_raw -> 'header' ->> 'event_organizer',
        p_raw -> 'header' ->> 'venue_organiser',
        p_raw -> 'header' ->> 'venue_organizer',
        p_raw -> 'header' ->> 'organiser_name',
        p_raw -> 'header' ->> 'organizer_name'
    )), '');
$fn$;

COMMENT ON FUNCTION erp_header_organiser(JSONB) IS
    'The organiser out of a stored ERP delivery, under any of the names it might arrive as. Returns NULL for every delivery received up to 2026-09-17 — the field does not exist yet, and this is the preventive half agreed with the user.';

CREATE OR REPLACE FUNCTION sales_orders_register_organiser()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_text  TEXT;
    v_place TEXT;
    v_id    UUID;
BEGIN
    -- Cheapest test first: today this is NULL for every order and the trigger
    -- costs one JSONB probe.
    v_text := erp_header_organiser(NEW.raw);
    IF v_text IS NULL OR NEW.period_month IS NULL THEN
        RETURN NULL;
    END IF;

    v_place := venue_group_key(NEW.venue);
    IF v_place IS NULL THEN
        RETURN NULL;
    END IF;

    -- ingest_erp_sales_order registers the venue AFTER writing the order, so
    -- at this point the place may not exist yet and the foreign key below
    -- would fail the whole delivery. Register it here on the same terms.
    INSERT INTO comm_venues (venue_key, display_name)
    VALUES (v_place, COALESCE(NULLIF(BTRIM(NEW.venue), ''), v_place))
    ON CONFLICT (venue_key) DO NOTHING;

    SELECT o.id INTO v_id
      FROM comm_organisers o
     WHERE organiser_key(o.name) = organiser_key(v_text)
     LIMIT 1;

    INSERT INTO comm_venue_events (venue_key, period_month, organiser_id, erp_organiser_text, source)
    VALUES (v_place, DATE_TRUNC('month', NEW.period_month)::DATE, v_id, v_text, 'erp')
    ON CONFLICT (venue_key, period_month) DO UPDATE
       SET organiser_id = CASE
               -- A human's pick is the answer. The feed may only correct
               -- itself.
               WHEN comm_venue_events.source = 'erp'
                   THEN COALESCE(EXCLUDED.organiser_id, comm_venue_events.organiser_id)
               ELSE comm_venue_events.organiser_id
           END,
           erp_organiser_text = EXCLUDED.erp_organiser_text,
           updated_at = NOW();
    RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS sales_orders_register_organiser ON sales_orders;
CREATE TRIGGER sales_orders_register_organiser
    AFTER INSERT OR UPDATE OF raw, venue, period_month ON sales_orders
    FOR EACH ROW
    EXECUTE FUNCTION sales_orders_register_organiser();

-- ─── 6. What was already typed ──────────────────────────────────────────────

INSERT INTO comm_organisers (name)
SELECT DISTINCT ON (organiser_key(v.organizer)) BTRIM(v.organizer)
  FROM comm_venues v
 WHERE organiser_key(v.organizer) IS NOT NULL
 ORDER BY organiser_key(v.organizer), BTRIM(v.organizer)
ON CONFLICT DO NOTHING;

-- The old column meant "every month this venue ever sold at", so that is
-- exactly what it becomes — and nothing more, because a month with no bills
-- had no fair to organise.
INSERT INTO comm_venue_events (venue_key, period_month, organiser_id, source)
SELECT DISTINCT
       COALESCE(v.canonical_key, v.venue_key),
       o.period_month,
       og.id,
       'manual'
  FROM comm_venues v
  JOIN comm_organisers og ON organiser_key(og.name) = organiser_key(v.organizer)
  JOIN sales_orders o ON venue_group_key(o.venue) = COALESCE(v.canonical_key, v.venue_key)
  JOIN sales_import_batches b ON b.id = o.batch_id AND b.status = 'committed'
 WHERE organiser_key(v.organizer) IS NOT NULL
   AND NOT o.cancelled
ON CONFLICT (venue_key, period_month) DO NOTHING;

COMMENT ON COLUMN comm_venues.organizer IS
    'SUPERSEDED 2026-09-17 by comm_venue_events, because the same venue has a different organiser from month to month. Migrated, no longer read or written; kept so the old value is recoverable.';

-- ─── 7. The month reads the fair, not the place ─────────────────────────────

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
    'A month''s sales orders as the commission engine reads them: commissionable value, the margin base and its verdict (manual / cost / none) on the scheme''s cost basis (revenue_cost_divisor), the venue as written plus the PLACE it belongs to and the organiser of THAT MONTH''S fair there, the Open Bill rank and the deposit-gate verdict.';

-- ─── 8. The register, all of it, on one screen ──────────────────────────────
--
-- One row per (place, month with bills), plus one row with a NULL month for a
-- place that has no bills at all — because "every venue" is what was asked
-- for, and a venue nobody has sold at yet is still a venue the ERP will name
-- again. Driven from comm_venues rather than from the orders: the ingest
-- registers every spelling it delivers, so the register is the complete list
-- and the orders are what fills it in.

CREATE OR REPLACE FUNCTION revenue_venue_register()
RETURNS TABLE (
    venue_key          TEXT,
    display_name       TEXT,
    aliases            TEXT[],
    period_month       DATE,
    sub_department_id  UUID,
    organiser_id       UUID,
    organiser_name     TEXT,
    erp_organiser_text TEXT,
    source             TEXT,
    people             INTEGER,
    bills              INTEGER,
    sales_value        NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    WITH places AS (
        SELECT v.venue_key,
               v.display_name,
               ARRAY(SELECT a.display_name
                       FROM comm_venues a
                      WHERE a.canonical_key = v.venue_key
                      ORDER BY a.display_name) AS aliases
          FROM comm_venues v
         WHERE v.canonical_key IS NULL
    ), months AS (
        SELECT venue_group_key(o.venue) AS venue_key,
               o.period_month,
               (ARRAY_AGG(DISTINCT b.sub_department_id))[1] AS sub_department_id,
               COUNT(DISTINCT COALESCE(o.staff_id::TEXT, o.agent_name))::INTEGER AS people,
               COUNT(*)::INTEGER AS bills,
               SUM(o.order_total) AS sales_value
          FROM sales_orders o
          JOIN sales_import_batches b ON b.id = o.batch_id AND b.status = 'committed'
         WHERE NOT o.cancelled
           AND venue_group_key(o.venue) IS NOT NULL
         GROUP BY 1, 2
    )
    SELECT p.venue_key,
           p.display_name,
           p.aliases,
           m.period_month,
           m.sub_department_id,
           e.organiser_id,
           og.name,
           e.erp_organiser_text,
           e.source,
           COALESCE(m.people, 0),
           COALESCE(m.bills, 0),
           COALESCE(m.sales_value, 0)
      FROM places p
      LEFT JOIN months m ON m.venue_key = p.venue_key
      LEFT JOIN comm_venue_events e
             ON e.venue_key = p.venue_key AND e.period_month = m.period_month
      LEFT JOIN comm_organisers og ON og.id = e.organiser_id
     ORDER BY p.display_name, m.period_month DESC NULLS LAST;
$fn$;

COMMENT ON FUNCTION revenue_venue_register() IS
    'Every venue the ERP has named, one row per month it has bills in, with that month''s organiser, its sales and the spellings folded into it. An RPC because the grouping is by the resolved PLACE, which only SQL knows.';

NOTIFY pgrst, 'reload schema';
