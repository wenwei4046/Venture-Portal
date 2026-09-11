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
PASS: 101 member SQL checks. Disposable synthetic auth/payroll/Storage; real Revenue and member migrations. No live database connection.
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

Auth/users, payroll and Storage scaffolding are synthetic. Selected existing Revenue migrations and every new member migration execute from repository files. This is not a full replay of the entire production migration history, a hosted Storage integration test or a multi-connection concurrency test. See [the verification handoff](../../docs/member-verification.md#sql-verification-record) for the numbered assertions, boundaries and remaining deployment checks.
