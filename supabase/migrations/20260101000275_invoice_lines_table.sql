-- Mig 275: invoice_lines — per-invoice line items for multi-line invoices.
--
-- Use case: one bill to a single party with multiple typed items, each
-- with its own description + amount + category (GL credit account).
-- Existing single-line invoices keep working unchanged (no rows in this
-- table; total_amount + category_code + description live on the invoice).
--
-- Multi-line semantic:
--   * invoices.total_amount = SUM(invoice_lines.amount)
--   * invoices.description, invoices.category_code can stay NULL (or
--     hold a header summary) since per-line versions exist.
--   * Approve/Issue posts per-line JE: Dr 3030 AR total / Cr <line.cat>
--     <line.amount> per line — preserves per-category P&L attribution.

CREATE TABLE invoice_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_no       INTEGER NOT NULL,
  description   TEXT,
  amount        DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  category_code VARCHAR(20) REFERENCES chart_of_accounts(code),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(invoice_id, line_no)
);

CREATE INDEX invoice_lines_invoice_id_idx ON invoice_lines(invoice_id);

ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_lines_pf_select ON invoice_lines
  FOR SELECT
  USING (current_user_role() = ANY (ARRAY['principal'::user_role, 'finance'::user_role]));

CREATE POLICY invoice_lines_finance_insert ON invoice_lines
  FOR INSERT
  WITH CHECK (current_user_role() = 'finance'::user_role);

CREATE POLICY invoice_lines_finance_update_draft ON invoice_lines
  FOR UPDATE
  USING (
    current_user_role() = 'finance'::user_role
    AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_lines.invoice_id AND i.status = 'draft'
    )
  );

CREATE POLICY invoice_lines_finance_delete_draft ON invoice_lines
  FOR DELETE
  USING (
    current_user_role() = 'finance'::user_role
    AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_lines.invoice_id AND i.status = 'draft'
    )
  );

COMMENT ON TABLE invoice_lines IS
  'Mig 275: per-invoice line items. Optional — only populated for multi-line invoices. invoices.total_amount must equal SUM(amount) when rows exist (enforced by app, not DB trigger). Approve/Issue posts per-line Cr JEs by category_code.';
