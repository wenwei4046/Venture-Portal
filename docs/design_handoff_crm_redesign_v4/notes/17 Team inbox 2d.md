# 17 · Team Inbox (phone) = frame 2d (owner, 2026-11-10: "use 2d")

Spec: frame **2d** in `CRM Optimized Phone.dc.html` (turn-12). Builds on 2c (filters) and 10b (row content, notes/16). Source today: `panel/PanelInbox.tsx` (status board) → replaced by this list; `panel/vm/inbox.ts` keeps the data.

## Header
- "Inbox" Inter Tight 500 30px · search icon · team toggle (`#FDE3D2`/`#8A1F0A`) · bell (dot) · Contacts — 40px circles, gap 8. Search opens in place, as 10b.

## Filters — exactly 2c
- People / Status buttons (44px, radius 14, count badge), removable tags, "23 chats of 167 · Clear all", the 2c·2 sheet.

## Card list
- Background `#FBF7F3`, padding 16px 16px 0, 12px between cards.
- Card: `#FFFFFF`, 1px `#EEE3DA`, radius 18, padding 15px 16px, gap 14.
- Avatar 44px + channel badge (18px, WhatsApp `#25D366` / Messenger `#0A7CFF`).
- Lines, 5px apart:
  1. Name 16px (600 if unread) + label tags (as notes/16) · right: time 12.5px (rust if unread), or the wait when waiting (icon + "9 h", 13px 600, urgency colour).
  2. Owner: 7px team-colour dot + name 12.5px 500 `#5A4034` · "·" `#CDBFB5` · ad source `#A8968B` (ellipsis) · right: status (6px square in status colour + name, 12px 500 `#7A6255`) **only when more than one status is in view** (Status = All or 2+ picked).
  3. Fixed 22px: message 15px `#5A4034` (ellipsis) · unread badge 22px.
- Tap opens the chat; long press / swipe as today.
