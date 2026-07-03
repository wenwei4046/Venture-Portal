-- Per-line department routing for consolidated payroll invoices. NULL segment
-- means "legacy" — inherit the invoice-level billing_mode routing (all existing
-- lines stay NULL, so every current consumer keeps its exact behavior). A
-- non-NULL segment marks a line that must post/settle/report to THAT department's
-- pool regardless of the invoice header (used by payroll_consolidated invoices,
-- where HR lines carry 'hr', Finance 'finance', Director Office 'director_office').
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS segment gl_segment;

COMMENT ON COLUMN invoice_lines.segment IS
  'Per-line P&L segment for consolidated invoices. NULL = inherit invoice.billing_mode (legacy). Non-NULL = route this line to that segment''s pool at issue/settlement/P&L.';
