-- Bank reconciliation sessions (user 2026-08-08: "upload pdf 或excel 后自动
-- 对账 · 存起来每月一份 · 金额，名字等等，日期其次 · 对不上就问我").
-- One session per bank per month; statement lines live under it, each line
-- optionally matched to a journal_line on that bank's GL code (auto or
-- manual) or marked ignored.

CREATE TABLE IF NOT EXISTS bank_recon_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id),
  period_month date NOT NULL,
  source_filename text,
  statement_opening numeric(14,2),
  statement_closing numeric(14,2),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_account_id, period_month)
);

CREATE TABLE IF NOT EXISTS bank_recon_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES bank_recon_sessions(id) ON DELETE CASCADE,
  txn_date date NOT NULL,
  description text,
  -- Signed from OUR account's view: positive = money in, negative = money out.
  amount numeric(14,2) NOT NULL,
  matched_journal_line_id uuid REFERENCES journal_lines(id),
  match_kind text CHECK (match_kind IN ('auto','manual','ignored')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_recon_lines_session_idx ON bank_recon_lines(session_id);

ALTER TABLE bank_recon_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_recon_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_recon_sessions_finance ON bank_recon_sessions;
CREATE POLICY bank_recon_sessions_finance ON bank_recon_sessions
  FOR ALL USING (current_user_role() IN ('finance','principal'))
  WITH CHECK (current_user_role() IN ('finance','principal'));

DROP POLICY IF EXISTS bank_recon_lines_finance ON bank_recon_lines;
CREATE POLICY bank_recon_lines_finance ON bank_recon_lines
  FOR ALL USING (current_user_role() IN ('finance','principal'))
  WITH CHECK (current_user_role() IN ('finance','principal'));
