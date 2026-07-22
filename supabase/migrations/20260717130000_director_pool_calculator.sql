-- ============================================================================
-- 20260717130000_director_pool_calculator.sql
-- Director Pool v2 — full port of the standalone "Director Salary Pool System"
-- HTML calculator (Salary_Pool_Combined). Replaces the old /director-pool
-- ledger view with the user's authoritative calculation:
--
--   6 companies pay Salary / KPI / Allowance monthly → pool
--   → split by director weight (two independent streams: Sal+KPI, Allowance)
--   → 5% saving each → 95% balance → 75% paid / 25% billing invoice
--   → Total Pay vs fixed salary (RM14,400) → shortfall accumulates as Advance
--   → three running ledgers per director: Saving / 25% Billing / Advance
--   → Contra: accumulated billing offsets accumulated advance
--
-- Standalone by design (user decision 2026-07-17): inputs are keyed manually
-- here, NOT fed from director-salary CTC submissions. History imports from
-- the HTML tool's saved JSON.
--
-- Access: Principal only. (Finance's old aggregate view is retired with the
-- old page; per-director calculation detail must never reach Finance/HR.)
-- ============================================================================

-- ── 1. Global settings (single row) ─────────────────────────────────────────
CREATE TABLE dp_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    fixed_salary DECIMAL(15, 2) NOT NULL DEFAULT 14400,
    saving_pct DECIMAL(5, 2) NOT NULL DEFAULT 5,     -- percent, e.g. 5 = 5%
    gb_pct DECIMAL(5, 2) NOT NULL DEFAULT 75,        -- percent paid out; rest = billing invoice
    billing_start_month DATE,                        -- accumulated billing counts from here (NULL = all months)
    allow_stat_until DATE DEFAULT '2026-06-01',      -- 25% Allowance Statutory column shown for months BEFORE this (NULL = always)
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE dp_settings IS
    'Director Pool calculator global settings (fixed salary / saving % / 75-25 split). Single row, Principal only.';

INSERT INTO dp_settings (id) VALUES (1);

-- ── 2. Directors (independent of the directors table — own weights) ─────────
CREATE TABLE dp_directors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    weight DECIMAL(7, 2) NOT NULL DEFAULT 100,       -- percent; all directors should total n×100
    color TEXT NOT NULL DEFAULT '#4C72B0',           -- dot colour carried over from the HTML tool
    sort INT NOT NULL DEFAULT 0
);

COMMENT ON TABLE dp_directors IS
    'Director Pool calculator participants + weightage. Independent of directors/director_payouts (v2 standalone port).';

INSERT INTO dp_directors (code, name, weight, color, sort) VALUES
    ('WL', 'WL',  85.0, '#4C72B0', 1),
    ('MK', 'MK',  94.5, '#DD8452', 2),
    ('WS', 'WS', 105.0, '#55A868', 3),
    ('WW', 'WW', 115.5, '#C44E52', 4);

-- ── 3. Contributing companies ───────────────────────────────────────────────
CREATE TABLE dp_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    sort INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO dp_companies (name, sort) VALUES
    ('Houzs Century', 1),
    ('The Conts', 2),
    ('Dream Crafter', 3),
    ('Carres', 4),
    ('2990 Home', 5),
    ('Hookka', 6);

-- ── 4. Per-director fixed-salary overrides (from a given month onwards) ─────
CREATE TABLE dp_fixed_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    director_id UUID NOT NULL REFERENCES dp_directors(id) ON DELETE CASCADE,
    from_month DATE NOT NULL,
    salary DECIMAL(15, 2) NOT NULL,
    CONSTRAINT dp_fo_first_of_month CHECK (EXTRACT(DAY FROM from_month) = 1),
    CONSTRAINT uq_dp_fo UNIQUE (director_id, from_month)
);

-- ── 5. Months ───────────────────────────────────────────────────────────────
CREATE TABLE dp_months (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month DATE NOT NULL UNIQUE,
    full_payout BOOLEAN NOT NULL DEFAULT FALSE,      -- 100% balance paid, no 75/25, no billing
    include_billing BOOLEAN NOT NULL DEFAULT FALSE,  -- keyed 25% statutory counts into Total Pay
    billing_deduct_adv BOOLEAN NOT NULL DEFAULT FALSE, -- billing tab deducts this month's advance (display)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT dp_months_first_of_month CHECK (EXTRACT(DAY FROM month) = 1)
);

-- ── 6. Monthly company inputs (Salary / KPI / Allowance) ────────────────────
CREATE TABLE dp_inputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month_id UUID NOT NULL REFERENCES dp_months(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES dp_companies(id) ON DELETE CASCADE,
    salary DECIMAL(15, 2) NOT NULL DEFAULT 0,
    kpi DECIMAL(15, 2) NOT NULL DEFAULT 0,
    allowance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    CONSTRAINT uq_dp_inputs UNIQUE (month_id, company_id)
);

CREATE INDEX idx_dp_inputs_month ON dp_inputs (month_id);

-- ── 7. Per-month per-director manual inputs ─────────────────────────────────
-- Everything the HTML tool lets you "自己填": statutory amounts, saving
-- withdrawals and advance overrides. NULL = not keyed (engine auto value).
CREATE TABLE dp_director_inputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month_id UUID NOT NULL REFERENCES dp_months(id) ON DELETE CASCADE,
    director_id UUID NOT NULL REFERENCES dp_directors(id) ON DELETE CASCADE,
    billing_stat DECIMAL(15, 2),        -- 25% Statutory (Sal+KPI) 自己填
    allow_billing_stat DECIMAL(15, 2),  -- 25% Statutory (Allowance) 自己填 — only months before allow_stat_until
    allow_pay_stat DECIMAL(15, 2),      -- 75% Allowance Statutory 自己填 — adds to advance debt
    adv_stat DECIMAL(15, 2),            -- Advance Statutory 自己填 — adds to advance debt
    saving_withdrawal DECIMAL(15, 2),   -- withdrawal from the saving ledger
    adv_override_this DECIMAL(15, 2),   -- manual override: advance this month (negative = advance)
    adv_override_accum DECIMAL(15, 2),  -- manual override: accumulated advance after this month
    is_contra_override BOOLEAN NOT NULL DEFAULT FALSE, -- override row written by Contra (reset removes only these)
    CONSTRAINT uq_dp_director_inputs UNIQUE (month_id, director_id)
);

CREATE INDEX idx_dp_di_month ON dp_director_inputs (month_id);

-- ── 8. Contra events (accumulated billing offsets accumulated advance) ──────
CREATE TABLE dp_contra (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    director_id UUID NOT NULL REFERENCES dp_directors(id) ON DELETE CASCADE,
    amount DECIMAL(15, 2) NOT NULL,
    from_month_id UUID NOT NULL REFERENCES dp_months(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE dp_contra IS
    'Contra events: billing accumulated up to from_month offset against advance. Sum per director = billingContraOffsets in the HTML tool.';

-- ── RLS: Principal only, full CRUD on every dp_* table ──────────────────────
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'dp_settings', 'dp_directors', 'dp_companies', 'dp_fixed_overrides',
        'dp_months', 'dp_inputs', 'dp_director_inputs', 'dp_contra'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (current_user_role() = ''principal'') WITH CHECK (current_user_role() = ''principal'')',
            t || '_principal_all', t
        );
    END LOOP;
END $$;
