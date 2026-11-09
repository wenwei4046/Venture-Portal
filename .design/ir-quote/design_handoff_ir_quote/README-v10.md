# Handoff: IR Quote v10 — quotation fixes + style moodboard

## Overview
This is an update to the IR Quote module in Venture-Portal (`src/components/member/app/irq/`), which is built from the prototype in `.design/ir-quote/design_handoff_ir_quote/`. It changes the quote flow and Quotation settings in seven places:

1. **Budget** field shows an **RM** prefix.
2. **Property type** is a dropdown with **Landed / Condo**.
3. **Billing address** is removed from Customer step 1 (the form). It is still a doc fact and still prints on the quotation.
4. **Quotation document font** is **Times New Roman** with lining/tabular figures, instead of Georgia with its old-style numerals.
5. **Photos follow company settings only.** Sales can't upload or change photos. The Drive entry points are removed from the quote flow, and style photos come only from Quote Settings → Styles.
6. **PHOTO column** in the item table, controlled from Quote Settings → Quotation document (the "+ add column" presets). Also: the **REMARKS** column now has an input per item in Customize.
7. **Style moodboard** on the quotation. The page lays it out automatically, and sales choose whether to include it with an "Include style moodboard" checkbox.

## About the design files
The files in this bundle are **design references built in HTML** (self-running "Design Component" prototypes, the same format as the existing handoff). They are **not production code**. Port the changes into the existing irq port, `QuoteTpl.tsx` / `QuoteLogic.ts` / `SettingsTpl.tsx` / `SettingsLogic.ts` / `lib/quote-doc.ts`, following its current patterns. Persistence in the prototype is localStorage; use the existing Supabase tables (`quote_config`, `quote_drafts`).

Open the `.dc.html` files in a browser with `support.js`, `quote-doc.js` and `data/` beside them. Each file's logic is in the `<script data-dc-script>` class at the bottom.

## Fidelity
**High fidelity.** Colours, type, spacing and copy are final. All new UI reuses the existing IR Quote tokens (see the end of this README).

---

## 1. Customer step: Budget, Property type, Billing address
File: `IR Quote v10.dc.html`. Template: the `custFields` loop in the Customer section. Logic: `custView()`.

Each field object now has three render variants: `isPlain` / `isMoney` / `isSelect`.

**Budget** (`crm.budget`, CRM field id `budget`; production id `budget`)
- Same input as the other fields: 42px high, 0 12px padding, radius 10, border `1px solid rgba(20,20,18,.12)`, 15px text. The left padding is **44px**.
- "RM" label sits absolutely at left 12px, vertically centred: 15px / 600, `#6B6B66`, `pointer-events:none`.
- `inputMode="decimal"`, placeholder `0`.
- **Value handling:** display strips a leading `RM` (CRM values look like `"RM 40k – 50k"`). On change it keeps only `[0-9.,\-\s k + –]` and stores `"RM " + value`, or `""` when empty. Printing therefore keeps the RM.

**Property type** (prototype id `ptype`; production CRM id `type`)
- A custom dropdown, not a native `<select>`. The native popup misplaces under a scaled preview and renders options grey.
- **Trigger:** a button, 42px high, radius 10, white, 15px text, with a chevron (16px, stroke `#6B6B66`) on the right.
  - Label is the selected value, or **"Select"** in `#97978F`.
  - Open state: border `#111111` plus ring `0 0 0 3px rgba(17,17,17,.12)`.
- **Menu:** absolute at top 46px, full width, padding 4, radius 10, white, border `#E7E7E2`, shadow `0 1px 2px rgba(20,20,18,.04), 0 8px 24px rgba(20,20,18,.1)`, z-index 41.
  - A transparent fixed backdrop (z 40) closes it on outside click.
- **Options** "Landed" and "Condo": 38px high, radius 8, 14.5px.
  - Hover: `#F2F2EF`.
  - Selected: bg `#FFF5EC`, weight 650, orange check (stroke `#D96E0B`).
- **Matching:** case-insensitive against the CRM value, so a CRM "condo" preselects Condo. Picking stores the canonical label, and also sets `cust.ptype` so step 2's Property type chips stay in sync.
- State: `selOpen` (field id or null).

**Billing address**
- Filtered out of the quote-only fields in the form (`ci.own.filter(f => f.id !== "bill")`).
- **Not** removed from the doc facts block: "BILLING ADDRESS:" still prints on the quotation, with "-" since it can't be filled in. Decide whether to also hide the fact. It is labelled `bill` in `FACTS` in quote-doc.

## 2. Quotation font
- `renderDoc` now uses `cfg.doc.font = props.docFont ?? "Times"`. The prototype exposes a Tweak with Times / Helvetica / Georgia.
- In production, change the **default** `doc.font` to `"Times"` in `defaults()`. Optionally expose a font picker in Quotation document settings, since the `FONTS` map already exists.
- `FONTS.Times = "'Times New Roman', Times, 'Noto Serif SC', serif"`.
- The doc table also gets `font-variant-numeric: lining-nums tabular-nums`, so prices align.

## 3. Photos are company-controlled
In the quote flow:
- **Removed:**
  - Drive tile on phone home. The Drafts tile now spans the full row (`grid-template-columns:1fr`).
  - Drive button in the desktop header.
  - "+" Drive button in the Style step header.
- **Style step empty state:** now a plain `div`, no longer a button that opens Drive. Copy: **"{Style} photos are set by the company in Quote Settings"**.
- **`styleStep()`:** ignores the sales Drive photos (`drive = {}`). Images = `style.photos`, or `style.cover`.
- **PDF export:** no longer appends Drive pages (`ws.pdfHtml`).
- **Rollback:** the `salesPhotos` prop (default false) restores the old behaviour.

In production, remove the Drive entry from the IR quote screens and stop merging `drive_boards` images into the Style step. Whether Drive survives elsewhere is a product decision.

**Not changed:** quote-only custom fields of type **image** (set up by the Principal) still allow upload. Confirm with the product owner whether that should be locked too.

## 4. PHOTO column + REMARKS input
**quote-doc.js**
- `COLUMNS` gains `{ key: "photo", label: "PHOTO", show: true, num: false }` after CODE/COLOUR. New configs get it by default; existing saved configs do **not** until the Principal adds it (see below).
- `renderDoc`: columns = `tb.columns.filter(c => c.show)`, minus `photo` when `excel` is set.
- **Photo cell:** `width:64px`, centred, `<img>` 56×56 `object-fit:contain`. Empty when there is no image.
- **Header cell:** `text-align:center` for photo.

**Row data** (`docRows`)
- `photo = line.img || catalogItem.img || imgFor(line)`. Match the catalogue by code, then by name.
- `remark = line.remark || ""`.

**Quote Settings v4 → Quotation document**
- **Add-column presets:** `["photo","PHOTO"], ["kind","CATEGORY"], ["collection","COLLECTION"], ["color","COLOUR"], ["remark","REMARKS"]`. Inserted before QTY. Greyed out (opacity .4, disabled) when already present.
- **A4 sample preview:**
  - Photo cells show a 40×40 thumbnail (`background: #F2F2EF url(img) center/contain`, radius 2). Grid track 44px.
  - Remarks cells show **"Sales fills in"** in italic `#97978F`.
  - Category / Collection / Colour cells now show catalogue data. Before this change they were blank.

**Customize step (sales)**
- When the table's `remark` column is visible, each line shows a full-width input under the row.
- Input: `flex:1 0 100%`, 34px high, radius 8, border `rgba(20,20,18,.1)`, bg `#F7F7F5`; focus: border `#111111`, bg white.
- Placeholder: "Remarks (shown on quotation)". Stored as `line.remark`, which drafts must persist.

## 5. Style moodboard (new)
**The checkbox: "Include style moodboard"**
- Where: the top of the desktop Summary → **Export** panel (bg `#F7F7F5`), and below the Discount card on phone step 5 (bg white).
- **Button** (`role=checkbox`, `aria-checked`): full width, padding 12, radius 12, border `#E7E7E2`.
- **Box:** 20×20, radius 6, 1.5px border.
  - Off: border `#C9C9C2`, white.
  - On: `#F5871F` fill and border, with a `#111111` check.
- **Title:** 14 / 650.
- **Sub-line:** 12px `#6B6B66`. Text: "{Style} · {n} photos under the customer details".
- **Disabled** (opacity .5, not-allowed) when the style has no photos. Sub-line: "No photos for {Style} in Quote Settings".
- State: `withMood`, default **false**. Persist it in the draft.

**Data**
- `moodboard = withMood ? { name: style.name, note: "Classic" | "Build in", imgs: style.photos (or [cover]) } : null`, passed to `renderDoc(q.moodboard)`.

**Rendering** (`moodRows()` in quote-doc.js)
- Inserted right after the **facts** block, before the "We refer to our meeting…" text. Skipped when `excel` is set.
- **Header row:** "STYLE PREVIEW · {STYLE}" (bold, letter-spacing .08em) on the left. On the right, "{Classic|Build in} · {n} photos" (size −1, `#6B6660`).
- **Tiles:** `<img>` with `object-fit:cover` inside a div (radius 3, bg `#EEEDE8`). Gap 4px.
- **Layout by count** (max 12):

| Photos | Layout | Height |
|---|---|---|
| 1 | single | 300px |
| 2 | 1fr 1fr | 260px |
| 3 | 3fr 2fr; big left, 2 stacked right | 260px |
| 4 | 2fr 1fr 1fr; areas `'a b b' 'a c d'` | 260px |
| 5 | 2fr 1fr 1fr; areas `'a b c' 'a d e'` (Airbnb-style) | 260px |
| 6+ | rows of 3 (150px each). A remainder of 2 becomes a final row of 2 (180px). A remainder of 1 turns the last row of 3 into **2 + 2**, so there's never a lone photo. | — |

Examples for 6+: 6 → 3·3, 7 → 3·2·2, 8 → 3·3·2, 9 → 3·3·3, 10 → 3·3·2·2.

- **Page breaks:** each image row is its own `<tr>` with `break-inside: avoid`, and the header has `break-after: avoid`. The PDF can break between rows but never through a photo, and photos never overlap the table.
- **Note:** grid-template-areas uses single quotes inside the HTML attribute. Double quotes broke the attribute.

## State (new or changed)
- `selOpen`: `string | null`. Which custom dropdown is open.
- `crm.budget`: `"RM …"` string.
- `crm.ptype` / `type`: `"Landed" | "Condo" | ""`.
- `lines[].remark`: string.
- `withMood`: boolean.
- `quote_config.doc.font`: default `"Times"`.
- `quote_config.doc.blocks[table].columns`: may include `{key:"photo"}` and `{key:"remark"}`.

## Design tokens (unchanged, from the IR Quote system)
- **Ink:** `#1F1F1C` / `#111111`. Body `#34342F`, muted `#6B6B66`, subtle `#97978F`.
- **Surfaces:** page `#F7F7F5`, panel `#F2F2EF`, chip `#EEEEEA`, borders `#E7E7E2` / `#DEDED8`, white.
- **Accent:** `#F5871F`; ink `#D96E0B`; tints `#FFEBD9` / `#FFF5EC`; border `#FFC999`.
- **Fonts:** Space Grotesk (titles), Manrope (UI). Quotation doc: **Times New Roman** (was Georgia).
- **Radii:** 8 / 10 / 12 / 14–16 / 20 / 24.
- **Card shadow:** `0 1px 2px rgba(20,20,18,.04), 0 8px 24px rgba(20,20,18,.045)`.

## Assets
No new assets. Product photos come from catalogue `img` (b2b hot-links). Style photos come from Quote Settings → Styles (Supabase Storage in production).

## Files
- `IR Quote v10.dc.html`: sales quote flow with all quote-side changes.
- `Quote Settings v4.dc.html`: Principal settings (PHOTO/REMARKS presets, preview cells).
- `quote-doc.js`: `COLUMNS` (photo), `FONTS`, `renderDoc` (photo cells, tabular numerals, moodboard), `moodRows()`.
- `Workspace.dc.html`, `workspace-store.js`, `catalog-import.js`, `support.js`, `data/*.json`: unchanged runtime and seed data from the original handoff, needed to open the prototypes.

Production files to touch: `src/components/member/app/irq/tpl/QuoteTpl.tsx`, `logic/QuoteLogic.ts`, `tpl/SettingsTpl.tsx`, `logic/SettingsLogic.ts`, `lib/quote-doc.ts`, `useIrqBoot.ts` (CRM field ids `type`/`budget`).

## Screenshots (`screenshots/`)
Phone-width captures of the prototype:
- 01–03: Customer step. Empty, Property type dropdown open, and filled (RM budget, Condo).
- 04: Room type. The step-2 chips pick up the step-1 Property type.
- 05: Style step empty state ("photos are set by the company in Quote Settings").
- 06: Customize. The Remarks input appears per item once the REMARKS column is on.
- 07: Quotation step with the "Include style moodboard" checkbox. Shown disabled because the demo styles have no photos.
- 08: Rendered quotation document. Times font, 5-photo moodboard (stand-in images), PHOTO column. The demo catalogue has no product images, so the photo cells are empty.
