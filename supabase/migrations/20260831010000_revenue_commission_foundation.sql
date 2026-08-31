-- ============================================================================
-- 20260831010000_revenue_commission_foundation.sql
-- Revenue Department commission payroll — schema foundation
-- HOUZS Venture Portal
--
-- Spec: docs/module-spec-revenue-commission.md
--
-- ⚠️  NOT YET APPLIED TO THE LIVE PROJECT. Two things are still open before
--     this runs (spec §8): the Tier/rank ladder brief (Q3) and the
--     1st/2nd/3rd Bill bonus basis (Q1). Neither changes the SHAPE below —
--     Q3 fills comm_ranks with rows, Q1 flips a comm_schemes column — so the
--     schema can be reviewed now.
--
-- What this adds:
--   sales_*  — raw ERP order facts, one immutable batch per import
--   comm_*   — commission configuration, runs, statements, audit lines
--   plus two columns on existing tables (departments.payroll_source,
--   hr_staff_costs.erp_sales_code)
--
-- What this deliberately does NOT touch: hr_monthly_payroll, payroll_runs,
-- the statutory trigger, GL. The engine feeds ONE existing field
-- (hr_monthly_payroll.commission_amount) through a later RPC. See spec §2.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------

CREATE TYPE sales_import_status AS ENUM ('draft', 'committed', 'superseded');

CREATE TYPE comm_run_status AS ENUM ('draft', 'computed', 'applied', 'locked');

CREATE TYPE comm_component AS ENUM (
    'product_revenue',
    'kpi_item',
    'kpi_threshold',
    'bill_bonus',
    'override'
);

CREATE TYPE comm_bill_bonus_basis AS ENUM (
    'uplift_on_commission',   -- orderRevenue × personalRate × billPct
    'pct_of_revenue'          -- orderRevenue × billPct
);

COMMENT ON TYPE comm_run_status IS
    'draft: created, not computed. computed: engine ran, statements exist. applied: written into hr_monthly_payroll.commission_amount. locked: payroll run submitted, immutable.';

-- ----------------------------------------------------------------------------
-- Existing-table columns
-- ----------------------------------------------------------------------------

ALTER TABLE departments
    ADD COLUMN IF NOT EXISTS payroll_source TEXT NOT NULL DEFAULT 'imported'
        CONSTRAINT valid_payroll_source CHECK (payroll_source IN ('imported', 'commission'));

COMMENT ON COLUMN departments.payroll_source IS
    'imported: payroll figures come verbatim from the InfoTech export. commission: figures are derived from the ERP sales import by the commission engine (Revenue Department).';

UPDATE departments SET payroll_source = 'commission' WHERE name = 'Revenue Department';

-- Revenue staff pay model (user decision 2026-08-31): NO basic salary and NO
-- statutory allowance -- they are paid 100% on commission. Nothing needs to
-- change for that to work:
--   * hr_staff_costs.basic_salary already allows 0 (migration 141 relaxed the
--     CHECK for commission-only staff; HV020 is the existing precedent), and
--     hr_employment_type already has 'commission_eligible' (migration 120).
--   * compute_hr_monthly_payroll bases EPF/SOCSO/EIS on
--     (prorated basic + statutory allowance), so with both at 0 every
--     statutory lookup returns 0 on its own -- no trigger change, and no risk
--     to the departments that DO carry a basic.
-- PCB is the one deduction that still bites: the trigger computes it on gross,
-- which for these staff is the whole commission. Left as-is deliberately --
-- commission is taxable income. Flagged in the spec for the user to confirm.

ALTER TABLE hr_staff_costs
    ADD COLUMN IF NOT EXISTS erp_sales_code TEXT;

COMMENT ON COLUMN hr_staff_costs.erp_sales_code IS
    'Salesperson code as it appears in the ERP order export. Primary match key for the sales import; fuzzy name is the fallback, same convention as the InfoTech payroll import.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_staff_erp_sales_code
    ON hr_staff_costs (erp_sales_code) WHERE erp_sales_code IS NOT NULL;

-- Retire the never-wired v1 engine (migration 123). Kept for history.
COMMENT ON TABLE commission_rules IS
    'DEPRECATED 2026-08-31 — superseded by comm_schemes / comm_ranks / comm_kpi_items. Never wired to any UI. Kept for history; do not extend.';
COMMENT ON TABLE commission_inputs IS
    'DEPRECATED 2026-08-31 — superseded by sales_orders / sales_order_lines. Never wired to any UI. Kept for history; do not extend.';

-- ============================================================================
-- IMPORTED FACTS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: sales_import_batches
-- One row per ERP file import. Re-importing a month supersedes the previous
-- batch rather than merging, so the engine always reads exactly one
-- 'committed' batch per period and a bad file can be undone in one step.
-- ----------------------------------------------------------------------------

CREATE TABLE sales_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_month DATE NOT NULL,
    file_name TEXT NOT NULL,
    file_hash TEXT,
    sheet_name TEXT,
    row_count INTEGER NOT NULL DEFAULT 0,
    order_count INTEGER NOT NULL DEFAULT 0,
    unmatched_count INTEGER NOT NULL DEFAULT 0,
    status sales_import_status NOT NULL DEFAULT 'draft',
    notes TEXT,
    imported_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    superseded_at TIMESTAMPTZ,

    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1)
);

COMMENT ON TABLE sales_import_batches IS
    'Revenue commission: one ERP sales-order file import. At most one committed batch per period (partial unique index below).';

CREATE UNIQUE INDEX uq_sales_batch_committed_per_period
    ON sales_import_batches (period_month) WHERE status = 'committed';

CREATE INDEX idx_sales_batch_period ON sales_import_batches (period_month, status);

-- ----------------------------------------------------------------------------
-- TABLE: sales_orders
-- ----------------------------------------------------------------------------

CREATE TABLE sales_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES sales_import_batches(id) ON DELETE CASCADE,
    period_month DATE NOT NULL,
    order_no TEXT NOT NULL,
    order_date DATE NOT NULL,

    -- The 1st/2nd/3rd Bill race is per EVENT DAY, which is normally the order
    -- date but is editable: a 3-day roadshow can straddle a cut-off, and the
    -- ERP timestamps late-entry orders on the following day.
    event_date DATE NOT NULL,

    customer_name TEXT,
    erp_sales_code TEXT,
    staff_id UUID REFERENCES hr_staff_costs(id) ON DELETE RESTRICT,
    company_id UUID REFERENCES companies(id),
    order_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    raw JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1),
    CONSTRAINT uq_sales_order_per_batch UNIQUE (batch_id, order_no)
);

COMMENT ON TABLE sales_orders IS
    'Revenue commission: one ERP sales order. staff_id NULL = unmatched salesperson, blocks the run until a human resolves it.';
COMMENT ON COLUMN sales_orders.raw IS
    'The source row(s) as parsed, verbatim. Lets us re-derive without asking for the file again when a mapping bug surfaces.';

CREATE INDEX idx_sales_orders_batch ON sales_orders (batch_id);
CREATE INDEX idx_sales_orders_staff_period ON sales_orders (staff_id, period_month);
CREATE INDEX idx_sales_orders_event_date ON sales_orders (staff_id, event_date);

-- ----------------------------------------------------------------------------
-- TABLE: sales_order_lines
--
-- No is_kpi column ON PURPOSE. Whether a line is a KPI item is derived at
-- compute time from comm_kpi_items, so re-configuring the KPI list and
-- re-running the engine gives the right answer without re-importing.
-- ----------------------------------------------------------------------------

CREATE TABLE sales_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL,
    product_code TEXT NOT NULL,
    product_name TEXT,
    qty DECIMAL(15, 3) NOT NULL DEFAULT 0,
    unit_price DECIMAL(15, 2) NOT NULL DEFAULT 0,
    line_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    raw JSONB,

    CONSTRAINT uq_sales_order_line UNIQUE (order_id, line_no)
);

COMMENT ON TABLE sales_order_lines IS
    'Revenue commission: order line items. KPI classification happens at compute time against comm_kpi_items — never stored here.';

CREATE INDEX idx_sales_order_lines_order ON sales_order_lines (order_id);
CREATE INDEX idx_sales_order_lines_product ON sales_order_lines (product_code);

-- ----------------------------------------------------------------------------
-- TABLE: sales_order_bill_tags
-- Manual pick: which order is this salesperson's 1st / 2nd / 3rd bill of the
-- event day. One tag per order; one holder per (staff, day, rank).
-- ----------------------------------------------------------------------------

CREATE TABLE sales_order_bill_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES sales_orders(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES hr_staff_costs(id) ON DELETE CASCADE,
    event_date DATE NOT NULL,
    bill_rank SMALLINT NOT NULL,
    tagged_by UUID REFERENCES users(id),
    tagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_bill_rank CHECK (bill_rank BETWEEN 1 AND 3),
    CONSTRAINT uq_bill_rank_per_staff_day UNIQUE (staff_id, event_date, bill_rank)
);

COMMENT ON TABLE sales_order_bill_tags IS
    'Revenue commission: the Additional Order (1st/2nd/3rd Bill) picks. Manual, per salesperson per event day.';

CREATE INDEX idx_bill_tags_staff_day ON sales_order_bill_tags (staff_id, event_date);

-- ============================================================================
-- CONFIGURATION
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: comm_schemes
-- The knob-holder. One active scheme at a time; a run snapshots which one it
-- used so changing a knob never silently rewrites a past month.
-- ----------------------------------------------------------------------------

CREATE TABLE comm_schemes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_name TEXT NOT NULL,
    department_id UUID NOT NULL REFERENCES departments(id),

    bill_bonus_basis comm_bill_bonus_basis NOT NULL DEFAULT 'uplift_on_commission',
    override_includes_kpi BOOLEAN NOT NULL DEFAULT FALSE,

    effective_from DATE NOT NULL,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT effective_window CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE comm_schemes IS
    'Revenue commission: scheme-level knobs. bill_bonus_basis = uplift_on_commission (user decision 2026-08-31): the 1st/2nd/3rd Bill bonus is a 50/40/30% uplift ON THAT ORDER''S COMMISSION, and is ADDITIVE to it.';

CREATE UNIQUE INDEX uq_comm_scheme_active_per_dept
    ON comm_schemes (department_id) WHERE is_active AND effective_to IS NULL;

-- ----------------------------------------------------------------------------
-- TABLE: comm_ranks
-- The Tier ladder. Rows arrive once the user briefs Q3 — the shape is a
-- straightforward (rank, personal rate) ladder and holds for any tier count.
-- ----------------------------------------------------------------------------

CREATE TABLE comm_ranks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id UUID NOT NULL REFERENCES comm_schemes(id) ON DELETE CASCADE,
    rank_key TEXT NOT NULL,
    label TEXT NOT NULL,
    product_rate DECIMAL(9, 6) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT product_rate_sane CHECK (product_rate >= 0 AND product_rate <= 1),
    CONSTRAINT uq_comm_rank_key UNIQUE (scheme_id, rank_key)
);

COMMENT ON TABLE comm_ranks IS
    'Revenue commission: Tier 1/2/3… and the personal % of product revenue each earns. The override differential is derived from these rates, never stored per pair.';

-- ----------------------------------------------------------------------------
-- TABLE: comm_kpi_items
-- Products that pay a flat allowance instead of counting as product revenue.
-- ----------------------------------------------------------------------------

CREATE TABLE comm_kpi_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id UUID NOT NULL REFERENCES comm_schemes(id) ON DELETE CASCADE,
    product_code TEXT NOT NULL,
    product_name TEXT,
    kpi_amount DECIMAL(15, 2) NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT kpi_amount_non_negative CHECK (kpi_amount >= 0),
    CONSTRAINT effective_window CHECK (effective_to IS NULL OR effective_to >= effective_from),
    -- btree_gist is installed; this stops two overlapping definitions of the
    -- same product silently double-paying.
    CONSTRAINT no_overlapping_kpi_item EXCLUDE USING gist (
        scheme_id WITH =,
        (UPPER(BTRIM(product_code))) WITH =,
        daterange(effective_from, effective_to, '[]') WITH &&
    )
);

COMMENT ON TABLE comm_kpi_items IS
    'Revenue commission: KPI products (e.g. pillow → RM30/unit). Their sales revenue is EXCLUDED from the product-revenue base — the allowance already pays for them.';

CREATE INDEX idx_comm_kpi_items_code ON comm_kpi_items (scheme_id, (UPPER(BTRIM(product_code))));

-- ----------------------------------------------------------------------------
-- TABLE: comm_kpi_thresholds
-- Ladder: sell N KPI units in the month → uplift the whole KPI base by X%.
-- ----------------------------------------------------------------------------

CREATE TABLE comm_kpi_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id UUID NOT NULL REFERENCES comm_schemes(id) ON DELETE CASCADE,
    min_qty INTEGER NOT NULL,
    bonus_pct DECIMAL(9, 6) NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT min_qty_positive CHECK (min_qty > 0),
    CONSTRAINT bonus_pct_sane CHECK (bonus_pct >= 0 AND bonus_pct <= 5),
    CONSTRAINT effective_window CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT no_overlapping_threshold EXCLUDE USING gist (
        scheme_id WITH =,
        min_qty WITH =,
        daterange(effective_from, effective_to, '[]') WITH &&
    )
);

COMMENT ON TABLE comm_kpi_thresholds IS
    'Revenue commission: KPI quantity ladder. The engine applies the HIGHEST rung met, not the sum of rungs.';

-- ----------------------------------------------------------------------------
-- TABLE: comm_bill_bonus_rules
-- ----------------------------------------------------------------------------

CREATE TABLE comm_bill_bonus_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id UUID NOT NULL REFERENCES comm_schemes(id) ON DELETE CASCADE,
    bill_rank SMALLINT NOT NULL,
    pct DECIMAL(9, 6) NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_bill_rank CHECK (bill_rank BETWEEN 1 AND 3),
    CONSTRAINT pct_sane CHECK (pct >= 0 AND pct <= 1),
    CONSTRAINT effective_window CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT no_overlapping_bill_rule EXCLUDE USING gist (
        scheme_id WITH =,
        bill_rank WITH =,
        daterange(effective_from, effective_to, '[]') WITH &&
    )
);

COMMENT ON TABLE comm_bill_bonus_rules IS
    'Revenue commission: 1st/2nd/3rd Bill bonus rates (50 / 40 / 30%). How the rate is applied is comm_schemes.bill_bonus_basis.';

-- ----------------------------------------------------------------------------
-- TABLE: comm_hierarchy
-- The payroll-purpose org chart. Deliberately separate from
-- hr_staff_costs.department_id and from any app-role hierarchy: this exists
-- only to answer "who overrides whom, at what rate, in which month".
-- ----------------------------------------------------------------------------

CREATE TABLE comm_hierarchy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id UUID NOT NULL REFERENCES comm_schemes(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES hr_staff_costs(id) ON DELETE CASCADE,
    upline_staff_id UUID REFERENCES hr_staff_costs(id) ON DELETE RESTRICT,
    rank_id UUID NOT NULL REFERENCES comm_ranks(id) ON DELETE RESTRICT,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT not_own_upline CHECK (upline_staff_id IS DISTINCT FROM staff_id),
    CONSTRAINT effective_window CHECK (effective_to IS NULL OR effective_to >= effective_from),
    -- One position per person at any point in time.
    CONSTRAINT no_overlapping_position EXCLUDE USING gist (
        scheme_id WITH =,
        staff_id WITH =,
        daterange(effective_from, effective_to, '[]') WITH &&
    )
);

COMMENT ON TABLE comm_hierarchy IS
    'Revenue commission: effective-dated upline map + rank. Read as-at the period being computed, then SNAPSHOTTED into comm_statements so history never moves.';

CREATE INDEX idx_comm_hierarchy_staff ON comm_hierarchy (scheme_id, staff_id, effective_from DESC);
CREATE INDEX idx_comm_hierarchy_upline ON comm_hierarchy (scheme_id, upline_staff_id);

-- ----------------------------------------------------------------------------
-- TRIGGER: reject a cycle in the upline chain.
-- The engine also guards (depth cap + visited set) — belt and braces, because
-- a cycle here would be a silent money bug, not a crash.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION comm_hierarchy_reject_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cursor UUID := NEW.upline_staff_id;
    v_depth  INTEGER := 0;
BEGIN
    WHILE v_cursor IS NOT NULL AND v_depth < 20 LOOP
        IF v_cursor = NEW.staff_id THEN
            RAISE EXCEPTION
                'comm_hierarchy: upline chain for staff % is cyclic', NEW.staff_id;
        END IF;

        SELECT h.upline_staff_id INTO v_cursor
        FROM comm_hierarchy h
        WHERE h.scheme_id = NEW.scheme_id
          AND h.staff_id = v_cursor
          AND h.id IS DISTINCT FROM NEW.id
          AND daterange(h.effective_from, h.effective_to, '[]')
              && daterange(NEW.effective_from, NEW.effective_to, '[]')
        LIMIT 1;

        v_depth := v_depth + 1;
    END LOOP;

    IF v_depth >= 20 THEN
        RAISE EXCEPTION
            'comm_hierarchy: upline chain for staff % exceeds 20 levels', NEW.staff_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_comm_hierarchy_reject_cycle
    BEFORE INSERT OR UPDATE OF upline_staff_id, staff_id, effective_from, effective_to
    ON comm_hierarchy
    FOR EACH ROW
    EXECUTE FUNCTION comm_hierarchy_reject_cycle();

-- ============================================================================
-- RUNS + RESULTS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: comm_runs
-- ----------------------------------------------------------------------------

CREATE TABLE comm_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_month DATE NOT NULL,
    scheme_id UUID NOT NULL REFERENCES comm_schemes(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES sales_import_batches(id) ON DELETE RESTRICT,
    status comm_run_status NOT NULL DEFAULT 'draft',

    staff_count INTEGER NOT NULL DEFAULT 0,
    total_commission DECIMAL(15, 2) NOT NULL DEFAULT 0,
    warnings JSONB NOT NULL DEFAULT '[]'::JSONB,

    computed_at TIMESTAMPTZ,
    computed_by UUID REFERENCES users(id),
    applied_at TIMESTAMPTZ,
    applied_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1),
    CONSTRAINT uq_comm_run_per_period UNIQUE (period_month)
);

COMMENT ON TABLE comm_runs IS
    'Revenue commission: one run per month. warnings holds the engine''s non-fatal findings; Apply stays disabled while any stands.';

-- ----------------------------------------------------------------------------
-- TABLE: comm_statements
-- One per (run × salesperson). Rank + rate + upline are SNAPSHOTS.
-- ----------------------------------------------------------------------------

CREATE TABLE comm_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES comm_runs(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES hr_staff_costs(id) ON DELETE RESTRICT,

    -- Snapshot of the position used, so later config edits never rewrite history
    rank_key TEXT,
    product_rate DECIMAL(9, 6) NOT NULL DEFAULT 0,
    upline_staff_id UUID REFERENCES hr_staff_costs(id),

    product_revenue DECIMAL(15, 2) NOT NULL DEFAULT 0,
    product_commission DECIMAL(15, 2) NOT NULL DEFAULT 0,

    kpi_qty DECIMAL(15, 3) NOT NULL DEFAULT 0,
    kpi_base DECIMAL(15, 2) NOT NULL DEFAULT 0,
    kpi_threshold_pct DECIMAL(9, 6) NOT NULL DEFAULT 0,
    kpi_commission DECIMAL(15, 2) NOT NULL DEFAULT 0,

    bill_bonus DECIMAL(15, 2) NOT NULL DEFAULT 0,
    override_commission DECIMAL(15, 2) NOT NULL DEFAULT 0,
    total_commission DECIMAL(15, 2) NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_comm_statement_per_run UNIQUE (run_id, staff_id),
    CONSTRAINT components_tally CHECK (
        total_commission
        = product_commission + kpi_commission + bill_bonus + override_commission
    )
);

COMMENT ON TABLE comm_statements IS
    'Revenue commission: one salesperson''s month. total_commission is what lands in hr_monthly_payroll.commission_amount. The CHECK makes a component/total drift impossible to store.';

CREATE INDEX idx_comm_statements_run ON comm_statements (run_id);
CREATE INDEX idx_comm_statements_staff ON comm_statements (staff_id);

-- ----------------------------------------------------------------------------
-- TABLE: comm_statement_lines
-- The audit trail — the reason this module can be trusted with money.
-- Invariant Σ lines.amount = statement.total_commission is verified by
-- apply_commission_run before it commits (arrives with the RPC migration).
-- ----------------------------------------------------------------------------

CREATE TABLE comm_statement_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_id UUID NOT NULL REFERENCES comm_statements(id) ON DELETE CASCADE,
    component comm_component NOT NULL,

    source_order_id UUID REFERENCES sales_orders(id) ON DELETE SET NULL,
    source_line_id UUID REFERENCES sales_order_lines(id) ON DELETE SET NULL,
    /* the downline whose volume produced an override line */
    source_staff_id UUID REFERENCES hr_staff_costs(id) ON DELETE SET NULL,

    basis_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    rate DECIMAL(9, 6),
    qty DECIMAL(15, 3),
    amount DECIMAL(15, 2) NOT NULL,
    note TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE comm_statement_lines IS
    'Revenue commission: every ringgit traced to the order line, tagged bill or downline that produced it. Drives the statement drill-down page.';

CREATE INDEX idx_comm_statement_lines_stmt ON comm_statement_lines (statement_id, component);
CREATE INDEX idx_comm_statement_lines_order ON comm_statement_lines (source_order_id);

-- ============================================================================
-- RLS
--
-- Mirrors hr_monthly_payroll (migration 122): principal ALL; hr full R/W;
-- finance DENY — these tables ARE individual salary detail, and CLAUDE.md's
-- standing rule is that Finance never sees per-employee pay; dept_manager
-- DENY (a read-only own-department carve-out is spec Q6, not assumed here).
-- ============================================================================

ALTER TABLE sales_import_batches   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order_lines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order_bill_tags  ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_schemes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_ranks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_kpi_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_kpi_thresholds    ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_bill_bonus_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_hierarchy         ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_runs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_statements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_statement_lines   ENABLE ROW LEVEL SECURITY;

DO $do$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'sales_import_batches', 'sales_orders', 'sales_order_lines',
        'sales_order_bill_tags', 'comm_schemes', 'comm_ranks',
        'comm_kpi_items', 'comm_kpi_thresholds', 'comm_bill_bonus_rules',
        'comm_hierarchy', 'comm_runs', 'comm_statements', 'comm_statement_lines'
    ]
    LOOP
        -- One statement per EXECUTE: plpgsql's EXECUTE cannot take two
        -- commands in a single string.
        EXECUTE format($f$
            CREATE POLICY %1$s_principal_all ON %1$I FOR ALL
                USING (current_user_role() = 'principal')
                WITH CHECK (current_user_role() = 'principal');
        $f$, t);
        EXECUTE format($f$
            CREATE POLICY %1$s_hr_all ON %1$I FOR ALL
                USING (current_user_role() = 'hr')
                WITH CHECK (current_user_role() = 'hr');
        $f$, t);
    END LOOP;
END;
$do$;

-- finance / dept_manager: no policy → DENY ALL. Deliberate — see the header.
