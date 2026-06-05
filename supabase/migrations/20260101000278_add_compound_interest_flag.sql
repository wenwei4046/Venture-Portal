-- Per-item opt-in for compounding interest (利滚利). Default off → existing
-- flat-interest behaviour unchanged. When true, the repayment schedule computes
-- interest on a month-by-month compounded balance (unpaid months capitalise).
alter table loans         add column if not exists compound_interest boolean not null default false;
alter table fund_sources  add column if not exists compound_interest boolean not null default false;
