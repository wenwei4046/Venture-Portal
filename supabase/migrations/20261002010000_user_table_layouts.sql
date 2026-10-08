-- How each person has arranged each table (2026-10-02).
--
-- The Finance tables (invoices, payments, receipts, fund in, fund out, ledger,
-- statements, BA) gained draggable column widths and a draggable column order.
-- The user asked for the arrangement to follow the ACCOUNT, not the browser:
-- sign in on another computer and the columns are where they were left, and
-- one person's arrangement never moves anybody else's.
--
-- One row per person per table. `layout` is { order: text[], widths: { key: px } }
-- — the client drops keys it no longer knows and clamps the widths, so a stale
-- or hand-edited row cannot break a table.
--
-- Written straight from the browser under RLS, not through a Server Action: a
-- Server Action in flight during a navigation makes Next refresh the landing
-- page (see lib/page-view.ts), and this is saved after every drag.
CREATE TABLE IF NOT EXISTS user_table_layouts (
  user_id    uuid        NOT NULL DEFAULT auth.uid() REFERENCES users(id) ON DELETE CASCADE,
  table_id   text        NOT NULL CHECK (char_length(table_id) BETWEEN 1 AND 80),
  layout     jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, table_id)
);

ALTER TABLE user_table_layouts ENABLE ROW LEVEL SECURITY;

-- auth.uid() is the person SIGNED IN — a Principal viewing as HR still reads and
-- writes their own arrangement, which is what "follows the account" means.
DROP POLICY IF EXISTS user_table_layouts_own ON user_table_layouts;
CREATE POLICY user_table_layouts_own ON user_table_layouts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON user_table_layouts TO authenticated;

COMMENT ON TABLE user_table_layouts IS
  'Per-person column order and widths for the portal''s sortable tables. Own rows only (RLS on auth.uid()); written from the browser after each drag.';
