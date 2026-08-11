-- BA v2 (user 2026-08-11): the interest is REAL even though the principal
-- never moves through HV's bank ("不会真实过银行，但是那些算的利息我是真的要去
-- bill 和真的要给回houzs的").
--   · 5028 Interest Income - BA — the 2.5%/mo line billed to the borrower via
--     a normal invoice (user: "account我要分成ba interest income").
--   · 6001 Interest Expense - BA — the 1.5%/mo line paid to HOUZS Century via
--     a normal PV (kept separate from 6000 fund-source interest so the BA
--     margin reads straight off the P&L).
--   · ba_limits — per-borrower-company BA limit; used = Σ active BA face,
--     settled releases; over-limit WARNS but does not block (user's choice).
--   · ba_attachments — the bank's BA advice (PDF/photo) filed per BA, stored
--     in the existing payment-attachments bucket under ba/<ba_id>/.

INSERT INTO chart_of_accounts (code, name, type, cash_flow_category, is_active, sort_order, parent_code) VALUES
  ('5028', 'Interest Income - BA',  'revenue', 'operating', true, 11, NULL),
  ('6001', 'Interest Expense - BA', 'cost',    'operating', true, 21, NULL)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS ba_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id),
  limit_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (limit_amount >= 0),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ba_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ba_limits_finance_all ON ba_limits;
CREATE POLICY ba_limits_finance_all ON ba_limits
  FOR ALL
  USING (current_user_role() IN ('finance', 'principal'))
  WITH CHECK (current_user_role() IN ('finance', 'principal'));

CREATE TABLE IF NOT EXISTS ba_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ba_id uuid NOT NULL REFERENCES ba_facilities(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  content_type text,
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ba_attachments_ba_idx ON ba_attachments(ba_id);

ALTER TABLE ba_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ba_attachments_finance_all ON ba_attachments;
CREATE POLICY ba_attachments_finance_all ON ba_attachments
  FOR ALL
  USING (current_user_role() IN ('finance', 'principal'))
  WITH CHECK (current_user_role() IN ('finance', 'principal'));
