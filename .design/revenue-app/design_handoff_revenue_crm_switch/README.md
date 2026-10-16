# Handoff: Revenue → CRM switch view motion ("Peach · Context", design 2c)

## Overview
In the Revenue app (mobile, Revenue view of HOUZS Venture Portal), tapping the view chip **"Revenue ▾"** in the header switches the user to the **CRM** view. This is the transition between the two: a peach curtain rises from the bottom, the word "Revenue" rolls up into "CRM" while a one-line CRM summary shows, then the curtain lifts off the top to reveal the CRM screen.

## About the design files
Files in this bundle are **design references built in HTML**, not production code. Recreate the motion in the Venture Portal codebase (Next.js / React, repo `wenwei4046/Venture-Portal`) using its existing patterns. `ViewSwitchCurtain.tsx` is a reference implementation with the final values. Use it as-is or port it.

- `motion-reference.html`: standalone, dependency-free playback of the exact motion. Open in a browser and tap "Revenue ▾". **This is the source of truth for timing.**
- `ViewSwitchCurtain.tsx`: React reference component (Web Animations API), with all timings, colours and copy.
- `prototype/Revenue to CRM Switch 2c.dc.html`: the original design prototype (needs `support.js` and the HOUZS design-system `_ds/` folder beside it to render; for reference only).

## Fidelity
**High fidelity.** Colours, type, copy, durations and easing are final. Match them 1:1.

## Sequence (ms from tap)
Easing for every tween: **`cubic-bezier(.2,.8,.2,1)`** (the system's single curve), except the chip press and dot pulse, which are linear or sine.

| t (ms) | Element | Change |
|---|---|---|
| 0 → 250 | Header chip "Revenue ▾" | press scale 1 → .96 → 1 (sine) |
| 0 → 450 | Chip ripple (80px circle, `#BD4A19`, centred in chip, clipped by chip) | scale .2 → 1.6, opacity .3 → 0 |
| 400 → 950 | Curtain panel (full screen) | translateY 100% → 0; border-radius top corners 40px → 0 |
| 400 → 950 | Revenue screen (under curtain) | scale 1 → .96 (origin 50% 40%) |
| 750 → 1000 | Caption, dots, foot line | opacity 0 → 1 |
| 950 | Swap | hide Revenue, mount/show CRM underneath (do the route/view change here) |
| 1150 → 1550 | Word roll | "Revenue" translateY 0 → −100%; "CRM" translateY 100% → 0 (inside a 56px clipping box) |
| 1700 → 1900 | Caption, dots, foot line | opacity 1 → 0 (the word "CRM" stays) |
| 1850 → 2350 | Curtain panel | translateY 0 → −100%; border-radius bottom corners 0 → 40px |
| 1900 → 2450 | CRM screen | translateY 36px → 0 |
| 2350 | Unmount curtain | |

Total: about 2.35s from tap to settled CRM. (In the prototype the loop starts 500ms before the tap; the times above are rebased to the tap.)

**Loading dots:** three 6×6 dots, gap 6px, `#BD4A19`. Opacity pulses .3 ↔ 1 on a sine, period ≈ 1005ms, each dot offset ≈ 176ms after the previous (`.3 + .7 × (.5 + .5·sin(t/160 − i·1.1))`).

**If CRM data takes longer than the curtain:** hold at the covered state (after the word roll) with the dots pulsing, and run the uncover (1850 →) only once the CRM screen is ready. Never uncover onto an empty screen.

**Reduced motion:** with `prefers-reduced-motion: reduce`, skip the curtain and switch views instantly.

## Curtain: layout and styling
Full-bleed over the app screen (`position:absolute; inset:0`, above header and content), `overflow:hidden`. Content is a vertical flex column, centred both ways, gap 14px.

- **Panel background:** `#FFF0E4` (`--rv-peach`)
- **Panel edge:** `box-shadow: inset 0 0 0 1px rgba(255,255,255,.25)` (`--rv-hero-edge`)
- **Caption:** "Now opening". Inter 12px, weight 400, uppercase, letter-spacing .12em, colour `#806B60` (`--rv-sub`)
- **Word roll:** box 260×56px, overflow hidden, centred text. Inter Tight 46px / 56px line-height, weight 800, letter-spacing −.04em, colour `#BD4A19` (`--rv-accent`). Words: "Revenue" → "CRM"
- **Dots:** see above, colour `#BD4A19`
- **Foot line:** "24 open leads · 6 to follow up today". Inter 13px, colour `#806B60`, absolutely positioned 64px from the bottom, centred. Use live CRM counts (`{open} open leads · {due} to follow up today`). If counts aren't loaded yet, omit the line rather than show a placeholder.

## Surrounding screens (for context)
- Phone canvas 360×740 in the prototype; real app is full-viewport.
- **Header chip (Revenue):** height 34, radius 17, padding 0 12 0 10, bg `#FFE5CF` (`--rv-pill-on`), text `#BD4A19` 13px/650, wallet icon 16px stroke 1.9, then "Revenue", then "▾" at 10px.
- **Header chip (CRM):** identical, team icon, label "CRM".
- Revenue screen: Today screen (greeting "Hello, Jia Hui", income hero). CRM screen: "Your pipeline" + segmented Today / Leads / Quoted + lead rows. Use the existing screens in the codebase.

## State
- `view: 'revenue' | 'crm'`
- `switching: boolean` (curtain mounted). Ignore taps on the chip while true.
- Trigger: chip tap → `switching = true` → at the 950ms swap set `view = 'crm'` → on uncover end `switching = false`.
- Optional: prefetch CRM summary counts on chip tap for the foot line.

## Design tokens used
| Token | Value | Use |
|---|---|---|
| `--rv-peach` | `#FFF0E4` | curtain background |
| `--rv-accent` | `#BD4A19` | word roll, dots, ripple, chip text |
| `--rv-sub` | `#806B60` | caption, foot line |
| `--rv-pill-on` | `#FFE5CF` | header chip background |
| `--rv-ink` | `#3F2B22` | screen body text |
| `--rv-hero-edge` | `inset 0 0 0 1px rgba(255,255,255,.25)` | curtain inner edge |
| easing | `cubic-bezier(.2,.8,.2,1)` | all tweens |
| radius | 40px | curtain leading-edge corners while moving |

Fonts: **Inter** (body, 400–700 + 650), **Inter Tight** (word roll, 800). Both already in the Venture Portal.

## Assets
No images. Icons are the Revenue `RvIcon` set (24px viewBox, round caps/joins, `currentColor`):
- wallet: `M3 6h17v15H3V6Zm0 0V3h14v3m-3 6h7v5h-7v-5Z`
- team: `M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8m6 9v-2a4 4 0 0 0-3-3.87M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z`

## Files
- `README.md`: this spec
- `motion-reference.html`: exact playable motion
- `ViewSwitchCurtain.tsx`: React reference component
- `prototype/`: original design prototype
