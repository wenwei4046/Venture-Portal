# Claude Code: voice notes + every date picker

Please fix two things in the CRM (`src/components/member/crm/`). Follow `.claude/rules/revenue/crm.md`. If a screen is generated (`tools/crm-design/`), fix it in the generator/patch so it survives the next run. When done, list every place you changed and anything you couldn't fix.

## 1. Voice notes: only one plays at a time
`shared/voice-note.tsx`: every note has its own `<audio>`, nothing stops the others.
- Keep one module-level `playing: HTMLAudioElement | null`. Before `a.play()`, pause `playing` if it is another element; set `playing = a`; clear it on `pause` / `ended`.
- Apply the same to `shared/file-preview.tsx`'s `<audio>` (or one capture-phase `play` listener on `document` that pauses every other `audio`).
- Desktop chat, phone chat (salesperson and Control panel) and the file viewer.

## 2. Every date choice can be Custom, and nothing overlaps
**Rule:** anywhere the user picks a period (Today / This week / This month / …), there is also **Custom**, and Custom lets them pick any From and To date, including earlier months. The picker never overlaps other content and is never clipped.

### Build one shared picker and use it everywhere
`shared/date-range.tsx` (desktop + phone):
- Presets row (whatever the screen has now) + `Custom`.
- Custom opens a popover (desktop) / bottom sheet (phone) with: month header with ‹ › to move months (no limit to the current month), a month grid, click start then end (if the second click is before the first, swap them), the chosen range shown as text (`3 – 18 Oct 2026`), From / To date inputs that stay in sync with the grid, `Apply` and `Cancel`.
- Future days: allowed only where the data can exist (e.g. Calendar, leave); disabled for reports/insight.
- Output `{ a: start of From 00:00, b: end of To 23:59 }` in local time.
- Layout: the popover is portalled to the frame (or uses fixed positioning), flips up/left when there isn't room, has its own z-index above tables/side panels, and closes on outside click / Esc. Labels never wrap inside fixed-height pills (`white-space: nowrap`, ellipsis). No invisible `opacity: 0` inputs: those don't open the picker in Chrome/Safari.

### Places to switch to it (checked in the code)
| Screen | File | Now |
|---|---|---|
| Insight (desktop) | desk/vm/app.ts:112 (`insPer`, `insRange`) | Custom has no date fields; stuck on 1st of month → today |
| Assignment › Ads to teams | desk/vm/assign-v2.ts:98 (`adCal`, `adCustT`) | Calendar shows only this month; future blocked; start may end up after end. proto-logic.ts:624 hard-codes "Oct 2026" |
| Assignment › Leads by ad | desk/DeskExtras.tsx:922 (`lbaFrom/lbaTo`) | Two invisible date inputs over the pill; often don't open |
| Ads Performance (+ Compare) | desk/vm/adsperf.ts (`dp`, `apCF/apCT`) | Own picker; check From/To and compare range |
| Reports | `rpPer` | Check it has Custom; add if missing |
| Chat progress | desk/vm/chatprogress.ts:114 | Works; move to the shared picker for consistency |
| Calendar range | desk/vm/calendar.ts:110 | Works; same |
| Workspace | desk/DeskWorkspace.tsx:166 | Works; same |
| Audit log | desk/vm/audit.ts (`auPer`: Today / 7 days / Month) | No Custom: add it |
| Showrooms › block dates | desk/Desk4a.tsx:1811 | Check layout only |
| Phone Overview / Compare | panel/vm/app.ts:122, panel/vm/common.ts:191 (`ovSheet`) | Check months can be changed and range applies |
| Salesperson Insight | sales/vm/insight.ts:122 (`irApply`) | Same |
| Leave (Up next / People) | new | Use the same picker + time |

Test each: pick a range in a previous month, a range crossing two months, a single day, end-before-start; resize to 1280 px wide and the phone; open it inside a side panel and near the right edge.
