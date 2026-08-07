-- Bank BA tracking (user 2026-08-07). Flow confirmed over three Q&A rounds:
--   · The BA itself is HOUZS Century's deal with the bank — HV never owes the
--     bank. The bank's day-count interest (face × annual × days/365) is shown
--     for REFERENCE only (HC's cost).
--   · HV owes HC:      face × 1.5%/mo × days/30   (rate editable per BA)
--   · HV charges sub:  face × 2.5%/mo × days/30   (rate editable per BA)
--   · HV margin = the spread. Both prorate by days.
--   · REAL money keeps flowing through fund_sources (owe HC) and loans (lend
--     to the sub) — this table is the registry/calculator layer and can LINK
--     to those records, so nothing double-books.

CREATE TABLE IF NOT EXISTS ba_facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ba_no text,                                   -- bank / HC reference
  bank_name text,
  face_amount numeric(14,2) NOT NULL CHECK (face_amount > 0),
  bank_annual_rate numeric(8,5) NOT NULL DEFAULT 0,   -- 0.045 = 4.5%/yr, reference
  start_date date NOT NULL,
  tenor_days integer NOT NULL CHECK (tenor_days > 0),
  maturity_date date GENERATED ALWAYS AS (start_date + tenor_days) STORED,
  charge_rate_monthly numeric(8,5) NOT NULL DEFAULT 0.025,  -- HV charges the sub
  hc_rate_monthly numeric(8,5) NOT NULL DEFAULT 0.015,      -- HV owes HC
  borrower_company_id uuid REFERENCES companies(id),
  borrower_name text,
  fund_source_id uuid REFERENCES fund_sources(id),   -- the owe-HC record
  loan_id uuid REFERENCES loans(id),                 -- the lend-to-sub record
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','settled','cancelled')),
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ba_facilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ba_facilities_finance_all ON ba_facilities;
CREATE POLICY ba_facilities_finance_all ON ba_facilities
  FOR ALL
  USING (current_user_role() IN ('finance', 'principal'))
  WITH CHECK (current_user_role() IN ('finance', 'principal'));
