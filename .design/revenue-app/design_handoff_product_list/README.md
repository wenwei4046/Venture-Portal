# Handoff: Revenue › Product List (desktop, Principal only)

## Overview
The Product List is the Principal's catalogue admin inside the desktop Revenue app. It has seven tabs:

1. SKU Master
2. Modular
3. Maintenance
4. Combo Pricing
5. Costing gaps
6. Costing Setting
7. Add-on / KPI Items

The Principal uses it to set prices, decide what the Quote may offer, map fabric tiers, price combo sets, fix costing gaps, set cost ratios and keep the KPI item list. It is reached from a **PRINCIPAL** group in the desktop sidebar, below Notifications. That group is only shown to Principal users.

This bundle also covers the new **Module switcher** at the bottom of the sidebar (Finance · Principal · HR · Revenue team). It is frontend only.

## About the design files
The files in `prototype/` are **design references built in HTML**. They are not production code to copy. Recreate them in the **Venture Portal** codebase (Next.js App Router, React, Supabase), using its existing patterns. The Product List already exists there at `src/app/(portal)/revenue/products/`. This design is the visual and interaction target for that route.

**Wire the UI to the existing loaders and actions.** Use `load.ts` and the tab components. Do not use the demo data in the prototype. Business rules already live in the codebase and stay authoritative:
- combo matching (`combo-pricing.ts`)
- modular board grouping (`modular-board.ts`)
- column layout cookies (`column-layout.ts`, `useColumnLayout.ts`)
- page-first wheel scrolling (`page-first-wheel.ts`)
- the draft-navigation guard (`ProductWorkspace.tsx`)

**Source of truth = `prototype/ProductList.dc.html`.** Every colour, size, radius, shadow, spacing value and line of copy is written inline there. When this README and the file disagree, the file wins.

How to read a `.dc.html`:
- The markup between `<x-dc>` and `</x-dc>` is the template. `{{ name }}` holes are values from `renderVals()`. `<sc-if value>` is a conditional, `<sc-for list as>` is a loop, and `<dc-import name="X">` mounts `X.dc.html`.
- The `<script type="text/x-dc">` block holds the demo data builders (`buildSkus`, `buildOptions`, `buildCombos`, `FABRICS`, `GAPS`) and `class Component`. That class is the state and behaviour, like a React class component.
- To open it: serve `prototype/` (e.g. `npx serve prototype`) and open `Product List Canvas.dc.html`. It shows every tab inside the desktop shell. `ProductList.dc.html` also opens alone at 1200×840. Its props are `tab`, `skuCategory`, `openModel`, `editing`, `newCombo` and `shift`.

## Fidelity
**High-fidelity.** Final colours, typography, spacing, copy and interactions. Recreate pixel-perfectly using the codebase's existing components (`ui.tsx`, `ColumnTable.tsx`, `PageScrolledTable.tsx`, `SubDepartmentChips.tsx`, `ProductListTabs.tsx`). Restyle them to match. Keep their behaviour.

## Codebase map
| Design area | Venture Portal file |
|---|---|
| Page shell, header, tab rail | `products/page.tsx`, `_components/ProductListTabs.tsx`, `_components/ProductWorkspace.tsx` |
| SKU Master | `_components/SkuMasterTab.tsx` (+ `ColumnTable.tsx`) |
| Modular board + model window | `_components/ModularTab.tsx`, `_components/modular-board.ts`, `_components/ModelEditor.tsx` |
| Maintenance | `_components/MaintenanceTab.tsx` |
| Combo Pricing (+ new Add combo window) | `_components/ComboPricingTab.tsx`, `_components/combo-pricing.ts` |
| Costing gaps | `_components/CostingGapsSection.tsx` |
| Costing Setting | `_components/CostSettingTab.tsx` |
| Add-on / KPI Items | `_components/KpiItemsTab.tsx` |
| Fair / IR chips | `_components/SubDepartmentChips.tsx` |
| Sidebar entry + Module switcher | desktop portal shell / sidebar layout (see `prototype/RevenueApp.dc.html`, `<aside>` near the top) |

---

## Design tokens

### Colours
| Token | Hex | Use |
|---|---|---|
| ink | `#3F2B22` | Body text, table text |
| ink-strong | `#4E2F20` | Tab ink, dark chips, dark buttons |
| muted | `#806B60` | Secondary text, labels, column heads |
| faint | `#A08E82` | Empty prices (—), disabled button ink |
| accent | `#BD4A19` | Active tab, primary buttons, links, focus/edited borders |
| accent-soft | `#E99A53` | Ticked tile borders, edited inputs in windows |
| accent-wash | `#FFF5EC` | Ticked tiles, edited inputs, NEW rows, picker panel |
| accent-wash-2 | `#FFF1E6` | Active chip bg, active sidebar row |
| picker-border | `#F6D7C0` | Picker panel border |
| sand | `#FBF6F2` | Filter panel, window header, table footer, sidebar |
| sand-2 | `#F7F0EA` | Table column-head row, combo module tiles |
| sand-3 | `#F5EBE3` | Band head row, model group row, neutral pills, segmented track |
| stripe | `#FBF7F3` | Odd table rows, not-offered cards |
| rule | `#EBDDD2` | Card/panel borders, header rules |
| rule-soft | `#F1E7DF` | Row rules; also disabled button bg and shaded "not offered" cells |
| control-border | `#E2CFC1` | Inputs, selects, secondary buttons |
| tick-off | `#C9B8AC` | Unticked checkbox border, "+" between tiles |
| ok-bg / ok-ink | `#E8F3ED` / `#24513B` | Success notice, "Offered" pill, KPI On |
| ok-border | `#B7DBC7` | KPI On card border |
| toggle-on | `#387557` | Offered toggle track |
| toggle-off | `#D9CABD` | Toggle track off |
| err-bg / err-ink | `#F8E1D8` / `#A3371A` | Error notice, REMOVING chip, Remove links |
| err-strong | `#C2412D` | Invalid input border / error status in Add combo |
| warn-bg / warn-border / warn-ink | `#FFF0CC` / `#E1B04F` / `#4A3110` | Leave-guard bar, flagged meta chips |
| warn-text | `#A46312` | "New model / New SKU / Inactive" flags, KPI Off |
| overlay | `rgba(40,25,18,.38)` | Window backdrop |

### Typography
- **Body:** Inter 400/500/600/650/700. Base 13.5–14px.
- **Display:** Georgia, 'Times New Roman', serif, weight 400.
  - Page title `Product List`: 36px, letter-spacing −.025em, line-height 1.18.
  - Section headings (h2): 22px, −.02em.
- **Mono eyebrow:** 'Chivo Mono' 500, 10px, letter-spacing .16em, ink #3F2B22. Preceded by a 22×2px #BD4A19 dash with a 10px gap. Examples: `REVENUE / PRODUCTS`, `MODULAR · 3 OF 41`, `COMBO PRICING · NEW SET`.
- **Column heads:** 11.5px/700, letter-spacing .07em, #806B60, uppercase.
- **Band heads** (`FABRIC P1`…): 12px/700, .06em, #4E2F20.
- **Field labels in windows:** 11px/700, .07em, #806B60, uppercase.
- **Sidebar group label** (`PRINCIPAL`, `SWITCH MODULE`, `MODULE`): 10.5–11px/700, .1–.12em, #A08E82.

### Radii
6 (segmented inner) · 7 (combo tiles) · 8 (table inputs, small buttons) · 9 (window buttons, selects) · 10 (filter inputs, action buttons, tiles) · 12 (notices, picker results) · 14 (model cards, leave bar, calculator box) · 16 (filter panel, table card, picker) · 18 (floating window, fig card) · pills 10–16.

### Shadows
- Floating window: `0 24px 60px rgba(40,25,18,.28)`
- Open model card: `0 6px 18px rgba(189,74,25,.12)`
- Segmented active: `0 1px 2px rgba(63,43,34,.14)`
- Module menu: `0 12px 32px rgba(63,43,34,.16)`
- Toggle knob: `0 1px 3px rgba(63,43,34,.25)`

### Motion
- Window: opacity 0→1 and `translateY(14px) scale(.98)` → `none`, 260ms `cubic-bezier(.2,.8,.2,1)`.
- Content right padding when a desktop right panel opens: 32px → 432px, 320ms, same easing.
- Toggle: 160ms on track bg and knob `left`.

---

## Page shell
- Container: white. The scroll area has padding `28px 32px 56px`. Children are a flex column with an 18px gap.
- **Header row** (`align-items:flex-end; space-between`):
  - Left: the eyebrow `REVENUE / PRODUCTS` above the h1 `Product List`.
  - Right: `Principal only · Fair and IR` (12.5px, #806B60).
- **Tab rail:** `<nav>` with a 1px #EBDDD2 bottom border, a 2px gap and horizontal scroll (no scrollbar).
  - Each tab is 44px tall, padding 0 14px, 14px text.
  - Inactive tab: ink #4E2F20, weight 500.
  - Active tab: ink #BD4A19, weight 650, with a 2px inset bottom rule in #BD4A19.
  - The active tab shows a 6px #BD4A19 dot when it has unsaved changes.
- **Leave guard bar:** replaces nothing; it sits under the tabs.
  - Container: #FFF0CC bg, 1px #E1B04F border, radius 14, padding 12/14/12/16.
  - Text: `You have N unsaved changes. Discard them and switch to <Tab>?`
  - Buttons: `Keep editing` (white, #E1B04F border) and `Discard and switch` (#4E2F20, white text). Both are 36px tall, radius 10.
- **Filter panel:** #FBF6F2, 1px #EBDDD2, radius 16, padding 14/16, gap 12. It has up to three stacked rows, each separated by a 1px #EBDDD2 top rule.
  1. **Chips.** 32px tall, radius 16, padding 0 13px, 13px text.
     - Off: white, #E2CFC1 border, weight 500.
     - On: bg #FFF1E6, border #BD4A19, ink #BD4A19, weight 650.
     - May carry a count badge: 18px #BD4A19 pill with 10.5px/700 white text.
     - May carry a label before them, e.g. `SUB-DEPARTMENT` (12px/650, .08em, #806B60).
  2. **Sub-chips** (Maintenance pools). 30px tall, radius 9, 12.5px text.
  3. **Controls.**
     - Search field: flex `1 1 280px`, min-width 220, 40px tall, radius 10, 1px #E2CFC1. It has a 17px magnifier icon and 14px input text.
     - Labelled selects: 40px tall, radius 10, a 12.5px #806B60 label, then a select with 13.5px/600 text.
     - Tier segmented control: a #F5EBE3 track with 2px padding and radius 8. Buttons are 28px tall, min-width 36, radius 6.
       - Active button: white bg, accent ink, segmented shadow.
       - Inactive button: transparent bg, #806B60 ink.
- **Action row:** min-height 40, space-between, wrapping.
  - Left: `<strong>N</strong> rest` in 14px.
  - Right, in this order:
    - Optional hint (13px, #806B60).
    - Optional secondary button (38px, white, #E2CFC1 border, #4E2F20 13.5px/650).
    - Primary `Edit …` button (38px, padding 0 16, #BD4A19 bg, white text, 15px pencil icon, gap 8).
    - In edit mode, the Edit button is replaced by `Cancel` (secondary) and `Save N things`.
      - Save with changes: #BD4A19 bg, white text.
      - Save with no changes: #F1E7DF bg, #A08E82 text.
- **Note:** 13px, #806B60, line-height 1.5, max-width 880, `text-wrap:pretty`. Margin-top −8px.
- **Notice:** radius 12, padding 11/14, 13.5px.
  - ok: #E8F3ED bg, #24513B text.
  - err: #F8E1D8 bg, #A3371A text.

### Table card
- Container: radius 16, 1px #EBDDD2, overflow hidden. It scrolls inside with a `max-height` of 560px on the long tabs.
- `border-collapse:separate`, 13.5px.
- **Optional band row:** 34px tall, #F5EBE3, sticky at top 0.
- **Column-head row:** 42px tall, #F7F0EA, 1px #EBDDD2 bottom border.
  - Sticky at top 0, or at top 34px under bands.
  - The first column is also sticky at `left:0` with an inset right rule (`inset -1px 0 0 #EBDDD2`).
  - Min-widths are set per column (see each tab).
- **Rows:**
  - Alternating #FFFFFF and #FBF7F3. Rows that are NEW use #FFF5EC.
  - Cell padding 11px 14px; 6px 10px for cells holding an input.
  - 1px #F1E7DF bottom rule.
  - The first cell is sticky, weight 650.
- **Chip after text:** a 20px pill, 11px/700, letter-spacing .03em.
  - `NEW`: default #F5EBE3 bg / #4E2F20 ink. On Costing Setting and KPI new rows it is #BD4A19 bg with white text.
  - `REMOVING`: #F8E1D8 bg, #A3371A ink.
- **Input cell:** 34px tall, radius 8, right-aligned 13.5px/600, placeholder `—`.
  - Edited input: border #BD4A19, bg #FFF5EC.
  - Untouched input: border #E2CFC1, white bg.
- **Footer:** min-height 46, #FBF6F2, 1px top rule, 12.5px #806B60.
  - Left: count text and an optional `Show 40 more` button (30px, radius 8).
  - Right: an optional foot note.

---

## Tabs

### 1. SKU Master
- **Chips:** `All` plus one per category. Category labels: Sofa, Bedframe, Accessory, Sofa Accessory, Mattress, Bedlines, Dining, Diffuser, Carpet, Service.
- **Search** placeholder: `Search product code or description…`
- **Model select:** shown when a multi-SKU category (Sofa, Mattress, Bedframe) is picked and it has more than one model.
- **Tier control:** Sofa only, P1 · P2 · P3, default P2.
- **Columns, non-sofa:**

  | Column | Min-width |
  |---|---|
  | PRODUCT CODE | 170 |
  | DESCRIPTION | 260 (600 weight) |
  | MODEL | 120, with the name as a sub-line |
  | SIZE | 130 |
  | BRAND | 110 (`rider` in muted when the SKU has no brand) |
  | PRICE (RM) | 130, right-aligned |

  A grid-priced SKU shows a `View prices` link in the price cell. It jumps to Sofa with that model selected.
- **Columns, sofa:**

  | Column | Min-width |
  |---|---|
  | PRODUCT CODE | 170 |
  | DESCRIPTION | 260 |
  | MODEL | 120 |
  | CATEGORY | 90 |
  | TIER | 70 |
  | SEAT 28" · SEAT 30" · SEAT 32" | 120 each, right-aligned |

- **Paging:** 40 rows, then `Show N more`. Foot: `40 of 1,234 SKUs shown`.
- **Foot note:**
  - Sofa: `Seat sizes follow the ERP order. Switch tier to price P1, P2 and P3.`
  - Otherwise: `Rider: no ladder of its own; the mattress or sofa in the cart decides.`
- **Edit prices:** every price cell becomes an input.
  - Note: `Blank clears a price; 0 is a zero price. Changes across models and tiers are saved together.`
  - The Save button counts distinct SKUs changed: `Save 3 SKUs`.
  - Success notice: `3 SKUs saved. New sales lines use these prices. To update an existing month, recost its orders in Comm Cal.`

### 2. Modular
- **Chips:** `All` plus categories.
- **Search** placeholder: `Search model, name, brand or SKU…`
- **Show select:** All models · Offered · Not offered · New models or SKUs.
- **Action row:** `N models · <Category>`, with the hint `Open a model to set what the Quote may offer of it.`
- **Board:** one section per category, with a 28px gap between sections.
  - Category head: a dark pill (#4E2F20, white 13px/650, height 28, radius 14) followed by `N models`.
  - Within a category, models group by ERP branding.
    - Group head: a 16×2 dash (#BD4A19, or #C9B8AC for `NO BRANDING`), the label in 12px/700 .1em, the count, then a 1px rule filling the rest.
  - Grid: `repeat(auto-fill,minmax(210px,1fr))`, gap 10.
- **Model card:** padding 14/14/12, radius 14, 1.5px border.
  - Top line: the code (15px/700) and a status pill on the right.
    - `Offered`: #E8F3ED bg, #24513B ink.
    - `Not offered`: #F5EBE3 bg, #806B60 ink.
  - Name: 12.5px muted.
  - Meta line, 12px muted: the ladder (Akemi / Ergotex / Dunlopillo / Zanotti / `Rider` / `No ladder`), the SKU count `4 / 5 SKUs`, and an optional flag in #A46312/650 (`Inactive`, `New model` or `New SKU`).
  - Card background: white when offered, #FBF7F3 when not offered.
  - The open card has border #BD4A19, bg #FFF5EC and the open-card shadow.
- **Model window** (floating, centred over the dimmed list):
  - **Frame:**
    - Overlay `inset:0`, padding `24px 28px`, rgba backdrop. Clicking the backdrop counts as Close.
    - Window: `flex:1`, max-width 1180, white, radius 18, window shadow, full height.
    - The header and footer stay fixed. Only the body scrolls.
  - **Header** (#FBF6F2, padding 20/22/16/24, 1px bottom rule):
    - Eyebrow: `MODULAR · 3 OF 41`, the position in the current filtered board order.
    - h2: code 22px/700, then ` · name` in 500 #806B60.
    - Meta chips, 24px tall, radius 12, 12px text: category, `ERP branding · AKEMI` (or `No ERP branding`), `N SKUs`, and the flagged chips `Inactive in ERP` / `New model` (#FFF0CC / #E1B04F / #4A3110).
    - On the right: three 36px square buttons, ‹ previous, › next and ✕ close. Previous and next sit at opacity .4 when there is no model in that direction.
  - **Body** (padding 20/24/26, gap 22):
    1. Optional note (#FFF5EC, radius 10).
    2. **Revenue calculator box.** #FBF6F2, 1px rule, radius 14, padding 16. It is a grid of `auto minmax(200px,280px)` with a 32px gap.
       - `REVENUE CALCULATOR` label above the Offered toggle: a 38px pill button holding a 40×26 track and a 20px knob, labelled `Offered` / `Not offered`.
       - `FREE GIFT` select. Options: default (`May be a gift (default)` when the calculator is Accessory, otherwise `Not a gift (default)`), `May be a gift` and `Not a gift`.
       - **No margin-ladder or calculator-section picker.** Both are recognised automatically from the model's ERP brand and category.
    3. **Summary strip** (radius 10, 13px). Three states:
       - Not offered: #F5EBE3 bg, #4E2F20 text: `Not offered. Members cannot quote this model.`
       - Offered, no ladder: #F8E1D8 bg, #A3371A text: `Offered, but members will not see it until a margin ladder is chosen.`
       - Offered with a ladder: #E8F3ED bg, #24513B text: `Members can quote 4 of 5 compartments · 3 seat height · 2 leg height · 4 specials.`
    4. **Sections.** The first is `Compartments` (Sofa), `Sizes` (Mattress or Bedframe) or `SKUs` (anything else).
       - Option sections follow by category:
         - Sofa: Seat height, Leg height, Specials.
         - Bedframe: Divan height, Total height, Gap, Leg height, Specials.
       - Each section has an h3 (15px/700), a count pill `n / total`, and `Select all` / `Clear all` buttons (32px, 12.5px).
       - **Tiles:** min-height 46, radius 10, padding 11/12, with an 18px checkbox (radius 4, 1.5px border).
         - Ticked: border #E99A53, bg #FFF5EC, checkbox #BD4A19.
         - Unticked: border #E2CFC1, white, checkbox #C9B8AC.
         - Content: the main label (13.5px/650), an optional sub-line (12px muted, e.g. the full SKU code) and an optional tag in 11px/700 #A46312 (`NEW`, `Inactive in ERP`).
         - An option that is inactive in the ERP and not ticked is disabled at opacity .5.
       - Grid columns: SKU tiles `minmax(160px,1fr)`; Specials `minmax(230px,1fr)`; other options `minmax(110px,1fr)`.
    5. Bedframe only, a closing note: `On the Quote, a divan, leg, gap or total height turned on here is offered with its charge from Maintenance. One turned on with no charge is FOC; one not turned on is never offered.`
  - **Footer** (padding 12/22/12/24, 1px top rule):
    - Normal state:
      - On the left, a status line.
        - Unsaved: `N unsaved changes` (ink, 650).
        - Saved: muted.
      - On the right, the buttons:
        - `Cancel`.
        - `Save`: primary, disabled-looking when there are no changes.
        - `Save & next`: secondary button with #E99A53 border and #BD4A19 ink. At opacity .4 when there is no next model.
    - Guard state: `<code> has unsaved changes.` with `Keep editing`, `Discard` and the primary `Save and …`. It appears on close, previous/next, or clicking another card while the window has changes.
  - **Turning Offered on** for a model with nothing ticked auto-ticks all its SKUs and active options. It also shows the note `Selected the current SKUs and allowed options. Untick anything the calculator should not offer.`
  - **Save notice:** `<code> saved. Calculator selections are updated.` After Save & next on the last model, it says `That was the last model in this list.` instead.
  - When a desktop right panel opens (`shift` prop), the open window closes.

### 3. Maintenance
- **Chips:** Bedframe · Sofa · Fabrics.
- **Sub-chips per section.** Each sub-chip shows a count badge of unsaved edits in that pool.
  - Bedframe: Divan Heights, Total Heights, Gaps, Leg Heights, Specials.
  - Sofa: Sizes, Leg Heights, Specials.
- **Heading** (Georgia 22): `Bedframe · Divan Heights`, followed by `N options`. Pools with no price show a `Read only` pill.
- **Option table:**

  | Column | Min-width | Notes |
  |---|---|---|
  | OPTION VALUE | 150 | |
  | DESCRIPTION | 260 | |
  | CHARGE (RM) or SURCHARGE (RM) | 150 | Priced pools only. Negative values show as `(40.00)`. A blank charge shows `FOC`. |
  | STATUS | 120 | Active, Inactive or Removed, plus an optional NEW chip. Inactive rows sit at opacity .6. |

- **Notes, by pool type:**
  - Bed-frame charge pools: `What the customer pays (RM) when a member picks this option for a bed frame on the Quote. Out of the margin on both sides, paid ordinary commission like the rest of the bill, never KPI. Blank or 0 is FOC.`
  - Surcharge pools: `Portal surcharge (RM) added to the cost when this option is chosen. Blank adds nothing; 0 is a zero surcharge.`
  - Unpriced pools: `ERP choices only. This pool has no surcharge; model availability is set on Modular.`
- **Edit:** the button reads `Edit charges` or `Edit surcharges`. Cancel reads `Cancel changes`.
  - Edits in several pools are kept and saved together. The note gains ` N unsaved changes across M pools; Save includes them all.`
- **Fabrics view:**
  - Search, plus selects for Sofa tier, Bedframe tier (All tiers / P1 / P2 / P3 / Unassigned category) and Catalogue (Current records / Include removed).
  - Columns:

    | Column | Min-width |
    |---|---|
    | FABRIC CODE | 130 |
    | DESCRIPTION | 240 |
    | SERIES | 100 |
    | CATEGORY | 110 |
    | SOFA TIER | 120 |
    | BEDFRAME TIER | 130 |
    | STATUS | 90 |

  - A tier label reads `P2`, `P2 · shared` or `P2 · default`.
  - Note: `Sofa and Bedframe mappings override the shared ERP tier independently. With neither mapping nor shared tier, P2 is used.`

### 4. Combo Pricing
- **Filters:**
  - Search placeholder: `Search combo or module…`
  - Model select: All models, or each model as `CODE · name`.
  - Tier control: All · P1 · P2 · P3.
- **Action row:** `N sets · Model X · price per set (RM)`. The buttons are **`+ Add combo`** (secondary, hidden in edit mode) and `Edit prices`.
- **Table:**
  - Band row: an empty band over the first two columns, then `FABRIC P1` / `FABRIC P2` / `FABRIC P3`, each spanning the three seat heights.
  - Columns: SET (160), WHAT IS IN IT (280), then 28" / 30" / 32" at 104 each per band. The first height column of each band has an inset left rule.
  - Model group row: #F5EBE3 bg, with `Model 00913` in 13px/700 and `N sets` in muted.
  - SET cell: the label, a NEW chip when new, and the sub-line `N pieces`.
  - WHAT IS IN IT cell: module tiles (26px, radius 7, #F7F0EA, 1px #EBDDD2, 12.5px/650 #4E2F20) joined by a #C9B8AC `+`.
    - An alternate shows as `or 2A-RHF` in muted.
    - A quantity shows as `×2` in #BD4A19.
  - A height the ERP doesn't offer for that set is a shaded #F1E7DF cell.
  - Foot: `5 sets · 13 of 13 combos shown`. Foot note: `Shaded boxes are sizes the ERP does not offer for that set.`
- **Edit prices:** price cells become 92px inputs.
  - Note: `Blank clears a price. Zero is stored; only a positive combo price replaces module prices. In edit mode you can paste a block copied from Excel.`
  - Saved notice: `N combos saved. New sales lines use these prices. To update an existing month, recost its orders in Comm Cal.`

#### 4a. Add combo window (new)
Same floating-window frame as the model window, but with a **max-width of 980**. It sits above the model window (z 5 vs 4).

- **Header:**
  - Eyebrow: `COMBO PRICING · NEW SET`.
  - h2: the set name, or `New combo` while nothing is picked, followed by ` · Model VERONA · Verona modular` in muted.
  - ✕ close button.
- **Body** (gap 24):
  1. **Identity box.** #FBF6F2, radius 14, padding 16. It is a grid of `repeat(auto-fit,minmax(220px,1fr))` with a 16px gap. It holds two fields:
     - `SOFA MODEL`: a select with `Choose a model…` and every sofa model. It defaults to the model currently filtered on the tab.
     - `SET NAME`: a text input whose placeholder is the auto name (e.g. `1A + 2A-LHF + CNR`), else `e.g. 3+2`. Helper below: `Blank uses the compartments as the name.`
     - Changing the model clears the picked compartments.
  2. **Compartments.**
     - Head: an h3, a count pill `N pieces` and `Clear all`.
     - With no model picked: a dashed empty state, `Pick a sofa model to see its compartments.`
     - Grid: `repeat(auto-fill,minmax(180px,1fr))`, gap 8. One card per compartment of the model, using the SKU Master SKUs whose model matches.
       - Card: the size (13.5px/650) above the full code (12px muted).
       - On the right, a stepper: 1px #E2CFC1, radius 9, 30px `−` and `+` buttons, the count in 13.5px/700. `+` is #BD4A19; `−` is #D9C9BC at zero.
       - A card with a count above 0 gets border #E99A53 and bg #FFF5EC.
     - **This set strip:** #FFF5EC, radius 10. It shows the label `THIS SET`, then chips (26px, white, 1px #E99A53, 13px/650) joined by `+`. A chip with more than one piece reads `2 × 1A`.
  3. **Price per set (RM).**
     - Head: an h3 and the button `Copy module totals`. The button is at opacity .45 until compartments are picked. It fills only the empty boxes.
     - Table, inside a 1px #EBDDD2 radius-12 card:
       - Mono heads: `FABRIC TIER` and `SEAT 28"` / `SEAT 30"` / `SEAT 32"`.
       - Rows: `Fabric P1`, `Fabric P2` and `Fabric P3`.
       - Each cell holds a 120×34 right-aligned input. Its placeholder is the module sum. Under it, 11.5px #A08E82, `Modules 3,420.00`, or `Not sold` when a compartment has no grid price there.
       - Input states: filled → border #E99A53, bg #FFF5EC; invalid → border #C2412D.
     - Rule text under the table: `When a sales line for Model VERONA has exactly 1A + 2A-LHF + CNR, it uses this set price for its fabric tier and seat height instead of adding up the module prices. Leave a box blank if that size is not sold as this set.`
- **Footer:**
  - Status: `3 pieces · 2 of 9 prices filled`, or the first problem in #C2412D/650 after Save is pressed.
  - Buttons: `Cancel` and **`Add combo`**.
    - Valid: #BD4A19, white text.
    - Invalid: #F1E7DF bg, #A08E82 text.
- **Validation,** checked in this order:
  1. `Pick a sofa model.`
  2. `Add at least two compartments.`
  3. `A price is not a number.`
  4. `Fill at least one price.`
  5. `This model already has a combo with these compartments.`
  6. `Model X already has a set called "…".`
- **Close with input:** closing (✕, backdrop or Cancel) while anything is entered swaps the footer to `Discard this new combo?`, with `Keep editing` and `Discard`. A tab or sub-department switch counts the open draft as one unsaved change and shows the page leave-guard bar.
- **Save:**
  - Writes one combo row per fabric tier that has at least one price. Each row stores only the heights that were filled.
  - Closes the window and filters the tab to that model (tier All, search cleared). The new set shows with a NEW chip.
  - Notice: `<name> added to Model X with N prices. New sales lines with these compartments use it.`
- In the codebase this maps onto `combo-pricing.ts`. That file holds the set → slots shape and the matching. The window is new UI on `ComboPricingTab.tsx`.

### 5. Costing gaps
- **Heading:** `Costing gaps`. Sub-line: `Sales from 1 Aug 2026 up to, but not including, 1 Nov 2026.`
- **Filters:** search (`Search code, product or brand…`) and a Reason select (All reasons · Missing from SKU Master · Price needed · Seat size not matched · Pricing error).
- **Action row:** `8 codes · 47 sales lines · RM 54,740.00 revenue`, with the secondary button `Open SKU Master`.
- **Columns:**

  | Column | Min-width |
  |---|---|
  | ITEM CODE | 160 |
  | PRODUCT | 230 |
  | GROUP | 100 |
  | LINES | 70, right-aligned |
  | BILLS | 70, right-aligned |
  | REVENUE (RM) | 120, right-aligned, 650 |
  | REASON | 170 (`Pricing error` in #A3371A) |
  | NEXT STEP | 260 |

  Rows sort by revenue, highest first.
- **Next step, by case:**
  - The price is now available: `Price now available. Recost the affected orders in Comm Cal.` in #24513B.
  - The code isn't in the SKU Master: `Check this code in the ERP catalogue.` in muted.
  - Otherwise: the link `Review SKU price →`. It opens SKU Master searched to that code, behind the leave guard.
- **Foot note:** `Bills are counted per code; the same bill may appear in several rows.`

### 6. Costing Setting
- **Sub-department chips:** `SUB-DEPARTMENT` label, then Fair · IR. Switching is guarded.
- **Fig card** (#FBF6F2, radius 18, padding 20/22):
  - Eyebrow: `FAIR · COST RATIO` in 12px/650 #BD4A19.
  - The ratio in 34px/700, e.g. `0.7`. In edit mode it becomes a 110×44 input with a 1.5px #BD4A19 border and 24px/700 text.
  - After the ratio: `divides every SKU's cost`.
  - Sub-line: `The Revenue Team's cost is the Product List cost divided by this ratio. Every margin in the calculator, the month and the run is judged against it. SKUs below divide by a ratio of their own.`
  - On the right, a worked example card: `Product List cost RM 1,000.00 ÷ 0.7 = Revenue Team cost RM 1,428.57`. The result is in #BD4A19 and updates live.
- **Heading:** `SKUs at their own ratio`, followed by `N SKUs`.
- **Columns:**

  | Column | Min-width |
  |---|---|
  | SKU CODE | 170 |
  | DESCRIPTION | 230 |
  | CATEGORY | 100 |
  | PRODUCT LIST COST | 150, right-aligned; a range `a – b` for grids, or `No price` |
  | RATIO | 110, right-aligned |
  | TEAM COST | 160, right-aligned, #BD4A19 |
  | (row action) | edit mode only |

- **Edit ratios.** A picker panel appears above the table:
  - Panel: #FFF5EC, 1px #F6D7C0, radius 16. Title: `ADD SKUS AT A RATIO OF THEIR OWN`.
  - Controls: a search field, a `Ratio` input (placeholder 0.60) and the button `Add N at 0.65` / `Tick SKUs to add`.
  - Results: up to 20 rows, each 46px with a 20px tick box, the code (190px column) and the description. SKUs already listed show an `On the list` pill.
  - Messages:
    - Before any search: `Type to find SKUs. Nothing shows until you search.`
    - More than 20 results: `Showing 20 of N. Narrow the search to see the rest.`
  - Row actions: `Take off` on new rows; `Remove` / `Keep` on saved rows. A row marked for removal shows the REMOVING chip, struck-through text and opacity .55.
- **Validation:** a ratio must be above 0 and at most 10.
  - Bad value: `"x" is not a ratio above 0 and at most 10.`
  - Blank new row: `<code>: give it a ratio, or take it off the list.`
- **Saved notice:** `Saved. The calculator judges margins at these ratios from now on; a month already computed moves when its run is computed again.`

### 7. Add-on / KPI Items
- **Sub-department chips:** the same as Costing Setting.
- **Fig card:**
  - On: #E8F3ED bg, #B7DBC7 border, green ink. `On` · `KPI items are paid flat`.
  - Off: #FFF0CC bg, #E1B04F border, #A46312 ink. `Off` · `KPI items are not paid`.
  - Link: `Set on Rules →`.
- **Columns:**

  | Column | Min-width |
  |---|---|
  | ITEM | 170 |
  | NAME | 230 |
  | KIND | 140: SKU / Bed frame special / Sofa special |
  | COUNTED | 150: Per unit / Per bed frame / Once per sofa bill |
  | KPI AMOUNT (RM) | 150, right-aligned |

- **Edit items** picker:
  - Title: `ADD AN ITEM`.
  - Source segmented control: SKU Master · Bed frame specials · Sofa specials.
  - An `Amount RM` input, and a per-row `Add` button. Items already listed show `On the list`.
- **Validation:** `<code>: type the KPI amount in RM, 0 or more.`
- **Foot note:** `A special rides on its bed frame or sofa line; it is not a product of its own.`

---

## Shared behaviour
- **One draft per tab.** `dirty()` counts unsaved changes per tab:

  | Tab | What one change is |
  |---|---|
  | SKU Master | a distinct SKU |
  | Maintenance | an option price |
  | Combo Pricing | a set (plus 1 for an open Add combo draft) |
  | Modular | a field or tick in the open model |
  | Costing Setting / KPI Items | an add, a removal, or an edit |

- Switching tab or sub-department with changes shows the leave-guard bar. `Discard and switch` resets every draft. The codebase equivalent is `ProductWorkspace.tsx`, which already disables the tab rail while dirty or saving and confirms before leaving the page. Keep that, and use this bar as the visual.
- Saving clears the draft, leaves edit mode and shows the ok notice. Starting an edit clears the notice.
- Numbers display with `en-MY` formatting at 2 decimals. Empty values show `—`.
- Every table's first column is sticky. Heads are sticky.

## Sidebar entry + Module switcher (desktop shell)
- **Placement:** below Notifications. A group label `PRINCIPAL` (11px/700, .12em, #A08E82, margin 18/12/6), then a 44px nav row `Product List` with a 20px cube icon.
  - Active row: bg #FFF1E6, ink #BD4A19, weight 650.
  - Visible only when the signed-in user is a Principal.
- When Product List is open, the main column becomes full width (no 760px column), and the other nav rows show as inactive.
- **Module switcher:** at the bottom of the sidebar, above the signed-in person card.
  - **Closed state:** a full-width 42px button with 1px #E2CFC1, radius 12, white bg. It holds a 17px grid icon, then the `MODULE` label (10.5px/700, .1em, #A08E82) over the current module name (14px/650), then an up-chevron.
  - **Open state:** a menu opens upward.
    - Menu: white, 1px #EBDDD2, radius 14, padding 6, menu shadow, with the `SWITCH MODULE` label at the top.
    - Rows are 40px, radius 10. Each has an 8px colour dot, the name, and a tick on the current module. The current row is #FFF5EC, weight 650.
    - Dots: Finance `#3C6E8F` · Principal `#4E2F20` · HR `#387557` · Revenue team `#BD4A19`.
    - Clicking outside closes the menu.
  - **Frontend only.** Picking a module just updates the label. Hook it to the portal's real module routing.

## Assets
No images. Icons are inline 20×20 or 24×24 stroke SVGs (stroke 1.6–2.2, round caps):
- pencil (Edit)
- magnifier (search)
- cube (Product List nav)
- 2×2 grid (Module switcher)
- chevrons
- close ✕
- tick

Use the codebase's icon set where an equivalent exists. Fonts: Inter and Chivo Mono (Google Fonts), plus the system Georgia.

## Files
- `prototype/ProductList.dc.html`: the Product List page, all seven tabs, the model window and the Add combo window. **This is the source of truth.**
- `prototype/RevenueApp.dc.html`: the desktop shell (sidebar with the PRINCIPAL group and the Module switcher, top bar). It mounts ProductList.
- `prototype/Product List Canvas.dc.html`: a canvas of every tab state inside the shell, including the Add combo window.
- `prototype/support.js`: the runtime needed to open the `.dc.html` files in a browser. It is not part of the design.
