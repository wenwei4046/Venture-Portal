-- Rank catalogue: percentage pay or a fixed incentive per qualifying group.
-- Existing percentage ranks keep their labels, rates and order unchanged.
-- Qualification and payout are computed by the engine; this migration only
-- adds configurable pay and keeps each rung's copies tied to its catalogue row.

ALTER TABLE comm_rank_defs
    ADD COLUMN group_incentive_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    ADD COLUMN group_subsidy_cap DECIMAL(15, 2) NOT NULL DEFAULT 0,
    ADD CONSTRAINT rank_def_group_incentive_sane CHECK (
        group_incentive_amount >= 0 AND group_incentive_amount < 10000000000000
    ),
    ADD CONSTRAINT rank_def_group_subsidy_sane CHECK (
        group_subsidy_cap >= 0 AND group_subsidy_cap < 10000000000000
    ),
    ADD CONSTRAINT rank_def_package_replaces_rate CHECK (
        group_incentive_amount = 0 OR product_rate = 0
    ),
    ADD CONSTRAINT rank_def_subsidy_requires_package CHECK (
        group_subsidy_cap = 0 OR group_incentive_amount > 0
    ),
    DROP CONSTRAINT uq_comm_rank_def_rate,
    ADD CONSTRAINT uq_comm_rank_def_package
        UNIQUE (scheme_id, product_rate, group_incentive_amount, group_subsidy_cap);

ALTER TABLE comm_ranks
    ADD COLUMN group_incentive_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    ADD COLUMN group_subsidy_cap DECIMAL(15, 2) NOT NULL DEFAULT 0,
    ADD CONSTRAINT rank_group_incentive_sane CHECK (
        group_incentive_amount >= 0 AND group_incentive_amount < 10000000000000
    ),
    ADD CONSTRAINT rank_group_subsidy_sane CHECK (
        group_subsidy_cap >= 0 AND group_subsidy_cap < 10000000000000
    ),
    ADD CONSTRAINT rank_package_replaces_rate CHECK (
        group_incentive_amount = 0 OR product_rate = 0
    ),
    ADD CONSTRAINT rank_subsidy_requires_package CHECK (
        group_subsidy_cap = 0 OR group_incentive_amount > 0
    ),
    ADD CONSTRAINT rank_package_monthly_target CHECK (
        group_incentive_amount = 0 OR (
            group_sales_threshold IS NOT NULL AND group_sales_threshold > 0
            AND personal_sales_threshold IS NULL AND consecutive_months IS NULL
        )
    ),
    DROP CONSTRAINT uq_comm_rank_rate,
    ADD CONSTRAINT uq_comm_rank_package
        UNIQUE (scheme_id, product_rate, group_incentive_amount, group_subsidy_cap);

COMMENT ON TABLE comm_rank_defs IS
    'Rank pay catalogue: percentage or a fixed group incentive plus a separate subsidy cap. Packages rank above percentage pay; the app maintains letters/order. Rungs copy pay, label and order by trigger.';
COMMENT ON COLUMN comm_rank_defs.group_incentive_amount IS
    'Positive amount = fixed monthly cash incentive per qualifying group, replacing percentage commission. 0 = percentage rank.';
COMMENT ON COLUMN comm_rank_defs.group_subsidy_cap IS
    'Separate monthly non-cash subsidy cap per qualifying group. Requires a group incentive package; excluded from commission cash.';
COMMENT ON COLUMN comm_rank_defs.sort_order IS
    'Pay order, 10/20/30 from the bottom: percentages by rate, then packages by incentive, subsidy cap and rate. Rewritten with letters by the app.';
COMMENT ON COLUMN comm_ranks.group_incentive_amount IS
    'COPY of comm_rank_defs.group_incentive_amount, maintained by trigger.';
COMMENT ON COLUMN comm_ranks.group_subsidy_cap IS
    'COPY of comm_rank_defs.group_subsidy_cap, maintained by trigger; separate from cash commission.';
COMMENT ON COLUMN comm_ranks.rank_def_id IS
    'The catalogue rank this rung pays. Percentage, group incentive, subsidy cap, label and order are copies maintained by comm_ranks_follow_rank_def.';

-- Explicit rank_def_id wins. Legacy inserts without one match the COMPLETE pay
-- identity; a zero-rate package must never match a plain zero-percent rank.
CREATE OR REPLACE FUNCTION comm_ranks_follow_rank_def() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    d comm_rank_defs%ROWTYPE;
BEGIN
    IF NEW.rank_def_id IS NULL THEN
        SELECT * INTO d FROM comm_rank_defs
         WHERE scheme_id = NEW.scheme_id
           AND product_rate = NEW.product_rate
           AND group_incentive_amount = NEW.group_incentive_amount
           AND group_subsidy_cap = NEW.group_subsidy_cap;
        IF NOT FOUND THEN
            INSERT INTO comm_rank_defs (
                scheme_id, product_rate, group_incentive_amount, group_subsidy_cap,
                label, sort_order
            ) VALUES (
                NEW.scheme_id, NEW.product_rate, NEW.group_incentive_amount,
                NEW.group_subsidy_cap, NEW.label, NEW.sort_order
            ) RETURNING * INTO d;
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
    NEW.group_incentive_amount := d.group_incentive_amount;
    NEW.group_subsidy_cap := d.group_subsidy_cap;
    NEW.label := d.label;
    NEW.sort_order := d.sort_order;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION comm_rank_defs_propagate() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE comm_ranks
       SET product_rate = NEW.product_rate,
           group_incentive_amount = NEW.group_incentive_amount,
           group_subsidy_cap = NEW.group_subsidy_cap,
           label = NEW.label,
           sort_order = NEW.sort_order
     WHERE rank_def_id = NEW.id
       AND (product_rate IS DISTINCT FROM NEW.product_rate
            OR group_incentive_amount IS DISTINCT FROM NEW.group_incentive_amount
            OR group_subsidy_cap IS DISTINCT FROM NEW.group_subsidy_cap
            OR label IS DISTINCT FROM NEW.label
            OR sort_order IS DISTINCT FROM NEW.sort_order);
    RETURN NULL;
END;
$$;

DROP TRIGGER comm_rank_defs_propagate ON comm_rank_defs;
CREATE TRIGGER comm_rank_defs_propagate
    AFTER UPDATE OF product_rate, group_incentive_amount, group_subsidy_cap, label, sort_order
    ON comm_rank_defs
    FOR EACH ROW EXECUTE FUNCTION comm_rank_defs_propagate();
