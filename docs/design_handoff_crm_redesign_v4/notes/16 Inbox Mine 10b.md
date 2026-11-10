# 16 · Inbox (Mine) = frame 10b (owner, 2026-11-10)

Spec: frame **10b** in `CRM Optimized Phone.dc.html` (turn-10). Source: `sales/SalesInbox.tsx`, `sales/vm/inbox.ts`. Behaviour unchanged: swipes, long press, More sheet, labels, ad sheet, filters, search, empty states.

## Header
- "Inbox" Inter Tight 500 30px. Right: search · team toggle (when shown) · bell (dot) · house — 40px circles, gap 8.
- Search is an icon: tap opens the search field in place of the chip row (same `q` / `setQ` / `clearQ`), with a Cancel that clears and closes.

## Chip row
- First: `All ads ▾` (34px, 1px `#E2D8D0` border) → today's ad sheet. Then a 1px divider, then the status chips as today (All · Attention · New · Follow up · Appointment · Won · Lost · Cold leads · Blocked · labels in use).
- Chips 34px, radius 17, 13px. On: `#422315` bg, white text, count `#E0CFC4`. Off: `#F7F3EF`, count `#A8968B` (Attention count `#8A1F0A`).

## Row (padding 14px 20px, gap 14) — every row the same height (≈ 98px)
- Avatar 50px (initials Inter Tight 500 17px) + channel badge as today. Lines gap 4.
- Line 1: name 17px (600 unread) + one small tag per label after the name: 20px high, radius 10, `#F7F3EF`, 6px dot in the label colour + name 11.5px 500 `#5A4034` · right: time (rust when unread). **When the chat is waiting** (urgency level ≠ none) the time is replaced by the wait: icon (clock / triangle-alert) + "9 h", 13px 600, urgency colour.
- Line 2: **ad source**, 13px `#A8968B`, one line, ellipsis.
- Line 3: fixed 22px high, `align-items:center` — message 15px `#5A4034`, ellipsis · unread badge (22px) on the right, so a badge never changes the row height. About 7 chats on screen at 430×932 — sizes kept close to today's for readability.
  - Booked visit: "📅 Sat 11 am ·" (calendar-check 13px, `#6F402C` 500) before the message.
  - Cold: lock 13px `#A8968B` before the message; name `#7A6255`.
- Removed: the separate urgency line, "1st visit …" line, "Cold lead" text, uppercase filled label tags (now small tags after the name).
