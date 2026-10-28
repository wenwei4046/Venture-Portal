# Lead View — handoff back to Claude Design (23 Oct 2026)

Lead View is Customer Service's inbox for the brands 2990s, 2990s mini and Carress (Messenger + Instagram). Customer Service's KPI is getting the customer's mobile number and handing it to that brand's sales on WhatsApp.

The previous handoff (export of 19 Oct, `docs/design_handoff_lead_view_inbox/`) has been built. This package is **what the app looks like now**, so the screens that need adjusting can be redesigned from the real thing, not from the 19 Oct prototype.

## What is in this package

| Folder | What it is |
|---|---|
| `screenshots/*.png` | Every screen at 1440 × 900, captured from the running app on 23 Oct 2026. |
| `screens/*.html` | The same screens as standalone HTML (styles inlined, no scripts). Open them in a browser or import them into Claude Design to edit. Fonts load from Google Fonts (Lora, Cormorant Garamond). |
| `README.md` | This file. |

All data on the screens is **test data**. Meta is not connected yet, so only test conversations exist (names such as Aisyah Rahman, Jason Lim, 測試客戶 01). The signed-in user is the "Principal" account.

## What to send back

Please return the redesign the same way as last time:
- one `.dc.html` per changed screen (the source of truth),
- a `README.md` that says what changed and why,
- screenshots for reference.

Only the screens that change need to come back. Anything not mentioned stays as it is now.

## Screens

| # | Screen | File | Notes on the build |
|---|---|---|---|
| 01 | Inbox | `01-inbox` | Three columns (conversations · chat · customer), plus a fourth: **Timeline**, folded to a rail on the right by default. The customer panel can fold too (» button). Both remember their state per browser. Typing `/` in the reply box offers Quick replies. ✦ AI draft is always shown; it says why when it cannot draft. Camera and attach are drawn but disabled until Meta is connected. |
| 01b | Inbox, timeline open | `01b-inbox-timeline-open` | The timeline panel open ("Timeline · this chat"). |
| 02 | Leads | `02-leads` | As designed: filters, status tabs, sortable and resizable table, period and page size at the foot, Export CSV. |
| 02b | Leads, drawer | `02b-leads-drawer` | The lead drawer: progress steps (clickable), Mark as lost, for the salesperson, timeline, Open conversation, Remind salesperson. |
| 03 | Insight | `03-insight` | From message to sale; By ad (Spend and Cost / sale show "—" until Ads Manager spend is connected; organic = "free"); Who replied first; Where customers drop off. Brand and period (7 days / 30 days / This quarter) at the top. |
| 04 | Campaigns | `04-campaigns` | Three columns as designed. Meta template, photo / video and Send test are drawn but disabled ("Comes with Meta"). Besides the drawn "Schedule for N" we kept **Save draft** and **Send now**, because nothing sends a schedule until a clock exists. Read is "—" until Meta. Channel is not on the screen (the design has none). |
| 05 | Reply rules | `05-reply-rules` | By ad / Organic and other ads. The ad list is the ads conversations came from, not an Ads Manager sync. |
| 06 | Reply templates | `06-reply-templates` | Canvas at 100%, right panel folded by default. |
| 06b | Reply templates, Edit step | `06b-reply-templates-edit-step` | Edit step open. **THEN** is now a dropdown that opens the list of step types. |
| 07 | Step library | `07-step-library` | Empty: the library starts empty (the 19 Oct items were prototype data). |
| 08 | AI Agent | `08-ai-agent` | Tabs: How it replies, Fixed answers, Sales playbook, Memory (Memory is drawn but not built yet). The agent reads every file in its brand's folder and Shared; pausing is done in Data Center. Test panel says "not connected" until an API key is added. |
| 09 | AI corrections | `09-ai-corrections` | List / Summary, CSV, period and page size at the foot, page-level Discard / Save. Empty until CS edits an AI draft. |
| 10 | General info | `10-general-info` | Categories on the left: any category, seeded or added, can be deleted (× on hover, or right-click → Delete category). |
| 11 | Data Center · Product data | `11-data-center` | Category glyphs, list title, blank CSV templates. Empty: no files uploaded yet. "Sync all" is disabled (re-reading web pages is not built). |
| 11b | Data Center · Quick replies | `11b-data-center-quick-replies` | Shortcut · brand · text · used, saved as a whole. |
| 12 | Business hours | `12-business-hours` | As designed (weekly hours, special dates). |
| 13 | Audit log | `13-audit-log` | Reads the portal's own change history for Lead View's set-up pages. The "System" rows are changes made by database migrations. |
| 14 | Settings | `14-settings` | Not in the 19 Oct design: brands with their Page / Instagram ids, salespeople, Ads, and Test (a customer's message as if from Meta). **Kept in the old style; it needs a design.** |

## Changes since the 19 Oct design (decided with the owner, 22–23 Oct)

- Sidebar: tighter rows, and **Collapse moved to the top** under the brand (was at the bottom).
- Inbox: **Promotions consent removed** from the customer panel; **Timeline moved** out of the customer panel into its own right-hand panel (folded by default); the customer panel can fold.
- Reply templates: Edit step's THEN is a dropdown.
- AI Agent: no Sources tab and no "AI drafts in the Inbox" switch (the agent reads its folder + Shared; saving the page turns drafts on).
- Data Center: Quick replies is a real tab (19 Oct had it as a tab too).
- Page headers of Reply rules, Reply templates, Step library, AI Agent and AI corrections carry "Save changes", as drawn.

## Rules any redesign has to keep

- **Meta's rules:** nothing automatic more than 24 hours after the customer's last message. Campaigns reach only customers who wrote in the last 24 hours (free) or agreed to promotions (charged); never anyone who unsubscribed. "Stop promotions" stays on every campaign message.
- **The AI is a copilot for now:** it writes drafts and CS sends them. Answering on its own needs a server worker that is not built. Screens can show the "AI Agent" mode, but should not promise it is replying by itself.
- **Saved in the database**, never in the browser. Only viewer conveniences (column widths, panels open or folded, the sidebar fold) live in the browser.
- **English only** on screens. Chinese appears only in what customers type or read, and in the WhatsApp text to salespeople.
- **Desktop only** (1440 × 900 artboard). Every column that holds text must reflow without overlap when resized.
- **Theme:** Lora + Cormorant Garamond, walnut sidebar `#2B211C`, accent `#C76F46`, outlined primary buttons. Only "Hand over to … sales" and the template's Save are filled.

## Not designed yet — needs a design

1. **Comments**: comments under the brands' Instagram and Facebook posts and ads. The owner wants Lead View to manage these ("IG 帖子和广告下面的留言也要"). It needs its own screen (or an Inbox tab): reply in public, reply in private (move to DM), hide, link to the post or ad, which ad it is. Meta permissions for this are being tested.
2. **Settings** (screen 14): never redesigned. Brands and Page ids, salespeople (name + mobile, rotation), Ads (names, fetch from Ads Manager), Test enquiry.

## Screens the owner wants adjusted

_The owner fills this in before sending: which screen, and what to change._

-
-
-
