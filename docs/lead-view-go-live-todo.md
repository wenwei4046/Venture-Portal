# Lead View go-live — what is left (written 2026-10-26)

Target: Customer Service starts on **28 Oct 2026**. PR: https://github.com/wenwei4046/Venture-Portal/pull/780 (branch `lead-view`, Auto-fix on).

## Done
- [x] Main merged into `lead-view` (up to `56fc2b3d`) and the merge fallout fixed.
- [x] Messenger connected in code (webhook → `lead_ingest_messenger`; templates sent through `lead_outbox`; CS replies sent through `lead_reply_target` / `lead_reply_sent`).
- [x] Campaigns' *Send now* switched off for the go-live.
- [x] Migrations `20261026100000`, `20261026110000`, `20261026110100` applied to production (2026-10-26, the user's yes; checked before and after).
- [x] Branch pushed, PR #780 merged into main (squash `49fb69c7`, 2026-10-26) — production deploys from it.
- [x] `META_PAGE_IDS` checked 2026-10-26: no brand Page in it (Vercel's note: The Conts, Dream Crafter; the value is sensitive and was not read).
- [x] Page ids set on production 2026-10-26: 2990s `946946021838962`, Carress `504171022789980`; 2990s mini left empty (it shares the 2990s Page).
- [x] 2990s and Carres subscribed to the app's webhook 2026-10-26 (the user's OK), the CRM Pages' five fields: messages, messaging_referrals, message_deliveries, message_reads, messaging_postbacks.
- [x] Tested 2026-10-27 00:03: the user's message to 2990s came into the Inbox (Kyky Loke, 2990s, name from Meta), and a reply from the Inbox went out — delivery sent, Meta's id kept.
- [x] Main's two Marketing tests (PicPage, ProductProject) fixed in the same PR (the clock frozen an hour after sending).

- [x] Stranger test 2026-10-27 01:29: Ykyk Huang came into 2990s through Messenger (the app published).
- [x] Demo data cleared 2026-10-27 at the user's word: 7 test conversations (messages, timeline, drafts) deleted; the 3 demo templates and 8 demo salespeople (示範 + test123) removed. Kyky Loke and Ykyk Huang kept, then deleted too the same day at the user's word ("所有测试资料删掉") — Lead View starts with no conversation. The Step library's "Welcome" (the user's own, 26 Oct 23:47) kept.

## Waiting — handle together later
7. **CS login:** HR makes it (the user, 2026-10-27).
8. **Meta App Review / app published** (app "Houzs Revenue Team CRM"; the user's screenshot, review submitted 2026-10-25 11:12 GMT+8, *some requests not approved*):
   - Approved: `pages_messaging`, `pages_show_list`, `pages_manage_metadata`, `public_profile` — enough for Lead View: receive messages, ask the Page token, subscribe the Pages, send replies inside 24 hours.
   - Not approved: **Human Agent** (no reply after 24 hours — the code already assumes this, `HUMAN_AGENT_APPROVED = false`) and **pages_read_engagement** (Lead View does not need it for messages; Comments later will).
   - **The app is still 未发布 (unpublished)** → the user publishes it (发布). Until then only people with a role on the app reach the Pages' webhook, so real customers' messages do not arrive. The same app serves the CRM's Messenger — publishing affects both (for the better).
   - Later, optional: read the reviewers' feedback (前往提交反馈) and re-submit Human Agent / pages_read_engagement.
9. Local-only failures to know about (not in CI): `src/components/member/crm/palette.test.ts` and `src/lib/erp-sync/catalogue.test.ts` fail on this Windows machine; main's CI passes them.

## Later (after the go-live)
- AI Agent beyond copilot, Instagram, Comments (not designed yet), campaign sending through Meta.
