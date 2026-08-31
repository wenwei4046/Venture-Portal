-- ============================================================================
-- 20260831010000_revenue_commission_foundation.sql
-- Revenue Department commission payroll — schema foundation
-- HOUZS Venture Portal
--
-- Spec: docs/module-spec-revenue-commission.md
--
-- Applied 2026-08-31, after being verified by dry-run inside BEGIN/ROLLBACK
-- against the live schema. Two things are still open (spec §12): the
-- group-sales targets above 300k, and where product cost comes from — neither
-- changes the shape below, and both are configuration rather than schema.
--
-- Structure, per the user's brief 2026-08-31:
--
--   The Revenue Department is divided into SUB-DEPARTMENTS, and each one
--   calculates commission differently. "Fair" (the roadshow / event team) is
--   the first, and its ruleset is the four components the engine implements.
--   A new sub-department may CLONE an existing one's rules or define its own,
--   which is why every rule table hangs off a SCHEME, and a scheme hangs off a
--   sub-department.
--
--   departments (Revenue Department)
--     └── comm_sub_departments (Fair, …)
--           └── comm_schemes            ← the knobs + component switches
--                 ├── comm_ranks              4 tiers, rates 5–10%
--                 ├── comm_item_groups        which ERP groups are commissionable
--                 ├── comm_kpi_items          product → flat KPI allowance
--                 ├── comm_kpi_thresholds     qty ladder → uplift
--                 ├── comm_open_bill_rules    1st/2nd/3rd bill of the day
--                 └── comm_hierarchy          who is under who, effective-dated
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
    'open_bill',
    'override',
    'margin_incentive'
);

CREATE TYPE comm_margin_band_kind AS ENUM (
    'incentive',   -- margin at or ABOVE the threshold pays monthly_incentive, cumulative
    'reference',   -- a named level ("standard", "low") with no money attached
    'penalty'      -- margin at or BELOW the threshold scales that BILL's commission
);

CREATE TYPE comm_promotion_criterion AS ENUM (
    'personal_sales',
    'group_sales',
    'kpi_items_per_pax',
    'margin_band'
);

CREATE TYPE comm_rate_mode AS ENUM (
    'fixed',      -- once promoted, the rate stays even in a month below target
    'variable'    -- recomputed monthly from that month's group sales
);

CREATE TYPE comm_open_bill_basis AS ENUM (
    'uplift_on_commission',   -- orderRevenue x personalRate x billPct  (Fair)
    'pct_of_revenue'          -- orderRevenue x billPct
);

COMMENT ON TYPE comm_run_status IS
    'draft: created, not computed. computed: engine ran, statements exist. applied: written into hr_monthly_payroll.commission_amount. locked: payroll run submitted, immutable.';

COMMENT ON TYPE comm_open_bill_basis IS
    'uplift_on_commission (user decision 2026-08-31): "10,000 at 7% — compute the 7% first, then add 50%" gives 700 commission + 350 bonus. Follows the salesperson''s CURRENT rate, so a promotion changes the bonus.';

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
-- statutory allowance — they are paid 100% on commission. Nothing needs to
-- change for that to work:
--   * hr_staff_costs.basic_salary already allows 0 (migration 141 relaxed the
--     CHECK for commission-only staff; HV020 is the existing precedent), and
--     hr_employment_type already has 'commission_eligible' (migration 120).
--   * compute_hr_monthly_payroll bases EPF/SOCSO/EIS on
--     (prorated basic + statutory allowance), so with both at 0 every
--     statutory lookup returns 0 on its own — no trigger change, and no risk
--     to the departments that DO carry a basic.
-- PCB is the one deduction that still bites: the trigger computes it on gross,
-- which for these staff is the whole commission. Left as-is deliberately —
-- commission is taxable income. Flagged in the spec for the user to confirm.

-- Retire the never-wired v1 engine (migration 123). Kept for history.
COMMENT ON TABLE commission_rules IS
    'DEPRECATED 2026-08-31 — superseded by comm_schemes / comm_ranks / comm_kpi_items. Never wired to any UI. Kept for history; do not extend.';
COMMENT ON TABLE commission_inputs IS
    'DEPRECATED 2026-08-31 — superseded by sales_orders / sales_order_lines. Never wired to any UI. Kept for history; do not extend.';

-- ============================================================================
-- ORG: SUB-DEPARTMENTS
-- ============================================================================

CREATE TABLE comm_sub_departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID NOT NULL REFERENCES departments(id),
    name TEXT NOT NULL,
    code TEXT,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_sub_department_name UNIQUE (department_id, name)
);

COMMENT ON TABLE comm_sub_departments IS
    'Sub-units of a commission department, each with its own calculation rules. First one: "Fair" — the roadshow / event team whose 3-day events are what the Open Bill bonus rewards.';

-- ============================================================================
-- CONFIGURATION
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: comm_schemes
-- The knob-holder + component switches. A run snapshots which scheme it used
-- so changing a knob never silently rewrites a past month.
-- ----------------------------------------------------------------------------

CREATE TABLE comm_schemes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_department_id UUID NOT NULL REFERENCES comm_sub_departments(id) ON DELETE RESTRICT,
    scheme_name TEXT NOT NULL,

    -- "Generate New Sub-Department -> follow an existing one's rules" copies
    -- every child row and records where it came from.
    cloned_from_scheme_id UUID REFERENCES comm_schemes(id),

    open_bill_basis comm_open_bill_basis NOT NULL DEFAULT 'uplift_on_commission',
    override_includes_kpi BOOLEAN NOT NULL DEFAULT FALSE,

    -- Share of the ORDER TOTAL the customer must have deposited before any of
    -- that order's commission is released. 0.50 = half; NULL disables the gate.
    -- Nothing is lost below it: the order pays in the month its deposit clears.
    deposit_threshold_pct DECIMAL(9, 6)
        CONSTRAINT deposit_threshold_sane
        CHECK (deposit_threshold_pct IS NULL
               OR (deposit_threshold_pct >= 0 AND deposit_threshold_pct <= 1)),

    -- Applied to a salesperson with no rate_mode of their own.
    default_rate_mode comm_rate_mode NOT NULL DEFAULT 'variable',

    -- Per-component switches: another sub-department reuses the subset that
    -- applies to it instead of getting a bespoke engine.
    enable_product_revenue  BOOLEAN NOT NULL DEFAULT TRUE,
    enable_kpi              BOOLEAN NOT NULL DEFAULT TRUE,
    enable_open_bill        BOOLEAN NOT NULL DEFAULT TRUE,
    enable_override         BOOLEAN NOT NULL DEFAULT TRUE,
    enable_margin_penalty   BOOLEAN NOT NULL DEFAULT TRUE,
    enable_margin_incentive BOOLEAN NOT NULL DEFAULT TRUE,

    effective_from DATE NOT NULL,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT effective_window CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE comm_schemes IS
    'One commission ruleset, owned by a sub-department. cloned_from_scheme_id records a "follow an existing sub-department''s rules" creation.';

CREATE UNIQUE INDEX uq_comm_scheme_active_per_sub_dept
    ON comm_schemes (sub_department_id) WHERE is_active AND effective_to IS NULL;

-- ----------------------------------------------------------------------------
-- TABLE: comm_ranks — the Tier ladder
--
-- Four tiers, rates 5-10%. Rates OVERLAP across tiers (7% is both a senior
-- Revenue Specialist and a junior Team Assistant), so the rank key, not the
-- rate, is the identity. The override differential is always derived from the
-- rates — never stored per pair.
-- ----------------------------------------------------------------------------

CREATE TABLE comm_ranks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id UUID NOT NULL REFERENCES comm_schemes(id) ON DELETE CASCADE,
    tier_key TEXT NOT NULL,
    tier_label TEXT NOT NULL,
    rank_key TEXT NOT NULL,
    label TEXT NOT NULL,
    product_rate DECIMAL(9, 6) NOT NULL,

    -- A Revenue Specialist on 5% may not hold downlines; reaching 6% unlocks
    -- recruiting. The engine warns if a placement violates this.
    can_recruit BOOLEAN NOT NULL DEFAULT TRUE,

    -- GROUP sales needed to hold this rank: the person's own commissionable
    -- revenue plus their whole downline's (user 2026-08-31 - a Specialist on
    -- 200k with two downlines on 100k each has group sales of 400k and clears
    -- the 300k gate for Team Assistant). NULL = an entry rank that cannot be
    -- climbed to by volume.
    --
    -- A `variable` salesperson is paid the highest rank they clear each month
    -- and drops back when they miss it; a `fixed` one keeps what they attained
    -- and this only drives the "due a promotion" prompt.
    group_sales_threshold DECIMAL(15, 2)
        CONSTRAINT group_sales_threshold_positive
        CHECK (group_sales_threshold IS NULL OR group_sales_threshold > 0),

    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT product_rate_sane CHECK (product_rate >= 0 AND product_rate <= 1),
    CONSTRAINT uq_comm_rank_key UNIQUE (scheme_id, rank_key)
);

COMMENT ON TABLE comm_ranks IS
    'Tier ladder: Revenue Specialist 5/6%, Team Assistant 7/8%, Team Leader 9%, Senior Team Leader 10%. There is NO 7% Revenue Specialist - 7% is where Team Assistant starts. can_recruit is false on the 5% rung.';
COMMENT ON COLUMN comm_ranks.group_sales_threshold IS
    'Group sales (own + whole downline) needed to hold this rank. Only ta_7 (300k) is known; the other rungs await their targets.';

-- ----------------------------------------------------------------------------
-- TABLE: comm_item_groups
-- Which ERP `Item Group` values earn commission. User decision 2026-08-31:
-- TRANS (transport charges) and OTHER (disposal, misc) do NOT; accessories do.
-- An unlisted group is treated as NOT commissionable AND raises a run warning,
-- so a new ERP group can never silently start or stop paying.
-- ----------------------------------------------------------------------------

CREATE TABLE comm_item_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id UUID NOT NULL REFERENCES comm_schemes(id) ON DELETE CASCADE,
    item_group TEXT NOT NULL,
    commissionable BOOLEAN NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_comm_item_group UNIQUE (scheme_id, item_group)
);

COMMENT ON TABLE comm_item_groups IS
    'ERP Item Group -> commissionable? Seeded from the groups seen in the July SO export: MATTRESS / SOFA / BEDFRAME / DINING / ACC pay, TRANS / OTHER do not.';

-- ----------------------------------------------------------------------------
-- TABLE: comm_kpi_items / comm_kpi_thresholds
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
    CONSTRAINT no_overlapping_kpi_item EXCLUDE USING gist (
        scheme_id WITH =,
        (UPPER(BTRIM(product_code))) WITH =,
        daterange(effective_from, effective_to, '[]') WITH &&
    )
);

COMMENT ON TABLE comm_kpi_items IS
    'Products that pay a flat KPI allowance (e.g. RM50 or RM60 per pillow). Their sales revenue is EXCLUDED from the product-revenue base — the allowance already pays for them. Most are bundled free in the ERP (qty > 0 at RM0), which is exactly the case the flat allowance exists to reward.';

CREATE INDEX idx_comm_kpi_items_code ON comm_kpi_items (scheme_id, (UPPER(BTRIM(product_code))));

CREATE TABLE comm_kpi_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id UUID NOT NULL REFERENCES comm_schemes(id) ON DELETE CASCADE,
    tier_label TEXT,
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
    'KPI quantity ladder. Tier 1 = 10 units -> +20% on the whole KPI base (10 x RM50 = 500 -> 600). The engine applies the HIGHEST rung met, never the sum of rungs.';

-- ----------------------------------------------------------------------------
-- TABLE: comm_open_bill_rules
-- ----------------------------------------------------------------------------

CREATE TABLE comm_open_bill_rules (
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
    CONSTRAINT no_overlapping_open_bill_rule EXCLUDE USING gist (
        scheme_id WITH =,
        bill_rank WITH =,
        daterange(effective_from, effective_to, '[]') WITH &&
    )
);

COMMENT ON TABLE comm_open_bill_rules IS
    'Open Bill: the 1st / 2nd / 3rd bill a salesperson writes on an event day earns +50 / 40 / 30% ON TOP of that order''s commission, at the person''s current rate.';

-- ----------------------------------------------------------------------------
-- TABLE: comm_brands
-- Margin thresholds, incentives and KPI expectations follow the BRAND
-- (user 2026-08-31): Akemi, Zanotti, Ergotex. What counts as a good margin
-- differs - Akemi's incentive Tier 1 is 36% where Zanotti's is 33%.
--
-- The ERP export has no brand column, so item_code_prefixes lets the importer
-- tag each line from its Item Code (AK-... -> Akemi, and so on).
-- ----------------------------------------------------------------------------

CREATE TABLE comm_brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id UUID NOT NULL REFERENCES comm_schemes(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    item_code_prefixes TEXT[] NOT NULL DEFAULT '{}',
    note TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_comm_brand_code UNIQUE (scheme_id, code)
);

COMMENT ON TABLE comm_brands IS
    'Brands whose margin ladders differ. item_code_prefixes maps ERP Item Codes onto a brand because the sales-order export carries no brand column.';

-- ----------------------------------------------------------------------------
-- TABLE: comm_products
-- The Product List the Principal keys costs into (user 2026-08-31). This is
-- the ONLY source of cost in the system: the ERP sales-order export carries
-- none, so without a row here a line has no cost and its bill has no margin.
--
-- Deliberately NOT scheme-scoped. A product's cost is a company fact, not a
-- commission rule, so one list serves every sub-department. brand_code lives
-- here too because it is the same keying exercise, and an explicit
-- product-level brand beats guessing from comm_brands.item_code_prefixes.
--
-- While this list is still being filled, sales_orders.manual_margin_pct lets a
-- human type a bill's margin directly and it OVERRIDES anything derived here.
-- ----------------------------------------------------------------------------

CREATE TABLE comm_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_code TEXT NOT NULL,
    product_name TEXT,
    brand_code TEXT,
    item_group TEXT,
    unit_cost DECIMAL(15, 2),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    note TEXT,
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unit_cost_non_negative CHECK (unit_cost IS NULL OR unit_cost >= 0)
);

COMMENT ON TABLE comm_products IS
    'Principal-maintained product cost list. unit_cost NULL = not keyed in yet, which leaves that line without cost and its bill without a derived margin.';
COMMENT ON COLUMN comm_products.unit_cost IS
    'Cost per unit. The importer stamps qty x unit_cost onto sales_order_lines.cost_amount, so a later cost change does NOT silently rewrite a run that already used the old one.';

-- Item codes are matched case-insensitively and trimmed, the same way the
-- engine matches KPI items, so uniqueness has to be on the same shape.
CREATE UNIQUE INDEX uq_comm_products_item_code
    ON comm_products ((UPPER(BTRIM(item_code))));
CREATE INDEX idx_comm_products_brand ON comm_products (brand_code);

-- ----------------------------------------------------------------------------
-- TABLE: comm_margin_bands
-- One brand's margin ladder. From the user's worked example:
--
--   incentive tier 2   43%   -> a further RM1,500 (RM2,500 in total)
--   incentive tier 1   36%   -> RM1,000
--   standard           33%   -> reference only
--   low                30%   -> reference only
--   below tier 1       27%   -> that BILL's commission x 0.50
--   below tier 2       25%   -> x 0.25
--   below tier 3       24%   -> x 0
--
-- Incentives read as ">= margin_pct" and STACK up the ladder; they are settled
-- on the salesperson's MONTHLY margin. Penalties read as "<= margin_pct" and
-- the MOST SEVERE match wins; they are settled PER BILL.
-- ----------------------------------------------------------------------------

CREATE TABLE comm_margin_bands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id UUID NOT NULL REFERENCES comm_schemes(id) ON DELETE CASCADE,
    brand_id UUID NOT NULL REFERENCES comm_brands(id) ON DELETE CASCADE,
    band_key TEXT NOT NULL,
    label TEXT NOT NULL,
    kind comm_margin_band_kind NOT NULL,
    margin_pct DECIMAL(9, 6) NOT NULL,
    commission_multiplier DECIMAL(9, 6) NOT NULL DEFAULT 1,
    monthly_incentive DECIMAL(15, 2) NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT margin_pct_sane CHECK (margin_pct >= -1 AND margin_pct <= 1),
    CONSTRAINT multiplier_sane CHECK (commission_multiplier >= 0 AND commission_multiplier <= 1),
    CONSTRAINT incentive_non_negative CHECK (monthly_incentive >= 0),
    CONSTRAINT uq_comm_margin_band UNIQUE (brand_id, band_key)
);

COMMENT ON TABLE comm_margin_bands IS
    'Per-brand margin ladder. kind=incentive pays monthly and stacks; kind=penalty scales a single bill''s commission and the most severe match wins; kind=reference is a label only.';

-- ----------------------------------------------------------------------------
-- TABLE: comm_promotion_rules
-- The promotion criteria, RECORDED BUT NOT ENFORCED (user 2026-08-31: "先不需
-- 要 set goal... 不过可以先写下来" - the algorithm may change once the
-- restrictions are settled). is_enforced stays FALSE; the live gate remains
-- comm_ranks.group_sales_threshold until the user says otherwise.
--
-- Criteria sharing an alternative_group are ANDed; different groups are ORed.
-- That models 7% -> 8% exactly: (500k AND 10 KPI per pax) OR (500k AND margin
-- Tier 1) OR (700k on its own).
-- ----------------------------------------------------------------------------

CREATE TABLE comm_promotion_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id UUID NOT NULL REFERENCES comm_schemes(id) ON DELETE CASCADE,
    from_rank_key TEXT NOT NULL,
    to_rank_key TEXT NOT NULL,
    alternative_group SMALLINT NOT NULL DEFAULT 1,
    criterion comm_promotion_criterion NOT NULL,
    threshold_amount DECIMAL(15, 2),
    threshold_qty INTEGER,
    margin_band_key TEXT,
    consecutive_months SMALLINT,
    is_enforced BOOLEAN NOT NULL DEFAULT FALSE,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT consecutive_months_sane CHECK (consecutive_months IS NULL OR consecutive_months > 0)
);

COMMENT ON TABLE comm_promotion_rules IS
    'Promotion criteria, recorded for reference. Same alternative_group = AND, different groups = OR. is_enforced is FALSE everywhere: nothing reads these yet, by the user''s request.';

CREATE INDEX idx_comm_promotion_rules_scheme
    ON comm_promotion_rules (scheme_id, from_rank_key, alternative_group);

-- ----------------------------------------------------------------------------
-- TABLE: comm_hierarchy
-- The payroll-purpose org chart. Deliberately separate from
-- hr_staff_costs.department_id and from any app-role hierarchy: this exists
-- only to answer "who overrides whom, at what rate, in which month".
--
-- The exclusion constraint spans SCHEMES on purpose: a salesperson may hold
-- only one position at a time, so they cannot sit in two sub-departments and
-- be paid twice for the same sale.
-- ----------------------------------------------------------------------------

CREATE TABLE comm_hierarchy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id UUID NOT NULL REFERENCES comm_schemes(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES hr_staff_costs(id) ON DELETE CASCADE,
    upline_staff_id UUID REFERENCES hr_staff_costs(id) ON DELETE RESTRICT,
    -- The rank ATTAINED. In fixed mode this is the whole story; in variable
    -- mode it is the floor the monthly recalculation can never drop below.
    rank_id UUID NOT NULL REFERENCES comm_ranks(id) ON DELETE RESTRICT,
    -- NULL = follow comm_schemes.default_rate_mode.
    rate_mode comm_rate_mode,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT not_own_upline CHECK (upline_staff_id IS DISTINCT FROM staff_id),
    CONSTRAINT effective_window CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT one_position_at_a_time EXCLUDE USING gist (
        staff_id WITH =,
        daterange(effective_from, effective_to, '[]') WITH &&
    )
);

COMMENT ON TABLE comm_hierarchy IS
    'Effective-dated upline map + rank, read as-at the period being computed and then SNAPSHOTTED into comm_statements so history never moves. Drives the drag-to-reparent org chart.';

CREATE INDEX idx_comm_hierarchy_staff ON comm_hierarchy (scheme_id, staff_id, effective_from DESC);
CREATE INDEX idx_comm_hierarchy_upline ON comm_hierarchy (scheme_id, upline_staff_id);

-- ----------------------------------------------------------------------------
-- TRIGGER: reject a cycle in the upline chain.
-- The engine also guards (depth cap + visited set) — belt and braces, because
-- a cycle here would be a silent money bug, not a crash. Dragging a manager
-- under their own downline in the org chart is exactly how one gets created.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION comm_hierarchy_reject_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
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
        WHERE h.staff_id = v_cursor
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
$body$;

CREATE TRIGGER trg_comm_hierarchy_reject_cycle
    BEFORE INSERT OR UPDATE OF upline_staff_id, staff_id, effective_from, effective_to
    ON comm_hierarchy
    FOR EACH ROW
    EXECUTE FUNCTION comm_hierarchy_reject_cycle();

-- ----------------------------------------------------------------------------
-- TABLE: comm_agent_aliases
-- The ERP export carries the salesperson as a FREE-TEXT `Agent` name with no
-- code, and the names are dirty: trailing spaces ("MELVIN CHONG "), mixed case
-- ("Peifen", "Lim Yau Wei"), plus non-people ("OTHERS", "Test Sales Director",
-- "HOUZS CENTURY"). One human can therefore appear under several spellings, so
-- the mapping is a table, not a column on hr_staff_costs.
--
-- agent_key = UPPER(collapse-whitespace(name)), computed by the importer.
-- ----------------------------------------------------------------------------

CREATE TABLE comm_agent_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_key TEXT NOT NULL UNIQUE,
    agent_name_sample TEXT NOT NULL,
    staff_id UUID NOT NULL REFERENCES hr_staff_costs(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE comm_agent_aliases IS
    'ERP Agent name -> hr_staff_costs. Confirmed once by a human in the import wizard, then remembered. Of the 40 agents in the July export only one (SIA JONAS) already existed in the staff master, so the Revenue Department''s people must be created before the first run.';

CREATE INDEX idx_comm_agent_aliases_staff ON comm_agent_aliases (staff_id);

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
    -- The export is a date RANGE, not a month: the user's "July SO" file
    -- actually ran 2026-07-01 to 2026-08-15. These record what was dropped.
    out_of_period_count INTEGER NOT NULL DEFAULT 0,
    cancelled_count INTEGER NOT NULL DEFAULT 0,
    unmatched_agent_count INTEGER NOT NULL DEFAULT 0,
    status sales_import_status NOT NULL DEFAULT 'draft',
    notes TEXT,
    imported_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    superseded_at TIMESTAMPTZ,

    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1)
);

COMMENT ON TABLE sales_import_batches IS
    'One ERP sales-order file import. At most one committed batch per period (partial unique index below).';

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

    -- The Open Bill race is per EVENT DAY, normally the order date but
    -- editable: a 3-day roadshow can straddle a cut-off and the ERP dates
    -- late-entry orders on the following day.
    event_date DATE NOT NULL,

    debtor_code TEXT,
    customer_name TEXT,
    -- Agent as written in the file, plus the normalised matching key.
    agent_name TEXT NOT NULL,
    agent_key TEXT NOT NULL,
    staff_id UUID REFERENCES hr_staff_costs(id) ON DELETE RESTRICT,
    -- Branch: KL / PG / SRW / SBH. Salespeople work across branches, so this
    -- is descriptive only — it never drives the hierarchy.
    location TEXT,
    -- A sales order never crosses brands (user 2026-08-31), so the brand is an
    -- order-level fact. The importer resolves it from the Item Codes and the
    -- engine warns if the lines ever disagree.
    brand_code TEXT,
    order_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    -- Margin keyed in by hand for this one bill, 0.36 = 36%. The stop-gap while
    -- the Product List fills up: it OVERRIDES anything derived from line costs,
    -- so a human correction always wins.
    manual_margin_pct DECIMAL(9, 6)
        CONSTRAINT manual_margin_sane
        CHECK (manual_margin_pct IS NULL OR (manual_margin_pct >= -1 AND manual_margin_pct <= 1)),
    manual_margin_by UUID REFERENCES users(id),
    manual_margin_at TIMESTAMPTZ,
    -- ERP BALANCE — outstanding amount. Recorded so a future "pay commission
    -- on collection" rule has the data; nothing reads it today.
    balance DECIMAL(15, 2),
    -- What the customer has actually put in. The deposit gate measures this
    -- against order_total, so it is derived once here rather than in every query.
    paid_amount DECIMAL(15, 2)
        GENERATED ALWAYS AS (order_total - COALESCE(balance, 0)) STORED,
    cancelled BOOLEAN NOT NULL DEFAULT FALSE,
    -- Position among that agent's orders that day, derived from the running
    -- Doc. No. — the Date cells carry no time. Seeds the Open Bill picks.
    sequence_in_day INTEGER,
    raw JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1),
    CONSTRAINT uq_sales_order_per_batch UNIQUE (batch_id, order_no)
);

COMMENT ON TABLE sales_orders IS
    'One ERP sales order. staff_id NULL = unmatched agent, which blocks the run until a human resolves it in the import wizard.';
COMMENT ON COLUMN sales_orders.raw IS
    'The source row as parsed, verbatim. Lets us re-derive without asking for the file again when a mapping bug surfaces.';

CREATE INDEX idx_sales_orders_batch ON sales_orders (batch_id);
CREATE INDEX idx_sales_orders_staff_period ON sales_orders (staff_id, period_month);
CREATE INDEX idx_sales_orders_event_date ON sales_orders (staff_id, event_date);
CREATE INDEX idx_sales_orders_agent_key ON sales_orders (agent_key);

-- ----------------------------------------------------------------------------
-- TABLE: sales_order_lines
--
-- No is_kpi column ON PURPOSE. Whether a line is a KPI item is derived at
-- compute time from comm_kpi_items, so re-configuring the KPI list and
-- re-running the engine gives the right answer without re-importing.
--
-- Beware when reading these: the ERP prices PACKAGES. 607 of the 691 orders in
-- the July export put the entire order value on ONE line (usually the
-- mattress) with the bundled items at qty > 0 and amount 0. A per-line amount
-- is not a per-product revenue split — only sums across an order are meaningful.
-- ----------------------------------------------------------------------------

CREATE TABLE sales_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL,
    item_group TEXT NOT NULL,
    product_code TEXT NOT NULL,
    product_name TEXT,
    description2 TEXT,
    uom TEXT,
    location TEXT,
    qty DECIMAL(15, 3) NOT NULL DEFAULT 0,
    unit_price DECIMAL(15, 2) NOT NULL DEFAULT 0,
    line_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    -- Brand, resolved from the Item Code via comm_brands.item_code_prefixes.
    brand_code TEXT,
    -- Cost of goods, for margin. THE ERP SALES-ORDER EXPORT HAS NO COST COLUMN,
    -- so this stays NULL until a cost source exists; the engine then skips the
    -- below-margin penalty and says so in the run warnings rather than quietly
    -- paying full commission on a bad-margin bill.
    cost_amount DECIMAL(15, 2),
    raw JSONB,

    CONSTRAINT uq_sales_order_line UNIQUE (order_id, line_no)
);

COMMENT ON TABLE sales_order_lines IS
    'Order line items. item_group decides whether the revenue is commissionable (comm_item_groups); product_code decides whether it is a KPI item. Both are resolved at compute time, never stored here.';

CREATE INDEX idx_sales_order_lines_order ON sales_order_lines (order_id);
CREATE INDEX idx_sales_order_lines_product ON sales_order_lines (product_code);
CREATE INDEX idx_sales_order_lines_group ON sales_order_lines (item_group);

-- ----------------------------------------------------------------------------
-- TABLE: sales_order_open_bill_tags
-- Which order is this salesperson's 1st / 2nd / 3rd bill of the event day.
-- Seeded from sales_orders.sequence_in_day, then adjustable by hand.
-- ----------------------------------------------------------------------------

CREATE TABLE sales_order_open_bill_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES sales_orders(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES hr_staff_costs(id) ON DELETE CASCADE,
    event_date DATE NOT NULL,
    bill_rank SMALLINT NOT NULL,
    -- TRUE while the rank is still the importer's suggestion; a human edit
    -- clears it, so the board can show what has actually been reviewed.
    auto_suggested BOOLEAN NOT NULL DEFAULT FALSE,
    tagged_by UUID REFERENCES users(id),
    tagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_bill_rank CHECK (bill_rank BETWEEN 1 AND 3),
    CONSTRAINT uq_bill_rank_per_staff_day UNIQUE (staff_id, event_date, bill_rank)
);

COMMENT ON TABLE sales_order_open_bill_tags IS
    'The Open Bill picks. One tag per order; one holder per (staff, event day, rank). In July, 300 of the 473 orders were a 2nd bill or later for their agent that day, so these are suggested first and reviewed rather than picked from scratch.';

CREATE INDEX idx_open_bill_tags_staff_day ON sales_order_open_bill_tags (staff_id, event_date);

-- ============================================================================
-- RUNS + RESULTS
-- ============================================================================

-- comm_order_releases follows comm_runs below (it references it).

CREATE TABLE comm_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_department_id UUID NOT NULL REFERENCES comm_sub_departments(id) ON DELETE RESTRICT,
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
    CONSTRAINT uq_comm_run_per_sub_dept_period UNIQUE (sub_department_id, period_month)
);

COMMENT ON TABLE comm_runs IS
    'One run per sub-department per calendar month (user 2026-08-31: commission settles month to month, 1st to last day). warnings holds the engine''s non-fatal findings; Apply stays disabled while any stands.';

CREATE TABLE comm_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES comm_runs(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES hr_staff_costs(id) ON DELETE RESTRICT,

    -- Snapshot of the position used, so later config edits never rewrite history
    tier_key TEXT,
    -- The rank ATTAINED, and the one actually paid this month. They differ for
    -- a variable-rate person whose group sales moved them up or back down.
    base_rank_key TEXT,
    rank_key TEXT,
    rate_mode comm_rate_mode,
    -- Set when group sales clear a rank above the base: already applied for a
    -- variable person, a promotion prompt for a fixed one.
    qualifies_for_rank_key TEXT,
    product_rate DECIMAL(9, 6) NOT NULL DEFAULT 0,
    upline_staff_id UUID REFERENCES hr_staff_costs(id),

    product_revenue DECIMAL(15, 2) NOT NULL DEFAULT 0,
    -- Sum of (each bill's revenue x its margin multiplier). This is the base an
    -- upline overrides on, so a bill cut for bad margin cuts the override in the
    -- same proportion (user decision 2026-08-31).
    penalty_weighted_revenue DECIMAL(15, 2) NOT NULL DEFAULT 0,
    -- Own + the entire downline subtree. A SALES figure, so it is the raw
    -- revenue: the margin penalty cuts commission, not the volume sold.
    group_revenue DECIMAL(15, 2) NOT NULL DEFAULT 0,
    -- Commissionable revenue held back by the deposit gate this month.
    deferred_revenue DECIMAL(15, 2) NOT NULL DEFAULT 0,
    -- Revenue dropped because its item group is not commissionable — shown so
    -- the salesperson can see WHY their base is below their sales figure.
    excluded_revenue DECIMAL(15, 2) NOT NULL DEFAULT 0,
    product_commission DECIMAL(15, 2) NOT NULL DEFAULT 0,

    kpi_qty DECIMAL(15, 3) NOT NULL DEFAULT 0,
    kpi_base DECIMAL(15, 2) NOT NULL DEFAULT 0,
    kpi_threshold_pct DECIMAL(9, 6) NOT NULL DEFAULT 0,
    kpi_commission DECIMAL(15, 2) NOT NULL DEFAULT 0,

    open_bill_bonus DECIMAL(15, 2) NOT NULL DEFAULT 0,
    override_commission DECIMAL(15, 2) NOT NULL DEFAULT 0,

    -- Margin, on the goods only (transport and disposal excluded, free KPI
    -- giveaways included - their cost is real and is meant to hurt).
    margin_revenue DECIMAL(15, 2) NOT NULL DEFAULT 0,
    margin_cost DECIMAL(15, 2) NOT NULL DEFAULT 0,
    -- NULL when no cost data was available: no penalty, no incentive, a warning.
    margin_pct DECIMAL(9, 6),
    -- Highest incentive tier cleared by EVERY brand they sold this month.
    margin_band_key TEXT,
    margin_incentive DECIMAL(15, 2) NOT NULL DEFAULT 0,
    -- Memo: commission the below-margin penalty removed. Already reflected in
    -- the statement lines, so it is NOT part of total_commission.
    margin_penalty_withheld DECIMAL(15, 2) NOT NULL DEFAULT 0,

    total_commission DECIMAL(15, 2) NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_comm_statement_per_run UNIQUE (run_id, staff_id),
    CONSTRAINT components_tally CHECK (
        total_commission
        = product_commission + kpi_commission + open_bill_bonus
          + override_commission + margin_incentive
    )
);

COMMENT ON TABLE comm_statements IS
    'One salesperson''s month. total_commission is what lands in hr_monthly_payroll.commission_amount. The CHECK makes a component/total drift impossible to store.';

CREATE INDEX idx_comm_statements_run ON comm_statements (run_id);
CREATE INDEX idx_comm_statements_staff ON comm_statements (staff_id);

CREATE TABLE comm_statement_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_id UUID NOT NULL REFERENCES comm_statements(id) ON DELETE CASCADE,
    component comm_component NOT NULL,

    source_order_id UUID REFERENCES sales_orders(id) ON DELETE SET NULL,
    source_line_id UUID REFERENCES sales_order_lines(id) ON DELETE SET NULL,
    -- the downline whose volume produced an override line
    source_staff_id UUID REFERENCES hr_staff_costs(id) ON DELETE SET NULL,

    basis_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    rate DECIMAL(9, 6),
    qty DECIMAL(15, 3),
    amount DECIMAL(15, 2) NOT NULL,
    note TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- TABLE: comm_statement_brand_margins
-- One row per (statement x brand). The monthly incentive is judged brand by
-- brand and EVERY brand must clear a tier, so the breakdown has to be visible:
-- three weekends of Akemi at Tier 2 and a fourth of Zanotti below it is a
-- Tier 1 month, and the salesperson needs to see which brand capped them.
-- ----------------------------------------------------------------------------

CREATE TABLE comm_statement_brand_margins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_id UUID NOT NULL REFERENCES comm_statements(id) ON DELETE CASCADE,
    brand_code TEXT NOT NULL,
    revenue DECIMAL(15, 2) NOT NULL DEFAULT 0,
    cost DECIMAL(15, 2) NOT NULL DEFAULT 0,
    margin_pct DECIMAL(9, 6),
    top_band_key TEXT,

    CONSTRAINT uq_statement_brand UNIQUE (statement_id, brand_code)
);

COMMENT ON TABLE comm_statement_brand_margins IS
    'Per-brand margin behind one statement. margin_pct NULL = no cost data for that brand, which blocks the whole incentive.';

CREATE INDEX idx_statement_brand_margins ON comm_statement_brand_margins (statement_id);

COMMENT ON TABLE comm_statement_lines IS
    'Every ringgit traced to the order, order line, tagged bill or downline that produced it. Sum of lines.amount = statement.total_commission is verified by apply_commission_run before it commits.';

-- ----------------------------------------------------------------------------
-- TABLE: comm_order_releases
-- Which orders have already had their commission paid, keyed by order_no
-- because batch rows are replaced when a month is re-imported.
--
-- This is what makes the deposit gate safe: an order under the threshold in
-- July is simply absent here, so August's run picks it up once the customer
-- tops up - and the UNIQUE constraint means it can only ever be paid once.
-- ----------------------------------------------------------------------------

CREATE TABLE comm_order_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_no TEXT NOT NULL UNIQUE,
    run_id UUID NOT NULL REFERENCES comm_runs(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES hr_staff_costs(id) ON DELETE RESTRICT,
    period_month DATE NOT NULL,
    order_period_month DATE NOT NULL,
    product_revenue DECIMAL(15, 2) NOT NULL DEFAULT 0,
    released_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1)
);

COMMENT ON TABLE comm_order_releases IS
    'One row per sales order whose commission has been paid. order_period_month vs period_month shows an order carried forward because its deposit only cleared later.';

CREATE INDEX idx_comm_order_releases_run ON comm_order_releases (run_id);
CREATE INDEX idx_comm_order_releases_staff ON comm_order_releases (staff_id, period_month);

CREATE INDEX idx_comm_statement_lines_stmt ON comm_statement_lines (statement_id, component);
CREATE INDEX idx_comm_statement_lines_order ON comm_statement_lines (source_order_id);

-- ============================================================================
-- SEED — Revenue Department > Fair
-- ============================================================================

DO $seed$
DECLARE
    v_dept   UUID;
    v_sub    UUID;
    v_scheme UUID;
BEGIN
    SELECT id INTO v_dept FROM departments WHERE name = 'Revenue Department';
    IF v_dept IS NULL THEN
        RAISE NOTICE 'Revenue Department not found - skipping the Fair seed.';
        RETURN;
    END IF;

    INSERT INTO comm_sub_departments (department_id, name, code, description)
    VALUES (v_dept, 'Fair', 'FAIR',
            'Roadshow / event team. Open Bill rewards writing consecutive bills during a 3-day event.')
    RETURNING id INTO v_sub;

    INSERT INTO comm_schemes (sub_department_id, scheme_name, effective_from,
                              deposit_threshold_pct, default_rate_mode)
    VALUES (v_sub, 'Fair 2026', DATE '2026-01-01', 0.50, 'variable')
    RETURNING id INTO v_scheme;

    -- Tier ladder. Rates overlap across tiers; can_recruit unlocks at 6%.
    -- Six rungs. There is NO 7% Revenue Specialist: 7% is where Team
    -- Assistant starts, and 300k of GROUP sales is what gets you there.
    -- The other thresholds are unknown and left NULL (spec Q1).
    INSERT INTO comm_ranks
        (scheme_id, tier_key, tier_label, rank_key, label, product_rate, can_recruit,
         group_sales_threshold, sort_order)
    VALUES
        (v_scheme, 'revenue_specialist', 'Revenue Specialist', 'rs_5',   'Revenue Specialist - 5%',  0.05, FALSE, NULL,      10),
        (v_scheme, 'revenue_specialist', 'Revenue Specialist', 'rs_6',   'Revenue Specialist - 6%',  0.06, TRUE,  NULL,      20),
        (v_scheme, 'team_assistant',     'Team Assistant',     'ta_7',   'Team Assistant - 7%',      0.07, TRUE,  300000.00, 30),
        (v_scheme, 'team_assistant',     'Team Assistant',     'ta_8',   'Team Assistant - 8%',      0.08, TRUE,  NULL,      40),
        (v_scheme, 'team_leader',        'Team Leader',        'tl_9',   'Team Leader - 9%',         0.09, TRUE,  NULL,      50),
        (v_scheme, 'senior_team_leader', 'Senior Team Leader', 'stl_10', 'Senior Team Leader - 10%', 0.10, TRUE,  NULL,      60);

    -- Item groups seen in the July SO export.
    INSERT INTO comm_item_groups (scheme_id, item_group, commissionable, note) VALUES
        (v_scheme, 'MATTRESS', TRUE,  NULL),
        (v_scheme, 'SOFA',     TRUE,  NULL),
        (v_scheme, 'BEDFRAME', TRUE,  NULL),
        (v_scheme, 'DINING',   TRUE,  NULL),
        (v_scheme, 'ACC',      TRUE,  'Accessories pay, except the codes configured as KPI items.'),
        (v_scheme, 'TRANS',    FALSE, 'Transportation charges - a service fee, not product revenue.'),
        (v_scheme, 'OTHER',    FALSE, 'Disposal / miscellaneous - a service fee, not product revenue.');

    -- Open Bill: 1st / 2nd / 3rd bill of the event day.
    INSERT INTO comm_open_bill_rules (scheme_id, bill_rank, pct, effective_from) VALUES
        (v_scheme, 1, 0.50, DATE '2026-01-01'),
        (v_scheme, 2, 0.40, DATE '2026-01-01'),
        (v_scheme, 3, 0.30, DATE '2026-01-01');

    -- KPI Tier 1: 10 units -> +20% on the whole KPI base.
    INSERT INTO comm_kpi_thresholds (scheme_id, tier_label, min_qty, bonus_pct, effective_from)
    VALUES (v_scheme, 'Tier 1', 10, 0.20, DATE '2026-01-01');

    -- comm_kpi_items is left EMPTY on purpose: which product codes are KPI
    -- items, and at what amount, is the user's call in Settings. The July
    -- export has 26 distinct ACC codes to choose from.

    -- ── Brands. Akemi's prefixes are safe (the July export's AK- codes carry
    -- AKEMI product descriptions); Zanotti's and Ergotex's are unknown and get
    -- filled in Settings. An order whose lines resolve to no brand BLOCKS that
    -- salesperson's margin incentive rather than paying it blind.
    INSERT INTO comm_brands (scheme_id, code, name, item_code_prefixes, note) VALUES
        (v_scheme, 'AKEMI',   'Akemi',   ARRAY['AK-', 'AKE'],
         'Margin ladder below is the user''s worked example.'),
        (v_scheme, 'ZANOTTI', 'Zanotti', ARRAY[]::TEXT[],
         'Incentive Tier 1 is 33%; the rest of the ladder and the Item Code prefixes are pending.'),
        (v_scheme, 'ERGOTEX', 'Ergotex', ARRAY[]::TEXT[],
         'Ladder and prefixes to be set later in Settings (user 2026-08-31).');

    -- Akemi's full ladder, exactly as briefed.
    INSERT INTO comm_margin_bands
        (scheme_id, brand_id, band_key, label, kind, margin_pct, commission_multiplier, monthly_incentive, sort_order)
    SELECT v_scheme, b.id, x.band_key, x.label, x.kind::comm_margin_band_kind,
           x.margin_pct, x.multiplier, x.incentive, x.sort_order
    FROM comm_brands b
    CROSS JOIN (VALUES
        ('incentive_tier_2', 'Incentive Tier 2',    'incentive', 0.43, 1.00, 1500.00, 10),
        ('incentive_tier_1', 'Incentive Tier 1',    'incentive', 0.36, 1.00, 1000.00, 20),
        ('standard',         'Standard margin',     'reference', 0.33, 1.00,    0.00, 30),
        ('low',              'Low margin',          'reference', 0.30, 1.00,    0.00, 40),
        ('below_tier_1',     'Below margin Tier 1', 'penalty',   0.27, 0.50,    0.00, 50),
        ('below_tier_2',     'Below margin Tier 2', 'penalty',   0.25, 0.25,    0.00, 60),
        ('below_tier_3',     'Below margin Tier 3', 'penalty',   0.24, 0.00,    0.00, 70)
    ) AS x(band_key, label, kind, margin_pct, multiplier, incentive, sort_order)
    WHERE b.scheme_id = v_scheme AND b.code = 'AKEMI';

    -- Zanotti: only the one threshold the user gave.
    INSERT INTO comm_margin_bands
        (scheme_id, brand_id, band_key, label, kind, margin_pct, monthly_incentive, sort_order)
    SELECT v_scheme, b.id, 'incentive_tier_1', 'Incentive Tier 1', 'incentive', 0.33, 1000.00, 20
    FROM comm_brands b WHERE b.scheme_id = v_scheme AND b.code = 'ZANOTTI';

    -- ── Promotion criteria. RECORDED ONLY (is_enforced = FALSE).
    INSERT INTO comm_promotion_rules
        (scheme_id, from_rank_key, to_rank_key, alternative_group, criterion,
         threshold_amount, threshold_qty, margin_band_key, consecutive_months, note)
    VALUES
        -- 5% -> 6%: two consecutive months at 100k. At 5% you cannot hold a
        -- team, so this can only be personal sales.
        (v_scheme, 'rs_5', 'rs_6', 1, 'personal_sales',    100000.00, NULL, NULL, 2,
         'Two consecutive months at 100k.'),

        -- 6% -> 7%: group sales 300k. This one IS live, via
        -- comm_ranks.group_sales_threshold on ta_7.
        (v_scheme, 'rs_6', 'ta_7', 1, 'group_sales',       300000.00, NULL, NULL, NULL,
         'Group sales 300k. Currently the only enforced gate.'),

        -- 7% -> 8%: any ONE of three alternatives.
        (v_scheme, 'ta_7', 'ta_8', 1, 'group_sales',       500000.00, NULL, NULL, NULL,
         'Alternative A: 500k group sales AND 10 KPI items per head.'),
        (v_scheme, 'ta_7', 'ta_8', 1, 'kpi_items_per_pax',      NULL,   10, NULL, NULL,
         'Alternative A: a team of 5 needs 50 KPI items in total.'),
        (v_scheme, 'ta_7', 'ta_8', 2, 'group_sales',       500000.00, NULL, NULL, NULL,
         'Alternative B: 500k group sales AND margin Tier 1.'),
        (v_scheme, 'ta_7', 'ta_8', 2, 'margin_band',            NULL, NULL, 'incentive_tier_1', NULL,
         'Alternative B: margin Tier 1.'),
        (v_scheme, 'ta_7', 'ta_8', 3, 'group_sales',       700000.00, NULL, NULL, NULL,
         'Alternative C: 700k group sales on its own, whatever the KPI and margin.'),

        -- 8% -> 9%: all three, compulsory.
        (v_scheme, 'ta_8', 'tl_9', 1, 'group_sales',       700000.00, NULL, NULL, NULL,
         'All three are compulsory.'),
        (v_scheme, 'ta_8', 'tl_9', 1, 'margin_band',            NULL, NULL, 'incentive_tier_1', NULL,
         'All three are compulsory.'),
        (v_scheme, 'ta_8', 'tl_9', 1, 'kpi_items_per_pax',      NULL,   10, NULL, NULL,
         'All three are compulsory.');

    -- 9% -> 10% has no rules yet (the user's "Tier 3" is still to come).
END;
$seed$;

-- ============================================================================
-- RLS
--
-- Mirrors hr_monthly_payroll (migration 122): principal ALL; hr full R/W;
-- finance DENY — these tables ARE individual salary detail, and CLAUDE.md's
-- standing rule is that Finance never sees per-employee pay; dept_manager
-- DENY (a read-only own-department carve-out is spec Q6, not assumed here).
-- ============================================================================

DO $rls$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'comm_sub_departments', 'comm_schemes', 'comm_ranks', 'comm_item_groups',
        'comm_kpi_items', 'comm_kpi_thresholds', 'comm_open_bill_rules',
        'comm_brands', 'comm_margin_bands', 'comm_promotion_rules',
        'comm_hierarchy', 'comm_agent_aliases',
        'sales_import_batches', 'sales_orders', 'sales_order_lines',
        'sales_order_open_bill_tags',
        'comm_runs', 'comm_statements', 'comm_statement_lines',
        'comm_statement_brand_margins', 'comm_order_releases'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
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
$rls$;

-- comm_products is the Principal's tab: HR needs to READ it (the importer
-- stamps costs from it) but must not change what a product costs.
ALTER TABLE comm_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY comm_products_principal_all ON comm_products FOR ALL
    USING (current_user_role() = 'principal')
    WITH CHECK (current_user_role() = 'principal');

CREATE POLICY comm_products_hr_select ON comm_products FOR SELECT
    USING (current_user_role() = 'hr');

-- finance / dept_manager: no policy -> DENY ALL. Deliberate — see the header.
