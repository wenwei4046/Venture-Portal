# Prompt for Claude Design

Paste everything below the line into a new Claude Design project, after uploading `design-brief.md`, the screenshots
in `phone-mine/`, `phone-team/` and `desktop/`, and the HTML snapshots in `html/`.

---

I want to **redesign our CRM** — the phone version and the desktop version — for HOUZS's Revenue team. It is live
and used every day. The attached screenshots (`phone-mine/01`–`09`, `phone-team/01`–`08`, `desktop/01`–`13`) and the
HTML snapshots (`html/`, named `<folder>--<screen>.html`) show it exactly as it runs today, on demo data. Start from
them: keep what every screen does, and make it clearer, calmer and better organised.

Read **`design-brief.md`** first. It explains what the CRM is, who sees what (salespeople, leaders, the Revenue
Director, the Principal), **which data each screen has** (use only that, or mark anything else **NEW DATA**), the
owner's recent decisions in §6 (keep them, or list any change to them), and what the platform cannot do (§7).

Please work in this order:

1. **One visual language** for phone and desktop: colour, type (Inter + Inter Tight), radii, cards, buttons, chips,
   the bottom bar, the round header buttons, sheets.
2. **Phone · Mine** (a salesperson): Inbox → the chat (header, bubbles, the floating composer with Attach, emoji, the
   held mic, a cold chat with its template button, the message menu) → Contacts → Calendar → Insight → Profile and
   Notifications.
3. **Phone · Team** (the Principal / Director / a leader): Insight → the Inbox board → Assignment and an ad's split
   (Evenly / By team, the Revenue Director first) → Calendar → Profile and Showrooms.
4. **Desktop**: the CRM's frame inside the Revenue app (its sidebar, the page head, the right-hand rails that fold),
   then Insight, Inbox (list · chat · Customer info), Contacts, Calendar, Ads Performance, Assignment, Showrooms,
   Customer form, Channels, Settings, Audit log.

For each screen show its normal state, empty, many rows, and any sheet or editor it opens. Phone frames 430 × 932;
desktop 1440 × 900, with Insight, Inbox and Assignment also at 1280 × 800. UI text in English.

When done, hand back:
- one `.dc.html` prototype with a frame per screen and state;
- **`CRM Redesign dev changes.md`**: numbered items, each naming the screen, what changes (sizes, colours, order,
  behaviour), **phone / desktop / both**, **NEW DATA** if it needs data we don't have, **changes a decision in §6** if
  it does, and an **acceptance** line;
- any new icons or images as files.
