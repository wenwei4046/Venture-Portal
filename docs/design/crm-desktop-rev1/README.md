# Handoff: CRM Desktop rev 1 (Venture Portal · Revenue app › Profile › My leads & appointments)

> 中文摘要：這是 CRM 電腦版（Principal / Revenue Director / Team leader / RS）的設計交接包。`prototypes/` 是可直接在瀏覽器打開的 HTML 原型（只是設計參考，不是正式程式碼）。逐項的修改與驗收方式寫在 `CRM Desktop rev 1 dev changes.md`。所有數字都是示範資料；標 **NEW DATA** 的項目需要先提資料庫方案、取得同意才實作。

## Overview
Desktop (≥ 1024 px) version of the CRM that opens from **Revenue app › left sidebar › Profile › MY LEADS & APPOINTMENTS**. It gives the Principal / Revenue Director a control panel (Insight, Inbox, Assignment, Calendar, Ads Performance, Showrooms, Settings), and the same frame is reused for the RS (salesperson) desktop (“Mine”). The phone CRM stays exactly as it is; the desktop reads the same data, writes and permissions. **Forms, Ads Performance and Chat progress are desktop only** — do not add them to the phone.

Place this folder at `docs/design/crm-desktop-rev1/` in `Venture-Portal` and run `crm-desktop/prompt-claude-code.md`. The change list wins where the prototype differs.

## About the design files
The files in `prototypes/` are **design references created in HTML** — prototypes that show the intended look and behaviour, not production code. Recreate them in the existing codebase (`src/components/member/crm/desk/`, `crm/panel/desk/`, `crm/sales/desk/`, React + CSS modules) using its established patterns, view models (`crm/panel/vm/*.ts`, `crm/sales/vm/*.ts`) and the phone's generated side-pane screens (change those only through `tools/crm-design/` patches).

How to open: serve the `prototypes/` folder (e.g. `npx serve prototypes`) and open `CRM Desktop rev 1.dc.html`. It is a pan/zoom canvas of frames; every frame is the same live component (`CrmFrame.dc.html`) with different starting props, and everything inside is clickable. `support.js` is only the prototype runtime — do not port it. Inter is loaded from Google Fonts (needs internet).

## Fidelity
**High fidelity.** Colours, type, spacing, radii and interactions are final. Copy is final (English UI). Data is demo data (Teams Kelvin / Priya / Ryan, Revenue Director Peter, Principal).

## Frames in the prototype
| id | Frame | Props |
|---|---|---|
| 2a | Settings · right menu open | 1440, panel, settings, principal, sheet, menu |
| 2b | Settings page open (menu closed) | 1440, panel, settings, principal, sheet, op |
| 2c | Assignment · menu · Director | 1440, panel, assignment, director, sheet, menu |
| 2d | 1280 × 800 · RS Profile · menu 440 | 1280, rs, profile, rs, sheet, menu |
| 1a | Inbox · docked chat pane | 1440, panel, inbox, principal, docked, chat |
| 1b | Inbox · docked pane empty | 1440, panel, inbox, docked empty |
| 1c | Insight · Director (Team / Mine) | 1440, panel, insight, director, closed |
| 1d | Overlay pane · CRM alerts over Insight | 1440, overlay, alerts |
| 1e | Wide pane · Settings section | 1440, wide, section |
| 1f | Mine · RS desktop tabs · Team leader | 1440, rs, inbox, leader, docked |
| 1g | 1280 × 800 · docked 400 · toast with Undo | 1280, docked, toast |
| 1i / 1j | Sidebar collapsed to 72 px rail (1440 / 1280) | collapsed |
| 1h | 1280 × 800 · Insight · Director | 1280, insight, closed |

**Which frames are authoritative:** frames **2a–2d** (`flow="sheet"`) are the reference for every page and for all behaviour in the change list — use 2a to click through Insight, Inbox, Assignment, Calendar, Ads Performance, Showrooms and Settings via the left sidebar. Frames **1a–1j** are only the frame / pane-mode study (docked, overlay, wide, collapsed rail, 1280 size, toast); their Assignment, Settings and Showrooms pages use an older list/wide-pane flow and are **superseded** — ignore them for those pages.

## Layout (frame)
- Canvas 1440 × 900 (also 1280 × 800). Revenue app top bar 60 px (greeting, Fair view selector, date mono 12.5 px, Revenue-app bell — **not** the CRM's — Sign out).
- Left sidebar 240 px, collapsible to a 72 px icon rail (toggle at top right of the sidebar). Order: Today, Insight, Quote, Arena · Profile (expands) › MY LEADS & APPOINTMENTS › Insight, Inbox, Assignment, Calendar, Ads Performance, Showrooms, Settings · Notifications (Revenue app) · account card at the bottom. No count badges on Inbox / Assignment / Calendar.
- CRM header bar 56 px: page title + “N new” + **CRM alerts** button (count badge) on the right.
- Right side pane: docked 440 px at 1440 / 400 px at 1280 (page shrinks to make room), overlay variant with shadow `-16px 0 40px rgba(40,25,18,.16)`, wide variant (page 380 px + pane).
- Right menu sheet (Assignment, Settings, Showrooms, RS Profile): 520 px (440 at 1280) slides in from the right; picking a row opens the page full width; the rust chip next to the page title (“All settings”, “All assignment”) reopens the menu. Esc / × / click outside closes.
- Toast: bottom centre, `#3F2B22`, radius 12, 13.5 px, auto-hides after 3 s, optional **Undo**.

## Design tokens (as used — map them to the codebase's existing CSS variables)
- Font: **Inter** 400 / 500 / 600 / 650 / 700. Body 13.5–15 px; page titles 28–34 px / 700 / −0.02em; section labels 11–12 px / 700 / letter-spacing .06–.1em uppercase; numbers `font-variant-numeric: tabular-nums`.
- Text `#3F2B22` · strong brown `#4E2F20` · muted `#806B60` · faint `#A08E82` / `#C9B8AC`.
- Primary (rust) `#BD4A19` · hover/pressed `#A3371A` · tint `#FFF1E6` / `#FFF0E4` / `#FFF5EC`.
- Surfaces: white `#FFFFFF`, soft `#FBF6F2`, tint `#F5EBE3`, app bg `#EFE8E2`, chat bg `#EFE7DE` + `assets/chat-pattern-clean.svg`.
- Borders: card `#EBDDD2`, hairline `#F1E7DF`, control `#E2CFC1`, checkbox `#CDBCAE`.
- Team colours (ink / tint): Kelvin `#BD4A19` / `#FFF0E4` · Priya `#2F6FB5` / `#E4EDF8` · Ryan `#8E4B6E` / `#F3E8EF`.
- Ad status: Running `#3FA06B` (ink `#387557`, tint `#E8F3ED`) · Paused `#B4AEA4` (ink `#6B645A`, tint `#F2F0EB`) · Pending `#E1B04F` (ink `#A46312`, tint `#FFF0CC`).
- Status chips: New `#FFF1E6`/`#BD4A19` · Follow up `#F1E7DF`/`#6B574C` · Appointment `#E4EDF8`/`#2F5E8C` · Overdue `#F8E1D8`/`#A3371A` · Showed up / Won `#E8F3ED`/`#387557` · To mark `#FFF0CC`/`#A46312`.
- Danger: `#A3371A`, delete button `#C8452A`, danger tint `#FBE9E4` / border `#F0C9BC`.
- Radii: pills 11–22 px (height/2), controls 9–12 px, cards 14–18 px, hero card 26 px.
- Shadows: dropdowns `0 10px 30px rgba(63,43,34,.14)`; selected seg `0 1px 3px rgba(63,43,34,.14)`; dragged row `0 6px 18px rgba(63,43,34,.22)`.
- Spacing: 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 22 / 24 px; page padding 20–24 px; card padding 16–20 px.

## Interactions & behaviour (global)
- Every dropdown closes on outside click and Esc; Esc also closes the side pane / menu.
- ↑ / ↓ inside numeric inputs moves focus to the previous / next numeric input in the same panel and selects it.
- Chevrons rotate `transform .15s`; no other motion beyond native hovers. Hover = soft tint (`#FBF6F2` / `#FFF5EC`), focus ring = 2 px rust.
- Save-gated editors: editing panels (ads split, full time, showrooms, templates, forms, member work type, customise metrics, date picker) change nothing until **Save / Apply**; Cancel / × discards.
- Toast after every save / apply / delete (“Saved · …”, “Applied to 3 running ads”, “Deleted 3 notifications”).

## State management
The prototype keeps everything in one component state; in production most of it is server data. Key client state: sidebar collapsed, current tab, pane mode/kind, right-menu stage, selected chat/visit/customer, inbox people filter (multi), Chat progress filters (time range, person/team, my actions, status, sort, selected chat), Ads Performance (status filter, date range + compare range, selected/ordered metric columns, sort column/dir), notifications (category, unread/read tab, selection mode, picked ids). Server data / NEW DATA items are listed in the change list.

## Assets
- `prototypes/assets/chat-pattern-clean.svg` — chat background pattern (same as the phone chat).
- Icons: Lucide-style inline SVG paths (stroke 1.7–2.4). Use the codebase's existing icon set; Waze / Google Maps use brand-coloured letter badges (`#33CCFF` W, `#34A853` G) — swap for official marks if available.

## Files
- `prototypes/CRM Desktop rev 1.dc.html` — overview canvas of all frames.
- `prototypes/CrmFrame.dc.html` — the whole interactive desktop CRM (template + logic + demo data).
- `prototypes/support.js` — prototype runtime only.
- `CRM Desktop rev 1 dev changes.md` — numbered change list with acceptance checks and NEW DATA flags.
