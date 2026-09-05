-- ============================================================================
-- 20260905060000_rank_catalog.sql
-- A rank is a row of its own: the Rank tab, and a ladder that picks one per title
-- HOUZS Venture Portal
--
-- The user, 2026-09-05 evening, on the Title ladder:
--
--   > 这个 rank 基本上是可选的，rate 是不能选的，因为 rate 绑定了 rank。你帮我加多
--   > 一个 rank 的 tab，点进去后我可以配置 rank A 等于多少 rate、rank B 等于多少
--   > rate … title 本身不能用 dropdown 选（只有 add new 那边才可以），选好后 title
--   > 就是 fixed 的；rank 那边有 dropdown option；rate 不能直接改，因为 rank 和
--   > rate 是绑定的，除非我在 rank 的那个 tab 里去调。
--
-- Until now a rank existed only as the rate on a rung of `comm_ranks`, and
-- the letter was counted from the top of the rungs (20260905010000). Now the
-- rank is its own row and the rung points at it:
--
--   comm_rank_defs   the catalogue — one row per (scheme, rate): "Rank A · 9%".
--                    What the Rank tab edits.
--   comm_ranks       the ladder — one rung per title, holding the gates and
--                    can_recruit, pointing at a rank. Its product_rate, label
--                    and sort_order are COPIES of the rank's, kept by trigger,
--                    so the engine, the statements, the hierarchy and every
--                    page that reads a rung keep reading what they read today.
--
-- Letters count from the top of the CATALOGUE — a rank nobody has put a title
-- on yet still takes its letter — and are rewritten by the app after every
-- Rank tab write (`resequenceLadder` over the defs, src/lib/commission/
-- ranks.ts), then copied down to the rungs by the trigger below.
--
-- Backward compatible on purpose: a rung inserted with only a rate (the code
-- that is live while this deploys, and any old script) is matched to the rank
-- at that rate, or mints one, so nothing between the migration and the deploy
-- can fail.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The catalogue
-- ----------------------------------------------------------------------------

CREATE TABLE comm_rank_defs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id    UUID NOT NULL REFERENCES comm_schemes(id) ON DELETE CASCADE,
    product_rate DECIMAL(9, 6) NOT NULL
                 CONSTRAINT rank_def_rate_sane CHECK (product_rate >= 0 AND product_rate <= 1),
    -- "Rank SS" / "Rank A" / "Rank B" … counted from the top of the catalogue,
    -- and sort_order 10, 20, 30 … from the bottom. Both rewritten by the app
    -- after every write; never typed in.
    label        TEXT NOT NULL DEFAULT 'Rank ?',
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A rank is its rate: two ranks on one rate would be two names for one pay.
    CONSTRAINT uq_comm_rank_def_rate UNIQUE (scheme_id, product_rate)
);

COMMENT ON TABLE comm_rank_defs IS
    'The Rank tab (2026-09-05): one row per rank of a scheme, a rank being its rate. Lettered from the top by the app (resequenceLadder) — SS for the highest rate, then A, B, C … Rungs of comm_ranks point here and copy product_rate / label / sort_order from it.';
COMMENT ON COLUMN comm_rank_defs.label IS
    '"Rank SS" / "Rank A" … from the top of the catalogue. Maintained by the app after every write; never typed in.';
COMMENT ON COLUMN comm_rank_defs.sort_order IS
    'Rate order, 10/20/30 … from the lowest rate up. Rewritten with the labels after every write.';

-- ----------------------------------------------------------------------------
-- 2. One rank per rate already on a ladder, wearing the letter its rung wears
-- ----------------------------------------------------------------------------

INSERT INTO comm_rank_defs (scheme_id, product_rate, label, sort_order)
SELECT scheme_id, product_rate, min(label), min(sort_order)
  FROM comm_ranks
 GROUP BY scheme_id, product_rate;

-- ----------------------------------------------------------------------------
-- 3. The rung points at its rank
-- ----------------------------------------------------------------------------

ALTER TABLE comm_ranks
    ADD COLUMN rank_def_id UUID REFERENCES comm_rank_defs(id) ON DELETE RESTRICT;

UPDATE comm_ranks r
   SET rank_def_id = d.id
  FROM comm_rank_defs d
 WHERE d.scheme_id = r.scheme_id
   AND d.product_rate = r.product_rate;

ALTER TABLE comm_ranks
    ALTER COLUMN rank_def_id SET NOT NULL,
    -- One title per rank. uq_comm_rank_rate already implies it while the copy
    -- holds; this says it outright.
    ADD CONSTRAINT uq_comm_rank_def UNIQUE (scheme_id, rank_def_id);

COMMENT ON COLUMN comm_ranks.rank_def_id IS
    'The rank this rung pays (comm_rank_defs). product_rate / label / sort_order on this row are copies of the rank''s, kept by comm_ranks_follow_rank_def.';
COMMENT ON COLUMN comm_ranks.product_rate IS
    'COPY of comm_rank_defs.product_rate for the rung''s rank_def_id — kept by trigger; the rate is set on the Rank tab. Still read by the engine and snapshotted into statements.';

-- ----------------------------------------------------------------------------
-- 4. The copies stay copies
-- ----------------------------------------------------------------------------

-- A rung takes its rate, letter and order from its rank. A rung written with
-- no rank — only a rate: the code live while this deploys, or an old script —
-- is matched to the rank at that rate, or mints one.
CREATE OR REPLACE FUNCTION comm_ranks_follow_rank_def() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    d comm_rank_defs%ROWTYPE;
BEGIN
    IF NEW.rank_def_id IS NULL THEN
        SELECT * INTO d FROM comm_rank_defs
         WHERE scheme_id = NEW.scheme_id AND product_rate = NEW.product_rate;
        IF NOT FOUND THEN
            INSERT INTO comm_rank_defs (scheme_id, product_rate, label, sort_order)
            VALUES (NEW.scheme_id, NEW.product_rate, NEW.label, NEW.sort_order)
            RETURNING * INTO d;
        END IF;
        NEW.rank_def_id := d.id;
    ELSE
        SELECT * INTO d FROM comm_rank_defs WHERE id = NEW.rank_def_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'rank % does not exist', NEW.rank_def_id;
        END IF;
        IF d.scheme_id <> NEW.scheme_id THEN
            RAISE EXCEPTION '% belongs to another scheme', d.label;
        END IF;
    END IF;
    NEW.product_rate := d.product_rate;
    NEW.label        := d.label;
    NEW.sort_order   := d.sort_order;
    RETURN NEW;
END;
$$;

CREATE TRIGGER comm_ranks_follow_rank_def
    BEFORE INSERT OR UPDATE ON comm_ranks
    FOR EACH ROW EXECUTE FUNCTION comm_ranks_follow_rank_def();

-- A rank re-rated or re-lettered pushes the change down to its rung.
CREATE OR REPLACE FUNCTION comm_rank_defs_propagate() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE comm_ranks
       SET product_rate = NEW.product_rate,
           label        = NEW.label,
           sort_order   = NEW.sort_order
     WHERE rank_def_id = NEW.id
       AND (product_rate IS DISTINCT FROM NEW.product_rate
            OR label IS DISTINCT FROM NEW.label
            OR sort_order IS DISTINCT FROM NEW.sort_order);
    RETURN NULL;
END;
$$;

CREATE TRIGGER comm_rank_defs_propagate
    AFTER UPDATE OF product_rate, label, sort_order ON comm_rank_defs
    FOR EACH ROW EXECUTE FUNCTION comm_rank_defs_propagate();

-- ----------------------------------------------------------------------------
-- 5. RLS — the same two policies every comm_* table carries
-- ----------------------------------------------------------------------------

ALTER TABLE comm_rank_defs ENABLE ROW LEVEL SECURITY;

CREATE POLICY comm_rank_defs_principal_all ON comm_rank_defs FOR ALL
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));

CREATE POLICY comm_rank_defs_hr_all ON comm_rank_defs FOR ALL
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));
