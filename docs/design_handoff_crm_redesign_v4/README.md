# Handoff: CRM redesign v4 — UI tidy-up and small feature changes (2026-11-10)

## Overview
This round tidies the CRM's phone and desktop UI (Espresso & White) and changes a few behaviours. **The CRM's colours do not change** (the orange chat, rust accents, existing palette). Builds on `docs/design_handoff_crm_redesign_v3` (v3 stays the base; v1 for tokens and components).

Repo: `wenwei4046/Venture-Portal`, CRM under `src/components/member/crm/`.

## About the design files
The `.dc.html` files are **design references made in HTML** — they show the intended look and behaviour; they are not code to copy. Recreate them in the app's existing React/TypeScript code and patterns (inline styles, `var(--crm-*)` tokens, `typePx`, the existing VMs). Open a `.dc.html` in a browser next to `support.js` and `icons/` to view it; each file is a canvas with numbered frames, newest turn at the top.

## Fidelity
**High-fidelity.** Lift exact values from the inline styles of the chosen frames and from `notes/`. Don't invent spacing or colours; when a value is unclear, ask.

## How to work (same rules as CLAUDE.md)
1. Read this README, then every file in `notes/` **in numeric order** (09 → 25). Each note names its frame(s) and source files.
2. Build only the frames marked **Chosen / Kept / Approved**. Other frames in the same turn are explorations — don't build them.
3. After each screen, screenshot production at the same size (phone 430×932, desktop 1440×900) and compare with the frame. Fix every difference and every overlap.
4. Use the app's existing fonts (Inter, Inter Tight, Noto Sans SC via its CSS variables). Don't load fonts again.
5. Don't change behaviour the notes don't mention.

## What to build — in this order

### Global / behaviour
| Note | What |
|---|---|
| 09 | Remove Suggest reply everywhere (phone + desktop, settings page); Attach slot 4 → Auto replies; Cold template stays |
| 10 | Android Back returns to the previous step, not the home screen |
| 11 | WhatsApp cold: warning above the typing bar + Template button, Send greyed (6a·2) — phone + desktop |
| 12 | Messenger window-closed failures look sent (temporary, until Human Agent is approved) |
| 13 | Voice notes: drag-to-scrub, tap-to-jump, one plays at a time (`Voice Note Scrub.dc.html`) — phone + desktop |
| 15 | Chat ⋮ menu gets **Label** (11a/11b) |
| 18-B | Profile › Quotation settings: Back returns to CRM Profile |

### Phone — `CRM Optimized Phone.dc.html`
| Screen | Frame | Note |
|---|---|---|
| Inbox (Mine) | **10b** | 16 |
| Inbox (Team) | **2d** (filters from 2c) | 17 |
| Chat ⋮ › Label | **11a, 11b** | 15 |
| Insight › Team / Ads / Up next / Activity | 8b · 8c · **9g** · **8e** | 14 (+ 8b/8c as drawn) |
| Assignment › Leave | **13d / 13e** (one sheet for both ways in) | 18-A |
| Calendar | no frame — tweaks 1–7 | 19 |
| Showrooms (Profile) | turn-3 **3a** + turn-4 **4a–4a·3** (one-page edit, drafts with author, Save draft / Discard / Keep editing on Back) | — (no separate note; follow the frames) |
| Facebook blocked | turn-7 **7b** (one grey line instead of the card) | — |

### Desktop — `CRM Optimized Desktop.dc.html`
| Screen | Frame | Note |
|---|---|---|
| Insight › Team performance | period switch only (D1a top row); rest unchanged | 20 |
| Insight › Ads performance | **D2a** | 21 |
| Insight › Up next | **D3a** | 23 |
| Insight › Team activity | **D4a + D4b** | 22 |
| Inbox | **D5a** (also: remove left-nav Team activity and Ads performance) | 24 |
| Reports | **D6a** (Lead sources & status merged into Overview via Columns) | 25 |

## Cross-cutting rules (repeated in the notes)
- **Remember per user (server-side prefs, not only localStorage):** Ads performance figures + chart folded/open (21); Reports columns (25).
- **One audit-log format everywhere** (chat, Customer info, Team activity drawer, Settings): the D4b timeline (24 §5). The chat Audit log stays in its own right-hand panel, folded by default.
- **Time format:** `4m` · `1h 05m` · `9h 45m` · `1d 3h`; dates added when the period isn't Today ("8 Nov, 8:40").
- **Rows the same height** whatever they contain (badges, label tags): fix line heights as the notes say.
- **Plain words for state** ("Never replied · 3 d", "Needs our reply · 9 h", "Customer hasn't replied · 2 d", "Visit booked · Sat 14 Nov").
- Sentence-case table headers; zeros and "—" in `#A8968B`; late values in oxblood `#8A1F0A` text, no pills.

## Design tokens used in this round
- Ink `#422315` · Rust `#BD4A19` · Oxblood `#8A1F0A` · Brown `#6F402C` · Amber `#FFA91F` · Orange `#EE5E08` · Green `#2F7A4A`
- Muted text `#7A6255` · Faint `#A8968B` · Body text `#5A4034` · Light on dark `#E0CFC4`
- Sand fills `#F7F3EF` · `#FBF7F3` · `#F5F0EA` · Lines `#EEE8E3` · `#F4F0EC` · `#E2D8D0`
- Tints: annual `#FFF0D1/#7A4E00` · sick `#FDE3D2/#8A1F0A` · training `#F1E3DA/#6F402C`
- Segmented control: track `#F7F3EF`, padding 3, radius 10; option 30px, radius 8; on = white + `0 1px 2px #2A160C1F`
- Fonts: Inter (UI), Inter Tight (titles, numbers)

## Screenshots
`screenshots/` has one PNG per chosen frame (with its notes on top), for a quick look and for comparing against production:
- Phone: 10b inbox (Mine) · 2d inbox (Team) · 11a/11b chat ⋮ › Label · 8b/8c/9g/8e Insight · 13e Add leave (13d = same sheet, opened from a name) · 3a, 4a, 4a·2, 4a·3 Showrooms · 6a·2 WhatsApp cold · 7b Facebook blocked
- Desktop: D1a (period row only) · D2a · D3a · D4a · D4b · D5a · D6a

The screenshot tool draws masked icons as **filled squares** — that is a capture artefact. Open the `.dc.html` files for the real icons and exact values; the HTML is the source of truth, the PNGs are a guide.

## Files
- `CRM Optimized Phone.dc.html` — phone frames (turns 1–14)
- `CRM Optimized Desktop.dc.html` — desktop frames D1a–D6a
- `Voice Note Scrub.dc.html` — voice-note interaction prototype
- `notes/09–25` — the spec for each change
- `screenshots/` — PNG of each chosen frame
- `icons/`, `support.js` — only to open the HTML references
