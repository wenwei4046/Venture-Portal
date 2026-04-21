# VP Test Credentials

> Seeded users. Password is `123456` for all (seed script's `changeme123` is stale — confirmed 2026-04-21).

| Role | Email | Purpose |
|---|---|---|
| Principal | `principal@venture.my` | CEO. Approves everything. Unique access to /approvals, /audit-log, /settings. |
| Finance | `finance@venture.my` | Treasury + Billing execution. PIN for /director-salary = `777333`. |
| HR | `hr@venture.my` | Payroll + director salary + benefit claims. |
| Dept Manager (Marketing) | `dept_manager@venture.my` | Own dept pool only. Scoped to Marketing. |

## Director Salary PIN
`777333` — Finance needs this to enter /director-salary (still sees only aggregate per RLS, not individual payouts).

## Fresh session tips
- Always `browser_evaluate "localStorage.clear()"` + new tab before switching roles to avoid session bleed.
- If a POST returns 404, run `rm -rf .next` and restart preview (Next.js HMR breaks Server Action IDs — known quirk).
