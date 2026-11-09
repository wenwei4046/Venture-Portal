# 19 · Calendar (phone, Team) — small tweaks only (owner, 2026-11-10: "不用画出来，只是微调")

Source: `shared/PhoneLeaveCal.tsx › PhoneCalendar`, `shared/leave-cal.ts`. Behaviour unchanged. Approved (owner: "全部照你的画"), with point 3 changed:

1. **One header row.** "Calendar" title + the month row become one row: "November 2026" (Inter Tight 500 26px) · ‹ › · + (40px). Saves ~56px.
2. **Layer chips smaller.** Appointments / Leave tick chips 36px → 32px, 12.5px text, 14px tick box; same toggle logic.
3. **Leave bar text: keep "Chin · Other", never cut or overlapping.** Draw each leave as ONE bar per week row, absolutely positioned across the columns it covers (left = first day's column, width = its days), so its label has the whole bar's width, not one 55px cell. Label 10px 600, ellipsis only at the bar's own end. A one-day leave is 2 lines in its cell (26px bar): "Chin" / "Other" at 9.5px. Lanes as today (max 3, then "+N").
4. **Shorter cells.** `minHeight` 88px → 72px. Six weeks then end ~100px higher, so the day list ("Tue, 10 Nov" + items) starts above the tab bar.
5. **Days outside the month.** No beige fill (`C.outMonth` → `#fff`); the faint number is enough.
6. **Grid lines lighter.** `--crm-rule-2` → `#F3EEEA`.
7. **Appointments (the yellow chips).** No fill: a 5px amber dot (`#FFA91F`) + time 10px 650 ink + first name 10px 500 `#7A6255`, no padding — "● 20:00 Chin" fits a 55px cell without cutting. Several on one day stack one per line; past the room left by leave bars, "+N" (10px 600 muted). Tap opens the visit as today. Approved (owner: "可以").
