-- Finance could not read director NAMES (directors_ph_select = principal+hr
-- only), so every finance-rendered counterparty showed '—' (Fund IN list,
-- Loan Monitor, exports — user report 2026-07-24 "director 的没有显示到").
-- Names/codes only; director payout amounts live in other tables whose
-- policies are untouched.
DROP POLICY directors_ph_select ON directors;
CREATE POLICY directors_pfh_select ON directors FOR SELECT
  USING (current_user_role() = ANY (ARRAY['principal'::user_role, 'hr'::user_role, 'finance'::user_role]));
