-- ============================================================================
-- 20260101000207_service_contracts_dept_manager_insert.sql
-- Feature #4 — allow Marketing dept_manager to create their own service contracts.
--
-- Current: service_contracts INSERT only allowed for role='finance' (mig 11).
-- New: also allow dept_manager IFF they insert into their own department.
-- Principal approval workflow unchanged — approval_requests still gate
-- creation via handle_approval_cascade (mig 203 kept new_contract branch).
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS service_contracts_finance_insert ON service_contracts;

CREATE POLICY service_contracts_insert ON service_contracts
    FOR INSERT WITH CHECK (
        current_user_role() = 'finance'
        OR (
            current_user_role() = 'dept_manager'
            AND department_id = current_user_department_id()
        )
    );

COMMIT;
