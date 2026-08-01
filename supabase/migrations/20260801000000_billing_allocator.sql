-- ============================================================================
-- 20260801000000_billing_allocator.sql
-- Inter-company Billing Allocator — port of the user's Apps Script tool
-- (user request 2026-07-31; scope confirmed via Q&A):
--   · HOUZS Venture is the ONLY payer (bill-from), allocating shared expenses
--     out to the subsidiaries.
--   · Methods: headcount / percentage / equal / custom. NO area method.
--   · Headcount uses the allocator's OWN Finance-maintained staff list
--     (deliberately NOT hr_staff_allocation — user chose a separate list),
--     with per-month snapshots so old periods recalculate on old headcount.
--   · Output: one DRAFT invoice per bill-to subsidiary per period, raised
--     through the SAME createMultiLineInvoice path as manual multi-line
--     invoices (billing_mode venture_attribution → settles into venture_pool).
--     Invoices are tagged reference_no = 'ALC-YYYYMM' for dedupe + linking.
--
-- company_id convention: NULL means "HOUZS Venture's own share" — shown in
-- previews and stored on txn details (is_own_share) but never billed.
-- All tables are Finance-owned: finance + principal full access, nobody else.
-- ============================================================================

-- ── Staff list (Finance's own, independent of HR) ──
CREATE TABLE IF NOT EXISTS alloc_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alloc_staff_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES alloc_staff(id) ON DELETE CASCADE,
    -- NULL = HOUZS Venture (own share, never billed)
    company_id UUID REFERENCES companies(id),
    pct NUMERIC(6, 2) NOT NULL CHECK (pct > 0 AND pct <= 100)
);
CREATE INDEX IF NOT EXISTS alloc_staff_splits_staff_idx ON alloc_staff_splits (staff_id);

-- Per-month headcount snapshot (the Apps Script HeadcountHistory): saving the
-- staff list auto-snapshots the current month; old periods calc on their own
-- snapshot when one exists.
CREATE TABLE IF NOT EXISTS alloc_staff_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_month DATE NOT NULL,
    staff_id UUID NOT NULL,
    staff_name TEXT NOT NULL,
    status TEXT NOT NULL,
    company_id UUID REFERENCES companies(id),  -- NULL = own share
    pct NUMERIC(6, 2) NOT NULL DEFAULT 0,
    snapshotted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alloc_staff_history_period_idx ON alloc_staff_history (period_month);

-- ── Expense categories (label + optional COA code for invoice-line routing;
--     plain text code like invoice_lines.category_code, no FK) ──
CREATE TABLE IF NOT EXISTS alloc_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    coa_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Expense templates (recurring presets) + their default % splits ──
CREATE TABLE IF NOT EXISTS alloc_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    default_method TEXT NOT NULL DEFAULT 'headcount'
        CHECK (default_method IN ('headcount', 'percentage', 'equal', 'custom')),
    default_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    category_id UUID REFERENCES alloc_categories(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alloc_template_splits (
    template_id UUID NOT NULL REFERENCES alloc_templates(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id),
    pct NUMERIC(6, 2) NOT NULL CHECK (pct > 0 AND pct <= 100),
    PRIMARY KEY (template_id, company_id)
);

-- ── Saved allocations ──
CREATE TABLE IF NOT EXISTS alloc_txns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    txn_no TEXT NOT NULL UNIQUE,           -- ALC-YYYYMM-###
    period_month DATE NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    method TEXT NOT NULL CHECK (method IN ('headcount', 'percentage', 'equal', 'custom')),
    category_id UUID REFERENCES alloc_categories(id) ON DELETE SET NULL,
    -- Which headcount the calc used: a snapshot month, or NULL = live list.
    hc_period DATE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alloc_txns_period_idx ON alloc_txns (period_month);

CREATE TABLE IF NOT EXISTS alloc_txn_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    txn_id UUID NOT NULL REFERENCES alloc_txns(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id),  -- NULL = own share
    method_detail TEXT NOT NULL DEFAULT '',
    amount NUMERIC(15, 2) NOT NULL,
    is_own_share BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS alloc_txn_details_txn_idx ON alloc_txn_details (txn_id);

-- ── RLS: finance + principal everything; nobody else anything ──
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'alloc_staff', 'alloc_staff_splits', 'alloc_staff_history',
        'alloc_categories', 'alloc_templates', 'alloc_template_splits',
        'alloc_txns', 'alloc_txn_details'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_finance_all', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (current_user_role() IN (''finance'', ''principal'')) WITH CHECK (current_user_role() IN (''finance'', ''principal''))',
            t || '_finance_all', t
        );
    END LOOP;
END $$;
