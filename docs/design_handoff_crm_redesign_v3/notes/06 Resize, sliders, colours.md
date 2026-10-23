# Sliders, split columns and resizing rules (fix request · round 4)

## 06 Split panel: sliders
- **Team rows:** under each team row there is a slider (4px track #EEE2D8, fill and thumb ring in the team colour, 14px white thumb). It is aligned with the name (19px indent).
- **Person rows (By %):** a slider sits between the name (92px) and the % box, in rust with a 12px thumb.
- **Slider and box stay in sync:** dragging changes the box, and typing moves the thumb. Steps are 0.5 while dragging; typing allows 0.1.
- **Total:** dragging one row re-balances the others proportionally, but only rows you have not touched. Rows you set yourself stay locked. Total stays 100%.
- **Thumb:** it stays inside the track (clamp left between 0 and track width) and never covers the % box or the name.

## 06b Leads by ad: Name and Team in separate columns
- **Columns:** Ad / Member · Team · Status · Members · Leads.
- **Member rows:** the name sits in the first column and the team (dot + name) in the Team column. Each truncates with an ellipsis on its own, so they never overlap.
- **Ad rows:** the Team column shows up to 3 overlapping team dots + "3 teams".

## Every resizable thing: never overlap
This applies to the Audit log / Customer info panels, the 06b columns and every CRM table with column handles.
- **Minimum widths:** every column and panel has one. The drag is clamped to it, and a column can never shrink below its content minimum. Ad 180, Team 110, Status 80, Members 110, Leads 52 px. Audit log panel 240–520 px. The chat column keeps at least 420 px.
- **Cell content:** every cell uses `min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis`. Text never spills into the next column.
- **Too little room:** when the widths add up to more than the container, the table scrolls sideways (`overflow-x: auto`) instead of squeezing or overlapping. The first column stays sticky (`position: sticky; left: 0` with a white or row background).
- **Header and body:** both share the same width source (one CSS grid template, or one colgroup), so headers and cells always line up while dragging.
- **Live feedback:** while dragging, show `cursor: col-resize` on the whole page, turn the handle rust #BD4A19, and turn off text selection.

## Round 5
### Summary blocks are less pink
Insight hero, Reports KPI strip and similar large blocks: background #F5F0EA, border 1px #ECE3DA, dividers #E6DCD2. Cream #FCEEE2 stays only for small things (selected row, avatar, chat wall).

### Inbox list (live site overlap)
- **Chip row:** a single line that scrolls sideways (`flex-wrap: nowrap; overflow-x: auto`). The list starts below it and never overlaps it.
- **Each row:** a fixed 3-line layout.
  1. Name (ellipsis) + time (nowrap, right).
  2. Channel icon + ad name (ellipsis).
  3. Preview (ellipsis) + owner tag (nowrap, right, max-width 40%) + unread badge.
- **List column:** resizable 300–480 px, with the same rules as the other resizable panels.

### Contacts table
The Name column has min 170 px, and name and phone each stay on one line with an ellipsis. The other columns have minimum widths too. When they no longer fit, the table scrolls sideways with Name sticky.

### Reports > Salespeople
- Column headers are Appts / Show-up / Won; the grey % next to each number is the rate.
- Every header has a resize handle except the last one.
- The footnote is removed; that text moves to a header tooltip on First reply.

### Inbox and Audit log colours (less pink)
- **Inbox selected row:** background #F5F0EA (warm sand), left bar 2px rust #BD4A19 (was cream #FCEEE2 with an orange bar).
- **Chat wall:** #F7F3EF (was #FCEEE2). Own bubbles stay rust; customer bubbles stay white.
- **Audit log panel:** white #FFFFFF, header #FBF7F3, borders #EEE8E3 (was tan #F6E7D8 / #E3CDB8).

### One "selected" colour everywhere
Every selected, active or open item uses the same treatment:
- **On white surfaces** (table rows, list rows, dropdown options, expanded customer rows): background #F5F0EA, plus a 2–3px rust #BD4A19 left bar on rows.
- **On the cream CRM nav:** active item background #EFE6DD (a step darker so it shows on #FBF4EC). The small orange active-nav mark stays.
- **Expanded parent rows** (e.g. an ad in Leads by ad): #FBF7F3. The selected child uses #F5F0EA.
- **Retired for selection:** #FCEEE2, #F3DFCC and the orange #EE5E08 row bar.
- **Segmented controls and tabs keep their own style:** white pill on #F7F3EF, and a rust underline.
