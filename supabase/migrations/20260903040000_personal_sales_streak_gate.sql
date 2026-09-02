-- ============================================================================
-- 20260903040000_personal_sales_streak_gate.sql
-- The 5% → 6% step goes live, and the ladder is climbed one rung at a time
-- HOUZS Venture Portal
--
-- The user's answer to spec Q11 (2026-09-03):
--
--   > 如果这种 case 的话，他不会直接上 Team Assistant。因为他的 criteria 是要连续两个
--   > 月达到标准，才可以晋升到 Senior Revenue Specialist。所以如果他只是单月达到
--   > 300k 的话，还是一样不能够跳过限制，他需要连续两个月达到那个 criteria 才能变成
--   > Senior Revenue Specialist，而不是直接升到 Team Assistant。
--
-- Two things follow, and the engine now does both (resolveRank, engine.ts):
--
--   1. NO SKIPPING. A month can lift somebody at most ONE rung above their
--      floor, and only if THAT rung's gate holds. Before this the engine paid
--      the highest rung whose gate was cleared, which is how a 5% Specialist
--      selling 300k alone became a Team Assistant in one month.
--
--   2. THE SECOND KIND OF GATE. `group_sales_threshold` (300k → Team
--      Assistant) is a MONTHLY target: paid that month, back down the next.
--      The 5% → 6% step is different in kind — personal sales of 100k for two
--      months in a row is a test of persistence, and passing it makes the
--      person a Senior Revenue Specialist for good. So it is an EARNED gate:
--      the title raised at apply is the record, and from then on the engine
--      climbs from that rung, not from the 5% they were placed at.
--
--        personal_sales_threshold   own commissionable revenue, deposit-cleared
--                                   (the statement's product_revenue), that
--                                   every month of the streak must reach
--        consecutive_months         how many months in a row, this one included
--
--      The earlier months come from the earlier runs' statements, so the
--      first month a sub-department is run nobody can pass a 2-month streak.
--
-- A rung carries at most one gate. The recorded promotion criteria
-- (comm_promotion_rules) stay recorded; Rules VIII derives its LIVE chip from
-- these ladder columns, as it already did for the 300k rung.
-- ============================================================================

ALTER TABLE comm_ranks
    ADD COLUMN personal_sales_threshold DECIMAL(15, 2)
        CONSTRAINT personal_sales_threshold_positive
        CHECK (personal_sales_threshold IS NULL OR personal_sales_threshold > 0),
    ADD COLUMN consecutive_months SMALLINT
        CONSTRAINT consecutive_months_sane
        CHECK (consecutive_months IS NULL OR consecutive_months >= 1),
    ADD CONSTRAINT streak_needs_months
        CHECK ((personal_sales_threshold IS NULL) = (consecutive_months IS NULL)),
    ADD CONSTRAINT one_gate_per_rung
        CHECK (group_sales_threshold IS NULL OR personal_sales_threshold IS NULL);

COMMENT ON COLUMN comm_ranks.personal_sales_threshold IS
    'EARNED gate into this rung: own commissionable, deposit-cleared revenue every month of a `consecutive_months` streak (this month included). Passing it raises the title for good and the engine climbs from this rung thereafter. A rung carries at most one gate.';
COMMENT ON COLUMN comm_ranks.consecutive_months IS
    'Length of the personal-sales streak, this month included. 1 = a single month.';
COMMENT ON COLUMN comm_ranks.group_sales_threshold IS
    'MONTHLY gate into this rung: own + downline commissionable revenue this month. Paid this rung in a month that clears it, back to the floor in one that does not. A rung carries at most one gate.';

-- The one live streak: 100k × 2 months → Senior Revenue Specialist, on every
-- ladder that still carries the seeded rs_6 rung.
UPDATE comm_ranks
   SET personal_sales_threshold = 100000.00,
       consecutive_months = 2
 WHERE rank_key = 'rs_6'
   AND group_sales_threshold IS NULL
   AND personal_sales_threshold IS NULL;
