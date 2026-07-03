-- Consolidated payroll invoice: one invoice per subsidiary combining HR + Finance
-- + Director Office. This billing_mode is a MARKER meaning "route per-line by
-- invoice_lines.segment, NOT by the invoice-level billing_mode". Every switch on
-- billing_mode must treat it as per-line (never map it to a single pool/segment).
-- Added in its own migration so the value is committed before any code inserts it
-- (Postgres forbids using a freshly-added enum value in the same transaction).
ALTER TYPE billing_mode ADD VALUE IF NOT EXISTS 'payroll_consolidated';
