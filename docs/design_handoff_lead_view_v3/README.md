# Handoff: Lead View v3 — outlets, team permissions, voice notes, AI Agent memory

## Overview
Updates to Lead View (repo `wenwei4046/Venture-Portal`, `src/app/(portal)/leads/`) made on 10 Nov 2026. Builds on `docs/design_handoff_lead_view_v2/`. Main themes:

1. **Outlets** — every lead belongs to an outlet, derived from the ad it came in on (manually overridable). Filterable everywhere.
2. **Team permissions** — people are added from ERP staff; Outlet staff only see their outlets; access can be time-boxed for leave cover; ERP-inactive = access stopped.
3. **Voice notes** — CRM-style, one plays at a time.
4. **AI Agent** — written "how to reach the goal" brief, hand-over free text, Knowledge reads the full folder line, per-question instructions, and a rebuilt Memory (fixed vs collected, learning direction, how it learns, reading order).

## About the Design Files
`Lead View App.dc.html` is a **design reference built in HTML** (open it directly in a browser; `support.js` must sit next to it). It shows intended look and behavior. It is not production code. Recreate it in the existing Next.js / React codebase using its components, Supabase data layer and patterns. All data in the file is mock data.

## Fidelity
**High-fidelity.** Colors, type, spacing and copy are final. Match them using the codebase's existing Lead View styles (same tokens as v2).

---

## 1. Voice notes (Inbox chat)
- Replace `<audio controls>` in `leads/_components/InboxView.tsx` (~line 796) with the CRM component `src/components/member/crm/shared/voice-note.tsx`. Importing it brings `one-audio.ts` → **only one voice note plays at a time** (starting one pauses the other).
- Keep Lead View bubble colors: customer `#FFFFFF` / border `#E7E5D4`; ours `#E9E9C7` / border `#DCDCB4`. Controls, waveform played part and thumb `#5E524A`; unplayed bars `rgba(94,82,74,.3)`; speed pill `#8A7E75` bg, white text.
- Sizes (same as CRM): row 248px wide, min-height 56px; play button 44px, icon 30px; waveform hit area 44px tall, 28 bars, max bar height 28px, gap 2px; time 11px under waveform; right slot 52px round avatar with 16px mic badge bottom-left → after first play becomes 52×30 speed pill (1× / 1.25× / 1.5× / 2×, remembered).
- Scrub: pointer down/move/up on waveform; while dragging thumb grows 12→18px with 6px ring `rgba(94,82,74,.18)` and a tooltip `0:12 / 0:23` (`#2B211C` bg). Release plays from that point. Pressing another note does not stop the playing one until release.

## 2. AI replies need blank lines
`src/lib/leads/ai.ts` ~line 145 prompt says "one to three small paragraphs". Change to "…one to three small paragraphs **separated by a blank line**, no markdown…". Optional safety net in `readDraft`: if >2 sentences and no `\n\n`, split by sentence. Bubbles already use `white-space: pre-wrap`.

## 3. Outlets

### Data
```
outlets: { id, brand, name }[]           // managed in Settings → Brands
ad_outlet: { [adName]: outletId }         // set in Reply rules → Ads
lead_outlet_override: { [leadId]: outletId | 'none' }   // set by CS in customer panel
leadOutlet(lead) = override ?? ad_outlet[lead.source] ?? null
```
Seed outlets: 2990s → 2990s Kelana Jaya, 2990s Petaling Jaya, PWCC Penang; Carress → Carress Taman Maluri, Carress Johor, Carress Penang. 2990s mini has none (its pickers show all outlets as fallback).

### Reply rules page
- Pages and Ads sections share one grid: `minmax(250px,1.1fr) minmax(200px,1fr) minmax(0,1fr) minmax(0,1fr) 56px` (name | outlet | Working hours | After hours | actions). Everything left-aligned; Pages leave the outlet column empty.
- Ads header: "Ads" + segmented filter All / No rule / Has rule; **All outlets** dropdown sits above the outlet column (grouped by brand, counts, "No outlet" last); "+ Add" button right.
- Each ad row has an outlet button styled like the rule chips (map-pin + name + chevron, transparent, hover `#F7F6EE`). Unset = rust text "Choose outlet". Picker lists that brand's outlets + "No outlet". Each change goes to the audit log.
- Trash icon only appears on hover (or when the row is selected) **and** only if the ad has its own rule.

### Leads page
- **All outlets** dropdown first in the toolbar. Source column 2nd line: `Brand · Outlet name`.

### Inbox customer panel
- New first row under "For the salesperson": **Outlet**, same row style as Interest/Budget (40px min-height, bottom border `#F3F1E7`). Value as plain 14px text + small grey "· from the ad" / "· set by you" + chevron; whole value is a native select overlay (opacity 0). Empty = "—" `#C4B9AE`.

### Settings
- **Brands → OUTLETS** block in brand detail: inline-editable names, ad count, trash (removing clears ad mappings), "New outlet…" input + Add.
- **Ads** nav item: list grouped by brand with outlet on the right ("No outlet" in rust), All / No outlet filter, detail with outlet pills, effective replies and source ("Ad rule" / "From <outlet>" / "From the page").
- Nav warning counts like `1 !` show a tooltip on hover (cursor: help):
  - Pages: "1 page needs attention. Open it to reconnect."
  - Ads: "1 ad has no outlet. Its leads won't show up when you filter by outlet."

## 4. Team permissions (Settings → Team)
### Data
```
erp_staff: { code, name, email, job, branch, outletId?, active, leftDate? }   // read from ERP
team: { id, erpCode, role: 'admin'|'cs'|'outlet', outlets: outletId[], reply: bool, reports: bool, from?: date, to?: date }
```
Name/email/position always come from ERP (read-only here).

### Rules
- **Add from ERP** opens a modal (480px, search by name / staff ID / branch). Already added or ERP-inactive people are greyed ("Added" / "Inactive in ERP"). On pick: ERP job **Lead Executive** → role Customer service; anything else → Outlet staff with their ERP branch outlet pre-ticked.
- Roles: **Admin** (everything incl. Settings), **Customer service** (all outlets, chats, replies, reports, no Settings), **Outlet staff** (only picked outlets **plus chats with no outlet**).
- Outlet staff options: OUTLETS multi-select pills grouped by brand; CAN switches — See chats and leads (always on, locked), Reply to customers, See reports; ACCESS: Always / Only between dates (date range; login stops after last day). List shows "Until 16 Nov" chip.
- **ERP inactive ⇒ access stopped automatically** (and restored if reactivated). Shown greyed with rust "Inactive in ERP · access stopped" and a banner in detail.
- List grouped **ACTIVE · n** and **INACTIVE · n** (collapsed by default). Default selection = first active person.

### Preview as someone (Inbox)
- Eye button next to Filters → "PREVIEW AS" menu (non-admins). Dark banner `#2B211C` "Viewing as <name>" + scope + Exit.
- Conversation list and tab counts filtered by that person's access. If the selected chat is out of scope, jump to their first visible chat; if none, chat + customer columns become one empty state ("Access stopped" / "No chats for <name>").
- If they can't reply, the composer becomes a locked dashed pill: "View only. <name> can't reply to customers."

## 5. AI Agent
### How it replies
- **How to reach the goal**: free-text textarea under Goal (7 rows). Helper: "Write it like you'd brief a new staff member. The AI reads this before every reply." "Try it" opens Test.
- **Hand to a person**: after the existing toggles, textarea "Also hand over when…" (`handNote`).

### Knowledge
- **Reads the whole line**: picking a folder/file deep in Data center means the AI reads every file sitting directly in each ancestor folder, plus the picked item (folder = everything inside; file = just that file). Sibling branches are not read. Example: pick `2990s / Sofa / 3 seater / Pushback / Model A` → reads Sofa files, 3 seater files, Pushback files, Model A files; not 2 seater, Slide out, Model B.
- File list row: second line "Also reads Sofa › 3 seater › Pushback".
- Detail panel **WHAT THE AI READS · N files**: vertical timeline (9px dots; ancestors `#30673A`, picked level `#A3401A` + bold rust name; connector 1.5px `#DCDCB4`), files per level (tiny ext tag `#FBEFE7`/`#A3401A`), "Not read: …" for skipped siblings (not shown at brand level).
- **ASKED ABOUT** → each question has an instruction ("+ Add instruction" → textarea, saved shows with green corner-down-right arrow). Users can add their own questions (removable). Stored per brand per file: `fileQs[fileName] = { extra: string[], ins: { [question]: text } }`. Must be passed to the AI with the file.
- New Knowledge category **Outlets**: per-outlet lines (facts/rules like parking, weekend-only). Used only in chats from that outlet. Stored as `howOut[outletId] = {id,t}[]`.

### Memory (left nav)
1. **Fixed memory** (pin icon) — rules the AI always uses, never changes/forgets; inline-editable list, "Add fixed memory". Each shows "Added by X · date".
2. **Collected** — LEARNING DIRECTION card (`#FBFAF4`): chip rows "Learn more about" (`#E9E9C7`) and "Don't learn about" (`#F4F2E8`), add via dashed pill input. Segmented To review / In use.
   - To review: Edit / Dismiss / Use it.
   - In use: 👍 More like this / 👎 Less like this (toggle, label shown), Edit, Turn off, **Make fixed** (moves into Fixed memory).
3. **From goal results** — learned lines with success rate ("58% reached · 212 chats"; ≥45% green `#30673A`, 30–44% `#5E524A`, <30% rust + warning), AI suggestion cards (Change line N with strikethrough old text / Add a line / Add for <outlet>; evidence + "Based on N chats"; Dismiss / Use it).
4. **How it learns** — settings rows (title 14px + description 13px `#8A7E75` left; control right), modelled on Claude Code settings:
   - **How it starts reading** (top): ordered list of sources read before each reply; higher wins on conflict. Rows: number, title, description; up/down arrows appear on hover (row bg `#F7F6EE`); switch on the right (off = 45% opacity, no number, "Not read"); Fixed memory locked on. Default order: Fixed memory, How to reach the goal, Fixed answers, This customer, Earlier chats with this customer, Outlet info, Sales playbook, Knowledge files and links, General info, Current promotions, Collected memory. **+ Add your own** adds a custom source (name + "What should the AI read or keep in mind here?"), tagged "Yours", editable/deletable.
   - Learn from its own chats (switch) · Learn from CS and templates (switch) · Learn from: Reached the goal / All chats · New lessons: Ask me first / Use right away / Don't collect · Minimum chats (number, default 5) · Forget unused lessons: Never / 30 / 90 days (fixed never forgotten) · Share lessons across outlets (switch).
- Removed: the "Reaching the goal" tab (superseded by the above).

All AI settings are per brand. In the mock the Test chat uses canned replies; implementation must feed: fixed memory, howGoal, handNote, reading order/off flags, custom sources, per-file question instructions, outlet lines and collected lessons into the prompt in the configured order.

---

## Design tokens (unchanged from v2)
- Ink `#2B211C`, body `#5E524A`, muted `#8A7E75`, faint `#A3978D`, disabled `#C4B9AE`
- Rust (primary/alert) `#A3401A`, rust tint `#FBEFE7`, rust border `#D9B8A6`
- Green (success/on) `#30673A`; khaki selected `#E9E9C7`, khaki border `#DCDCB4`
- Surfaces `#FFFFFF`, `#FBFAF4`, `#F7F6EE`, `#F4F2E8`; borders `#E7E5D4`, `#ECEADB`, `#F3F1E7`, `#DEDCC8`, `#CFC9B0`
- Type: Figtree (UI, 12/13/14px), Georgia (titles 17–30px). Section labels 11px, letter-spacing .1em, `#A3978D`.
- Radii: 7–9px controls, 10–14px cards/sections, 999px pills. Switch 32–38×18–22px.
- Popover: white, 1px `#E7E5D4`, radius 11px, shadow `0 10px 28px rgba(43,33,28,.14)`.

## Assets
Icons: Lucide (same as existing). No images.

## Screenshots (`screenshots/`)
Reference captures of the HTML design (mock data). Use with the README; the HTML file is the source of truth for exact values.
- `01-inbox-voice-notes` — voice notes in chat, Outlet row in customer panel
- `02-inbox-preview-as-outlet-staff` — Preview as Michelle Wong: banner, filtered list, locked composer
- `03-leads-outlet-filter` — All outlets dropdown on Leads
- `04-reply-rules` / `05-reply-rules-outlet-picker` — aligned grid, outlet column, outlet picker
- `06-settings-brands-outlets` — OUTLETS block in brand detail
- `07-settings-ads-outlet` — Settings → Ads
- `08-settings-team` / `09-settings-team-add-from-erp` — Team list + detail, Add from ERP modal
- `10-ai-how-to-reach-goal` / `11-ai-hand-to-person` — How it replies additions
- `12-ai-knowledge-read-path` / `13-ai-knowledge-asked-about` — WHAT THE AI READS line, per-question instructions
- `14-ai-knowledge-outlets` — Knowledge → Outlets
- `15-ai-memory-fixed` / `16-ai-memory-collected` / `17-ai-memory-goal-results` / `18-ai-memory-how-it-learns` — Memory sections

## Files
- `Lead View App.dc.html` — all screens (Inbox, Leads, Reply rules, AI Agent, Settings, etc.). Navigate via the left rail.
- `support.js` — runtime for the HTML reference only; not for production.

Repo files touched by these changes: `src/app/(portal)/leads/_components/*` (InboxView, Leads, Reply rules, Settings, AI Agent views), `src/components/member/crm/shared/voice-note.tsx` + `one-audio.ts` (reuse), `src/lib/leads/ai.ts` (prompt). ERP staff source table not located in the repo — connect to the real ERP staff data.
