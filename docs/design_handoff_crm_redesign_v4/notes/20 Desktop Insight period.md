# 20 · Desktop Insight — period switch only (owner, 2026-11-10)

> "可以保留原始设计，但是标记的部分换成截图标识处"

Keep today's desktop Insight (all tabs, figures, tables) unchanged except the period row beside the "Insight" title:

- **Period:** Today · This week · This month · Custom → one segmented control: track `#F7F3EF`, padding 3px, radius 10; each option 30px high, padding 0 14px, radius 8, 13.5px; picked = white, 600, ink, shadow `0 1px 2px #2A160C1F`; others 500 `#7A6255`. Custom still opens the date picker.
- **Dates:** "1–30 Nov" right after it, 14px `#A8968B`, 20px gap.
- **Remove** the "vs 1–31 Oct ×" chip. Comparisons on the figures stay as today.
- Spec: frame D1a in `CRM Optimized Desktop.dc.html` (period row only).
