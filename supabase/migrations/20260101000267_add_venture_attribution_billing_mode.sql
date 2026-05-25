-- billing_mode is a Postgres ENUM. Adding 'venture_attribution' so the
-- Create Invoice / Credit Note flows can route to the Venture Pool
-- (gl_segment='corporate'), matching the 6-pool model used everywhere
-- else (Venture + Marketing + HR + Finance + Director Office + Director).
ALTER TYPE billing_mode ADD VALUE IF NOT EXISTS 'venture_attribution';
