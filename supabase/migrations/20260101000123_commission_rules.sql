-- ============================================================================
-- 20260101000123_commission_rules.sql
-- Spec 1 (HR Payroll Redesign) — commission rule engine
-- HOUZS Venture Portal
--
-- Two rule shapes:
--  1. tiered_per_unit  — e.g. Telemarketer: 1–10 units × RM50, 11–30 × RM80,
--                        31+ × RM100. tier_config is a JSONB array of
--                        {from, to, rate}. `to = null` means "no upper limit".
--  2. pct_of_base      — e.g. MK lead: 2% of Marketing dept NP. `pct` is a
--                        decimal (0.02 = 2%). `base_source` picks the base.
--
-- A staff may have multiple active rules; compute_commission sums them.
-- Inputs per month (sales count / amount) go in commission_inputs so HR can
-- adjust without touching the rule definition.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------

CREATE TYPE commission_rule_type AS ENUM (
    'tiered_per_unit',
    'pct_of_base'
);

CREATE TYPE commission_base_source AS ENUM (
    'staff_sales_count',      -- count from commission_inputs.sales_count
    'staff_sales_amount',     -- amount from commission_inputs.sales_amount
    'dept_np',                -- Net Profit of a specific department pool (deferred — stub)
    'company_sales',          -- Aggregate HV sales (deferred — stub)
    'team_commission_sum'     -- Sum of commission paid to teammates (deferred — stub)
);

COMMENT ON TYPE commission_base_source IS
    'Where a pct_of_base rule draws its base value. staff_* sources read from commission_inputs. dept_np / company_sales / team_commission_sum are stubbed in compute_commission v1 — they return 0 until Spec 2+ wires them.';

-- ----------------------------------------------------------------------------
-- TABLE: commission_rules
-- ----------------------------------------------------------------------------

CREATE TABLE commission_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES hr_staff_costs(id) ON DELETE CASCADE,
    rule_type commission_rule_type NOT NULL,
    rule_name TEXT NOT NULL,

    -- tiered_per_unit: JSONB array of {from: int, to: int|null, rate: number}
    tier_config JSONB,

    -- pct_of_base: percentage (0.02 = 2%) + base source (+ optional base_dept_id for dept_np)
    pct DECIMAL(9, 6),
    base_source commission_base_source,
    base_dept_id UUID REFERENCES departments(id),

    effective_from DATE NOT NULL,
    effective_to DATE,

    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT effective_window CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT tiered_has_config CHECK (
        rule_type <> 'tiered_per_unit' OR tier_config IS NOT NULL
    ),
    CONSTRAINT pct_has_base CHECK (
        rule_type <> 'pct_of_base' OR (pct IS NOT NULL AND base_source IS NOT NULL)
    ),
    CONSTRAINT dept_np_needs_dept CHECK (
        base_source IS DISTINCT FROM 'dept_np' OR base_dept_id IS NOT NULL
    )
);

COMMENT ON TABLE commission_rules IS
    'Spec 1: commission rule engine. Principal + HR own the rules. compute_commission(staff_id, period) reads + sums rules that apply on that period.';

CREATE INDEX idx_commission_rules_staff_effective
    ON commission_rules (staff_id, effective_from DESC);

-- ----------------------------------------------------------------------------
-- TABLE: commission_inputs
-- One row per (staff × month) — sales count + amount HR enters monthly.
-- ----------------------------------------------------------------------------

CREATE TABLE commission_inputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES hr_staff_costs(id) ON DELETE CASCADE,
    period_month DATE NOT NULL,
    sales_count INTEGER NOT NULL DEFAULT 0,
    sales_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1),
    CONSTRAINT inputs_non_negative CHECK (sales_count >= 0 AND sales_amount >= 0),
    CONSTRAINT uq_commission_inputs UNIQUE (staff_id, period_month)
);

COMMENT ON TABLE commission_inputs IS
    'Spec 1: monthly sales count + amount per staff. Read by compute_commission for tiered_per_unit and staff_sales_* pct rules.';

-- ----------------------------------------------------------------------------
-- RPC: compute_commission(p_staff_id, p_period) RETURNS DECIMAL
--
-- Sums commission from all active rules for the staff in the given period.
-- Convention for tiered_per_unit tier_config:
--   [{from:1, to:10, rate:50}, {from:11, to:30, rate:80}, {from:31, to:null, rate:100}]
--   `from` / `to` are 1-indexed inclusive unit numbers. NULL `to` = no upper.
--
-- For base sources not yet wired (dept_np, company_sales, team_commission_sum),
-- the contribution is 0. Those arrive in Spec 2+ once the underlying aggregates
-- exist. HR can enter commission_amount directly on hr_monthly_payroll in the
-- meantime.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION compute_commission(
    p_staff_id UUID,
    p_period DATE
)
RETURNS DECIMAL
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rule         commission_rules%ROWTYPE;
    v_total        DECIMAL := 0;
    v_sales_count  INTEGER := 0;
    v_sales_amount DECIMAL := 0;
    v_tier         JSONB;
    v_from         INTEGER;
    v_to           INTEGER;
    v_rate         DECIMAL;
    v_qty          INTEGER;
BEGIN
    -- Pull the monthly inputs once
    SELECT COALESCE(sales_count, 0), COALESCE(sales_amount, 0)
    INTO v_sales_count, v_sales_amount
    FROM commission_inputs
    WHERE staff_id = p_staff_id AND period_month = p_period;

    FOR v_rule IN
        SELECT * FROM commission_rules
        WHERE staff_id = p_staff_id
          AND effective_from <= p_period
          AND (effective_to IS NULL OR effective_to >= p_period)
    LOOP
        IF v_rule.rule_type = 'tiered_per_unit' THEN
            FOR v_tier IN SELECT jsonb_array_elements(v_rule.tier_config)
            LOOP
                v_from := (v_tier->>'from')::INTEGER;
                v_to   := (v_tier->>'to')::INTEGER;  -- NULL = no upper bound
                v_rate := (v_tier->>'rate')::DECIMAL;

                -- Upper bound of this tier inside the actual sales_count
                IF v_to IS NULL THEN
                    v_qty := GREATEST(0, v_sales_count - v_from + 1);
                ELSE
                    v_qty := GREATEST(0, LEAST(v_sales_count, v_to) - v_from + 1);
                END IF;

                v_total := v_total + (v_qty * v_rate);
            END LOOP;

        ELSIF v_rule.rule_type = 'pct_of_base' THEN
            CASE v_rule.base_source
                WHEN 'staff_sales_count' THEN
                    v_total := v_total + (v_sales_count * v_rule.pct);
                WHEN 'staff_sales_amount' THEN
                    v_total := v_total + (v_sales_amount * v_rule.pct);
                ELSE
                    -- dept_np / company_sales / team_commission_sum: stub (deferred to Spec 2+)
                    v_total := v_total + 0;
            END CASE;
        END IF;
    END LOOP;

    RETURN ROUND(v_total, 2);
END;
$$;

COMMENT ON FUNCTION compute_commission IS
    'Spec 1: sums active commission rules for a staff in a period. tiered_per_unit and staff_sales_{count,amount} fully wired. dept_np / company_sales / team_commission_sum stubbed (return 0) until Spec 2+ wires the aggregates.';

GRANT EXECUTE ON FUNCTION compute_commission TO authenticated;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_inputs ENABLE ROW LEVEL SECURITY;

-- commission_rules: principal ALL, hr SELECT/INSERT/UPDATE (no DELETE — audit)
CREATE POLICY commission_rules_principal_all
    ON commission_rules FOR ALL
    USING (current_user_role() = 'principal')
    WITH CHECK (current_user_role() = 'principal');

CREATE POLICY commission_rules_hr_select
    ON commission_rules FOR SELECT
    USING (current_user_role() = 'hr');

CREATE POLICY commission_rules_hr_insert
    ON commission_rules FOR INSERT
    WITH CHECK (current_user_role() = 'hr');

CREATE POLICY commission_rules_hr_update
    ON commission_rules FOR UPDATE
    USING (current_user_role() = 'hr')
    WITH CHECK (current_user_role() = 'hr');

-- No DELETE for HR — use effective_to to retire a rule

-- commission_inputs: principal SELECT, hr ALL
CREATE POLICY commission_inputs_principal_select
    ON commission_inputs FOR SELECT
    USING (current_user_role() = 'principal');

CREATE POLICY commission_inputs_hr_all
    ON commission_inputs FOR ALL
    USING (current_user_role() = 'hr')
    WITH CHECK (current_user_role() = 'hr');
