---
paths:
  - "src/app/*/leads/**"
  - "src/lib/leads/**"
  - "src/components/layout/lead-nav.ts"
  - "src/components/layout/LeadSidebar.tsx"
  - "supabase/migrations/*_lead*"
  - "tests/member-sql/validate-leads.mjs"
---

# Lead View — Customer Service's inbox for the brands

Read this before changing anything under `/leads`, `src/lib/leads/` or the `lead_*` tables and functions, and again in every full scan of such a change (CLAUDE.md › Rules by tab). New decisions are added here, dated.

**WHAT IT IS (2026-10-16, the user):** one system where Customer Service answers the group's brands' enquiries — 2990s, 2990s mini, Carress, more later — from Messenger and Instagram (ads or organic; no WhatsApp channel), gets the customer's PHONE (Customer Service's KPI: 客服的 KPI 更多是在拿到電話號碼), and hands it to that brand's sales, who are NOT in the system (銷售團隊不會在這個系統中，會用自己的手機去聯繫客戶做預約). Desktop first. Three parts in the user's brief: manual replies; automation (an AI agent with a per-brand data center and "soul", and button flows); campaign blasting. The design is the Claude Design canvas "Lead View" (https://claude.ai/artifact/8cZ6TsUeWX6AYETkxQudiK), approved "1，2，3（中英）" — the UI writes Chinese and English side by side.

**PHASE 1 (2026-10-16, branch `lead-view`):** Inbox (three columns: conversations by brand / waiting · answered · handed / search; the chat; the customer card), Leads (the month's phones, hand-over and outcome), Insight (phone rate by brand, ad and who handed over; tests left out), Settings (brands with their Page / Instagram ids and hand-over mode, salespeople, and *Test* — a customer's message as if from Meta). Later phases, in order: flows (buttons), Data Center + AI as copilot (drafts), AI on its own (after hours first), Campaigns (opt-in only, Meta charges).
- **Where:** `/leads`, `/leads/list`, `/leads/insight`, `/leads/settings` under `(portal)`; PortalFrame draws Lead View's own shell on them (`isLeadViewPath`): the view sidebar with `lead-nav.ts`, HR's greeting bar saying *Lead View*. The view switcher's *Lead View* is not a mask — `setViewAs('lead')` clears the mask and opens `/leads`. An account whose cells open no Overview but hold Lead View lands on `/leads` from `/dashboard`.
- **Permission:** function `leads` (View · Create · Edit · Manage, reach all), key `leads` (scope none), Principal's role default, Ultimate / Full every cell (mig `20261016300000`). Tabs: a sixth view, *Lead View* (`lead.inbox`, `lead.leads`, `lead.insight`, `lead.settings`; Settings' Edit = `leads.manage`), so a template "Customer Service" can tick them — the tick tables' CHECKs and the functions that check a tick learned `lead` (mig `20261016300400`). The user: Customer Service has their own logins (one person today), title *Customer Service*; every reply shows who sent it.
- **Database:** `lead_brands`, `lead_sales`, `lead_contacts`, `lead_messages`, `lead_events` — RLS on, NO policy, no grants; every read and write is a `lead_*` DEFINER function asking `has_any_action` (mig `20261016300200`); the Inbox's create / edit writes also ask their page (`tab_write_guard`, mig `20261016300500`). The three brands are seeded. PGlite: `tests/member-sql/validate-leads.mjs`.
- **The phone:** `lead_find_phone` (SQL) and `findPhone` (`lib/leads/phone.ts`) find the first Malaysian mobile in a message — the same examples hold both; stored as digits (0123384721), shown 012-338 4721. A found phone is *detected* until Customer Service confirms it (or hands the lead over, which confirms it); the first phone stays.
- **Hand-over (the user: 可以):** a brand's salespeople are names and mobiles on Settings; the window suggests whoever had the fewest leads this week (rotate) or lets Customer Service pick, fills a WhatsApp message (editable), records `lead_handoff` and opens `wa.me` in a tab opened at the click. Appointment / came are kept by Customer Service on the card or Leads.
- **Meta is NOT connected (the user: 先把界面處理好再串接):** a reply is recorded (`delivery 'recorded'`), never sent; conversations arrive only through Settings › Test (`is_test`). Connecting later: the brands' Pages into Centralize Marketing Hub and the System User, their ids on Settings, the Messenger webhook routing a brand's Page to a lead ingest function (the CRM's Pages keep going to the CRM). Messenger permissions are the app's (no new review per Page); Instagram messaging needs its own App Review.
- **Not applied:** the six migrations wait for the user's yes; until then the pages say *Lead View's database is not set up yet*.
