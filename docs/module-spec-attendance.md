# Attendance — photo clock-in, leave, OT, approvals and the payroll hook

**Status:** design, nothing built. Written 2026-10-14.
**Owner:** Principal. **Runs it:** HR. **Used by:** every employee who clocks, and their uplines.
**Asked for (the user, 2026-10-14):** 拍照打卡，同时即时记录打卡时间；leave management（假别 + 总共几天）；
能设置 OT 以及 OT rate；可以设定谁不需要打卡；打卡时间跟职位设定，或者跟人设定；审批可选 upline → HR、
直接 HR、或只要 upline 批；背后要能接 payroll。

**DOCUMENTED** marks a figure taken from this repo's own records, named with its date — nothing in this
spec was read off production. Statutory rules are cited in §14. Everything else is a proposal; §13 lists
what the user decides.

---

## 0. Everything that has to be set

| # | What | Set by | When | Default this spec assumes |
|---|---|---|---|---|
| A | Who clocks — `clock` / `no_clock` / `off` (§2) | HR | once; then on every hire | salaried staff `clock`; Director and Revenue `off` |
| B | Work schedules, and who follows which (§3.3) | HR | once; then on change | one *Office 9–6, Mon–Fri* for everybody; titles, then people, override |
| C | Clock-in policy — photo, GPS, grace, window, corrections, retention (§3.2) | Principal | once | live selfie + server time + GPS that flags, never refuses; 5 min grace; 3 corrections a month; photos kept 90 days |
| D | Work locations and their fences (§3.4) | HR | once; then per site | HQ, 150 m |
| E | Public holidays, by state (§3.5) | HR | every December | the 5 compulsory + 6 chosen |
| F | Leave types, entitlements, carry-forward, **opening balances** (§3.6) | HR | once; balances at go-live | the Employment Act's minimums + Compassionate, Marriage, Emergency |
| G | OT — who is eligible, the rates, how it is asked for, the caps (§3.7) | Principal + HR | once; then per person | the Act's minimum rates; OT asked for BEFORE it is worked |
| H | Approval route per request type, title or person (§3.8) | Principal | once | §3.8's table |
| I | Month close, and which engine pays (§7) | Principal | once | closed by the 3rd; InfoTech keeps computing pay until two months match |

Every person-level setting (A, B, D, G, H) resolves the same way: **person → title → company** (§3.1).

---

## 1. What the portal already has — and what it lacks

**Reuse:**

| Need | Already there |
|---|---|
| The person | `hr_staff_costs` — the person master for every department |
| Their position | `titles` (`department_id`, `level_id`, `is_department_head`, `template_id`) |
| Their upline | `hr_staff_costs.reports_to` — one line manager, company-wide, no cycles; **current state only, no history** (mig `20260901030000`) |
| Their login | `hr_staff_costs.user_id` — NULL = "on the payroll but cannot sign in — the normal state for most staff" (mig `20260901020000`, line 83) |
| Payroll's inputs | `hr_monthly_payroll.ot_hours`, `ot_amount` (RM), `unpaid_leave_days` — all decimals, so half days fit (mig `20260101000122`) |
| Bell and phone push | `app_notifications`, `notify_people()` / `notify_topic()`, the outbox → web push (mig `20261011180000`) |
| A private photo | a private bucket with an own-folder INSERT policy (`member-invoices`); a byte-checked Server Action upload (`verifiedUpload`, `src/lib/member/server.ts`); a phone-side resize (`prepareImage`, `src/components/member/crm/shared/image-prep.ts`) |
| The office's day | `src/lib/office-time.ts`; `(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date` in SQL |
| An hourly job | Vercel cron → `/api/member-queue` (`vercel.json`) |
| Permissions, audit, tabs | templates × cells, `has_any_action`, `audit_register`, `PAGE_TABS` (`.claude/rules/portal-wide/permissions.md`) |

**Missing:** schedules, punches, a holiday calendar, leave types / balances / requests, OT rules, and a
multi-step approval.

**Not to be reused:**
- `approval_requests` — one decider per row, a company-wide domain holder (Treasury, HR Costing, Director
  Salary): the Principal's money queue. It cannot say "this requester's upline, then HR", and leave would
  bury the vouchers.
- `member_requests` — the Revenue team's only: `member_staff_id()` refuses anybody outside a
  `payroll_source = 'commission'` department; HR decides it in one step.
- `comm_hierarchy` — the commission line, which is money. Inside a commission department it is derived
  from `reports_to` (trigger `hr_staff_costs_one_line_sync`, `.claude/rules/revenue/comm-cal.md` › ONE
  LINE); this module reads `reports_to` only, and never writes either.

---

## 2. Who clocks

**DOCUMENTED** (`docs/module-spec-payroll-cycles.md`, 2026-09-16) — who is paid today:

| Track | People | Default mode |
|---|---:|---|
| Marketing 13, HR 6, Finance 5, IT 2, Director Office 1 (InfoTech) | 27 | `clock` |
| Director (the board, incl. the CEO) | 4 | `off` |
| Revenue (commission) | 31 | `off` — Fair may become `no_clock` once the Revenue app has a Leave page (§12); IR stays `off` |

| Mode | Punches | Leave in the system | OT | For |
|---|---|---|---|---|
| `clock` | yes | yes | by eligibility (§3.7) | salaried staff |
| `no_clock` | no — a work day counts as present unless on leave | yes | claimed by hand | senior or field roles |
| `off` | no | no | no | not in the module: contractors (always), the board (by choice) |

**Contractors must be `off`.** The IR team moved to a true Contract for Service in September 2026. Fixed
hours, clocking in and asking for leave are an employer's control — exactly what makes a "contractor" an
employee. Putting them on the clock would build that evidence day by day.

**A personal login is a prerequisite.** A selfie and a decision both need a person. The shared accounts
(principal@, finance@, hr@, marketing@ — no staff row) can neither clock nor approve. **DOCUMENTED**
(`.claude/rules/portal-wide/permissions.md` › CHANGE PASSWORD, 2026-10-12): the portal had two personal
logins. Go-live is People › Invite user for every `clock` person, every upline and every HR approver —
about 30 — each on a title whose template holds the self-service cells (§10).

**The subsidiaries are out of Phase 1.** The roster has no company column (a company is only a person's
monthly cost split, `hr_staff_allocation`), and the documented payroll above covers only HV's own
departments — the subsidiaries' factory and outlet staff are not on it. Bringing them in needs a company on
the person, a kiosk for people without a phone or a login (§12), and rules per jurisdiction — CMI is in
Indonesia, and Sabah and Sarawak have Labour Ordinances of their own.

---

## 3. The settings

### 3.1 Person → title → company

The shape the user asked for ("跟着职位设定 … 或者是跟着人来定"), used for every person-level setting:
1. a **person** assignment covering the date; else
2. their **title**'s; else
3. the **company** default.

Assignments are effective-dated (`effective_from`) and never edited in place: moving somebody to a new
schedule from 1 November must not rewrite October's lateness. (`reports_to` keeps no history — which is why
a request stores its upline when it is sent, §3.8.)

Resolved this way: the mode (§2), the schedule (§3.3), the allowed locations (§3.4), OT eligibility
(§3.7), the approval route (§3.8).

### 3.2 The company policy

One row, versioned (a change applies from a date).

| Setting | Default | Why |
|---|---|---|
| Photo | required, live camera only | §4 |
| GPS | recorded; outside every fence → **flagged**, never refused | refusing strands somebody at a client or a fair; a flag puts it in front of HR |
| Reason outside a fence | required | |
| Grace | 5 min | once passed, lateness counts from the scheduled start |
| Earliest IN | 120 min before the start | stops a punch the night before |
| Day cutover | 04:00 | a punch before it belongs to the previous work day (late shifts) |
| Corrections (补卡) | 3 a month, then HR only | |
| Photo kept | 90 days | PDPA: no longer than the purpose needs (§11); the punch itself is kept seven years |
| Probation | 3 months | a leave type may be closed during it |
| Leave year | calendar | |
| Month closed by | the 3rd | Employment Regulations 1957 reg 5 (§7.4) |
| Absence alert | after 2 consecutive work days | EA s.15(2) — HR is told; the system decides nothing |
| OT rounding | down to 30 min, 30 min minimum | |
| OT a month | warn at 80 h, flag above 104 h | Employment (Limitation of Overtime Work) Regulations 1980 |
| A day in total | 12 h | a request that would pass it is refused (company guard rail) |
| ORP divisor | 26 | EA: monthly rate ÷ 26 |
| OT base | basic only, or basic + fixed allowances | §13 — match what InfoTech does today |
| Statutory OT ceiling | RM 4,000 | EA First Schedule |
| Lateness and pay | none | §3.9 |

### 3.3 Schedules

A schedule = a name + seven weekday rows:

| Field | *Office 9–6* |
|---|---|
| Day type | Mon–Fri `work`, Sat `off`, Sun `rest` |
| Start / end | 09:00 / 18:00 |
| Break | 60 min, unpaid, not punched |
| Normal hours | worked out: end − start − break = 8 h |
| Flexible start | optional — e.g. start any time 08:00–10:00, then the normal hours from the first punch |

The **day type** decides two things — whether a leave day counts, and which OT rate applies (§3.7):
- `work` — a normal day;
- `off` — the second free day of a five-day week. The Act knows no "off day"; the usual reading is that
  every hour worked on it is outside normal hours, so OT;
- `rest` — the weekly rest day (EA s.59), with rest-day rates;
- `holiday` — never on a schedule; it comes from the calendar (§3.5).

On save, warnings (never a refusal): more than 8 normal hours a day (9 when another day is shorter), more
than 45 a week, a spread-over beyond 10 h, more than 5 h without a 30-minute break, no rest day in the week.

Rosters — outlets and shift work, published before the month — are Phase 2.

### 3.4 Work locations

`att_locations`: name, address, **state** (for the holiday calendar), lat / lng, radius (150 m), active. A
person's allowed locations resolve as §3.1 (title *Marketing Executive* → HQ). "Anywhere" is a choice for
field roles: the position is recorded, never flagged.

### 3.5 Public holidays

EA s.60D: eleven paid public holidays a year — five compulsory (National Day, Malaysia Day, Labour Day, the
Agong's birthday, the Ruler's or Yang di-Pertua Negeri's birthday / Federal Territory Day) and six the
employer picks, the list published before the year starts — plus every day gazetted under the Holidays Act
s.8. A holiday on a rest day makes the next working day a paid holiday.

`att_holidays`: date, name, kind (`compulsory` · `chosen` · `gazetted` · `replacement`), the states it
applies in (the Ruler's birthday differs by state). HR's December job: pick next year's six — the page
refuses a year without the five. A holiday inside a leave request is not counted as leave.

### 3.6 Leave

Each leave type:

| Field | Meaning |
|---|---|
| Paid | unpaid days go to payroll's `unpaid_leave_days` |
| Entitlement | fixed, or bands by completed years of service |
| Accrual | `monthly` (earned per completed month) or `upfront` |
| Counts | `working_days` (skips off, rest, holidays) or `calendar_days` (consecutive) |
| Half day | allowed? |
| Notice | at least N days ahead (AL: 3) |
| Back-dating | up to N days after (SL: 2 — the 48-hour rule) |
| Attachment | required? (SL, HL: the certificate) |
| Most per request | ML 98, PL 7 |
| During probation | allowed? |
| Carry-forward | most days, and the date they lapse (AL: 5, 31 Mar) |
| Paid out on leaving | AL: yes (the law) |
| Eligibility | checked by HR (ML, PL) — no gender or marital field is added to the roster |
| Approval route | §3.8 |

**The Act's minimums** (Peninsular Malaysia; seeded; HR may raise them, never lower them):

| Type | Minimum | Rules |
|---|---|---|
| Annual (AL) | 8 / 12 / 16 days — under 2 years / 2 to under 5 / 5 and over | not taken within 12 months after the year → forfeited, unless the employer stopped it (then paid in lieu); unused on leaving → paid |
| Sick (SL) | 14 / 18 / 22 days — same bands | a registered doctor's or dentist's certificate; the employer told within 48 hours, else absent without leave |
| Hospitalisation (HL) | 60 days a year | **on top of** SL since 1 Jan 2023 (the 2022 amendment deleted the 60-day aggregate cap) |
| Maternity (ML) | 98 consecutive days | rest days and holidays inside count; paid when ≥ 90 days' service in the 9 months before and fewer than 5 living children |
| Paternity (PL) | 7 consecutive days | married; ≥ 12 months' service; told ≥ 30 days before the expected birth or as soon as possible after; 5 births at most |
| Unpaid (UL) | — | to payroll |

**Company types** (the user's choice): Compassionate, Marriage, Emergency (taken from AL), and Replacement
leave — time off instead of OT pay, only for people NOT on statutory OT (§3.7).

**AL accrues monthly.** Granted up front, somebody can take the year's twelve days in March and resign in
April — and taking the excess back out of the final pay is a deduction EA s.24 does not allow without the
employee's written request. Earned month by month, it cannot happen. (An "advance" of N days is a setting,
default 0.)

**Balances are a ledger** (`leave_ledger`): every accrual, use, cancellation, adjustment, carry-forward,
lapse and pay-out is a row with who and why; a balance is their sum. Go-live needs an **opening balance**
per person per type — what each has already used this leave year, from InfoTech or HR's records — or every
balance is wrong on day one. Starting the system's leave year on 1 Jan 2027 shrinks that to carry-forwards.

### 3.7 OT

**Eligibility**, per person (§3.1) — suggested by the system from the monthly wage, confirmed by HR:

| | Who | Rates |
|---|---|---|
| `statutory` | wages ≤ RM 4,000 a month, OR — at any wage — manual labour, supervising manual labour, drivers, vessel crew (EA First Schedule) | at least the Act's (below); the page refuses less |
| `contract` | above RM 4,000 with OT in their contract | the company's (default: the same table) |
| `none` | managers and the like | no OT pay; Replacement leave if the policy allows |

**Rates** — monthly-rated, seeded at the Act's minimum:

| Day | Hours within normal hours | Hours beyond normal hours |
|---|---|---|
| Work day | — | 1.5 × HRP |
| Off day | 1.5 × HRP — none of it is normal hours | 1.5 × HRP |
| Rest day | up to half the normal hours: ½ day's ORP · more than half: 1 day's ORP | 2 × HRP |
| Public holiday | 2 days' ORP, on top of the holiday pay already in the salary | 3 × HRP |

ORP (ordinary rate of pay) = monthly rate ÷ 26. HRP (hourly rate of pay) = ORP ÷ normal hours a day, from
the schedule.

*Worked: RM 3,000 a month, 8-hour day.* ORP RM 115.38, HRP RM 14.42. Work-day OT RM 21.63 an hour. Rest
day: 4 h RM 57.69, 8 h RM 115.38, beyond RM 28.85 an hour. Public holiday: 8 h RM 230.77, beyond RM 43.27 an
hour. **The 104-hour month is worth RM 2,250 — 75 % of the salary.** That is why OT is asked for first.

**How OT happens:**
1. **Asked for first** (default): the employee, or their upline for them, asks for OT on a date — planned
   hours, reason — and it follows its route (§3.8).
2. **Paid** = the smaller of what was approved and what was punched past the scheduled end, rounded down to
   30 min. On a rest day or a holiday the punched hours are split at the normal hours.
3. **Unapproved extra time** is shown, never paid: *2 h past 18:00 — claim OT?* → a request after the fact,
   same route.
4. **Caps:** warn at 80 h a month; flag above 104 h (rest-day and holiday work do not count towards it);
   refuse a request that would make the day longer than 12 h.
5. A `no_clock` person claims hours by hand — there are no punches to measure.

### 3.8 Approval routes

The user's three:

| Route | Steps |
|---|---|
| `upline_then_hr` | upline → HR |
| `hr_only` | HR |
| `upline_only` | upline |

Set per **request type** — each leave type, OT, a correction — and overridable by **title**, then
**person** (§3.1): "department heads `hr_only` for everything" is one title row.

**Defaults:**

| Request | Route | Why |
|---|---|---|
| AL, Compassionate, Marriage, Emergency, Replacement | `upline_only` | the upline knows the workload; HR sees everything anyway |
| SL, HL | `hr_only` | HR checks the certificate; the upline is told |
| UL, ML, PL | `upline_then_hr` | pay, and eligibility |
| OT | `upline_then_hr` | money |
| Correction (补卡) | `upline_only` | the upline knows whether they were there |

**Who decides:**
- **Upline** = `reports_to` when the request is sent, **stored on the step** — a reorganisation must not
  move a decision already on its way.
- **HR** = any personal login holding Attendance · Approve (All).

**The rules around them:**
1. **No usable upline → HR.** Usable = set, active, holding a personal login whose template gives
   Attendance · Approve (Own) (§10), not the requester. (A Revenue
   team leader under a Revenue Director has `reports_to` NULL — the director line is derived — and falls
   back the same way.)
2. **Never your own.** The requester decides no step of their own request. An HR person's own HR step goes
   to another HR approver — and to the Principal when there is none.
3. A **rejection** at any step ends the request; it needs a note.
4. **Every step notifies:** the decider when it arrives (bell + push), the requester at each decision.
5. **Waiting:** after 24 h the requester may nudge. Automatic reminders, and passing a step to the upline's
   upline after 48 h, are Phase 2 (they need the hourly job). Nothing is ever approved by itself.
6. **Cancelling:** freely before the start date (approved leave goes back to the balance; the deciders are
   told); after it, only HR.
7. HR may decide a waiting upline step **on the upline's behalf** (an upline away) — recorded as such.

### 3.9 Lateness is recorded, not deducted

EA s.24 lists the only deductions an employer may make; a lateness fine is not one (the Human Resources
Minister, Feb 2024). Phase 1 records late and early minutes, shows them to HR and the upline, and counts
repeats for the disciplinary process. A money lever, if wanted later: an **attendance allowance** written
into the contract and not earned in a month with lateness — an allowance not earned is not a deduction.
Phase 2, and the contracts first.

---

## 4. The punch

1. **The camera opens live** — the front camera through `getUserMedia`; there is no gallery path. (Fallback
   `<input type="file" capture="user">` where a browser refuses.)
2. **The frame is shrunk on the phone** — ≤ 720 px, JPEG ≈ 0.7, ~60–120 KB (`prepareImage` does the same at
   1,600 px today).
3. **The position** — `getCurrentPosition({ enableHighAccuracy: true, timeout: 10 s, maximumAge: 0 })`:
   latitude, longitude, accuracy; or "refused".
4. **One Server Action**, `punch`: checks the JPEG's bytes (as `verifiedUpload`), uploads it under the
   person's own session to `attendance-photos/<user id>/<YYYY-MM>/<uuid>.jpg` (an own-folder INSERT policy,
   as `member-invoices`), then calls `att_punch(kind, path, lat, lng, accuracy, reason)`.
5. **`att_punch`** (DEFINER) **stamps `now()` — that is the time; the phone's clock is never read** —
   checks the earliest-IN window, finds the nearest allowed location and the distance, sets the flags, and
   answers what the screen shows: *IN 08:57 · HQ · on time*.

**Flags** — shown, never decided silently: outside every fence; no position; accuracy worse than 100 m; the
same photo as before (sha256); a second device the same day; a punch from a computer. HR may mark a punch
invalid, with a reason (audited).

**No face matching in Phase 1.** Without it a selfie is ordinary personal data. Matched by software, it
becomes biometric data — sensitive personal data since the 2024 PDPA amendment — which needs explicit
consent (§11).

**Offline** = no punch (the service worker keeps only `offline.html`, by rule); the person files a
correction.

**Who sees a photo:** the person and HR (Attendance · View, All). An upline sees times, place and flags — not
faces. Photos open through a link made at the click (300 s), as Documentation's files do.

---

## 5. A day's status

One set-returning SQL function over people × a date range (`att_day_status(p_staff, p_from, p_to)`) — never
called once per person or per day (CLAUDE.md › Navigation speed: a SQL function must not call another per
row). Read live until the month closes, then frozen into `att_days`. No job runs to keep it.

- **From:** the mode, schedule and locations in force that day; the holidays of their location's state;
  approved leave; the punches (first IN, last OUT, by work day, with the 04:00 cutover); approved
  corrections; approved OT.
- **Status:** `present` · `late` · `early_out` · `late_early` · `incomplete` (no OUT) · `absent` (a work day,
  no punch, no leave) · `leave` / `half_leave` · `off` · `rest` · `holiday` · `not_required` (`no_clock`,
  `off`).
- **Minutes:** late (from the scheduled start, once grace is passed), early out, worked, OT approved, OT
  paid.

---

## 6. Requests

One engine for leave, OT and corrections:
- `att_requests` — a number HR and the employee both quote (`LV-2611-004`, `OT-…`, `CR-…`, like Member
  services' `RQ-…`), the person, the kind, the leave type, dates and half days, the days counted, the OT
  date and minutes, the corrected time, the reason, the attachment; status `submitted` → `approved` /
  `rejected` / `cancelled`.
- `att_request_steps` — step 1 / 2, `upline` | `hr`, the upline it was assigned to (an upline step),
  `waiting` / `approved` / `rejected` / `skipped`, who decided, when, the note, on behalf or not.

**Checked when sent:** the balance (pending requests counted), the notice and back-dating windows, no overlap
with another request, probation, the attachment, OT's 12-hour day.

---

## 7. Month close and payroll

### 7.1 The close

HR closes month M by the 3rd of M+1 — the register's legal deadline (§7.4), and before payroll's 7th
(`docs/module-spec-payroll-cycles.md`). The close:
1. refuses while any request of M is still waiting, or any `absent` / `incomplete` day is undecided — HR
   marks each **unpaid**, **excused** or **corrected**;
2. freezes M's `att_days` and its OT;
3. records itself (`att_month_closes`: who, when, each person's totals);
4. produces the register (§7.4) and each person's payroll inputs: OT hours and RM by rate, unpaid days.

Reopened only by HR, with a reason, and only while M's payroll is still draft.

### 7.2 Two engines — the user picks

**Today's rule (the user, 2026-06-05; `src/app/(portal)/hr-costing/payroll/[period]/import/actions.ts`):** the
InfoTech file is the single source of truth — basic, OT, allowances, EPF / SOCSO / EIS, PCB, gross and net
are written exactly as exported — "The system does NOT recompute statutory on import." Those figures
survive only because the import's second phase writes columns the compute trigger does not listen to.

**That breaks the moment attendance writes `ot_hours`, `ot_amount` or `unpaid_leave_days`.** All three are on
`trg_hr_monthly_payroll_compute`'s column list (mig `20260930010000`, lines 257–267): the row is recomputed by
the portal's own formula, and InfoTech's EPF, SOCSO, EIS, PCB, gross and net are replaced.

| | **A — InfoTech keeps computing pay** | **B — the portal computes** |
|---|---|---|
| The close writes | nothing in `hr_monthly_payroll`; a file per person — OT hours by rate, unpaid days — for InfoTech | `ot_hours`, `ot_amount`, `unpaid_leave_days` on the person's draft row |
| Statutory | InfoTech, as today | the portal's JADUAL lookups |
| First | nothing | §7.3's three fixes; the import stops writing `ot_amount` and `unpaid_leave_days` (it never writes `ot_hours`) for `clock` people |
| Risk | HR keys the figures into InfoTech | the portal's formula becomes the payslip |

**Recommended:** A from go-live, with a **variance view** — after each InfoTech import the portal shows, person
by person, its own OT and unpaid figures beside InfoTech's. Two months at zero → B.

### 7.3 Three things to fix in `compute_hr_monthly_payroll` before B

In mig `20260930010000` (the last copy in this repo — compare its md5 with production's before changing it,
CLAUDE.md › Do NOT):

1. **OT is pro-rated** — line 153, `v_prorated_ot := NEW.ot_amount * v_prorata_ratio`. OT is paid for hours
   actually worked; a mid-month joiner, or anybody with an unpaid day, loses part of OT they did work. → OT
   is not scaled.
2. **OT is outside the SOCSO and EIS wage** — lines 155–158: ONE base (basic + statutory allowance −
   deduction) feeds EPF, SOCSO and EIS alike. OT is outside EPF's wages but **inside** SOCSO's and EIS's. →
   two bases.
3. **Half days round** — line 140, `NEW.unpaid_leave_days::INTEGER`: a numeric cast rounds 0.5 up to 1, so
   half a day unpaid takes a whole day's pay. → keep the fraction.

1 and 3 already apply to any row HR edits on the payroll grid; imported rows hide them only because the
import's figures are written after the trigger.

### 7.4 The statutory register

Employment Regulations 1957 reg 5: a register with, for each wage period, the agreed normal hours a day, the
days of normal work, the OT hours, the work on rest days and holidays, and the leave granted — **brought up to
date by the 3rd day after the period**. The close's export *is* that register, kept seven years with the
punches (the tax-records period).

---

## 8. Where people use it

| Who | Phone | Computer |
|---|---|---|
| An employee | the 打卡 card on whichever face they open — the HR app's Home, the portal's phone Overview; somebody whose account opens nothing else lands on a new **staff face** of the ONE app (`/me`, `src/lib/one-app.ts`): punch, today, my month, my balances, ask for leave / OT / a correction, my requests | My attendance — Department view, own reach (the `dept.my_claims` precedent) |
| An upline | the same + *Waiting for me* + *My team today* | My team |
| HR | the HR app: the card (HR clocks too); leave, OT and corrections in Review | HR's sidebar › **Attendance**: Today · Records · Requests · Balances · OT · Month close · Settings · Readiness |

**Readiness** (HR, before go-live and every month): `clock` people with no login, no schedule or no location;
uplines with no login; titles with no template; leave types without opening balances; next year's holidays
not set. Every row links to its fix.

**Notifications:**
- `attendance` added to `app_notifications.kind` and `att_request` to `ref_kind` (the CHECKs in mig
  `20261012210000`, lines 45–50) **and** to `KINDS` / `REFS` in `src/lib/push/notices.ts` — `noticeFromRow`
  silently drops a kind it does not know.
- HR's step notifies every holder of Attendance · Approve (All) **by name** (`notify_people`), not through a
  topic: `notification_topics` is written only when somebody opens the HR app (`src/lib/hr-app/server.ts`)
  and forgotten on every permission change, so an approver who works at the computer would never hold it.
- The staff face's phones need a third push app in four places: the `push_subscriptions.app` CHECK (mig
  `20261011180000`, line 56), `push_subscribe`'s own check (same migration), `PushApp`
  (`src/lib/push/config.ts`) and the outbox's filter (`src/lib/push/outbox.ts`, which drops any device that
  is not `revenue` or `hr`) — plus a branch in `noticeUrl`.

---

## 9. Tables

All of them RLS on, **no policy, no client grant** — every read and write is a SECURITY DEFINER function
asking `has_any_action`. That is the sanctioned exception to CLAUDE.md's "every table must have policies":
round 2's modules (`.claude/rules/portal-wide/permissions.md` › ROUND 2'S FOUR MODULES) and their
hardening, which took the default client grants off (`.claude/rules/hr/documentation.md`, mig
`20261011120100`). It also keeps the upline check inside the function, where it belongs.

| Table | Holds | `audit_register` |
|---|---|---|
| `att_policy` | §3.2 — one row, versioned | all |
| `att_locations` | §3.4 | all |
| `att_schedules`, `att_schedule_days` | §3.3 | all |
| `att_assignments` | company / title / person · from · mode · schedule · locations · OT eligibility · route | all |
| `att_holidays` | §3.5 | all |
| `att_ot_rules` | day type × within / beyond → days of ORP or × HRP, per eligibility | all |
| `att_punches` | person · kind · time (server) · work day · photo + sha256 · position + accuracy · location · distance · flags · source · invalidated by / why | all, diff only, the position left out (`p_omit`) — so an invalidation shows in the history and no coordinates are copied |
| `att_requests`, `att_request_steps` | §6 | all |
| `leave_types` | §3.6 | all |
| `leave_ledger` | §3.6 — insert-only: a correction is a new row, never an edit | none — the ledger is the record |
| `att_days` | the frozen month (§5) | none — a snapshot |
| `att_month_closes` | §7.1 | all |

**Bucket** `attendance-photos`: private, 2 MB, `image/jpeg` + `image/webp`; INSERT into one's own folder
only; read only through links a checked Server Action makes.

**Deleting old photos** is one more step of the hourly `/api/member-queue` (Hiring's leftovers are the
precedent). A new job for the service role is the user's decision (CLAUDE.md › Supabase client).

---

## 10. Permissions

A new function, `attendance`:

| Cell | Held by | Opens |
|---|---|---|
| View · Own | everybody in the module | my days, my balances, my requests |
| Create · Own | `clock` and `no_clock` people | punch; ask |
| Approve · Own | anybody who can be an upline | decide the steps assigned to **them** as somebody's upline — never their own request (§3.8) |
| View · Dept | department heads | their department's board |
| View · All | HR | everything, photos included |
| Edit · All | HR | corrections on somebody's behalf; invalidate a punch; decide absences; **close the month** (a module's own step is Edit, as HR's Total Close) |
| Approve · All | HR | the HR step, and any upline step on the upline's behalf |
| Manage | HR, Principal | §3 (the Edit of the Settings tab) |

**The upline step = the relationship AND a cell:** being the step's assignee (stored when the request was
sent) plus Attendance · Approve (Own), both checked inside the function — the shape of the CRM's
`crm_answer_invite` (`to_staff = crm_me()` and `crm_can('edit', 'own')`). A template without Approve · Own
cannot decide for its holders' reports; their steps fall back to HR (§3.8 rule 1).

**Templates:** a title points at exactly one template, so the cells go INTO the existing ones, as round 2
did (mig `20261011060000`): View + Create · Own into Staff · Basic (`staff`) and every other template whose
holders clock; Approve · Own into every template of people who lead somebody (department head, the
Finance and HR templates, the Director's); the All cells into HR's and the full-access ones. Then the
templates' versions are bumped.

**The plumbing** — round 2's mig `20261011060000_round2_permission_functions.sql` is the model; every registry
a module like this touches (`.claude/rules/portal-wide/permissions.md` holds the why):
1. the function, its cells, template grants and their version bump;
2. `audit_register` for each table, in its own migration — and its read key in `AUDIT_READ_KEYS`
   (`src/lib/audit/read-keys.ts`; `src/lib/audit/registry.test.ts` fails otherwise);
3. DEFINER writes ask `has_any_action`; revoked from PUBLIC and anon; a `p_user` must be `auth.uid()`;
4. tab guards where a cell has boxes on several tabs; and — because this module adds pages and boxes —
   `permission_page_tabs` / `permission_tab_cells` seeded again, whole (`src/lib/tab-write-guards.test.ts`);
5. `FunctionKey`, `KEY_ACTIONS`, `PERMISSIONS`, `canAccessAttendance`;
6. `GATED_ACTIONS`;
7. `PERMISSION_TABS` and its fixtures;
8. `PAGE_TABS`, `requirePage` first, a `loading.tsx` per route folder with children; the route prefix in
   `SHEET_ROUTE_PREFIXES` (`src/lib/sheet-routes.ts` — HR's pages sit on the white sheet, CLAUDE.md UI
   rule 7);
9. `requireActionOn(pages, 'attendance', …)` on every Server Action;
10. HR's sidebar; `PART_PAGE` for the HR app's parts;
11. every `.rpc()` in `DEFINER_RPCS`; every reader in `READS_WHILE_VIEWING_AS`;
12. the office clock in SQL and TypeScript;
13. a PGlite test, `tests/member-sql/validate-attendance.mjs`;
14. the tab's rules file, `.claude/rules/hr/attendance.md`, with `paths:` — and its name added to the HR row
    of CLAUDE.md › Rules by tab.

---

## 11. PDPA

- **A notice before the first punch** — what is collected (a photo, the time, the position at the punch), why
  (attendance and pay), who sees it, how long it is kept — acknowledged once per person. Documentation's
  memos already reach a person and record the acknowledgement.
- **Collected at the punch only** — no tracking between punches.
- **Kept:** photos 90 days, then deleted; the punch records seven years.
- **Biometric only if face matching is added** — then explicit consent, first.
- **A breach:** the Commissioner within 72 hours, the people affected within 7 days of that (since 1 June
  2025).
- **A Data Protection Officer** is required above 20,000 people, above 10,000 with sensitive data, or for
  "regular and systematic monitoring" — whether GPS-stamped clocking counts is a question for the company's
  lawyer.

---

## 12. Phases

**Phase 1 — the four asks, engine A.** Five PRs:
1. **Foundations** — the permission function and template; settings tables and pages (policy, locations,
   schedules, assignments, holidays, leave types, OT rules, routes); Readiness.
2. **The punch** — the bucket, `att_punch`, the staff face and the HR app's card, Today, a day's status.
3. **Requests and approvals** — leave and corrections, notifications, the leave ledger and opening balances.
4. **OT** — eligibility, asking first, claiming after, the computation, the caps.
5. **Month close** — freeze, the register, InfoTech's file, the variance view.

**Phase 2:** engine B (§7.3 and the import guard); the hourly photo purge and reminders; rosters; a kiosk (a
shared tablet: PIN + selfie) for people without a phone or a login; the subsidiaries (a company on the
person); Revenue Fair `no_clock` with a Leave page in the Revenue app; the attendance allowance;
flexible-working requests (EA s.60P — answered in writing within 60 days); leaving (AL paid out at ORP ×
days); face matching, with consent; rules per jurisdiction.

**Rollout suggested:** HR's six for two weeks → every salaried person → the system's leave year starts
1 Jan 2027 (2027's holidays must be published before then anyway) → engine B after two months at zero
variance.

---

## 13. Decisions for the user

The default is what this spec assumes.

| # | Decision | Default |
|---|---|---|
| 1 | Phase 1 = HV's own roster only? | yes |
| 2 | Director and Revenue `off` (IR always)? | yes |
| 3 | Outside every fence: flag, or refuse? | flag |
| 4 | Lateness: recorded only, or an attendance allowance later? | recorded only |
| 5 | OT asked for before it is worked? | yes |
| 6 | Payroll: engine A first, B after two months at zero variance? | yes |
| 7 | OT base: basic only, or basic + fixed allowances? | whatever InfoTech does today — to check |
| 8 | AL earned monthly; carry 5 days to 31 Mar? | yes |
| 9 | Photos kept 90 days, seen by the person and HR only? | yes |
| 10 | The photo purge as a step of the hourly job (service role)? | yes |
| 11 | Pilot in November, everybody in December, the leave year from January 2027? | yes |

---

## 14. Sources

- Employment Act 1955 — leave and hours, the government's summary: <https://www.malaysia.gov.my/en/topics/labour-law>
- The 2022 amendment (in force 1 Jan 2023) — hospitalisation on top of sick leave, paternity, 45 h, s.60P,
  the RM 4,000 line: <https://www.skrine.com/insights/alerts/december-2022/employment-amendment-act-2022-comes-into-force-on>
- Hours, OT and rest-day / holiday rates, ORP ÷ 26, the covered categories, s.24: <https://dnh.com.my/guide-to-malaysian-employment-law/>
- OT rates for monthly-rated staff: <https://help.talenox.com/en/articles/3522182-overtime-rates-malaysia>
- Sick leave 14 / 18 / 22: <https://timeteccloud.com/employment-act>
- The 48-hour rule: <https://dnh.com.my/sick-and-tired-sick-leave-in-malaysia/>
- Unused annual leave: <https://dnh.com.my/faq-on-unused-annual-leave/>
- s.15(2), two consecutive days: <https://mahwengkwai.com/does-absenteeism-justify-immediate-dismissal/>
- 104 hours a month (rest-day and holiday work not counted): <https://www.replicon.com/?p=135322>
- Eleven public holidays, the five, the list before the year: <https://www.ajobthing.com/resources/blog/public-holidays-under-malaysian-law>,
  <https://ajobthing.com/resources/blog/can-employer-request-employee-work-on-state-holiday>
- A holiday on a rest day: <https://www.malaymail.com/news/what-you-think/2024/09/05/will-you-get-an-extra-holiday-on-september-17-for-a-four-day-weekend-leonard-yeoh-and-pua-jun-wen/149310>
- s.24, no arbitrary deductions (the HR Minister): <https://www.malaymail.com/news/malaysia/2024/02/22/salary-deductions-follow-proper-procedure-hr-minister-tells-employers/119453>
- OT outside EPF: <https://www.ajobthing.com/resources/blog/which-allowances-are-subject-to-epf-in-malaysia>
- OT inside SOCSO and EIS: <https://help.payrollpanda.my/perkeso/which-payments-are-subject-to-socso-contribution-and-which-are-exempted>
- Employment Regulations 1957, reg 5 (the register, the 3rd day): <https://jtksm.gov.my/sites/default/files/2023-03/1.%20EMPLOYMENT%20REGULATIONS%201957_0.pdf>
- PDPA 2024 amendment, biometric data as sensitive data: <https://www.christopherleeong.com/viewpoints/the-personal-data-protection-amendment-bill-2024-an-analysis-and-upcoming-developments/>
- DPO and breach notification guidelines: <https://privacymatters.dlapiper.com/2025/03/malaysia-guidelines-issued-on-data-breach-notification-and-data-protection-officer-appointment/>
