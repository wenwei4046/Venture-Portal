-- ============================================================================
-- 20261015030100_attendance.sql
-- HR › Attendance (2026-10-15, the Claude Design handoff "Attendance Prototype
-- Design", `source/HR Attendance.dc.html`): the tables behind Today, Records,
-- Requests, Leave balances, Month close, Settings and Readiness, and the
-- functions that read and write them.
-- ============================================================================
--
-- Every table has RLS on and NO policy: nothing reads or writes them straight.
-- Every read and write is one of the att_* functions below, SECURITY DEFINER,
-- each asking has_any_action() for its cell (mig 20261015030000):
--   attendance.view     att_config(), att_month(month), att_requests_list(),
--                       att_ledger(year)
--   attendance.create   att_create_request(...) on somebody's behalf
--   attendance.edit     att_save_setting / att_delete_setting, att_set_days,
--                       att_clear_days, att_set_day_override, att_ledger_add,
--                       att_invalidate_punch, att_decide_day, att_close_month,
--                       att_reopen_month
--   attendance.approve  att_decide(request, approve, note) — HR's step, or the
--                       upline's on their behalf ("recorded as such")
-- A person's own (the punch button the user adds to the apps later, and the
-- requests they send from there): att_punch(...) and att_create_request with
-- their own staff id — signed in as themselves.
--
-- What a day IS (present, late, absent, on leave…) is not stored: the portal
-- works it out from the schedule, the holidays, the punches, the approved
-- leave and HR's corrections (lib/attendance/engine.ts — "TS reckons, SQL
-- writes atomically"). Stored are only the facts and HR's decisions.
--
-- Attendance starts EMPTY: no schedule, location, holiday, assignment or leave
-- type exists until HR adds it on Settings (the prototype's sample rows are
-- illustrative — README "Sample data … is illustrative"). The Employment Act's
-- minimum OT rates and one default policy are seeded, because the page shows
-- them and refuses less.

-- ── Settings: schedules, locations, holidays ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.att_schedules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 60),
  -- Seven rows, Mon..Sun: { "day": "Mon", "type": "work"|"off"|"rest", "start": "09:00", "end": "18:00", "break": 60 }
  days        jsonb NOT NULL CHECK (jsonb_typeof(days) = 'array' AND jsonb_array_length(days) = 7),
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS att_schedules_name ON public.att_schedules (lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.att_locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 80),
  address     text NOT NULL DEFAULT '' CHECK (length(address) <= 200),
  state       text NOT NULL DEFAULT '' CHECK (length(state) <= 40),
  radius_m    integer NOT NULL DEFAULT 150 CHECK (radius_m BETWEEN 20 AND 5000),
  lat         double precision,
  lng         double precision,
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.att_holidays (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day         date NOT NULL,
  name        text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 80),
  kind        text NOT NULL CHECK (kind IN ('compulsory', 'chosen', 'replacement')),
  -- 'All', 'All except Sarawak', or one state's name.
  states      text NOT NULL DEFAULT 'All' CHECK (length(states) <= 60),
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS att_holidays_day ON public.att_holidays (day) WHERE deleted_at IS NULL;

-- ── Who clocks: company default → by title → by person, effective-dated ──────

CREATE TABLE IF NOT EXISTS public.att_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level          text NOT NULL CHECK (level IN ('company', 'title', 'person')),
  title_id       uuid REFERENCES public.titles(id),
  staff_id       uuid REFERENCES public.hr_staff_costs(id),
  -- What the card says (the company's name for the default).
  label          text NOT NULL CHECK (btrim(label) <> '' AND length(label) <= 80),
  -- clock = punches; no_clock = fixed hours, no punch; off = neither (directors, Revenue).
  mode           text NOT NULL CHECK (mode IN ('clock', 'no_clock', 'off')),
  schedule_id    uuid REFERENCES public.att_schedules(id),
  location_id    uuid REFERENCES public.att_locations(id),
  anywhere       boolean NOT NULL DEFAULT false,
  ot             text CHECK (ot IN ('by_wage', 'statutory', 'none')),
  effective_from date NOT NULL,
  deleted_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT att_assignments_target CHECK (
    (level = 'company' AND title_id IS NULL AND staff_id IS NULL)
    OR (level = 'title' AND title_id IS NOT NULL AND staff_id IS NULL)
    OR (level = 'person' AND staff_id IS NOT NULL AND title_id IS NULL))
);

-- ── Leave types, OT rates, policy, approval routes ───────────────────────────

CREATE TABLE IF NOT EXISTS public.att_leave_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL CHECK (code ~ '^[A-Z]{2}$'),
  name        text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 60),
  -- Entitlement groups, first match wins:
  -- [{ "titles": ["all"] | [title_id…], "levels": ["all"] | [rank…], "base": 8, "steps": [{ "yrs": 2, "days": 12 }] }]
  groups      jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(groups) = 'array'),
  rules       text NOT NULL DEFAULT '' CHECK (length(rules) <= 300),
  route       text NOT NULL DEFAULT 'upline_only' CHECK (route IN ('upline_only', 'hr_only', 'upline_then_hr')),
  counts      text NOT NULL DEFAULT 'working' CHECK (counts IN ('working', 'calendar')),
  -- AL is earned month by month; the rest are granted on 1 January.
  accrues     boolean NOT NULL DEFAULT false,
  -- No balance at all (Unpaid): to payroll as unpaid days.
  unpaid      boolean NOT NULL DEFAULT false,
  -- Taken from another type's balance (Emergency → AL).
  draws_from  text CHECK (draws_from ~ '^[A-Z]{2}$'),
  sort_order  integer NOT NULL DEFAULT 0,
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS att_leave_types_code ON public.att_leave_types (code) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.att_ot_rates (
  day_type    text PRIMARY KEY CHECK (day_type IN ('work', 'off', 'rest', 'ph')),
  multiplier  numeric(4,2) NOT NULL,
  minimum     numeric(4,2) NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT att_ot_rates_not_below CHECK (multiplier >= minimum)
);

-- Versioned: a change applies from a date, never backwards.
CREATE TABLE IF NOT EXISTS public.att_policy (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from         date NOT NULL UNIQUE,
  fence_mode             text NOT NULL DEFAULT 'flag' CHECK (fence_mode IN ('flag', 'refuse')),
  photo_required         boolean NOT NULL DEFAULT true,
  earliest_in_min        integer NOT NULL DEFAULT 120 CHECK (earliest_in_min BETWEEN 0 AND 600),
  cutover                text NOT NULL DEFAULT '04:00' CHECK (cutover ~ '^0[0-6]:[03]0$'),
  grace_min              integer NOT NULL DEFAULT 5 CHECK (grace_min BETWEEN 0 AND 120),
  corrections_per_month  integer NOT NULL DEFAULT 3 CHECK (corrections_per_month BETWEEN 0 AND 31),
  ot_warn_h              integer NOT NULL DEFAULT 80,
  ot_flag_h              integer NOT NULL DEFAULT 104,
  ot_base                text NOT NULL DEFAULT 'basic' CHECK (ot_base IN ('basic', 'fixed')),
  photo_keep_days        integer NOT NULL DEFAULT 90 CHECK (photo_keep_days BETWEEN 1 AND 3650),
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid DEFAULT auth.uid()
);

-- Approval routes per request type (company), overridden by title.
CREATE TABLE IF NOT EXISTS public.att_routes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       text NOT NULL CHECK (scope IN ('company', 'title')),
  -- Request kinds this row covers: leave codes (AL, SL…), 'OT', 'CR' (correction), 'PF' (profile), or '*'.
  kinds       text[] NOT NULL,
  label       text NOT NULL CHECK (btrim(label) <> '' AND length(label) <= 120),
  title_id    uuid REFERENCES public.titles(id),
  route       text NOT NULL CHECK (route IN ('upline_only', 'hr_only', 'upline_then_hr')),
  why         text NOT NULL DEFAULT '' CHECK (length(why) <= 160),
  sort_order  integer NOT NULL DEFAULT 0,
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── The facts: punches, HR's corrections, whole days ────────────────────────

CREATE TABLE IF NOT EXISTS public.att_punches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id       uuid NOT NULL REFERENCES public.hr_staff_costs(id),
  at             timestamptz NOT NULL DEFAULT now(),
  -- The work day it belongs to (a punch before the cutover is the previous day's).
  work_day       date NOT NULL,
  direction      text NOT NULL CHECK (direction IN ('in', 'out')),
  source         text NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'web', 'hr')),
  lat            double precision,
  lng            double precision,
  accuracy_m     integer,
  location_id    uuid REFERENCES public.att_locations(id),
  distance_m     integer,
  inside_fence   boolean,
  device         text NOT NULL DEFAULT '' CHECK (length(device) <= 120),
  photo_path     text,
  -- Why the person punched outside every fence (asked by the app).
  reason         text NOT NULL DEFAULT '' CHECK (length(reason) <= 200),
  invalid_at     timestamptz,
  invalid_by     uuid,
  invalid_reason text NOT NULL DEFAULT '',
  created_by     uuid DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS att_punches_day ON public.att_punches (work_day, staff_id);

-- One person, one day, set by HR (Records, the calendar): wins over everything.
CREATE TABLE IF NOT EXISTS public.att_day_marks (
  staff_id    uuid NOT NULL REFERENCES public.hr_staff_costs(id),
  day         date NOT NULL,
  -- P L A I H SO W, or a leave code (AL, SL…).
  code        text NOT NULL CHECK (code ~ '^[A-Z]{1,2}$'),
  in_time     text CHECK (in_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  out_time    text CHECK (out_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  note        text NOT NULL CHECK (btrim(note) <> '' AND length(note) <= 300),
  by_user     uuid DEFAULT auth.uid(),
  by_name     text NOT NULL,
  at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, day)
);
CREATE INDEX IF NOT EXISTS att_day_marks_day ON public.att_day_marks (day);

-- A whole day for everyone (right-click a date): Public holiday, Company holiday, Special off, or a Working day.
CREATE TABLE IF NOT EXISTS public.att_day_overrides (
  day         date PRIMARY KEY,
  code        text NOT NULL CHECK (code IN ('H', 'CH', 'SO', 'WD')),
  name        text NOT NULL DEFAULT '' CHECK (length(name) <= 80),
  by_user     uuid DEFAULT auth.uid(),
  by_name     text NOT NULL,
  at          timestamptz NOT NULL DEFAULT now()
);

-- ── Requests and their approval steps ───────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.att_request_seq START 1;

CREATE TABLE IF NOT EXISTS public.att_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- LV-2610-009 / OT-… / CR-… / PF-…: the reference people read out.
  ref             text NOT NULL UNIQUE,
  staff_id        uuid NOT NULL REFERENCES public.hr_staff_costs(id),
  kind            text NOT NULL CHECK (kind IN ('leave', 'ot', 'correction', 'profile')),
  leave_code      text CHECK (leave_code ~ '^[A-Z]{2}$'),
  date_from       date,
  date_to         date,
  days            numeric(6,2),
  hours           numeric(6,2),
  -- OT: { "dayType": "off", "from": "18:00", "to": "21:00" }; correction: { "punch": "out", "at": "18:04" };
  -- profile: { "changes": [{ "field": "Mobile", "from": "…", "to": "…" }] }
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason          text NOT NULL DEFAULT '' CHECK (length(reason) <= 300),
  attachment_path text,
  attachment_name text,
  route           text NOT NULL CHECK (route IN ('upline_only', 'hr_only', 'upline_then_hr')),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  -- HR sent it for them (+ On someone's behalf, Use leave).
  on_behalf       boolean NOT NULL DEFAULT false,
  created_by      uuid DEFAULT auth.uid(),
  created_by_name text NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz,
  CONSTRAINT att_requests_leave CHECK (kind <> 'leave' OR (leave_code IS NOT NULL AND date_from IS NOT NULL AND date_to IS NOT NULL AND date_to >= date_from))
);
CREATE INDEX IF NOT EXISTS att_requests_staff ON public.att_requests (staff_id, date_from);
CREATE INDEX IF NOT EXISTS att_requests_open ON public.att_requests (status) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.att_request_steps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        uuid NOT NULL REFERENCES public.att_requests(id) ON DELETE CASCADE,
  seq               integer NOT NULL,
  role              text NOT NULL CHECK (role IN ('upline', 'hr')),
  -- The upline is stored on the step when the request is sent.
  approver_staff_id uuid REFERENCES public.hr_staff_costs(id),
  approver_name     text NOT NULL,
  state             text NOT NULL CHECK (state IN ('waiting', 'queued', 'approved', 'rejected', 'skipped')),
  decided_by        uuid,
  decided_by_name   text,
  on_behalf         boolean NOT NULL DEFAULT false,
  note              text NOT NULL DEFAULT '',
  arrived_at        timestamptz,
  decided_at        timestamptz,
  UNIQUE (request_id, seq)
);

-- ── Leave ledger (what is stored: openings and HR's adjustments) ────────────
-- Entitlement, monthly accrual and what approved requests and HR's marks used
-- are reckoned from the leave types, the requests and the marks.

CREATE TABLE IF NOT EXISTS public.att_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref         text NOT NULL UNIQUE,
  staff_id    uuid NOT NULL REFERENCES public.hr_staff_costs(id),
  leave_code  text NOT NULL CHECK (leave_code ~ '^[A-Z]{2}$'),
  year        integer NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  kind        text NOT NULL CHECK (kind IN ('opening', 'adjust')),
  days        numeric(6,2) NOT NULL,
  entry_date  date NOT NULL,
  note        text NOT NULL CHECK (btrim(note) <> '' AND length(note) <= 300),
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  by_user     uuid DEFAULT auth.uid(),
  by_name     text NOT NULL,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS att_ledger_staff ON public.att_ledger (staff_id, year, leave_code);

-- ── Month close ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.att_day_decisions (
  staff_id    uuid NOT NULL REFERENCES public.hr_staff_costs(id),
  day         date NOT NULL,
  decision    text NOT NULL CHECK (decision IN ('Unpaid', 'Excused', 'Corrected')),
  by_user     uuid DEFAULT auth.uid(),
  by_name     text NOT NULL,
  at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, day)
);

CREATE TABLE IF NOT EXISTS public.att_months (
  month          date PRIMARY KEY CHECK (extract(day FROM month) = 1),
  status         text NOT NULL CHECK (status IN ('open', 'closed')),
  people         integer,
  -- The register as frozen on close: one row per person (days, late, leave, absent, unpaid, OT).
  register       jsonb,
  closed_at      timestamptz,
  closed_by      uuid,
  closed_by_name text,
  reopened_at    timestamptz,
  reopen_reason  text
);

-- ── Every entity's trail (the drawers' Audit trail) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.att_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity      text NOT NULL CHECK (entity IN ('request', 'ledger', 'mark', 'day', 'punch', 'month', 'setting')),
  entity_key  text NOT NULL,
  staff_id    uuid,
  what        text NOT NULL,
  actor_name  text NOT NULL,
  actor_user  uuid,
  note        text NOT NULL DEFAULT '',
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS att_events_entity ON public.att_events (entity, entity_key, at);

-- ── Locks and the audit register ─────────────────────────────────────────────

ALTER TABLE public.att_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_ot_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_punches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_day_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_day_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_request_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_day_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.att_schedules, public.att_locations, public.att_holidays, public.att_assignments,
  public.att_leave_types, public.att_ot_rates, public.att_policy, public.att_routes, public.att_punches,
  public.att_day_marks, public.att_day_overrides, public.att_requests, public.att_request_steps,
  public.att_ledger, public.att_day_decisions, public.att_months, public.att_events FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.att_request_seq FROM anon, authenticated;

SELECT public.audit_register('att_schedules', 'Attendance schedules', 'Settings', '{attendance}', 'all', p_labels => '{name}');
SELECT public.audit_register('att_locations', 'Attendance locations', 'Settings', '{attendance}', 'all', p_labels => '{name}');
SELECT public.audit_register('att_holidays', 'Public holidays', 'Settings', '{attendance}', 'all', p_labels => '{name,day}');
SELECT public.audit_register('att_assignments', 'Who clocks', 'Settings', '{attendance}', 'all', p_labels => '{label}');
SELECT public.audit_register('att_leave_types', 'Leave types', 'Settings', '{attendance}', 'all', p_labels => '{code,name}');
SELECT public.audit_register('att_ot_rates', 'OT rates', 'Settings', '{attendance}', 'all', p_labels => '{day_type}');
SELECT public.audit_register('att_policy', 'Clock-in policy', 'Settings', '{attendance}', 'all', p_labels => '{effective_from}');
SELECT public.audit_register('att_routes', 'Approval routes', 'Settings', '{attendance}', 'all', p_labels => '{label}');
SELECT public.audit_register('att_punches', 'Punches', 'People', '{attendance}', 'all', p_labels => '{work_day,direction}');
SELECT public.audit_register('att_day_marks', 'Attendance corrections', 'People', '{attendance}', 'all', p_labels => '{day,code}');
SELECT public.audit_register('att_day_overrides', 'Whole days', 'People', '{attendance}', 'all', p_labels => '{day,code}');
SELECT public.audit_register('att_requests', 'Attendance requests', 'People', '{attendance}', 'all', p_labels => '{ref}');
SELECT public.audit_register('att_request_steps', 'Attendance request steps', 'People', '{attendance}', 'all', p_labels => '{role,state}');
SELECT public.audit_register('att_ledger', 'Leave ledger', 'People', '{attendance}', 'all', p_labels => '{ref,leave_code}');
SELECT public.audit_register('att_day_decisions', 'Month close decisions', 'People', '{attendance}', 'all', p_labels => '{day,decision}');
SELECT public.audit_register('att_months', 'Attendance months', 'People', '{attendance}', 'all', p_labels => '{month,status}');
SELECT public.audit_register('att_events', 'Attendance trail', 'People', '{}', 'none',
  p_reason => 'Each request''s, entry''s and day''s own trail, written by the attendance functions beside the change (which is recorded).');

-- ── Seeds: the Act's minimum OT rates and a first policy ────────────────────

INSERT INTO public.att_ot_rates (day_type, multiplier, minimum) VALUES
  ('work', 1.5, 1.5), ('off', 1.5, 1.5), ('rest', 2, 2), ('ph', 3, 3)
ON CONFLICT (day_type) DO NOTHING;

INSERT INTO public.att_policy (effective_from) VALUES ('2026-11-01') ON CONFLICT (effective_from) DO NOTHING;

