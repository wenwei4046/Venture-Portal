# Assignment, Showrooms and side rails (fix request · round 2)

Design reference: `CRM Desktop.dc.html` › 06 / 06b / 06c / 07, plus the folded rails on 02.

## 06b Leads by ad
- **Header:** the title stays on one line (`white-space: nowrap`). The period and status controls move to a second row so nothing overlaps.
- **Status filter:** All · Running · Paused · Ended. The colour dot matches the status pill.
- **Period:** This month · Last month · All time · Custom. Custom shows a date-range button.
- **Click a member** (in an expanded ad): the row highlights (`#F3DFCC` + 3px orange left bar) and a **left panel** (300px) opens.
  - Panel header: the member, their team, and "**9 leads** from {ad} · {range}".
  - Panel list: every lead they got from that ad in the range (name, phone · date, status pill). Clicking a lead opens the chat.
  - ✕ closes the panel.
- **Insight needs the same numbers.** On the Insight Team performance table, each member row gets a "Leads by ad" breakdown (expand or tooltip), using the same query: leads assigned per member per ad per date range. It must match 06b exactly.

## 06 Split panel (By team)
- **Decimals:** % inputs accept decimals (`inputmode="decimal"`, step 0.1, max one decimal), e.g. 24.5%. Total must still equal 100.0 (round to 0.1).
- **Alignment:** every input is `84px` wide, right-aligned, with the "%" suffix inside the box. Team rows and the per-person rows (By %) share the same right edge, so nothing overlaps. Per-person inputs are 28px tall, team inputs 34px.

## 06c Active members
- **One table card** like Approvals:
  - Header: title, counts, search, All / Active / Locked.
  - Columns: Name · Team · Title · Status · Leads this month · New leads (toggle).
  - Rows are grouped by team with a light group row: team dot + name + "3 of 5 active". Director first, then teams in a fixed order.
- **Locked row:** grey avatar, muted name, "Locked" pill with a lock icon, "—" for leads, toggle off.
- **Names:** Title Case (see Active members fix note).

## 07 Showrooms
- **Delete showroom:** an oxblood text button with a trash icon at the bottom of the left column. Confirm before deleting. If upcoming visits exist, block it and say how many.
- **Opening hours** (the left column scrolls):
  - "All days" row: from–to time inputs + **Apply to all** (rust). This fills every open day.
  - Then one row per weekday: toggle (open/closed) + from–to inputs, editable one by one.
  - The weekly grid on the right still supports drag-select. Typing and dragging update the same data.
- **Remarks:** a textarea with a "Staff only" lock pill. It is never sent to or shown to customers. Show it to sales in Book visit for that showroom.

## Folded side rails (Customer info, Audit log, Ad performance)
All folded rails use one style:
- `width: 44px`, background `#FBF4EC`, `border-left: 1px solid #EEE8E3`.
- Top to bottom: 16px icon `#6F402C`, vertical label (`writing-mode: vertical-rl`, 12px Inter 500, `#5A4034`), then one `chevron-left` 13px `#A8968B`.
- Use a single chevron, not «. No white or tan variants.
