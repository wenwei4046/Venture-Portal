# Settings (frame 10) — proposal to make its rows editable

Status (2026-10-18): the owner chose three — Reply targets, Suggest a template, Auto-assign ("可以，照这三项做"). Built as mig `20261018100000_crm_settings_editable`, dry-run on production (rolled back); **applied only on the owner's yes.** The rest of this page is the proposal as written.

Today the desktop Settings › General tab draws frame 10's four groups, each row locked, showing what the CRM does now.
None of these is stored as a setting. They are constants in code (`URGENCY_THRESHOLDS` in `src/lib/member/crm.ts`) or
rules inside database functions (`notify_crm_due`, `crm_assign_contact`, the ingest functions). To make a row
editable, it needs a column, a write function, and every reader changed to read it.

## Where to keep them

One row already exists for CRM-wide settings: `crm_settings` (one row, `id = true`; today it holds only
`sub_department_id`). Add the columns there, all with today's value as the default, so nothing changes until someone
edits a value.

- **Who may write:** a new `crm_save_settings(...)` (SECURITY DEFINER) asks `crm_manages()` (CRM · Manage), like every
  assignment or settings write. It goes on `CRM_WRITES` and `MANAGE_WRITES`.
- **Who may read:** a reader function, `crm_settings_read()`, open to anybody in the CRM (`crm_me()`), because every
  salesperson's phone draws the 3 / 6 / 9 h lines.
- **Audit:** the History / Audit log reads `audit_changes()` for the table (`audit_tables` line), so a change shows as
  *Settings · Urgent after · 6 h → 5 h*, as frame 11 draws.

## Row by row

| Group | Row | Can be made editable? | Column (default) | What must read it |
|---|---|---|---|---|
| Reply targets | Reply soon / Urgent / Overdue | **Yes** | `reply_soon_h 3`, `reply_urgent_h 6`, `reply_overdue_h 9` (whole hours, rising) | `urgencyOf` (phone, desktop, Team board's Attention), `salesNotifs`, `notify_crm_due` (the hourly phone notices) |
| Cold leads | Reply window 24 h | **No** — Meta's rule | — | stays locked |
| Cold leads | Move to Cold leads after | **No, as drawn.** A chat is "cold" exactly when Meta's window shuts. "After 2 days" would be a new status rule | (would need a new rule; not proposed) | — |
| Cold leads | Suggest a template | **Yes** | `suggest_template true` | the cold chat's template button (both phone chats, desktop chat) |
| Notifications | Push for new messages | **No** — each phone turns its own on (Revenue app › Settings) | — | stays locked |
| Notifications | Daily summary at 9 am | **New feature** — needs a daily sweep and a new notice | `daily_summary false` + the sweep | not proposed in this round |
| Notifications | Team inbox alerts | **No** — locked Off by decision 28 / §6.10 | — | stays locked |
| New leads | Auto-assign by the ad's split | **Yes, carefully.** Off means every new lead waits for a manager to send it by hand | `auto_assign true` | `crm_assign_contact` (rewritten from production's body, md5 checked) |
| New leads | Send auto-reply | **Not now.** Auto-replies are saved but not sent (owner, 2026-10-09: 先不發送). Turning sending on is its own decision | — | — |
| New leads | Hold leads outside working hours | **New feature** — needs working hours and a release at 10 am | `hold_after_hours false`, `work_from`, `work_to` | `crm_assign_contact` + an hourly release; not proposed in this round |

## What I recommend for round 1

1. Reply targets (3 / 6 / 9 h).
2. Suggest a template.
3. Auto-assign by the ad's split.

That is one migration: three columns' worth of settings in `crm_settings`, `crm_save_settings`, `crm_settings_read`,
and `notify_crm_due` and `crm_assign_contact` rebuilt from production's bodies. It comes with a PGlite check
(`tests/member-sql/validate-crm-settings.mjs`).

The app reads the values softly, so the screens keep today's values before the migration is applied. Settings ›
General gets frame 10's number boxes and switches, and its **Save changes** button.

Daily summary and Hold leads outside working hours are new features. They are left for a later round.
