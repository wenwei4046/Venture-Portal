-- 作废已开发票 (user 2026-09-15): a 'voided' invoice status. Separate
-- migration because a new enum value cannot be referenced in the same
-- transaction that adds it (the RPC lands in 20260915020000).
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'voided';
