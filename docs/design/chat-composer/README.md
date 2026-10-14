# Handoff: CRM chat composer (RS mobile)

## Overview
New typing bar ("composer") for the salesperson (RS) mobile chat in the CRM (`src/components/member/crm/sales/SalesChat.tsx`). It combines **Sticker**, **Camera** and **Attach** in one pill, swaps between the system keyboard and two in-place panels (Sticker panel, Attach panel) at the same height, and turns the mic into **Send** while typing.

## About the design files
`Chat Composer.dc.html` is a **design reference built in HTML**: a live prototype of the intended look and behaviour, not production code. Recreate it in the Venture Portal codebase (Next.js / React / Tailwind) using its existing patterns: `RvIcon`, the Revenue tokens (`--rv-*` / `--ds-*`), `chat-wall` from `sales/wall.ts`, and the existing `attach-sheet.tsx` actions. Open the HTML in a browser to click through every state.

## Fidelity
**High-fidelity.** Colours, sizes, radii, shadows, icons and motion are final. Match them exactly. The only placeholders are the **GIF and sticker content** (see Assets).

---

## Screen: Chat thread with composer
Phone viewport 390×844 (it must reflow to any mobile width; nothing in the composer is fixed-width except the buttons).

### Layer structure (bottom → top)
1. **Wallpaper**: full bleed behind everything. `background-color:#EFE7DE; background-image:url(chat-wall.svg); background-size:240px 240px`.
2. **Message list**: `position:absolute; inset:0`, scrollable, `flex-direction:column; justify-content:flex-end; gap:10px; padding:124px 16px <bottomPad>`.
   - `bottomPad = barBase + panelH + (textareaH − 46)`, where `barBase = 96px` and `panelH = 280px` when the keyboard **or** a panel is open (else 0). This keeps the last message visible as the composer grows.
   - Tapping the list **dismisses** the keyboard and any panel (`blur()` the textarea).
3. **Header** (floats over wallpaper): `background:rgba(255,255,255,.96); border-bottom:1px solid rgb(235 221 210)`. Status bar 44px; then a row with `padding:2px 16px 12px; gap:10px`: back (40×40, arrow icon 22), 40px avatar (`#FFF0E4` bg, `#BD4A19` initials 13/650, 18px online dot `#387557` with 2px white ring at −3/−3), name 16/600, sub-line 12px `#387557`, menu (40×40, 3 dots 18).
4. **Composer stack**: `position:absolute; left:0; right:0; bottom:0; flex-direction:column`, containing in order: **bar → (sticker panel | attach panel | keyboard) → home-indicator strip (26px)**. The strip's background matches whatever sits above it: keyboard `#D3D5DB`, sticker panel `#fff`, attach panel `#FBF7F3`, otherwise transparent.

### Message bubbles (unchanged from current app)
- Mine: `#FCD6B8`, radius `16px 16px 4px 16px`, aligned right, blue double tick `#2F8FD8`.
- Theirs: `#fff`, radius `16px 16px 16px 4px`.
- Both: `max-width:80%; padding:8px 12px 6px; box-shadow:0 1px 1px rgba(63,43,34,.10)`, text 15/1.45, time 11px `#806B60` floated right.
- Day separator: white pill `padding:5px 12px; radius 9; 12px/600 #4E2F20`.
- **Sticker message** (no bubble): 132×132, radius 34, sticker colour fill, `border:5px solid #fff`, `box-shadow:0 3px 10px rgba(63,43,34,.18)`, `rotate(<sticker rot>)`. Emoji 54px; caption Inter Tight 15/800, −.01em. Time sits in a white pill below (`rgba(255,255,255,.92)`, radius 8, 11px).
- **GIF message**: 200×140, radius 14, tile colour, emoji 52px running its loop animation, caption Inter Tight 17/800 −.02em, "GIF" badge top-left (`rgba(63,43,34,.6)`, white Chivo Mono 10/700, radius 6, padding 2×6).
- **User image sticker**: 128×128, `object-fit:contain`, no frame.

### Typing bar ("One pill")
Row: `display:flex; align-items:flex-end; gap:6px; padding:8px 12px 10px`.

**Pill** (flex:1): `min-height:46px; padding:0 4px; radius 23; background:#fff; box-shadow:0 1px 2px rgba(63,43,34,.14)`. Children are left to right:

| Element | Size | Icon | Colour |
|---|---|---|---|
| Sticker toggle | 38×46 | `sticker` 21px, stroke 1.65. Becomes the `keyboard` icon while the sticker panel is open | `rgb(128 107 96)`, active `#BD4A19` |
| Textarea | flex:1 | none | 16px/22px Inter, `#3F2B22`, placeholder `#A8968B` "Reply to Lim…", `padding:12px 2px`, auto-grows up to 154px |
| Attach | 40×46 | paperclip 22px, stroke 1.8, rotated −45° | `rgb(128 107 96)`, active `#BD4A19` |
| Camera | 40×46 | camera 23px, stroke 1.8 | `rgb(128 107 96)` |

Attach and Camera **hide while the draft is non-empty**.

**Main button**: 46×46 circle, `#BD4A19`, white icon 20px stroke 1.75, `box-shadow:0 3px 9px rgba(189,74,25,.18)`. The draft is empty → mic icon (hold to record). The draft is non-empty → send icon; tapping it sends the message and clears the draft.

### Keyboard (simulated in the prototype; it is the OS keyboard in the real app)
Height **280px** including its top padding. All in-place panels use the **same 280px** so swapping never shifts the layout. In the real app, set the panel height to the last measured keyboard height (via `visualViewport`), falling back to 280px.

### Sticker panel (280px)
`background:#fff; border-radius:22px 22px 0 0; box-shadow:0 -6px 20px rgba(63,43,34,.08), 0 -1px 0 #EFE4DA; flex-direction:column`. Enter animation: `sheetUp 240ms cubic-bezier(.2,.8,.2,1)` (translateY 16px → 0, opacity 0 → 1).

1. **Grabber**: 36×4, radius 2, `#E3D6CC`, padding-top 8.
2. **Top row**: `padding:8px 10px; gap:8px; align-items:center`.
   - **Search**: 36×36 circle, `#F3EAE2` / icon `#3F2B22` 19px stroke 1.9. Active: `#FFE5CF` / `#BD4A19`. Toggles the search field.
   - **Middle slot** (`flex:1 1 0; min-width:0; height:36px`):
     - Tabs track: `#F3EAE2`, radius 18, padding 3, gap 2. Three equal tabs, each 30px tall with radius 15, an icon 15px plus a label at 12.5/650 and gap 4, `white-space:nowrap`. Tabs are **Emoji** (smile), **GIF** (play-square), **Sticker** (sticker). The active tab is `#fff` with `box-shadow:0 1px 3px rgba(63,43,34,.14)` and `#BD4A19` text. Inactive tabs are transparent with `#806B60` text. Background transitions over 200ms on the house curve.
     - Search mode replaces the track with an input. The input is 36px tall, radius 18, `1px solid #BD4A19` with a focus ring `0 0 0 3px rgba(189,74,25,.14)` and 15px text. The placeholder depends on the tab: "Search emoji", "Search GIFs" or "Search stickers".
   - **Delete (backspace key)**: 44×36, **radius 12**, `#fff`, `1px solid #EBDDD2`, `box-shadow:0 1px 2px rgba(63,43,34,.10)`, icon 22px stroke 1.8 `#3F2B22`. Pressed: `#FFF0E4` bg, `#BD4A19` border and icon, `scale(.94)` over 120ms. Deletes one **grapheme** from the draft (`Intl.Segmenter`), so multi-codepoint emoji are removed whole.
3. **Content** (flex:1, scroll, `padding:0 10px 8px`):
   - **Emoji**: a category label (12/650 `#806B60`: "Recents", "Smileys", …, "Results", or "No emoji match “q”"). Below it, an 8-column grid with gap 2. Each cell is 40px tall, emoji 27px, radius 12. Pressed: `#FFF0E4`, `scale(.9)`. Tapping a cell appends the emoji to the draft.
   - **GIF**: a 3-column grid with gap 6. Tiles are 84px tall, radius 12, filled with the tile colour. Each tile has a 30px animated emoji, an Inter Tight 12/800 caption, and a "GIF" badge (Chivo Mono 8/700, white on `rgba(63,43,34,.55)`, radius 4). Pressed: `scale(.96)`. Tapping a tile sends the GIF.
   - **Sticker**: a 4-column grid with gaps of 8px between rows and 6px between columns. The first cell is **Create sticker**, sized 76px tall. It has radius 18, a `1.5px dashed #E0B9A2` border on `#FFF8F2`, a 28px rust circle with a white +, and the label "Create<br>sticker" at 11/700 `#BD4A19`. The sticker cells are also 76px tall. Each sticker itself is 68×68 with radius 20, filled with the sticker colour, with a `3px solid #fff` border, `box-shadow:0 2px 6px rgba(63,43,34,.18)` and `rotate(rot)`. It shows a 27px emoji and an Inter Tight 9/800 caption. Pressed: `scale(.94)`. Tapping a sticker sends it.
   - Empty hints (13px `#806B60`, centred) are "Stickers you send appear here.", "Tap Create sticker to make one from a photo." and "No stickers match “q”.".
4. **Bottom category bar**: 46px tall, `border-top:1px solid #F3EAE2`, `padding:0 10px`, gap 6. There are **two approved styles**, chosen with the `bottomBar` prop:
   - `icons` (default): items spaced evenly, each 44×42, icon 21px. Inactive: stroke 1.7 `#806B60`. Active: stroke 2 `#BD4A19`, with a 16×3 rust underline (radius 2) 2px from the bottom.
   - `labels`: chips that scroll sideways, each 30px tall with radius 15, `padding:0 12px` and gap 6. Each chip has a 15px icon and a 13/650 label. Inactive: `#F3EAE2` / `#806B60`. Active: `#BD4A19` / `#fff`.
   - On the Sticker tab, a trailing **Add sticker** button (34px circle, `#FFF0E4` with a rust +) opens the photo picker.
   - The categories depend on the tab:
     - Emoji: Recents (clock), Smileys (smile), Gestures (thumbs-up), Home (house), Symbols (heart).
     - GIF: Trending (flame) showing all items, Thanks (thumbs-up), Greetings (sun), Sales (tag), Fun (sparkle).
     - Sticker: Recent (clock), HOUZS pack (house), My stickers (user).

### Attach panel (280px)
`background:#FBF7F3; border-top:1px solid #EBDDD2; padding:24px 12px 16px`, with **no title row**. It is a 4-column grid with gaps of 18px between rows and 8px between columns. Each tile is a 54px circle (white icon 24px stroke 1.8) above a 12/600 `#3F2B22` label with gap 7. The tiles are:
- Photos: `#2F8FD8`
- Document: `#BD4A19`
- Quick replies: `#A46312`
- Auto replies: `#387557`

These map to the existing `attach-sheet.tsx` actions.

---

## Interactions & behaviour
- **Focus the textarea**: the keyboard opens and any panel closes.
- **Sticker toggle while the keyboard is up**: the sticker panel replaces the keyboard at the same height. The icon becomes the keyboard icon, and tapping it again closes the panel and brings the keyboard back.
- **Attach while the keyboard is up**: the attach panel replaces the keyboard. Tapping Attach again restores the keyboard only if it was open before.
- **Tap the message list**: closes everything.
- **Camera**: opens the camera for a photo or video. The prototype shows a toast instead.
- **Mic**: hold to record. The prototype shows the toast "Hold to record a voice note".
- **Send**: appends a mine bubble with the current time ("h:mm am", `en-MY`) and clears the draft. The sticker panel stays open if it was open.
- **Search**: emoji are matched by English keywords (bed, sofa, thanks, deliver, pay …). GIFs and stickers are matched by caption. Picking a category ends search mode.
- **Create sticker / Add sticker**: opens the image picker (`accept="image/*"`). The chosen image is added to **My stickers** and that category is selected.
- **Sent stickers** go to the front of **Recent** (no duplicates, max 12).
- **Toast**: `#3F2B22` card with radius 14, white 14/600 text, 100px from the bottom, `fadeIn 160ms`, visible for 2.2s.

## Motion (use exactly these)
| What | Spec |
|---|---|
| House easing | `cubic-bezier(.2,.8,.2,1)` |
| Sticker panel in | `sheetUp` 240ms (translateY 16px→0, opacity 0→1) |
| Keyboard / attach / toast in | `fadeIn` 160ms ease-out |
| Tab / search / chip background | 200ms house curve |
| Category icon colour | 200ms house curve |
| Press feedback | delete `scale(.94)` 120ms; emoji `scale(.9)`; GIF `scale(.96)`; sticker `scale(.94)` |
| GIF emoji loops | `gBounce` 1s house curve (translateY −7px) · `gWiggle` .8s ease-in-out (rotate ±9°) · `gPulse` 1.1s (scale 1.16) · `gSpin` 4s linear (360°) · `gFloat` 2.2s (translate −3,0 → 3,−4) — all infinite |
| Reduced motion | `prefers-reduced-motion: reduce` → no animations or transitions |

## State
`draft`, `panel: null | 'sticker' | 'attach'`, `keyboardOpen`, `prevKeyboardOpen` (restored when a panel closes), `stickerTab: 'emoji' | 'gif' | 'sticker'`, `emojiCat`, `gifCat`, `stickerCat`, `searching`, `query`, `myStickers: Image[]`, `recentStickers` (max 12). Persist `myStickers`, `recentStickers` and recent emoji per user on the server.

## Design tokens (Revenue view)
- Ink `#3F2B22`; sub-text `#806B60`; muted placeholder `#A8968B`; rust `#BD4A19`; peach `#FFF0E4` / `#FFE5CF` / `#FCD6B8`; panel cream `#FBF7F3`; track `#F3EAE2`; hairline `#EBDDD2` / `rgb(235 221 210)`; won green `#387557`; info blue `#2F8FD8`; keyboard grey `#D3D5DB`.
- Sticker and GIF fills: `#FFE5CF #FCD6B8 #FFF0E4 #E4EFE8 #E3EEF8 #E9E4F2 #F6E7C8 #F3EAE2`. Solid fills for emphasis: `#BD4A19 #387557 #C8402A`. Caption colours: `#BD4A19 #2F5F8A #387557 #5B4A86 #A46312 #3F2B22 #806B60 #fff`.
- Radii: pill 23, main button 50%, panel top 22, track 18, tab 15, delete key 12, emoji cell 12, GIF tile 12, Create sticker 18, sticker 20, attach tile 27.
- Shadows: pill `0 1px 2px rgba(63,43,34,.14)`; main button `0 3px 9px rgba(189,74,25,.18)`; panel `0 -6px 20px rgba(63,43,34,.08), 0 -1px 0 #EFE4DA`; active tab `0 1px 3px rgba(63,43,34,.14)`; delete `0 1px 2px rgba(63,43,34,.10)`.
- Type: Inter for UI. Inter Tight 800 for sticker and GIF captions. Chivo Mono 700 for "GIF" badges.

## Icons
24-unit viewBox, round caps and joins, `currentColor`. These are the exact path `d` values. Add any that are missing to `RvIcon`.
- sticker `M20 13V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h6l7-7Zm0 0h-4a3 3 0 0 0-3 3v4`
- keyboard `M3 6h18v12H3V6Zm4 3h.01M10 9h.01M13 9h.01M16 9h.01M7 12h.01M10 12h.01M13 12h.01M16 12h.01M8 15h8`
- paperclip (rotate −45°) `M16.5 7.5v8.25a4.5 4.5 0 0 1-9 0V6a3 3 0 0 1 6 0v9.5a1.5 1.5 0 0 1-3 0V8`
- camera `M3 9a2 2 0 0 1 2-2h2l1.5-2.2A1.5 1.5 0 0 1 9.75 4h4.5a1.5 1.5 0 0 1 1.25.8L17 7h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z` + `circle cx12 cy13 r3.5`
- mic `M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3`
- send `M4 12 20 4l-4 16-4-7-8-1Zm8 1 8-9`
- search `M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4`
- backspace `M8.5 5.5h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-10L3.5 12l5-6.5Z` + `m11.5 9.5 5 5m0-5-5 5`
- smile `M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8.5 14.5a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01`
- gif `M4 5h16v14H4V5Zm6 4 5 3-5 3V9Z`
- clock `M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z`
- thumbs-up `M7 10v10H4V10h3Zm0 0 4-7a2 2 0 0 1 3 2l-1 4h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7`
- house `M4 11 12 4l8 7M6 9.5V20h12V9.5`
- heart `M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z`
- flame `M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.5 2 1.5 3 2.5 3 0-3-1-5.5.5-8.5Z`
- sun `M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17m10-10 1.4-1.4`
- tag `M3 12V4h8l10 10-8 8L3 12Zm5-4h.01`
- sparkle `M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2`
- user `M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0`
- plus `M12 5v14M5 12h14`

Stroke widths: bar icons 1.65 (sticker) and 1.8 (attach, camera); main button 1.75; top-row icons 1.8–1.9; tab icons 1.8; category icons 1.7, or 2 when active.

## Content
The full lists are in the logic class of `Chat Composer.dc.html`:
- `CATS`: 5 emoji categories × 24 emoji.
- `NAMES`: search keywords.
- `STK`: 20 HOUZS stickers as `[emoji, caption, fill, ink]`, rotations cycling −4°, 3°, −2°, 4°, −3°, 2°, −1°.
- `GIFS`: 20 items as `[caption, emoji, fill, animation, category]`.

## Assets
- `chat-wall.svg`: the existing wallpaper from `src/components/member/crm/sales/wall.ts`.
- **Placeholders**: the GIF tiles and the HOUZS sticker pack are designed with emoji and captions. Swap in real GIF provider results (e.g. Tenor/Giphy) and real sticker artwork, keeping the same tile sizes, radii, border and press states.
- Emoji render with the platform emoji font.

## Files
- `Chat Composer.dc.html`: the final prototype. Its `bottomBar` prop is `icons` or `labels`.
- `chat-wall.svg`: the wallpaper.
