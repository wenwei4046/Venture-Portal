-- A table's default arrangement for everyone (2026-10-07).
--
-- user: "我要能定这个 as default". user_table_layouts (20261002010000) keeps
-- each PERSON's column order, widths and hidden columns. This is the one row
-- per table that stands for everybody who has not arranged it themselves, and
-- what Reset goes back to. Read by every signed-in account; set by Principal,
-- Finance and HR (each for the tables they run) from the Columns panel.
CREATE TABLE IF NOT EXISTS table_layout_defaults (
  table_id text        PRIMARY KEY CHECK (char_length(table_id) BETWEEN 1 AND 80),
  layout   jsonb       NOT NULL,
  set_by   uuid        DEFAULT auth.uid() REFERENCES users(id) ON DELETE SET NULL,
  set_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE table_layout_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS table_layout_defaults_read ON table_layout_defaults;
CREATE POLICY table_layout_defaults_read ON table_layout_defaults
  FOR SELECT TO authenticated
  USING (true);

-- A NULL role (no users row) is not IN the list, so it is refused.
DROP POLICY IF EXISTS table_layout_defaults_set ON table_layout_defaults;
CREATE POLICY table_layout_defaults_set ON table_layout_defaults
  FOR ALL TO authenticated
  USING (current_user_role() IN ('principal', 'finance', 'hr'))
  WITH CHECK (current_user_role() IN ('principal', 'finance', 'hr'));

GRANT SELECT, INSERT, UPDATE, DELETE ON table_layout_defaults TO authenticated;

COMMENT ON TABLE table_layout_defaults IS
  'The default column order, widths and hidden columns of a sortable table, for everyone without an arrangement of their own (user_table_layouts). One row per table; set from the Columns panel by principal / finance / hr.';
