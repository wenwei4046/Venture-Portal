-- HR cost-summary Principal approval removed (user 2026-06-26).
--
-- submitHRCostSummary now inserts hr_cost_submissions.execution_state directly
-- as 'approved_for_execution' and no longer files an hr_costing approval_request.
-- The ONLY path that advanced a snapshot from 'pending' -> 'approved_for_execution'
-- was the (now removed) Principal-approval branch in performApproval, so any
-- in-flight 'pending' snapshot at deploy time would otherwise be permanently
-- stuck with no actionable control. Advance them, and settle any orphaned
-- still-pending hr_costing approval-queue rows so they don't linger in the
-- Principal inbox with no handler.
--
-- No-op on a clean DB (production currently has zero such rows).

UPDATE hr_cost_submissions
   SET execution_state = 'approved_for_execution'
 WHERE execution_state = 'pending';

UPDATE approval_requests
   SET status = 'approved',
       workflow_state = 'approved'
 WHERE request_type = 'hr_costing'
   AND status = 'pending';
