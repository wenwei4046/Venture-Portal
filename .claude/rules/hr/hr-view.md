---
paths:
  - "src/lib/hr-view.ts"
  - "src/components/layout/Hr*"
  - "src/components/layout/hr-nav.ts"
  - "src/components/layout/PortalFrame.tsx"
  - "src/components/hrv/**"
---

# HR tab — HR's view (the shell) and the revamp's kit

HR's view of the portal — the hr role, and the Principal viewing as HR — and the `components/hrv` kit its revamped pages are drawn with. The pages themselves are in their tabs' files (`../revenue/comm-cal.md`, `people.md`, `../revenue/revenue-app.md`). DESIGN.md › "The HR revamp" is the visual spec.

Read this before changing anything it covers, and again in every full scan of such a change (CLAUDE.md › Rules by tab). New decisions are added here, dated.

**HR'S OWN SHELL (2026-10-10, the Claude Design handoff *Sidebar design revamp from HR*: `.design/hr-revamp/handoff`, README = spec, `design/Revenue App.dc.html` = source of truth, variant A; user: "colour tone, motion, function & button 100% same with prototype"):** `lib/hr-view.ts` `isHrView(role)` decides; PortalFrame draws `.hrv-shell` — `HrSidebar` (square, full height, 248 ↔ 64px content-box, five toned sections from `hr-nav.ts`: Overview · HR & Payroll · Directors · Revenue · People · Admin; one pill slides to the clicked row, tile swaps tones + scale 1.06, label nudges 2px; the H tile folds it, cookie `vp-hr-nav`), `HrTopBar` (white; the "HR view" words are the view switcher for an account that may switch; no theme toggle — the prototype has none and the shell is drawn light), and the sheet as `<main>` scrolling inside `.hrv-frame` (`data-hrv-overlay`: drawers, windows and the toast portal there, covering the sheet only). Every other view keeps its shell (user: the design is HR's view). HR's sidebar drops Claims and Revenue › Department (pages kept). Phone: the old TopBar / tab bar / More sheet. Tests: `hr-nav.test.ts`, `PortalFrame.fin.test.tsx`, `layout.test.tsx`.

**ROUND 2 — THE KIT'S ADDITIONS (2026-10-11, the handoff's second package `.design/hr-r2/handoff`; plan `.design/hr-r2/PLAN.md`; DESIGN.md v3.30):** `components/hrv/select.tsx` `Select` = the soft dropdown (README 18.1, `dropdown.js`): a real `<select>` drawn radius 10 (12 on the guest page) with the chevron, whose pointer press opens our menu instead of the browser's — a pick sets the value the browser's way and fires `change`, so onChange hears it; Esc closes only the menu. Every `<select>` on a round-2 page is a `Select` (round 1's pages are Part 1's to switch). Drawers slide in (`hvDrawerIn .34s`), scrims fade `.25s`, windows `.2s` — in the kit, so every drawer moves.

**THE BRAND HAS MORE AIR (2026-10-11, round 2's README 3 — "Part 1"):** `HrSidebar`'s brand block pads `20px 12px 26px 14px` and has no rule under it (Overview starts 84px down, as the prototype's). Measured equal.

**THE KIT (2026-10-10):** `components/hrv/` — `kit.tsx` (PageHead, Cards/Card, SectHead, Chip, Toggle, GridTable/GridHead/GridRow, HistoryEvent, Facts, SecLabel, `btn()`), `tabs.tsx` (Tabs, `useTabParam` — `?tab=` pushed with history), `overlay.tsx` (Drawer, Window, `useEscape` — Esc closes the top one), `toast.tsx` (`flash()` + one ToastHost per shell), `icons.tsx`, `hrv.module.css`. Colours only through `--hv-*` (globals.css, on `.sheet-theme` and `.hrv-overlay`). A revamped page undoes what Tailwind's preflight moves: `line-height: normal`, and `box-sizing: content-box` where the prototype sizes a box with padding / border. Cross-check every page with a measuring script (prototype vs live, element by element: computed font / colour / size / padding / border / radius / background) — the PR1 run left only intended tag differences (real `<button>` / `<a>` where the prototype has spans).
