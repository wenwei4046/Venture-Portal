-- 20260101000246_coa_parent_code.sql
--
-- Chart of Accounts gets a one-level hierarchy. Each row may declare a
-- `parent_code` pointing at another COA row of the SAME type (e.g. liability
-- "4000 Amount due to related party" with children "4001 — Lim Wei Siang",
-- "4002 — Carres"). Parents become "header" accounts automatically: an
-- account is a header iff at least one other row references it via
-- parent_code. Headers must not appear in posting forms (PV sources,
-- invoice category, fund-source account, loan disbursement account) and
-- the trigger below makes the DB the last line of defence — any write that
-- tries to point a transactional row at a header fails loudly instead of
-- silently corrupting the ledger.
--
-- What this migration does:
--   (1) Add chart_of_accounts.parent_code with FK to chart_of_accounts.code.
--   (2) Enforce: parent and child must share `type`.
--   (3) Enforce: parent_code <> code (no self-parent).
--   (4) Helper: coa_is_header(p_code) — true iff any row has parent_code = p_code.
--   (5) Trigger function coa_reject_header_post(): if NEW.<col> references a
--       header, RAISE EXCEPTION. Attached to:
--         - payment_voucher_sources.account_code
--         - invoices.category_code (revenue mapping)
--         - fund_sources.account_code (added in mig 247 — trigger here is
--           future-proof and short-circuits on NULL column)
--   (6) Cascade-prevent: if a row already has children, ALTERing its type
--       must also flip the children. We block UPDATE of type when children
--       disagree via the same trigger as (2).

BEGIN;

-- ── (1) Add parent_code column ─────────────────────────────────────────────
ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS parent_code TEXT;

ALTER TABLE chart_of_accounts
  ADD CONSTRAINT coa_parent_code_fk
  FOREIGN KEY (parent_code) REFERENCES chart_of_accounts(code);

ALTER TABLE chart_of_accounts
  ADD CONSTRAINT coa_parent_not_self
  CHECK (parent_code IS NULL OR parent_code <> code);

CREATE INDEX IF NOT EXISTS idx_coa_parent_code ON chart_of_accounts(parent_code);


-- ── (2) Parent + child must share type ─────────────────────────────────────
CREATE OR REPLACE FUNCTION coa_enforce_parent_type()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_parent_type account_type;
  v_child_type_mismatch INT;
BEGIN
  -- Self check: if NEW row has parent_code, its type must match parent's.
  IF NEW.parent_code IS NOT NULL THEN
    SELECT type INTO v_parent_type
      FROM chart_of_accounts
     WHERE code = NEW.parent_code;
    IF v_parent_type IS NULL THEN
      RAISE EXCEPTION 'coa_enforce_parent_type: parent account % does not exist', NEW.parent_code;
    END IF;
    IF v_parent_type <> NEW.type THEN
      RAISE EXCEPTION 'coa_enforce_parent_type: child % is type %, parent % is type % — must match',
        NEW.code, NEW.type, NEW.parent_code, v_parent_type;
    END IF;
  END IF;

  -- UPDATE-of-type guard: if this row's type changes and it has children
  -- with the OLD type, the children would now disagree. Block.
  IF TG_OP = 'UPDATE' AND OLD.type <> NEW.type THEN
    SELECT COUNT(*) INTO v_child_type_mismatch
      FROM chart_of_accounts
     WHERE parent_code = NEW.code
       AND type <> NEW.type;
    IF v_child_type_mismatch > 0 THEN
      RAISE EXCEPTION
        'coa_enforce_parent_type: cannot change type of % from % to % — % child accounts still use the old type. Re-classify or detach children first.',
        NEW.code, OLD.type, NEW.type, v_child_type_mismatch;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS coa_enforce_parent_type_trigger ON chart_of_accounts;
CREATE TRIGGER coa_enforce_parent_type_trigger
  BEFORE INSERT OR UPDATE ON chart_of_accounts
  FOR EACH ROW
  EXECUTE FUNCTION coa_enforce_parent_type();


-- ── (3) Helper: is this account a header? ──────────────────────────────────
CREATE OR REPLACE FUNCTION coa_is_header(p_code TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM chart_of_accounts WHERE parent_code = p_code);
$$;
GRANT EXECUTE ON FUNCTION coa_is_header(TEXT) TO authenticated;


-- ── (4) Generic header-rejection trigger function ──────────────────────────
-- Each table picks which column carries the COA code via TG_ARGV[0].
CREATE OR REPLACE FUNCTION coa_reject_header_post()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_col TEXT := TG_ARGV[0];
  v_code TEXT;
BEGIN
  EXECUTE format('SELECT ($1).%I::TEXT', v_col) INTO v_code USING NEW;
  IF v_code IS NOT NULL AND coa_is_header(v_code) THEN
    RAISE EXCEPTION
      'Cannot post to header account % — pick a leaf sub-account (no children) instead.',
      v_code;
  END IF;
  RETURN NEW;
END $$;


-- ── (5) Attach trigger to posting tables ───────────────────────────────────
DROP TRIGGER IF EXISTS pvs_reject_header_account ON payment_voucher_sources;
CREATE TRIGGER pvs_reject_header_account
  BEFORE INSERT OR UPDATE OF account_code ON payment_voucher_sources
  FOR EACH ROW
  EXECUTE FUNCTION coa_reject_header_post('account_code');

DROP TRIGGER IF EXISTS invoices_reject_header_category ON invoices;
CREATE TRIGGER invoices_reject_header_category
  BEFORE INSERT OR UPDATE OF category_code ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION coa_reject_header_post('category_code');

-- fund_sources.account_code is added in mig 247; trigger attached there.

COMMIT;
