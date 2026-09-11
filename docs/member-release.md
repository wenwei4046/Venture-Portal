# Revenue member workspace

The only sign-in entry point for every account is `/login`, using the selected Warm Editorial design and the HOUZS VENTURE brand. The old `/member/login` URL is a redirect only. Revenue members enter `/member`; administrative accounts enter their existing portal. An actual, active Principal can choose **Revenue View** in the shared view selector and return to Principal, Finance or HR without signing in again. Principal and authorised HR users manage requests, memos, capacity and catalogue options at `/member-admin`.

Principal Revenue View is a department overview, with the real Principal identity and no employee-link requirement. It includes current team hierarchy, actual aggregate commission, requests, published memos and the Fair calculator. It never presents a fabricated personal salary, marks memos on an employee’s behalf or submits employee requests. Management buttons restore Principal view before opening administration. Raw product costs remain server-side.

Apply `20260912090000_member_principal_view.sql` before deploying this access change. The two new read functions check the stored active Principal role in the database; an app view cookie cannot grant Principal access. Existing employee-specific read/write policies are unchanged. The local regression suite contains 199 SQL checks, including original member privacy boundaries and Principal accounts without a linked employee.

## Release contents

- Real account sign-in, inactive-account rejection and a separate Revenue Member role.
- Personal income, commission rules, KPI and margin progress, authorised team information and HR memos.
- Fair product catalogue, model/brand selectors, accessories, cart quantity controls, swipe removal, collapsible combination and immediate quotation calculation. Product costs remain on the server.
- Claims with private verified invoices, replacement requests and a capacity-aware waiting list.
- Principal/HR management tools and an authenticated hourly queue sweep. Vercel supplies the production `CRON_SECRET` to `/api/member-queue`; event-driven queue processing also runs when capacity or qualification changes.

## Database rollout

Apply only the member migrations in order against the existing commission schema. The role enum migration must commit before later files use the new role. The database has historical migration-version drift, so do not bulk-push every locally pending migration. Record each successfully applied member version in migration history.

The release seeds no employees, catalogue prices, sales, requests or capacity limits. HR must link each real employee account to their active Revenue staff record and membership. Principal must configure the catalogue and current costs. Actual department headcount limits must be supplied before waiting-list allocation is enabled. Product photos remain a later setup step.

## Verification

Run `npm run test:ci` and `npm run build`. The separate member SQL suite runs with `npm ci --prefix tests/member-sql` followed by `npm test --prefix tests/member-sql`; it uses a disposable database and synthetic fixtures, never production credentials. CI also checks the Cloudflare worker and PDF rendering to preserve the existing hosting compatibility.

After deployment, verify the live member login, protected-route redirects, responsive layout and queue endpoint authentication. A complete employee sign-in walkthrough requires an authorised, linked employee account.
