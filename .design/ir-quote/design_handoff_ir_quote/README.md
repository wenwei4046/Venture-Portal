# Handoff: IR Quote (Renovation package quotation) + Quotation settings

## Overview
Quotation tool for the IR (interior renovation) sub-department of HOUZS Venture Revenue app.
- **Sales (IR team)** build a renovation-package quote for a customer in 5 steps on phone or desktop, show style photos, swap furniture, and export/share a PDF quotation.
- **Principal** maintains the price base: room types (package furniture lists), catalogue (b2b items & prices), styles (photos), quotation document layout and customer fields.
- **Drive** (per sales account) holds style photos grouped by room, shown to customers during quoting.

Target app: Venture-Portal (Next.js + Supabase). The CRM already has Customer form, Contacts, Profile etc. Wire into those rather than rebuilding.

## About the Design Files
Files in this bundle are **design references created in HTML** (self-running "Design Component" prototypes). They show intended look and behaviour; they are **not production code**. Recreate them in Venture-Portal's existing environment (React/Next.js, its component and styling patterns, Supabase for data). The prototypes persist to `localStorage`/IndexedDB only — replace with Supabase tables + storage.

Open any `.dc.html` directly in a browser (needs `support.js` beside it, and `data/*.json`). Logic sits in the `<script data-dc-script>` class at the bottom of each file; the template above it is plain HTML with `{{ }}` holes.

## Fidelity
**High-fidelity.** Final colours, typography, spacing, copy and interactions. Recreate pixel-close using the codebase's primitives.

## Entry points (in the real app)
| Who | Where | Opens |
|---|---|---|
| Sales & Principal | Bottom nav orange **Quote** button (raised circle) | Quote home (phone) / quote flow (desktop) |
| Principal only | CRM → Profile → below **Ads performance** → **Quotation settings** | Room types / Catalogue / Styles (phone); full settings (desktop) |

## Screens

### 1. Quote home (phone) — `IR Quote v9 Bold` (state `home: true`)
- Greeting "Hi, {name}", title **Quote** (Space Grotesk 28/700).
- **New quote** card: black #111111, radius 20, orange circle decor top-right (#F5871F, 140px, -30/-30), white 44px "+" tile, title 21/700, sub "Customer · Room · Style · Customize" #BDBDB5.
- 2-col tiles: **Drive** (opens Drive), **N drafts**.
- **CONTINUE** list: single white card, rows 60px: name 14.5/650, meta "room · Step n/5 · date" 12 #97978F, total right; ✕ delete (tap twice → "Delete?"). Max 4, "See all N".
- App bottom nav visible only here.

### 2. Quote flow (5 steps) — `IR Quote v9 Bold`
Phone top bar: back arrow · centered step name + "n / 5" · avatar; 3px progress segments along bottom edge (done = #F5871F, rest #E7E7E2). Desktop: sidebar (black #111111), step pills, right **Summary** panel (Total, Package price, Changes, Discount, Export).
Footer (phone): save-draft icon (50px) + black primary button ("Room type →", "Style →", "Customize →", "Preview quotation →", "View quotation →").

1. **Customer** — CRM search (name/phone) autofills CRM fields and preselects room type by Unit size. Fields = CRM fields with "Show in quote" + Quote-only fields from settings; red * for required.
2. **Room type** — phone: vertical list cards (92px photo, title 18/700, beds/baths, sq.ft., "From RM…", round radio). Desktop: Airbnb-style grid, photo carousel (auto-slide 3.5s unless "cover only"). Sorted by bedrooms then bathrooms.
3. **Style** — phone: chips (Muji/Modern/Nordic); full-bleed 4:3 image carousel, small 30px arrows, room chips (Living/Dining/Bedroom = Drive sections), tap image = full-screen zoom with arrows. Classic / Build in segmented. **Furniture** list (tap row = zoom photo) and collapsible **Services**. Images = style photos (settings) + sales' Drive photos for that style.
4. **Customize** — phone: Furniture | Services tabs (sticky, 32px). Category header grey bar (#EEEEEA, sticky) with count badge + orange "+" (add from catalogue). Rows: name, price (+ "RM x each"), lock icon for fixed price, swap icon (opens Change sheet), qty stepper (typeable, 0–999). Fixed-price items: removable (qty 0) but not repriced; "edit" items show orange RM input.
   - **Change item sheet**: tabs "All {kind}" | "By collection" (collection list → items, "Use X for the whole home"), colour filter, search, zoom with arrows, "Not listed?" custom b2b item. Desktop keeps sheet open after a pick.
5. **Quotation** — phone: black total card + details (package/changes/discount input) → **View quotation** full-screen A4 preview (fit-to-width) with back arrow and bar: save-draft · share · **Download PDF**. Share sheet: WhatsApp / Email / Telegram / Copy / More (native share). Save & PDF show confirm modal.

### 3. Drive (Workspace) — `Workspace.dc.html`
- One folder per **style** (from settings) — no custom folders. Rooms = sections ("+ Room" opens bottom sheet: name + photos → Add room).
- Grid 2 cols on phone; tap photo = full-screen present; tap title/pencil = edit panel (title, note, draw/erase, delete); trash on each tile (tap twice).
- Header icon buttons: Upload, Save (status dot).
- Data is **per account** (Supabase: owner = auth user).

### 4. Quotation settings — desktop `Quote Settings v3 Bold`, phone `Quote Settings Mobile`
Tabs (desktop): Quotation document · Customer info · Room types · Styles · Catalogue · Categories. Changes are drafts until **Publish** (or the per-panel save icon).
- **Quotation document**: block list (eye icon show/hide), A4 live preview; click to edit. Letterhead (logo + lines with size/B/I/U), facts, item table (hover → grey "+" right = add column: preset Category/Collection/Colour/Remarks or custom name; "+" bottom = extra row on every quote), totals, terms, signatures, custom fields.
- **Customer info**: From CRM table (Required *, Show in quote 👁, Print 🖨 checkboxes; print needs show) + Quote-only fields (rename, type, required, print, add/remove; built-in fields Unit no./Billing address/Building/Date/Prepared by can't be deleted). Live phone/desktop preview + quotation header preview.
- **Room types**: list sorted by size; one package group per bedrooms×bathrooms, Classic + Build in versions. Beds/baths steppers + Extra room (+1) stepper, sq.ft., note, photos (slideshow/cover-only, pin cover). Furniture table per category (collapsible): item, desc, code, catalogue kind, price source (**b2b** follows catalogue / **fixed** / **edit** = sales can change), qty, sum. **Template** (download .xlsx of this room type: CATEGORY, ITEM, DESCRIPTION, CODE/COLOUR, QTY, PRICE) / **Upload** (preview → Replace or Add → Import). Right-click package: Open, Duplicate, Add other version, Delete. "+ New package" creates immediately (copies current list).
  - Phone: tabs Details / Furniture (Classic|Build in toggle, swipe **left** to delete, "+" per category adds catalogue items only) / Photos.
- **Styles**: name, description, multiple photos (first = cover, pin to change).
- **Catalogue**: search, category filter, paging (25/50/100), price, show/hide in IR Quote, bulk actions; b2b price grabber (bookmarklet in `catalog-import.js`) imports prices, collections, colours.
- **Categories**: kinds, rooms, b2b page URLs.

## Pricing rules
- Package price = Σ item cost × qty. No markup — b2b price is the selling price.
- Room-type item with a catalogue code match follows catalogue price unless set **fixed**/**edit** (`quote-doc.js → syncPrices`).
- Customer total = package ± changes − discount.

## Data model (suggested Supabase tables)
`quote_config` (company, doc blocks, custInfo, styles, markup unused) · `packages` (id, group, style classic|build, spec {beds, baths, sqft, note, photos[], photoMode}, cats[] {name, items[] {name, desc, code, cost, qty, kind, fixed, adjust}}) · `catalog_items` (code, name, kind, cost, img, collection, color, paused, noPrice) · `catalog_kinds` · `drive_boards` (owner, style, sections[], images[] {src→storage, title, note, marks, section}) · `quote_drafts` (owner, customer, step, lines, discount, styleId) · CRM customers/form from existing tables.
See `quote-doc.js` (`load`, `defaults`, `syncPrices`, `renderDoc`, `CRM_FIELDS`) and `workspace-store.js` for current shapes.

## Design tokens
- Ink #1F1F1C / #111111 · body text #34342F · muted #6B6B66 · subtle #97978F
- Surfaces: page #F7F7F5, panel #F2F2EF, chip #EEEEEA, border #E7E7E2 / #DEDED8, white #FFFFFF
- Accent orange #F5871F (hover/ink #D96E0B, tint #FFEBD9, #FFF5EC, border #FFC999)
- Danger #8A2E1C (tint #F6E1DA) · success #2F6B47 (tint #E8F3ED)
- Sidebar #111111, active item #F5871F with #111111 text
- Fonts: **Space Grotesk** 500–700 (titles, numbers), **Manrope** 400–800 (UI). Quotation doc: Georgia.
- Radius: 8 (inputs/chips small), 10–12 (buttons/inputs), 14–16 (cards), 20 (hero cards), 24 (bottom sheets), 50% (avatars/fab)
- Shadow cards: 0 1px 2px rgba(20,20,18,.04), 0 8px 24px rgba(20,20,18,.045)
- Touch targets ≥ 30px (steppers), primary buttons 46–50px.

## Assets
Product images are hot-linked from the b2b site (mm.hinlim.com) via catalogue `img`. User uploads (room/style photos, Drive, logo, signature) are base64 in the prototype — move to Supabase Storage. Icons are inline SVG (Lucide-style strokes); use the app's icon set.

## Screenshots
`screenshots/` — 01–06-quote: phone-width quote flow (home → Customer → Room type → Style → Customize → Quotation). 01–05-settings: desktop Quotation settings tabs (Quotation document, Customer info, Room types, Styles, Catalogue). Product images hot-linked from b2b may appear blank in the captures; the A4 preview iframe is not captured — open the HTML files for the live versions.

## Files
- `IR Quote v9 Bold.dc.html` — sales quote flow (desktop + phone; `?embed=1` hides app nav).
- `IR Quote v9 Mobile.dc.html` — iPhone frame wrapper for review only.
- `Quote Settings v3 Bold.dc.html` — Principal desktop settings.
- `Quote Settings Mobile.dc.html` — Principal phone settings (Room types / Catalogue / Styles).
- `Workspace.dc.html` — Drive.
- `quote-doc.js` — config load/save, price sync, quotation HTML renderer, CRM field list.
- `workspace-store.js` — Drive storage (IndexedDB), accounts mock.
- `catalog-import.js` — b2b price-grabber bookmarklet.
- `data/packages.json`, `data/catalog.json` — seed data from the original Excel quotation and b2b scrape.
- `support.js` — prototype runtime only (not needed in production).
