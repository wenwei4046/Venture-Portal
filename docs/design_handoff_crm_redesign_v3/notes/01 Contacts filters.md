# Contacts: filter dropdowns + right rail (fix request)

Design reference: `CRM Desktop.dc.html` › 03 Contacts.

## 1. Remove the "Breakdown" donut from the right rail
- Delete the Breakdown block: the title, the "By status" switch, the donut and its legend.
- Keep the **Selected** customer panel: details, Open chat, Customer info. It now starts at the top of the rail.

## 2. Filter dropdowns (Ad, Showroom, Status, Assigned to)
Problem on the live site: long ad names overlap each other (the line-height collapses), and the menu is too narrow.

Specs for every filter menu:
- **Width:** `min-width: 240px`, Ad menu `width: 360px`, `max-width: calc(100vw - 32px)`.
- **Option row:** a grid with columns `16px | 1fr | auto` (tick · label · count), `align-items: start`, `padding: 8px 10px`, `border-radius: 7px`, gap 2px between rows.
- **Label:** `font: 13px/1.4 Inter`, `display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere`. Show the full name in a `title` tooltip.
- **Count:** `12px` Inter Tight, tabular-nums, `#A8968B`, aligned to the first line.
- **Selected row:** background `#FCEEE2`, label 600, rust tick `#BD4A19`.
- **List:** `max-height: 300px; overflow-y: auto`.
- **Search field:** add one at the top of the **Ad** menu only (it has many long names). 34px tall, `#F7F3EF`.
- **Showroom:** the same row spec, so "Skyline Embassy B-19-08" wraps cleanly onto 2 lines without overlapping.
