-- ════════════════════════════════════════════════════════════════════════════
-- 20261013050000_erp_changes_cancel_and_share.sql
-- A cancellation is deducted directly; a shared bill's change follows its
-- shares (2026-10-13)
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY. The user, on the ERP audit trail (20261013010000): a cancellation —
-- "取消的单 … just direct deduct" — and of a shared bill dropped after its
-- commission was given, which still took the whole drop from its owner: "want
-- drop sales by share as well. Follow the share ratio."
--
-- 1. A CANCELLATION IS DEDUCTED DIRECTLY. When the ERP cancels or deletes a
--    bill whose commission was given, erp_sync_note_adjustment no longer asks:
--    what is still given on it is taken back by itself — a confirmed drop
--    (erp_reason cancelled / deleted, answered_by_feed) in the first month
--    after the one that gave the commission, from the month the portal pays
--    from, whose run has not paid and where neither the owner nor anybody
--    holding a share of the bill is closed. No such month within two years:
--    it waits as a question, as before. A question already waiting on the
--    bill goes: the deduction covers it.
-- 2. BACK IN THE ERP. A bill the ERP counts again after the feed deducted its
--    cancellation by itself: while the month that deduction went into is
--    still open for everybody on the bill, the deduction is simply withdrawn;
--    once it has been closed, giving it back is a question (Reinstated), as
--    any upsell. A deduction somebody answered by hand is never withdrawn.
-- 3. A SHARED BILL. A drop, an upsell or a cancellation is split among the
--    holders of the bill whose pay gave the commission, in its share ratio,
--    each part paid at its holder's rate and climbing their upline — the run
--    does that (lib/commission/run-payload.ts). That bill is recorded on the
--    row (settled_order_id): the document's own row, or for a month the claim
--    form settled, the claim-form row of the same paper — the claim form names
--    who shared it (ZNT5991: LUCAS CHOOI 50% · WEI PIN 50%, where the ERP says
--    ANTHONY alone). Here: nothing may be paid into a month where anybody
--    holding a part of that bill is closed (comm_upsales_holders_guard, 23CLS,
--    as the owner's comm_upsales_closed_month_guard).
--
-- erp_sync_note_adjustment is 20261013010000's (md5 a6f1c10e93da53daf220546f2294a7d4)
-- with the withdrawal before the figure and the deduction after it; refused if
-- production's body changed since.
--
-- Rollback, in words (the database tool refuses the keyword): re-apply
-- 20261013010000's erp_sync_note_adjustment and 20261013020000's
-- erp_sync_note_change; take away the trigger comm_upsales_holders_guard, the
-- functions this file creates, and comm_upsales.answered_by_feed /
-- settled_order_id (a confirmed deduction it made stays a confirmed drop, paid
-- to the bill's owner alone).
-- ════════════════════════════════════════════════════════════════════════════

DO $guard$
DECLARE
    v_note TEXT := (SELECT prosrc FROM pg_proc WHERE oid = 'public.erp_sync_note_adjustment(uuid, jsonb, uuid)'::REGPROCEDURE);
BEGIN
    IF strpos(v_note, 'erp_sync_first_open_month(') = 0
       AND md5(v_note) <> 'a6f1c10e93da53daf220546f2294a7d4' THEN
        RAISE EXCEPTION 'erp_sync_note_adjustment is not the body 20261013010000 left (md5 %) — production changed since this migration was written',
            md5(v_note);
    END IF;
END
$guard$;

-- ─── 1. Answered by the feed ────────────────────────────────────────────────

ALTER TABLE public.comm_upsales
    ADD COLUMN IF NOT EXISTS answered_by_feed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.comm_upsales.answered_by_feed IS
    'The ERP feed answered it itself (2026-10-13): a cancellation or a deletion of a bill whose commission was given, deducted directly into the first month still open for everybody on the bill. Withdrawn by itself if the ERP counts the bill again while that month is open. Undo makes it an ordinary question (FALSE).';

ALTER TABLE public.comm_upsales
    ADD COLUMN IF NOT EXISTS settled_order_id UUID;

COMMENT ON COLUMN public.comm_upsales.settled_order_id IS
    'The bill whose pay gave the commission the change is measured from (2026-10-13): the ERP''s own row of the document — or, for a month the claim form settled, the claim-form row of the same paper. Its shares split the change (lib/commission/run-payload.ts); NULL on a row found before then, which follows the document''s own row.';

COMMENT ON COLUMN public.comm_upsales.decided_by IS
    'Who answered it (Pay in / Not a change). On a waiting row: who sent it back with Undo (2026-10-13) — a cancellation a person sent back stays a question instead of being deducted directly again.';

-- ─── 2. Which bill gave the commission; who holds it; when they are closed ──

-- The bill whose pay gave the commission on a document (erp_sync_settled_
-- basis's own pick): the claim-form row of the same paper for a month settled
-- by hand — the claim form names who shared it (ZNT5991: LUCAS CHOOI and WEI
-- PIN, where the ERP says ANTHONY) — and the document's own row otherwise.
CREATE OR REPLACE FUNCTION public.erp_sync_settled_bill(p_order_id UUID, p_settled_by TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT CASE WHEN p_settled_by = 'hand' THEN (
               SELECT m.id
                 FROM sales_orders o
                 JOIN sales_import_batches ob ON ob.id = o.batch_id
                 JOIN sales_orders m ON m.bill_ref = o.bill_ref
                 JOIN sales_import_batches b ON b.id = m.batch_id
                WHERE o.id = p_order_id
                  AND b.sub_department_id = ob.sub_department_id
                  AND b.status = 'committed'
                  AND b.source = 'file'
                  AND b.period_month = o.period_month
                  AND NOT m.cancelled
                ORDER BY m.order_total DESC
                LIMIT 1)
           ELSE p_order_id END;
$fn$;

-- The bill a drop or an upsell follows: the one recorded on it, else the
-- document's own row.
CREATE OR REPLACE FUNCTION public.erp_sync_adjustment_bill(p_sub_department_id UUID, p_settled_order_id UUID, p_doc_no TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT COALESCE(p_settled_order_id, (
        SELECT o.id FROM sales_orders o
          JOIN sales_import_batches b ON b.id = o.batch_id AND b.sub_department_id = p_sub_department_id
         WHERE o.order_no = p_doc_no AND o.source = 'erp_sync'
         LIMIT 1));
$fn$;

-- The name of somebody holding a share of the bill (not its owner) who is
-- closed in the month, or nothing. The owner is the row's own staff — the
-- closed-month guard and erp_sync_holders_closed ask about them.
CREATE OR REPLACE FUNCTION public.erp_sync_closed_holder(p_sub_department_id UUID, p_period DATE, p_bill UUID, p_owner UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT COALESCE(h.employee_name, 'A salesperson holding a share')
      FROM sales_order_shares s
      LEFT JOIN hr_staff_costs h ON h.id = s.staff_id
     WHERE s.order_id = p_bill AND s.staff_id IS DISTINCT FROM p_owner
       AND comm_staff_month_closed(p_sub_department_id, p_period, s.staff_id)
     ORDER BY h.employee_name
     LIMIT 1;
$fn$;

-- Is the owner, or anybody holding a part of the bill, closed in the month?
CREATE OR REPLACE FUNCTION public.erp_sync_holders_closed(p_sub_department_id UUID, p_period DATE, p_order_id UUID, p_owner UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT comm_staff_month_closed(p_sub_department_id, p_period, p_owner)
        OR EXISTS (SELECT 1 FROM sales_order_shares s
                    WHERE s.order_id = p_order_id
                      AND comm_staff_month_closed(p_sub_department_id, p_period, s.staff_id));
$fn$;

-- The first month from p_from (and from the month the portal pays from) that
-- may still take a deduction for the bill: no run has paid it and nobody on
-- the bill is closed in it. Two years on and none: nothing.
CREATE OR REPLACE FUNCTION public.erp_sync_first_open_month(p_sub_department_id UUID, p_from DATE, p_order_id UUID, p_owner UUID)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
    v_month DATE := GREATEST(DATE_TRUNC('month', p_from)::DATE,
                             COALESCE(comm_first_paid_month(p_sub_department_id), DATE_TRUNC('month', p_from)::DATE));
BEGIN
    FOR i IN 0..23 LOOP
        IF NOT commission_order_period_locked(p_sub_department_id, v_month)
           AND NOT erp_sync_holders_closed(p_sub_department_id, v_month, p_order_id, p_owner) THEN
            RETURN v_month;
        END IF;
        v_month := (v_month + INTERVAL '1 month')::DATE;
    END LOOP;
    RETURN NULL;
END;
$fn$;

-- ─── 3. Nothing paid into a month a holder of the bill is closed in ─────────
-- comm_upsales_closed_month_guard asks about the row's own salesperson — the
-- bill's owner. A drop or an upsell of a shared bill is paid to every holder
-- in their part (the run splits it), so a month any of them is closed in may
-- not take it either: their close would never pay or take back their part.
-- Trigger-only, as its owner (it reads the bill's shares and the closes
-- whoever answers); nobody may call it.

CREATE OR REPLACE FUNCTION public.comm_upsales_holders_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_name TEXT;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.status = 'confirmed' AND OLD.erp_doc_no IS NOT NULL
       AND (TG_OP = 'DELETE'
            OR ROW(NEW.status, NEW.period_month, NEW.staff_id, NEW.amount, NEW.sub_department_id)
               IS DISTINCT FROM ROW(OLD.status, OLD.period_month, OLD.staff_id, OLD.amount, OLD.sub_department_id)) THEN
        v_name := erp_sync_closed_holder(OLD.sub_department_id, OLD.period_month,
                                         erp_sync_adjustment_bill(OLD.sub_department_id, OLD.settled_order_id, OLD.erp_doc_no),
                                         OLD.staff_id);
        IF v_name IS NOT NULL THEN
            RAISE EXCEPTION '%''s % is closed, and % holds a share of this bill. Reopen it on Comm Cal before changing what it pays.',
                v_name, TO_CHAR(OLD.period_month, 'FMMonth YYYY'), v_name
                USING ERRCODE = '23CLS';
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.status = 'confirmed' AND NEW.erp_doc_no IS NOT NULL
       AND (TG_OP = 'INSERT'
            OR ROW(NEW.status, NEW.period_month, NEW.staff_id, NEW.amount, NEW.sub_department_id)
               IS DISTINCT FROM ROW(OLD.status, OLD.period_month, OLD.staff_id, OLD.amount, OLD.sub_department_id)) THEN
        v_name := erp_sync_closed_holder(NEW.sub_department_id, NEW.period_month,
                                         erp_sync_adjustment_bill(NEW.sub_department_id, NEW.settled_order_id, NEW.erp_doc_no),
                                         NEW.staff_id);
        IF v_name IS NOT NULL THEN
            RAISE EXCEPTION '%''s % is closed, and % holds a share of this bill. Reopen it on Comm Cal, or pay this in a later month.',
                v_name, TO_CHAR(NEW.period_month, 'FMMonth YYYY'), v_name
                USING ERRCODE = '23CLS';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$fn$;

CREATE OR REPLACE TRIGGER comm_upsales_holders_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.comm_upsales
    FOR EACH ROW EXECUTE FUNCTION public.comm_upsales_holders_guard();

-- ─── 4. The question, deducted directly when the ERP cancelled ──────────────

CREATE OR REPLACE FUNCTION public.erp_sync_note_adjustment(p_order_id UUID, p_order JSONB, p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_row       sales_orders%ROWTYPE;
    v_sub       UUID;
    v_scheme    UUID;
    v_status    TEXT := UPPER(COALESCE(NULLIF(BTRIM(p_order->>'status'), ''), 'CONFIRMED'));
    v_deleted   BOOLEAN := COALESCE((p_order->>'deleted')::BOOLEAN, FALSE);
    v_on_hold   BOOLEAN := COALESCE((p_order->>'onHold')::BOOLEAN, FALSE);
    v_by_hand   BOOLEAN;
    v_counted   BOOLEAN;
    v_new       NUMERIC(15, 2);
    v_settled   NUMERIC(15, 2);
    v_period    DATE;
    v_by        TEXT;
    v_staff     UUID;
    v_at        TIMESTAMPTZ;
    v_stand     NUMERIC(15, 2);
    v_stood_at  TIMESTAMPTZ;
    v_base      NUMERIC(15, 2);
    v_delta     NUMERIC(15, 2);
    v_reason    TEXT;
    v_month     DATE;
    v_direct    DATE;
    v_note      TEXT;
    v_bill      UUID;
    v_today     DATE := (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE;
BEGIN
    SELECT * INTO v_row FROM sales_orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    SELECT b.sub_department_id INTO v_sub FROM sales_import_batches b WHERE b.id = v_row.batch_id;
    v_scheme := erp_sync_scheme_of(v_sub);
    IF v_scheme IS NULL THEN
        RETURN;
    END IF;
    v_by_hand := sales_order_excluded_by_hand(v_row.id);
    v_counted := NOT (v_deleted OR v_status IN ('CANCELLED', 'DRAFT', 'ON_HOLD') OR v_on_hold OR v_by_hand);

    IF v_counted THEN
        v_new := erp_sync_lines_value(p_order->'lines', v_scheme);
    ELSE
        v_new := 0;
    END IF;

    SELECT b.amount, b.period, b.settled_by, b.staff_id, b.settled_at
      INTO v_settled, v_period, v_by, v_staff, v_at
      FROM erp_sync_settled_basis(v_row.id) b;
    IF v_settled IS NULL OR v_staff IS NULL THEN
        DELETE FROM comm_upsales
         WHERE sub_department_id = v_sub AND erp_doc_no = v_row.order_no AND status = 'pending';
        RETURN;
    END IF;
    -- The bill whose pay gave it: its shares split the change.
    v_bill := COALESCE(erp_sync_settled_bill(v_row.id, v_by), v_row.id);

    -- Counted again: a deduction the feed made by itself is withdrawn while
    -- its month is open for everybody on the bill.
    IF v_counted THEN
        DELETE FROM comm_upsales u
         WHERE u.sub_department_id = v_sub AND u.erp_doc_no = v_row.order_no
           AND u.status = 'confirmed' AND u.answered_by_feed
           AND NOT commission_order_period_locked(v_sub, u.period_month)
           AND NOT erp_sync_holders_closed(v_sub, u.period_month, COALESCE(u.settled_order_id, v_bill), u.staff_id);
    END IF;

    SELECT u.erp_amount, u.decided_at INTO v_stand, v_stood_at
      FROM comm_upsales u
     WHERE u.sub_department_id = v_sub AND u.erp_doc_no = v_row.order_no
       AND u.status = 'dismissed' AND u.erp_amount IS NOT NULL
       AND u.decided_at > v_at
     ORDER BY u.decided_at DESC
     LIMIT 1;
    IF v_stood_at IS NOT NULL THEN
        v_base := v_stand + COALESCE((
            SELECT SUM(u.amount) FROM comm_upsales u
             WHERE u.sub_department_id = v_sub AND u.erp_doc_no = v_row.order_no
               AND u.status = 'confirmed' AND u.decided_at > v_stood_at), 0);
    ELSE
        v_base := v_settled + COALESCE((
            SELECT SUM(u.amount) FROM comm_upsales u
             WHERE u.sub_department_id = v_sub AND u.erp_doc_no = v_row.order_no
               AND u.status = 'confirmed'), 0);
    END IF;
    v_delta := ROUND(v_new - v_base, 2);

    IF ABS(v_delta) < 0.01 THEN
        DELETE FROM comm_upsales
         WHERE sub_department_id = v_sub AND erp_doc_no = v_row.order_no AND status = 'pending';
        RETURN;
    END IF;

    v_reason := CASE WHEN v_deleted THEN 'deleted'
                     WHEN v_status = 'CANCELLED' THEN 'cancelled'
                     WHEN v_on_hold OR v_status IN ('ON_HOLD', 'DRAFT') THEN 'on_hold'
                     WHEN v_by_hand THEN 'not_counted'
                     WHEN ABS(v_base) < 0.01 AND v_delta > 0 THEN 'reinstated'
                     ELSE 'amount' END;
    v_month := GREATEST(DATE_TRUNC('month', v_today)::DATE,
                        (DATE_TRUNC('month', v_period) + INTERVAL '1 month')::DATE);

    -- A cancellation is not asked (2026-10-13): taken back directly. The
    -- question already waiting on the bill BECOMES the deduction — the same
    -- row, so the trail that points at it still does. Refused for any reason
    -- (a guard, a close made a moment ago): asked, as before. A question a
    -- person sent back (Undo — decided_by on a waiting row) stays a question.
    IF v_reason IN ('cancelled', 'deleted') AND v_delta < 0
       AND NOT EXISTS (SELECT 1 FROM comm_upsales u
                        WHERE u.sub_department_id = v_sub AND u.erp_doc_no = v_row.order_no
                          AND u.status = 'pending' AND u.decided_by IS NOT NULL) THEN
        v_direct := erp_sync_first_open_month(v_sub, (DATE_TRUNC('month', v_period) + INTERVAL '1 month')::DATE,
                                              v_bill, v_staff);
        IF v_direct IS NOT NULL THEN
            v_note := 'The ERP ' || CASE v_reason WHEN 'deleted' THEN 'deleted ' ELSE 'cancelled ' END || v_row.order_no
                || ' after its commission was given in ' || TO_CHAR(v_period, 'FMMonth YYYY')
                || ' — taken back directly in ' || TO_CHAR(v_direct, 'FMMonth YYYY');
            BEGIN
                UPDATE comm_upsales u
                   SET period_month     = v_direct,
                       staff_id         = v_staff,
                       amount           = v_delta,
                       kind             = 'drop',
                       status           = 'confirmed',
                       sold_on          = CASE WHEN u.amount = v_delta THEN u.sold_on ELSE v_today END,
                       original_ref     = v_row.bill_ref,
                       note             = v_note,
                       erp_event_id     = COALESCE(p_event_id, u.erp_event_id),
                       settled_amount   = v_base,
                       erp_amount       = v_new,
                       original_period  = v_row.period_month,
                       erp_reason       = v_reason,
                       settled_period   = v_period,
                       settled_by       = v_by,
                       settled_order_id = v_bill,
                       answered_by_feed = TRUE,
                       decided_by       = NULL,
                       decided_at       = NOW()
                 WHERE u.sub_department_id = v_sub AND u.erp_doc_no = v_row.order_no AND u.status = 'pending';
                IF NOT FOUND THEN
                    INSERT INTO comm_upsales (
                        sub_department_id, period_month, staff_id, amount, sold_on, original_ref, note,
                        kind, status, source, erp_doc_no, erp_event_id, settled_amount, erp_amount, original_period,
                        erp_reason, settled_period, settled_by, settled_order_id, answered_by_feed, decided_at, created_by)
                    VALUES (
                        v_sub, v_direct, v_staff, v_delta, v_today, v_row.bill_ref, v_note,
                        'drop', 'confirmed', 'erp', v_row.order_no, p_event_id, v_base, v_new, v_row.period_month,
                        v_reason, v_period, v_by, v_bill, TRUE, NOW(), NULL);
                END IF;
                RETURN;
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'erp_sync_note_adjustment(%): not taken back directly, asked instead — %', p_order_id, SQLERRM;
            END;
        END IF;
    END IF;

    INSERT INTO comm_upsales (
        sub_department_id, period_month, staff_id, amount, sold_on, original_ref, note,
        kind, status, source, erp_doc_no, erp_event_id, settled_amount, erp_amount, original_period,
        erp_reason, settled_period, settled_by, settled_order_id, created_by)
    VALUES (
        v_sub, v_month, v_staff, v_delta, v_today, v_row.bill_ref,
        'The ERP ' || CASE v_reason WHEN 'cancelled' THEN 'cancelled ' WHEN 'deleted' THEN 'deleted '
                                    WHEN 'on_hold' THEN 'held back ' WHEN 'reinstated' THEN 'reinstated '
                                    ELSE 'changed ' END
            || v_row.order_no || ' after its commission was given in ' || TO_CHAR(v_period, 'FMMonth YYYY'),
        CASE WHEN v_delta > 0 THEN 'upsale' ELSE 'drop' END, 'pending', 'erp', v_row.order_no, p_event_id,
        v_base, v_new, v_row.period_month, v_reason, v_period, v_by, v_bill, NULL)
    ON CONFLICT (sub_department_id, erp_doc_no) WHERE status = 'pending' AND erp_doc_no IS NOT NULL
    DO UPDATE SET amount          = EXCLUDED.amount,
                  kind            = EXCLUDED.kind,
                  staff_id        = EXCLUDED.staff_id,
                  period_month    = EXCLUDED.period_month,
                  sold_on         = CASE WHEN comm_upsales.amount = EXCLUDED.amount THEN comm_upsales.sold_on
                                         ELSE EXCLUDED.sold_on END,
                  original_ref    = EXCLUDED.original_ref,
                  note            = EXCLUDED.note,
                  erp_event_id    = COALESCE(EXCLUDED.erp_event_id, comm_upsales.erp_event_id),
                  settled_amount  = EXCLUDED.settled_amount,
                  erp_amount      = EXCLUDED.erp_amount,
                  original_period = EXCLUDED.original_period,
                  erp_reason      = EXCLUDED.erp_reason,
                  settled_period  = EXCLUDED.settled_period,
                  settled_by      = EXCLUDED.settled_by,
                  settled_order_id = EXCLUDED.settled_order_id;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'erp_sync_note_adjustment(%): %', p_order_id, SQLERRM;
END;
$fn$;

COMMENT ON FUNCTION public.erp_sync_note_adjustment(UUID, JSONB, UUID) IS
    'What the ERP changed on a bill whose commission was given (erp_sync_settled_basis): the delivery''s commissionable amount minus that figure — moved by drops/upsells confirmed since, re-based by the latest "Not a change" since — is one pending comm_upsales row per document, payable from the month after the one that gave the commission. A cancellation or a deletion is not asked: it is deducted directly into the first month still open for everybody on the bill (answered_by_feed), and withdrawn by itself if the ERP counts the bill again while that month is open. Nothing given: no question. Never raises. 2026-10-13.';

-- ─── 5. The trail points at a deduction the feed made, too ──────────────────
-- erp_sync_note_change is 20261013020000's (md5 55530b49d9da7c5dbdb086f78c7c6029)
-- with its one lookup swapped: a save that moved money points at the question
-- waiting on its bill, else at the deduction this very delivery made.

DO $swap$
DECLARE
    v_fn  REGPROCEDURE := 'public.erp_sync_note_change(uuid, text, uuid, uuid, text, date, jsonb, jsonb, timestamptz, timestamptz)'::REGPROCEDURE;
    v_src TEXT := (SELECT prosrc FROM pg_proc WHERE oid = 'public.erp_sync_note_change(uuid, text, uuid, uuid, text, date, jsonb, jsonb, timestamptz, timestamptz)'::REGPROCEDURE);
    v_old TEXT := $old$             WHERE u.sub_department_id = p_sub_department_id AND u.erp_doc_no = p_doc_no AND u.status = 'pending';$old$;
    v_new TEXT := $new$             WHERE u.sub_department_id = p_sub_department_id AND u.erp_doc_no = p_doc_no
               AND (u.status = 'pending' OR (u.answered_by_feed AND u.erp_event_id = p_event_id))
             ORDER BY (u.status = 'pending') DESC, u.created_at DESC
             LIMIT 1;$new$;
BEGIN
    IF strpos(v_src, 'u.answered_by_feed AND u.erp_event_id = p_event_id') > 0 THEN
        RETURN;
    END IF;
    IF md5(v_src) <> '55530b49d9da7c5dbdb086f78c7c6029' THEN
        RAISE EXCEPTION 'erp_sync_note_change is not the body 20261013020000 left (md5 %) — production changed since this migration was written', md5(v_src);
    END IF;
    IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
        RAISE EXCEPTION 'erp_sync_note_change: its lookup is not there once';
    END IF;
    EXECUTE replace(pg_get_functiondef(v_fn), v_src, replace(v_src, v_old, v_new));
END
$swap$;

-- ─── 6. Who may call what ───────────────────────────────────────────────────

-- Ordinary (INVOKER) helpers of the receiver and of HR's replay, which runs
-- as HR: what they read answers to HR's own row policies.
REVOKE ALL ON FUNCTION public.erp_sync_settled_bill(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_sync_adjustment_bill(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_sync_closed_holder(UUID, DATE, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_sync_holders_closed(UUID, DATE, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_sync_first_open_month(UUID, DATE, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_sync_settled_bill(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_sync_adjustment_bill(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_sync_closed_holder(UUID, DATE, UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_sync_holders_closed(UUID, DATE, UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_sync_first_open_month(UUID, DATE, UUID, UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.comm_upsales_holders_guard() FROM PUBLIC, anon, authenticated;

-- ─── 7. The questions waiting now, under the new rule ───────────────────────
-- A cancellation waiting for an answer (HC8972 on 2026-10-13) is deducted
-- directly — its question becomes the deduction, so the trail row pointing at
-- it still does; the others are asked again, unchanged.

DO $review$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT DISTINCT u.sub_department_id, u.erp_doc_no
          FROM comm_upsales u
         WHERE u.status = 'pending' AND u.source = 'erp' AND u.erp_doc_no IS NOT NULL
    LOOP
        PERFORM erp_sync_review_order(r.sub_department_id, r.erp_doc_no);
    END LOOP;
    -- The ones already answered follow the bill that paid them too — those
    -- found before 20261013010000 recorded nothing of it, and are asked now
    -- (none in a month a run has paid: that month keeps what it paid).
    UPDATE public.comm_upsales u
       SET settled_order_id = erp_sync_settled_bill(o.id, COALESCE(u.settled_by,
                                  (SELECT x.settled_by FROM erp_sync_settled_basis(o.id) x)))
      FROM public.sales_orders o
      JOIN public.sales_import_batches b ON b.id = o.batch_id
     WHERE u.source = 'erp' AND u.erp_doc_no IS NOT NULL AND u.settled_order_id IS NULL
       AND o.order_no = u.erp_doc_no AND o.source = 'erp_sync' AND b.sub_department_id = u.sub_department_id
       AND (u.status <> 'confirmed' OR NOT commission_order_period_locked(u.sub_department_id, u.period_month));
END
$review$;

NOTIFY pgrst, 'reload schema';
