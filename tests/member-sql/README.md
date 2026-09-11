# Member SQL regression checks

This isolated package verifies the Revenue member migrations in a fresh, in-memory PGlite database. It does not change the application package dependencies, load `.env` files, contact Supabase or mutate a live database.

Use Node.js 20 or later. From the repository root:

```sh
npm ci --prefix tests/member-sql
npm test --prefix tests/member-sql
```

The lockfile pins PGlite 0.5.8. Dependency installation requires the npm registry; the test itself uses local package assets and repository SQL only. Migration paths are resolved relative to `import.meta.url`, so the test has no user-specific path or working-directory dependency.

Expected final output:

```text
PASS: 199 member SQL checks. Disposable synthetic auth/payroll/Storage; real Revenue and member migrations. No live database connection.
```

The process exits nonzero on a failed assertion or SQL error. The same two commands can be used in CI; no database service, credentials or browser is required. Keep this package's `node_modules` and any `.env` files untracked.

Coverage includes own-data privacy, neutral member permission boundaries, claim attachment/hash/idempotency and revision linkage, memo acknowledgement, cross-department waiting requests, capacity reservation/allocation and the service-only scheduled queue worker. The actual legacy HOME Fair roster synchronization functions are exercised too.

The 27 additional legacy-boundary checks replay the real payment attachment
policies and the original `claims_submit` policy. They demonstrate the prior
authenticated-user access, then verify that active and inactive Revenue members
cannot read/upload payment attachments or directly insert claims. All four prior
roles retain their existing access, service-role Storage access remains intact,
and the verified member invoice-to-claim workflow still succeeds with owner-only
invoice visibility. These remain database policy checks against synthetic
Storage/auth scaffolding, not hosted file upload tests.

The Principal Revenue View checks in `principal-view-checks.mjs` apply the ninth
member migration and exercise it as an authenticated Principal without any staff
link. They cover the real account identity, a full roster including unlinked
staff, an empty IR scheme, unchanged member privacy, and rejection of inactive,
revoked, other-role and anonymous access. Aggregate checks use stored statement
components across Fair and IR, reject overlapping group revenue as team sales,
and preserve period/status separation. Catalogue checks require explicit product
publication and current active Fair brands without exposing cost fields. Order
checks cover service-fee exclusion, free KPI cost, manual margin, missing cost,
unassigned staff, cancelled/uncommitted orders and Fair-only scheme association.
Requests exclude drafts; Principal memo receipts remain separate from members.
No salary is inferred, no collective target/rate is invented, and overlapping
statement brand summaries are deliberately not reported as team brand margins.

Auth/users, payroll and Storage scaffolding are synthetic. Selected existing Revenue migrations and every new member migration execute from repository files. This is not a full replay of the entire production migration history, a hosted Storage integration test or a multi-connection concurrency test. See [the verification handoff](../../docs/member-verification.md#sql-verification-record) for the numbered assertions, boundaries and remaining deployment checks.
