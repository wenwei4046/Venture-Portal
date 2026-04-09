-- ============================================================================
-- 20260101000015_seed_genesis.sql
-- Genesis seed data: companies, departments, directors, config, base rate
-- HOUZS Venture Portal (VP)
--
-- IMPORTANT: This migration is IDEMPOTENT. It can be re-run safely via ON CONFLICT.
-- Statutory tables (EPF/SOCSO/EIS/PCB) are NOT seeded here — load from CSV in
-- supabase/seed/statutory/ via separate seed script before Phase 3 launch.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Departments
-- ----------------------------------------------------------------------------

INSERT INTO departments (name) VALUES
    ('Marketing'),
    ('Finance'),
    ('HR')
ON CONFLICT (name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Companies (8 HOUZS subsidiaries per CLAUDE.md)
-- ----------------------------------------------------------------------------

INSERT INTO companies (name, short_code, tier) VALUES
    ('HOUZS Century',       'HC',    'T2'),
    ('The Contemporary',    'CONTS', 'T1'),
    ('Dream Crafter',       'DC',    'T2'),
    ('Carres',              'CAR',   'T3'),
    ('Hookka',              'HK',    'T1'),
    ('2990',                '2990',  'T2'),
    ('Ohana',               'OHN',   'T3'),
    ('CMI',                 'CMI',   'T2')
ON CONFLICT (short_code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Directors (4 per spec: WL, MK, WS, WW)
-- Weightage: 85 / 94.5 / 105 / 115.5 (%)
-- Note: director.id = auth user linkage is Phase 3 concern; for now use uuid
-- ----------------------------------------------------------------------------

INSERT INTO directors (name, code, pcb_category, children_count, weightage, min_payout) VALUES
    ('Director WL', 'WL', 'KA1', 0, 0.850000, 14400.00),
    ('Director MK', 'MK', 'KA1', 0, 0.945000, 14400.00),
    ('Director WS', 'WS', 'KA1', 0, 1.050000, 14400.00),
    ('Director WW', 'WW', 'KA1', 0, 1.155000, 14400.00)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Tier config (default rates)
-- ----------------------------------------------------------------------------

INSERT INTO tier_config (tier, premium_rate) VALUES
    ('T1', 0.000000),
    ('T2', 0.005000),
    ('T3', 0.010000),
    ('T4', 0.015000)
ON CONFLICT (tier) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Overdue config (default stages)
-- ----------------------------------------------------------------------------

INSERT INTO overdue_config (stage, days_from, days_to, penalty_rate) VALUES
    ('grace',      0,  7,    0.000000),
    ('late_1',     8,  30,   0.005000),
    ('late_2',     31, 60,   0.010000),
    ('escalation', 61, NULL, 0.015000)
ON CONFLICT (stage) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Treasury config (default values)
-- ----------------------------------------------------------------------------

INSERT INTO treasury_config (config_key, config_value, description) VALUES
    ('op_margin',     0.003000, 'Operating margin added to weighted cost = base rate'),
    ('buffer_amount', 50000.00, 'Minimum free cash buffer (RM) — alert when breached'),
    ('saving_rate',   0.050000, 'Director salary 5% saving rate (Phase 3)')
ON CONFLICT (config_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Genesis base rate history row
-- Creates an initial Q2 2026 rate so the first loan creation does not crash.
-- Principal will approve subsequent quarters normally.
-- Uses op_margin only (no paid capital yet) as placeholder.
-- ----------------------------------------------------------------------------

-- Only insert if no base_rate_history exists yet
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM base_rate_history) THEN
        INSERT INTO base_rate_history (
            quarter,
            effective_from,
            effective_to,
            total_paid,
            total_pool,
            weighted_cost,
            op_margin,
            base_rate,
            approved_at
        ) VALUES (
            '2026Q2',
            '2026-04-01',
            NULL,  -- currently active
            0,
            0,
            0.000000,       -- no capital yet = no cost
            0.003000,       -- matches treasury_config op_margin
            0.003000,       -- = op_margin (will be recalculated when first fund source is added)
            NOW()           -- auto-approved genesis row
        );
    END IF;
END $$;

COMMENT ON TABLE base_rate_history IS
    'Genesis row inserted for 2026Q2. Principal must approve Q3 and onwards normally.';

-- ----------------------------------------------------------------------------
-- Statutory tables: NOT SEEDED HERE
-- Load from supabase/seed/statutory/*.csv via separate script before Phase 3.
-- Source PDFs in supabase/seed/sources/ for audit trail.
-- ----------------------------------------------------------------------------

-- Placeholder comment only
DO $$
BEGIN
    RAISE NOTICE 'Statutory tables (EPF/SOCSO/EIS/PCB) are NOT seeded in this migration.';
    RAISE NOTICE 'Load from supabase/seed/statutory/*.csv before Phase 3 launch.';
END $$;

-- ----------------------------------------------------------------------------
-- Development convenience: test department assignment
-- Marketing department has a dept manager concept for Phase 2.
-- ----------------------------------------------------------------------------

-- No test users are created in production seed.
-- Test users are seeded in CI only via a separate test-seed script.
