# 22 · Desktop Insight › Team activity = frames D4a + D4b (owner, 2026-11-10: "use d4b")

Spec: D4a (list) and D4b (a lead open) in `CRM Optimized Desktop.dc.html`. Source: `desk/DeskTeamActivity.tsx`, `shared/team-activity.ts`. Same data and behaviour; layout follows phone 8e (notes/14b).

## Top
- Header + period as notes/20 (the period here replaces the old Today/Week/Month/Custom of this tab).
- Filters: Everyone ▾ · All ads ▾ (34px, `#F7F3EF`); right: green dot + "Live · 18:24".
- Figures on an espresso strip (`#422315`, radius 16, 88px), 5 equal centred columns, white 30px values, `#E0CFC4` labels, Waiting `#FFB38A` when any wait is late.

## Table
- One list (not grouped by team). Columns `260px 200px repeat(5, 1fr)`: Name (chevron 13px fixed + name; header indented 23px) · Team (dot + name; header indented 15px) · Leads · Avg reply · Waiting (centred) · Appt · Show-up. Header row 38px `#FBF7F3`, sentence case; headers still sort.
- Default sort: leads high → low (notes/14b); 0-lead people last, not greyed. Top 6, then "Show N more"; "Not in turn N" folded at the end.
- Times: 4m · 1h 05m · 9h 45m; late waits oxblood text, no pill.
- A person opens to their leads on `#FBF7F3`, on the same grid: customer under Name (indent 23px) · time under Team (indent 15px; "8:40" for Today, "8 Nov, 8:40" for any other period) · reply under Avg reply · status (6px square + word) right-aligned across Appt + Show-up.

## A lead open (D4b)
- Click a lead → drawer on the right, 420px, from below the tab row to the bottom, no dim. The table stays usable and **tightens to `230px 160px repeat(5,1fr)` with right padding 452px** so all seven columns stay visible. Clicking another lead swaps the drawer. The open lead's name is rust.
- Drawer head: avatar 44 · customer (Inter Tight 22px) · ad (13px muted) · **‹ 1 / 3 ›** steps through this person's leads · × (Esc) closes.
- Facts row: Got · First reply · Now with (3 equal columns, dividers).
- Timeline (no "Log" heading): date + time right-aligned in a 62px column, a dot (ink for got/moved, green for reply / appointment / show-up) on a 2px line, title 14.5px 600 + sub 13px muted.
- Foot: Open chat (46px, rust, full width).
- Closing gives the table its full width back.
