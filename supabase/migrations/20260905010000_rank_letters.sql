-- ============================================================================
-- 20260905010000_rank_letters.sql
-- A rank is its rate: letter the ladder from the top, one rung per rate
-- HOUZS Venture Portal
--
-- The user's rule (2026-09-05, plain words):
--
--   > Rank 你不用想一个名字 … 它直接变成 Rank A equal to 5% rate 这样。可能从 Rank H
--   > 以此类推到 Rank A，最高到 SS，这样反推过去，它就是 equal with 它的 rate。
--   > 同个 title 可能是不同的 rank … 你现在是 Team Leader，可能你是 Rank A equal
--   > to 9%，但你那个月没有 hit 到 target，你还是一样的 Team Leader title，但你的
--   > rank 掉去 Rank B，所以拿到 8% 的 rate。
--
-- So a rung is no longer named after its title ("Team Leader - 9%" was the
-- title again with the rate stapled on). It is lettered from the TOP of the
-- ladder — SS for the highest rate, then A, B, C … — and the letter follows
-- the rate. The title stays the ratchet (migration 20260903030000); the rank
-- is what the month pays.
--
-- What this migration does:
--
--   1. Re-sequences every scheme's ladder by rate (sort_order 10, 20, 30 …
--      from the lowest rate up) and rewrites `label` as "Rank <letter>" from
--      the top down. The app does the same after every ladder write
--      (`resequenceLadder`, src/lib/commission/ranks.ts); this is the one-off
--      for the rows already there.
--   2. `uq_comm_rank_rate` — one rung per rate per scheme. Two rungs on one
--      rate would be two names for one pay.
--
-- `rank_key` — what statements snapshot and promotion rules point at — is
-- untouched: the letter moves when a rung is added above, the key never does.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Letters, from the top
-- ----------------------------------------------------------------------------

WITH ordered AS (
    SELECT id,
           row_number() OVER (PARTITION BY scheme_id ORDER BY product_rate ASC, sort_order ASC) AS from_bottom,
           count(*)     OVER (PARTITION BY scheme_id) AS n
      FROM comm_ranks
)
UPDATE comm_ranks r
   SET sort_order = o.from_bottom * 10,
       label      = 'Rank ' || CASE
                        WHEN o.n - o.from_bottom = 0 THEN 'SS'
                        ELSE chr(64 + (o.n - o.from_bottom)::int)
                    END
  FROM ordered o
 WHERE o.id = r.id;

COMMENT ON COLUMN comm_ranks.label IS
    '"Rank SS" / "Rank A" / "Rank B" … — the letter counted from the TOP of the ladder (highest rate = SS). Maintained by the app after every ladder write (resequenceLadder); never typed in. The rate is the rank; the title is separate and a ratchet.';

COMMENT ON COLUMN comm_ranks.sort_order IS
    'Ladder order = rate order, 10/20/30 … from the lowest rate up. Rewritten with the labels after every ladder write, so "one rung up" always means the next rate up.';

-- ----------------------------------------------------------------------------
-- 2. One rung per rate
-- ----------------------------------------------------------------------------

ALTER TABLE comm_ranks
    ADD CONSTRAINT uq_comm_rank_rate UNIQUE (scheme_id, product_rate);

COMMENT ON CONSTRAINT uq_comm_rank_rate ON comm_ranks IS
    'A rank is its rate (2026-09-05): two rungs on one rate would be two names for one pay.';
