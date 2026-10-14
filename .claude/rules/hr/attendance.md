---
paths:
  - "src/app/*/attendance/**"
  - "src/lib/attendance/**"
  - "src/components/ds/**"
  - "supabase/migrations/*attendance*"
  - "tests/member-sql/validate-attendance.mjs"
---

# HR tab — Attendance (Today, Records, Requests, Leave balances, Month close, Settings, Readiness)

Read this before changing anything it covers, and again in every full scan of such a change (CLAUDE.md › Rules by tab). New decisions are added here, dated.

**THE MODULE (2026-10-15, the Claude Design handoff "Attendance Prototype Design" — `design_handoff_hr_portal`, README + `source/HR Attendance.dc.html`; the user: "做出 100% 一样的页面 … help me link the backend as well"):** seven pages under `/attendance/*`, HR's sidebar section II (olive), one HR-view tab each (`hr.att_today` … `hr.att_ready`, `lib/permission-tabs.ts`, page registry reseeded by mig `20261015030300`). One function `attendance` (View · Create · Edit · Approve, reach all; key `attendance`, scope none; the Principal, HR and the Ultimate / Full / HR templates hold it — mig `20261015030000`).

**THE DATA (migs `20261015030100` tables, `030200` functions):** 17 `att_*` tables, RLS on and NO policy — every read and write is an `att_*` SECURITY DEFINER function asking `has_any_action(attendance.*)` (readers `att_config`, `att_month`, `att_requests_list`, `att_ledger`; writers listed in the migration's head). What a DAY is (P / L / A / I / leave / H / W / `·`) is never stored: `lib/attendance/engine.ts` reckons it from who clocks (Settings › Who clocks: person → title → company, latest `from` within each), the schedule, the holidays and whole-day overrides, approved / waiting leave, the punches and HR's corrections (`att_day_marks`, which win). Stored are the facts and HR's decisions. Balances: entitlement from the leave type's groups (first match by title + level, service steps by whole years from `hire_date`), AL-like types accrue monthly (`accrues`), the rest granted on 1 January; used = approved leave requests + leave codes set in Records; openings and adjustments are `att_ledger` rows with a reason. Attendance starts EMPTY — HR sets it up on Settings; the Act's OT minimums and a first policy (from 2026-11-01) are seeded. `att_months` freezes a month (the register the page reckoned); a closed month refuses corrections until reopened with a reason.

**PUNCHING (the user, 2026-10-15):** the punch button is the user's to add — in the Revenue app, the HR app, and later the Marketing and Finance apps. The portal only keeps the backend ready: `att_punch(direction, lat, lng, accuracy, device, photo_path, reason, source)` punches for the caller's own staff record (cutover → work day, nearest fence → inside / distance, refused outside only when the policy says Refuse). Do not build a punch UI unasked.

**REQUESTS:** a request takes its route when sent (title override → company row → the leave type's own); the upline is stored on the step then, and an upline without a login falls back to HR. HR (Attendance · Approve) decides HR's step, or the upline's on their behalf — recorded as such; the upline decides their own step signed in as themselves; nobody decides their own request; rejecting needs a note. Leave balances › Use leave books leave approved on the spot (`p_booked`).

**THE LOOK:** the design system's core components live in `components/ds` (Button, Field / TextField / Textarea / DsSelect, SegmentedControl, Switch, StatusChip, DescriptionList, DataTable, ListItem, Card, Banner, Sheet / SidePanel / CenterWindow / Toast), ported value for value from the handoff's `_ds_bundle.js`; page pieces in `attendance/_components/bits.tsx`. Compare with the standalone prototype at a **1600×1000** viewport — at 1440×900 its stage scales to 0.947. No page subtitle, no "drag / click here" hint lines (DESIGN.md › No descriptions on the page), though the prototype draws them.
