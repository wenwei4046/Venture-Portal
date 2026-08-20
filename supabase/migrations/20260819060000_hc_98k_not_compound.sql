-- Data fix (2026-08-20): the HC 98,000 fund-in ("Hookka - Mac", eff
-- 2026-05-20) was flagged compound_interest but the deal is FLAT 2%/mo
-- (user: "那个98k 不是compound interest 吧"). The matching 98k loan OUT to
-- Hookka was already flat (its 3,920 interest = 98,000 × 2% × 2 months,
-- simple), so only the fund-source flag was wrong.

UPDATE fund_sources
SET compound_interest = false, updated_at = now()
WHERE id = '89b09736-af77-40b2-a9df-90e2312e4394'
  AND compound_interest = true;
