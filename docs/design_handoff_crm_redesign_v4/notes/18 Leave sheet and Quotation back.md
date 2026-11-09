# 18 · Assignment › Leave sheet; Profile › Quotation settings Back (owner, 2026-11-10)

## A. Assignment › Leave (frames 13d, 13e)
> "请假很简单，只需要我点哪个人名或+ leave，就会跳出add leave … UI，字体要好看一点，不要overlap"

- **Bug today:** the Add leave sheet (`shared/PhoneLeaveCal.tsx › LeaveSheet`, z-index 43) draws **under** the CRM's bottom tab bar, so the To field and Cancel / Save are hidden. Render the sheet above the tab bar (portal to the CRM shell, or a z-index above the nav), `maxHeight: 88%`, scrollable body, buttons always visible with the safe-area padding.
- **Flow:** tapping a person row opens Add leave with that person set (`openModal({ who: id, … phone: true })`), not the person sheet. If they have a leave now or upcoming, open **Edit leave** on it instead (with Remove). + Leave opens Add leave on the first editable person, with **Change** to pick someone else.
- **Sheet (13d/13e):** title "Add leave" Inter Tight 500 22px + 36px close (×). Person row 56px, 1px `#E2D8D0` border (avatar 36, name 16px 500, team dot + name 12.5px) + "Change" in rust — **the same sheet (13e) whether opened from a name or from + Leave** (owner: "use 13e 的设计 … 都一样"); from a name the person is preset. Reason: 4-way segmented control, 40px, on = white + shadow. When: one `#F7F3EF` block, two 52px rows "From" / "To" (13px muted label 40px wide), date field flex 1 and time field 76px, both 38px, white, 15px 500, **left-aligned** (keep the DT reset). Buttons: Cancel (outline) 1fr · Save leave (rust) 1.6fr, 50px, radius 25. Other → note field under Reason as today.
- **List rows: no change.** Top of the page (13d/13e): + Leave moves up beside the title (36px pill, rust) — one row saved. Tabs: 14px, 500 / 600 when on, spread with `justify-content:space-between` so all five fit at 390px with nothing cut off; on = ink + 2px rust underline, row has a 1px `#E6DED7` rule. Title 30px.
- Pause / Lock / lead days stay where they are elsewhere (Active, Full time); the Leave tab no longer opens the person sheet.

## B. Profile › Quotation settings → Back
- Today: `RevenueApp.tsx` `openIrqSettings` shows the IR Quote settings (`irqSettings = true`); its Back is `onBack={() => setIrqSettings(false)}` — that drops the person outside CRM Profile.
- **Change:** remember where settings were opened from. When opened from CRM (`CrmApp onQuoteSettings`), Back returns to the CRM on **Profile** (route `account / pf: "crm"`, `CrmApp open={{ tab: "profile" }}` or equivalent), scroll position kept if possible. Android Back does the same (notes/10). Opened from the Quote screen, Back stays as today.
