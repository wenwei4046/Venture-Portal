# 21 · Desktop Insight › Ads performance = frame D2a (owner, 2026-11-10: "use d2a")

Spec: frame **D2a** in `CRM Optimized Desktop.dc.html`. Header/period as notes/20. Same data, same chart, same table columns.

## Filters
- Running ▾ · All sources ▾ (34px, radius 8, `#F7F3EF`). **Remove** the third filter ("This month · 1 Nov – 10 Nov") — the header period drives it.

## Figure strip (chart folded by default)
- Card 84px, 1px `#EEE8E3`, radius 14. Figures in equal columns (`repeat(n, 1fr)`), **centred**, 1px `#F1EBE6` dividers. Label 12.5px 500 `#7A6255` with an 8px dot in the figure's chart colour; value Inter Tight 500 24px, tabular.
- Right end (divider before it): **+** (36px circle, `#F7F3EF`) opens today's metric picker and adds a column + a chart line, folded or not; hover a figure → × removes it. Then "Show chart ▾" (13.5px 500 rust).
- **Remembered per user, across refresh and next login:** the figures picked (which ones, in their order — added with +, removed with ×) and folded / open. Save to the user's CRM preferences (server, not only localStorage) so it follows them to another computer; first visit uses today's five. The same picked figures drive the chart lines. Folded is the default. Opened: today's chart below the strip; the old metric cards lose their fills, × and ▾ (the strip above does that job).

## By ad table
- Title "By ad" Inter Tight 18px + count `#A8968B`; right: "Columns" (sliders icon) replaces the dashed + column button.
- Header row 38px, `#FBF7F3`, radius 8, **sentence case, one line**, 12.5px 500 `#7A6255`: Ad · Leads · Appts · Appt rate · Show-up · Won · Won rate · Spend (RM) · Per lead.
- Rows 58px: channel tile 28px (WhatsApp `#E7F6EC`/`#1E9E4F`, Messenger `#E6F0FE`/`#0A7CFF`), ad name 14.5px 500 one line ellipsis, brand under it 12.5px `#A8968B` (no repeated ad name). ↗ only on hover. Leads 600. 0 / 0% / — in `#A8968B`.
