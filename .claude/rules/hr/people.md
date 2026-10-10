---
paths:
  - "src/app/*/team/**"
  - "src/lib/ladder.ts"
  - "src/lib/import/staff-match.ts"
  - "src/lib/team-directory.ts"
  - "tests/member-sql/validate-employee-chart-lifecycle.mjs"
  - "tests/member-sql/validate-team-directory.mjs"
---

# HR tab — People

People Management (and its Permissions tab), Hierarchy (Org chart, Table, Levels, Roles), employee codes — `src/app/(portal)/team/`. How a permission template gates the portal is `../portal-wide/permissions.md`.

Read this before changing anything it covers, and again in every full scan of such a change (a review, QA, an E2E audit) — CLAUDE.md › Rules by tab. New decisions are added here, dated, never to CLAUDE.md. Until 2026-10-10 this was the Architecture tree's comment on `team/` in CLAUDE.md, moved word for word.

## `src/app/(portal)/team/`

team/ ← the sidebar's **People** section (its own category since 2026-09-01, below Departments): People Management / Member Services / Hierarchy. **Since 2026-10-08 (Claude Design handoff, the People Management revamp)** Permissions is People Management's 2nd tab (`?tab=permissions`: permission TEMPLATES — see Permissions below) and Roles is Hierarchy's 4th (`?tab=roles`: titles + Level + their template); /team/roles and /team/permissions redirect there. Invite user is a DRAWER on People Management (pick an active person with no login, email + password, no role); /team/people/invite? staff= deep-links into it. Routes stay under /team/*. Roles = titles. Hierarchy = the GRAPH, with a panel beside it (2026-09-07): three views on the header's rule (`?tab=`) — **Org chart** (default), **Table** (the same two facts as editable rows, in ladder order), **Levels** = the **ladder** (`title_levels`, one shared scale, 2026-09-03; on Roles until 2026-09-05) that the chart obeys, promotion climbs and the roster sorts by — `lib/ladder.ts`. A SECOND GRAPH rides the chart view: the commission tree (`comm_hierarchy`), READ beside the staff one and still EDITED on Revenue. Clicking a card in either centres the other. Permissions = the matrix, split off 2026-09-03. **Employee codes (2026-09-12):** `employee_code` = HV001, HV002 … numbered from the top of the ladder (CEO = HV001) and, from then on, handed out by trigger `hr_staff_costs_assign_code` = the largest HV number on the table + 1 (inactive rows count; a code is never cleared). Add Staff has no code field — it shows `next_staff_code()`; it DOES ask for a **Sub-department** and a **Reporting upline** (2026-09-20) — blank for a department with none, and a base whose ladder has no rung for the chosen title is offered greyed out. Inside one title the roster sorts by code (`compareByLadder`). Mig `20260915040000`. InfoTech's own number is `infotech_code` (mig `20260915050000`): both imports match on it first, name second, never on the HV code (`lib/import/staff-match.ts`).
