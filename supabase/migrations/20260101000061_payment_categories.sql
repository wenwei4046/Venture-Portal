-- ============================================================================
-- 20260101000061_payment_categories.sql
-- Payment categories (user-defined transaction tags for P&L classification)
-- + target_pool on payment_vouchers for Credit direction
-- ============================================================================

-- TABLE: payment_categories (global, shared by debit + credit)
CREATE TABLE payment_categories (
    code        VARCHAR(30) PRIMARY KEY,
    label       TEXT NOT NULL,
    description TEXT,
    gl_account_code VARCHAR(20) REFERENCES chart_of_accounts(code),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INTEGER NOT NULL DEFAULT 100,
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE payment_categories IS
    'User-defined transaction categories for Payment vouchers. Maps to P&L lines via gl_account_code. Shared across debit and credit.';

-- Seed common categories
INSERT INTO payment_categories (code, label, description, gl_account_code, sort_order) VALUES
    ('logistics',    'Logistics',        'Shipping, courier, freight',            '5050', 10),
    ('food',         'Food & Beverage',  'Meals, team lunch, catering',           '5050', 20),
    ('rental',       'Rental',           'Office rent, equipment rental',         '5050', 30),
    ('advertising',  'Advertising',      'Digital ads, print ads, sponsorship',   '5040', 40),
    ('utilities',    'Utilities',        'Electricity, water, internet',          '5050', 50),
    ('stationery',   'Stationery',       'Office supplies, printing',             '5050', 60),
    ('travel',       'Travel',           'Transport, accommodation, mileage',     '5050', 70),
    ('professional', 'Professional Fee', 'Accounting, legal, consulting',         '5050', 80),
    ('salary_ctc',   'Salary / CTC',     'Director CTC from subsidiaries',        '2030', 90),
    ('loan_interest','Loan Interest',    'Interest on fund sources',              '5010', 95),
    ('loan_principal','Loan Principal',  'Principal repayment on fund sources',   '2010', 96),
    ('marketing',    'Marketing',        'Marketing campaigns, events',           '5040', 100),
    ('maintenance',  'Maintenance',      'Repairs, servicing, upkeep',            '5050', 110),
    ('insurance',    'Insurance',        'Business insurance premiums',           '5050', 120),
    ('other',        'Other',            'Miscellaneous',                         '5050', 999);

-- RLS
ALTER TABLE payment_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY pc_select ON payment_categories
    FOR SELECT USING (TRUE);  -- all authenticated can read
CREATE POLICY pc_insert ON payment_categories
    FOR INSERT WITH CHECK (current_user_role() IN ('principal', 'finance'));
CREATE POLICY pc_update ON payment_categories
    FOR UPDATE USING (current_user_role() IN ('principal', 'finance'));
CREATE POLICY pc_no_delete ON payment_categories
    FOR DELETE USING (FALSE);

CREATE INDEX idx_pc_active ON payment_categories(sort_order) WHERE is_active = TRUE;

-- Add category + target_pool to payment_vouchers
ALTER TABLE payment_vouchers
    ADD COLUMN category_code VARCHAR(30) REFERENCES payment_categories(code),
    ADD COLUMN target_pool TEXT;  -- for credit: 'hv_operating_fund', 'salary_pool', 'dept_pool_marketing', etc.

COMMENT ON COLUMN payment_vouchers.category_code IS
    'Transaction category for P&L classification (logistics, food, rental, etc.)';
COMMENT ON COLUMN payment_vouchers.target_pool IS
    'For credit direction: which pool the incoming funds go to (hv_operating_fund, salary_pool, dept_pool_{name})';
