-- ════════════════════════════════════════════════════════════════════════════
-- A bill can be SHARED between salespeople (2026-09-24)
-- ════════════════════════════════════════════════════════════════════════════
--
-- At a fair two people often close one customer together, and the hand-kept
-- claim form has always said so: "Share with Lucas RM7500", "share bill with
-- Chooi RM2720". The portal could only pay a bill to the one name the ERP put
-- on it, so on the August 2026 reconciliation everybody who shared a bill out
-- read HIGH (James, Sheldon, Esther, Wei Pin) and everybody who shared one in
-- read low.
--
-- THE RULE (user 2026-09-24):
--   * A bill is shared from its owner (sales_orders.staff_id) to one or more
--     team members. Default 50 / 50.
--   * Each person is paid on THEIR part at THEIR OWN rate — a RM 10,000 bill
--     shared 50/50 by an 8% owner with a 5% member pays 8% of 5,000 and 5% of
--     5,000.
--   * The part climbs the RECEIVER's own line: their uplines earn override on
--     the RM 5,000 exactly as if the receiver had written it.
--
-- The owner's part is never stored. It is 1 − Σ(shares), so it cannot drift
-- from the shares and the ERP can re-push the order (it does, on every save)
-- without touching who shares it.
--
-- The split happens BEFORE the engine (`lib/commission/shares.ts`): each part
-- is the order scaled down — lines, cost, total and paid alike — so the deposit
-- ratio and the margin are the same on every part, and the engine, which groups
-- by salesperson, needs no second idea of what a bill is.
--
-- Rollback: DROP TABLE sales_order_shares CASCADE;
--           DROP FUNCTION sales_order_shares_guard();
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sales_order_shares (
    order_id   UUID          NOT NULL REFERENCES sales_orders (id) ON DELETE CASCADE,
    staff_id   UUID          NOT NULL REFERENCES hr_staff_costs (id) ON DELETE RESTRICT,
    share_pct  NUMERIC(5, 4) NOT NULL DEFAULT 0.5,
    created_by UUID          DEFAULT auth.uid(),
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (order_id, staff_id),
    CONSTRAINT share_pct_between CHECK (share_pct > 0 AND share_pct < 1)
);

CREATE INDEX IF NOT EXISTS idx_sales_order_shares_staff ON sales_order_shares (staff_id);

COMMENT ON TABLE sales_order_shares IS
    'Who else a bill is shared with, and their part (0.5 = half). The owner (sales_orders.staff_id) keeps 1 − Σ share_pct. Each part is paid at its holder''s own rate and climbs its holder''s own upline line. Split before the engine by lib/commission/shares.ts.';

-- ─── The rules of a share, refused at the table ─────────────────────────────

CREATE OR REPLACE FUNCTION sales_order_shares_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_order sales_orders%ROWTYPE;
    v_sub   UUID;
    v_row   sales_order_shares%ROWTYPE;
    v_total NUMERIC;
BEGIN
    v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

    SELECT * INTO v_order FROM sales_orders WHERE id = v_row.order_id;
    SELECT b.sub_department_id INTO v_sub
      FROM sales_import_batches b WHERE b.id = v_order.batch_id;

    -- Which month a bill is in decides which run paid it, and who it is shared
    -- with decides who that run paid. Same refusal as moving or recosting it.
    IF commission_order_period_locked(v_sub, v_order.period_month) THEN
        RAISE EXCEPTION 'The run for % has paid. Reopen it before changing who shares this bill.',
            TO_CHAR(v_order.period_month, 'Mon YYYY')
            USING ERRCODE = '23RUN';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF v_order.staff_id IS NULL THEN
        RAISE EXCEPTION 'Match this bill to a salesperson before sharing it'
            USING ERRCODE = '23SHR';
    END IF;
    IF NEW.staff_id = v_order.staff_id THEN
        RAISE EXCEPTION 'A bill cannot be shared with the person it already belongs to'
            USING ERRCODE = '23SHR';
    END IF;

    SELECT COALESCE(SUM(share_pct), 0) INTO v_total
      FROM sales_order_shares
     WHERE order_id = NEW.order_id
       AND staff_id <> NEW.staff_id;
    IF v_total + NEW.share_pct >= 1 THEN
        RAISE EXCEPTION 'The shares on this bill would leave its owner nothing (% shared)',
            ROUND((v_total + NEW.share_pct) * 100, 1) || '%'
            USING ERRCODE = '23SHR';
    END IF;

    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS sales_order_shares_guard ON sales_order_shares;
CREATE TRIGGER sales_order_shares_guard
    BEFORE INSERT OR UPDATE OR DELETE ON sales_order_shares
    FOR EACH ROW
    EXECUTE FUNCTION sales_order_shares_guard();

-- ─── Who may see and change it: whoever may see the bill ────────────────────

ALTER TABLE sales_order_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_order_shares_hr_all ON sales_order_shares;
CREATE POLICY sales_order_shares_hr_all ON sales_order_shares
    FOR ALL
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

DROP POLICY IF EXISTS sales_order_shares_principal_all ON sales_order_shares;
CREATE POLICY sales_order_shares_principal_all ON sales_order_shares
    FOR ALL
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));

GRANT SELECT, INSERT, UPDATE, DELETE ON sales_order_shares TO authenticated;

NOTIFY pgrst, 'reload schema';
