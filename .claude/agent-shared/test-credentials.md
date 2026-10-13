# VP Test Credentials

> Seeded users. Password is `123456` for all (seed script's `changeme123` is stale — confirmed 2026-04-21).

| Role | Email | Purpose |
|---|---|---|
| Principal | `principal@venture.my` | CEO. Approves everything. Unique access to /approvals, /audit-log, /settings. |
| Finance | `finance@venture.my` | Treasury + Billing execution. PIN for /director-salary: seed `777333` — may have been changed via Settings > Directors. Verify against `treasury_config.director_pin_hash` if locked out. |
| HR | `hr@venture.my` | Payroll + director salary + benefit claims. |
| Dept Manager (Marketing) | `marketing@venture.my` | Own dept pool only. Scoped to Marketing. |

## Director Salary PIN
Seed is `777333`. Finance needs this PIN to enter /director-salary (still sees only aggregate per RLS, not individual payouts). The PIN is user-changeable via Settings > Directors — if the seeded `777333` fails `bcrypt.compare` against `treasury_config.director_pin_hash`, it's been changed. Either reset via Settings UI or read the current hash in DB. Confirmed drift on 2026-04-25 by vp-e2e-role-auditor.

**No longer a gate (checked 2026-10-14):** no page asks for the PIN — `DirectorPinGate` is unused, and `/director-salary` asks the `director_salary` permission, which Finance's template lacks. The PIN can still be set in Settings › Director Salary.

## Access
The four logins above are shared accounts with fallback kinds. What an account may open now comes from its title → permission template (CLAUDE.md › Permissions), so check the account's cells before calling a missing page or button a bug.

## Fresh session tips
- Always `browser_evaluate "localStorage.clear()"` + new tab before switching roles to avoid session bleed.
- If a POST returns 404, run `rm -rf .next` and restart preview (Next.js HMR breaks Server Action IDs — known quirk).
