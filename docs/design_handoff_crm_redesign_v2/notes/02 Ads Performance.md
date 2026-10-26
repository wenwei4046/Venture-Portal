# Ads Performance: colour + clean-up (fix request)

Design reference: `CRM Desktop.dc.html` › 05 Ads Performance.

## Remove
1. The period tabs next to the title (Today · This week · This month · Custom). The date button under the title already does this job.
2. The info line "Ad names, spend and every Meta figure come from Ads Manager…".
3. The chart footnote "Each line is drawn against its own highest day · hover for the day's figures". Keep the hover tooltip itself.

## Metric cards + chart lines: use the CRM palette
Replace the blue, orange, green, yellow and pink with this fixed series order, taken from the status ramp:

| # | Metric (default order) | Line / dot / top bar | Card tint |
|---|---|---|---|
| 1 | Amount spent | `#422315` ink | `#F3EBE5` |
| 2 | Leads | `#BD4A19` rust | `#FDE3D2` |
| 3 | Cost per lead | `#6F402C` brown | `#F1E3DA` |
| 4 | Appointments | `#FFA91F` amber | `#FFF0D1` |
| 5 | Impressions (or any 5th metric) | `#C29C88` | `#F7F0EB` |

Further metrics continue with `#9A6B55`, then `#DCC6B8`.

## Card style
- **No solid fills.** Cards use the tint background with a `3px` top border in the series colour, plus an 8px colour dot before the label.
- **Value:** `20px` Inter Tight 500, ink `#422315`, tabular-nums.
- **Label:** `12px` Inter 500 `#5A4034`. The chevron and ✕ use `#A8968B`.
- **Size:** height `64px`, radius `8px`, gap `8px`. The "+" card has a dashed rust border.
- **Chart:** lines 2px in the series colour, gridlines `#F4F0EC`, axis labels `11px` `#A8968B`.
- Text on every card stays ink. Never put white text on amber or `#C29C88`.

## By-ad table: Appt rate column
- Show only the percentage, right-aligned like the other number columns. Remove the bar.
- Column width now matches Show-up / Won.
