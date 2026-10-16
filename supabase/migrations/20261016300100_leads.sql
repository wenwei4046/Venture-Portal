-- ============================================================================
-- 20261016300100_leads.sql
-- Lead View (2026-10-16): the tables behind Inbox, Leads, Insight and Settings,
-- and the functions that read and write them. Design: the Claude Design canvas
-- "Lead View" (https://claude.ai/artifact/8cZ6TsUeWX6AYETkxQudiK), approved by
-- the user ("1，2，3（中英）").
-- ============================================================================
--
-- Every table has RLS on and NO policy: nothing reads or writes them straight.
-- Every read and write is one of the lead_* functions below, SECURITY DEFINER,
-- each asking has_any_action() for its cell (mig 20261016300000):
--   leads.view     lead_config(), lead_inbox(...), lead_thread(contact),
--                  lead_list(from, to)
--   leads.create   lead_reply(contact, body), lead_simulate(...)
--   leads.edit     lead_save_card(contact, fields), lead_handoff(contact, sales),
--                  lead_set_outcome(contact, appt, shown)
--   leads.manage   lead_save_brand(id, data), lead_save_sales(id, brand, data),
--                  lead_remove_sales(id)
--
-- Meta is NOT connected yet (the user: 先把界面處理好再串接): a reply is
-- recorded, not sent, and the only way a customer's message arrives is
-- Settings › Test (lead_simulate), which marks its conversation is_test. The
-- webhook joins later through its own ingest function, as the CRM's do.
--
-- Salespeople are NOT portal users (the user: 銷售團隊不會在這個系統中) — a
-- brand's list of names and phones; handing a lead over opens WhatsApp in the
-- browser with the lead's details and records who got it.

-- ── Brands and their salespeople ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_brands (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 40),
  -- The chip's tone on every screen (Inbox, Leads, Insight).
  tone           text NOT NULL DEFAULT 'ink' CHECK (tone IN ('ink', 'clay', 'blue', 'olive', 'plum')),
  -- Filled once Meta is connected: the Page's id and the Instagram account's.
  fb_page_id     text CHECK (fb_page_id ~ '^[0-9]{5,30}$'),
  ig_account_id  text CHECK (ig_account_id ~ '^[0-9]{5,30}$'),
  -- rotate = the salesperson with the fewest leads this week is suggested; pick = Customer Service picks.
  handoff_mode   text NOT NULL DEFAULT 'rotate' CHECK (handoff_mode IN ('rotate', 'pick')),
  sort_order     integer NOT NULL DEFAULT 0,
  deleted_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lead_brands_name ON public.lead_brands (lower(name)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lead_brands_page ON public.lead_brands (fb_page_id) WHERE fb_page_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lead_brands_ig ON public.lead_brands (ig_account_id) WHERE ig_account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.lead_sales (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    uuid NOT NULL REFERENCES public.lead_brands(id),
  name        text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 60),
  -- Malaysian mobile, digits only, as typed less the country code: 0123384721.
  phone       text NOT NULL CHECK (phone ~ '^01[0-9]{8,9}$'),
  showroom    text NOT NULL DEFAULT '' CHECK (length(showroom) <= 60),
  sort_order  integer NOT NULL DEFAULT 0,
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_sales_brand ON public.lead_sales (brand_id) WHERE deleted_at IS NULL;

-- ── Conversations (one customer on one channel of one brand) ─────────────────

CREATE TABLE IF NOT EXISTS public.lead_contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        uuid NOT NULL REFERENCES public.lead_brands(id),
  channel         text NOT NULL CHECK (channel IN ('messenger', 'instagram')),
  -- Meta's id for the customer on that Page / account (PSID / IGSID); 'test:…' for Settings › Test.
  external_id     text NOT NULL CHECK (btrim(external_id) <> '' AND length(external_id) <= 80),
  is_test         boolean NOT NULL DEFAULT false,
  name            text NOT NULL DEFAULT '' CHECK (length(name) <= 80),
  -- The ad the customer came from ('' = organic).
  source_ad       text NOT NULL DEFAULT '' CHECK (length(source_ad) <= 120),
  -- The customer's phone, digits only (0123384721). detected = found in their message, not yet confirmed.
  phone           text CHECK (phone ~ '^01[0-9]{8,9}$'),
  phone_state     text NOT NULL DEFAULT 'none' CHECK (phone_state IN ('none', 'detected', 'confirmed')),
  phone_at        timestamptz,
  interest        text NOT NULL DEFAULT '' CHECK (length(interest) <= 120),
  budget          text NOT NULL DEFAULT '' CHECK (length(budget) <= 60),
  showroom        text NOT NULL DEFAULT '' CHECK (length(showroom) <= 60),
  preferred_time  text NOT NULL DEFAULT '' CHECK (length(preferred_time) <= 60),
  note            text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  -- Handed to a salesperson (who then calls from their own phone).
  handed_sales_id uuid REFERENCES public.lead_sales(id),
  handed_at       timestamptz,
  handed_by       uuid,
  handed_by_name  text,
  -- What came of it, kept by Customer Service (the salesperson is not in the system).
  appt            text NOT NULL DEFAULT 'unknown' CHECK (appt IN ('unknown', 'booked', 'not_booked')),
  shown           text NOT NULL DEFAULT 'unknown' CHECK (shown IN ('unknown', 'came', 'no_show')),
  last_at         timestamptz NOT NULL DEFAULT now(),
  -- in = the customer spoke last (waiting for a reply), out = we did.
  last_dir        text NOT NULL DEFAULT 'in' CHECK (last_dir IN ('in', 'out')),
  last_text       text NOT NULL DEFAULT '' CHECK (length(last_text) <= 200),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, channel, external_id),
  CONSTRAINT lead_contacts_phone_state CHECK ((phone IS NULL) = (phone_state = 'none')),
  CONSTRAINT lead_contacts_handed CHECK ((handed_sales_id IS NULL) = (handed_at IS NULL))
);
CREATE INDEX IF NOT EXISTS lead_contacts_last ON public.lead_contacts (last_at DESC);
CREATE INDEX IF NOT EXISTS lead_contacts_created ON public.lead_contacts (created_at);

CREATE TABLE IF NOT EXISTS public.lead_messages (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id  uuid NOT NULL REFERENCES public.lead_contacts(id),
  direction   text NOT NULL CHECK (direction IN ('in', 'out')),
  -- Who wrote it: the customer, Customer Service, the AI agent or a flow (the last two come later).
  sender      text NOT NULL CHECK (sender IN ('customer', 'cs', 'ai', 'flow')),
  by_user     uuid,
  by_name     text NOT NULL DEFAULT '',
  body        text NOT NULL CHECK (btrim(body) <> '' AND length(body) <= 2000),
  -- The phone found in a customer's message, digits only.
  phone_found text,
  -- recorded = kept here only (Meta not connected, or a test conversation); sent / failed once Meta is.
  delivery    text NOT NULL DEFAULT 'recorded' CHECK (delivery IN ('recorded', 'sent', 'failed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_messages_sender CHECK ((direction = 'in') = (sender = 'customer'))
);
CREATE INDEX IF NOT EXISTS lead_messages_contact ON public.lead_messages (contact_id, id);

-- A conversation's timeline beside its messages: came in, phone found / confirmed, handed over, outcome.
CREATE TABLE IF NOT EXISTS public.lead_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id  uuid NOT NULL REFERENCES public.lead_contacts(id),
  what        text NOT NULL CHECK (btrim(what) <> '' AND length(what) <= 200),
  actor_name  text NOT NULL,
  actor_user  uuid,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_events_contact ON public.lead_events (contact_id, at);

-- ── Locks and the audit register ─────────────────────────────────────────────

ALTER TABLE public.lead_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_brands, public.lead_sales, public.lead_contacts, public.lead_messages, public.lead_events
  FROM anon, authenticated;

SELECT public.audit_register('lead_brands', 'Lead View brands', 'Lead View', '{leads}', 'all', p_labels => '{name}');
SELECT public.audit_register('lead_sales', 'Lead View salespeople', 'Lead View', '{leads}', 'all', p_labels => '{name}');
SELECT public.audit_register('lead_contacts', 'Lead View customers', 'Lead View', '{leads}', 'all', p_labels => '{name}',
  p_omit => '{last_at,last_dir,last_text}');
SELECT public.audit_register('lead_messages', 'Lead View messages', 'Lead View', '{}', 'none',
  p_reason => 'A conversation''s messages are its record already: each says who wrote it and when.');
SELECT public.audit_register('lead_events', 'Lead View timeline', 'Lead View', '{}', 'none',
  p_reason => 'Each conversation''s own timeline, written by the lead functions beside the change (which is recorded).');

-- ── The three brands the user named (2026-10-16); more are added on Settings ─

INSERT INTO public.lead_brands (name, tone, sort_order)
SELECT v.name, v.tone, v.ord
  FROM (VALUES ('2990s', 'ink', 1), ('2990s mini', 'clay', 2), ('Carress', 'blue', 3)) AS v(name, tone, ord)
 WHERE NOT EXISTS (SELECT 1 FROM public.lead_brands b WHERE lower(b.name) = lower(v.name) AND b.deleted_at IS NULL);
