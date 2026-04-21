-- Mig 203: P2-9 fix — drop legacy 'dept_expense' branch from handle_approval_cascade
--
-- Why
-- ---
-- mig 17 added a dispatch branch for approval_requests.request_type =
-- 'dept_expense' that INSERTs a dept_pools expense_out row when the
-- approval status transitions to 'approved'. This branch has been
-- superseded by the dept_payment_request flow (mig 173), which uses the
-- approve_dept_payment_expense RPC path. No code in the current codebase
-- creates approval_requests with request_type='dept_expense' anymore.
--
-- Audit (2026-04-22) flagged this legacy branch as a drift surface: it
-- debits dept_pools without journaling, and because it's a trigger
-- firing on status transitions, adding a JE here is awkward (no RPC
-- context for created_by). Per user Q7 = drop.
--
-- This migration rewrites handle_approval_cascade to keep only the
-- new_contract branch. Everything else (including legacy dept_expense)
-- falls through to the explicit no-op.

BEGIN;

CREATE OR REPLACE FUNCTION handle_approval_cascade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.status <> 'pending' THEN
        RETURN NEW;
    END IF;

    IF NEW.status NOT IN ('approved', 'rejected') THEN
        RETURN NEW;
    END IF;

    CASE NEW.request_type

        -- new_contract (Phase 2): Principal approval stamps service_contracts;
        -- rejection flips to cancelled.
        WHEN 'new_contract' THEN
            IF NEW.status = 'approved' THEN
                UPDATE service_contracts
                SET approved_by = NEW.approved_by,
                    updated_at  = NOW()
                WHERE id = NEW.reference_id;
            ELSE
                UPDATE service_contracts
                SET status     = 'cancelled',
                    updated_at = NOW()
                WHERE id = NEW.reference_id;
            END IF;

        -- dept_expense branch dropped in mig 203. Replaced by the
        -- dept_payment_request flow (mig 173 / mig 198). Legacy approval
        -- rows of this type should no longer exist; if they do, the
        -- cascade is a safe no-op.

        ELSE
            NULL;
    END CASE;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION handle_approval_cascade() IS
    'Mig 203: legacy dept_expense branch removed (replaced by dept_payment_request flow). Only new_contract cascade remains.';

COMMIT;
