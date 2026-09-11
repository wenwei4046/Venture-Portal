# Revenue member workspace

The member entry point is `/member/login`, using the selected Warm Editorial design and the HOUZS VENTURE brand. The responsive workspace is `/member`; existing administrative accounts retain their portal navigation. Principal and authorised HR users manage member requests, memos, capacity and catalogue options at `/member-admin`.

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
