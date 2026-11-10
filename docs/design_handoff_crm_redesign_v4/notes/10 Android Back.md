# 10 · Android Back: always one step back (owner, 2026-11-09)

> "android 点返回会回到首页，帮我检查返回是返回到上一个动作"

Back (the hardware/gesture button) must undo the last move inside the CRM: close the layer that was opened last, or go back to the screen the user came from. It may leave the CRM only from its first screen with nothing open.

The mechanism already exists: `shared/nav-history.ts` + `shared/nav-frame.ts`, wired in `CrmApp.tsx` (`useNavHistory(navFrame, …)`). These are the gaps found in it.

## 1 · Layers missing from the nav frame
A layer that is not in `SALES_NAV` / `PANEL_NAV` never pushes a step. Back then skips it and lands on an earlier screen, or leaves the CRM. Add these:

**SALES_NAV**: `pick` (photo/video preview with HD switch), `tp` (time picker), `celebrate`.
**PANEL_NAV**: `pPick`, `bpSheet` (Adjust split sheet), `applyPick` (Save and apply to all), `ftx` (full-time allocation editor), `rmDel` (delete-showroom confirm), `rmTP` (showroom time picker), `ovAds` / `ovUp` / `ovAct` (Insight's Team / Ads / Up next / Activity switch: treat a switch as a page step).

Check the hosts mounted in `shell()`: `AttachSheetHost`, `ActionSheetHost`, `NotifSummaryHost`, `MessageMenu`. Each one that opens full-screen or as a bottom sheet must hold its own step through `useBackCloses` (as `MediaViewer` does). The message menu is a dropdown and is the exception, as noted in nav-frame.ts.

Rule for the future: every new `ui` / `panelUi` field that opens a sheet, page or dialog goes into the nav frame in the same change. Add a test that fails when a field named `*Open`, `*Sheet`, `*Ed`, `*Edit` or `*Ask` is missing from the lists.

## 2 · The 30-step cap
`MAX = 30`, and past it `useNavHistory` stops pushing. A salesperson moving between tabs and chats passes 30 quickly. After that, Back jumps to a screen from much earlier, and soon runs out and leaves the CRM, which looks like "back goes to the home page". Raise the cap well above normal use (e.g. 200). When it is full, keep stepping and forget the oldest steps; never stop pushing.

## 3 · CrmApp remounts
The stack lives in a `useRef`. If `CrmApp` remounts (Revenue app view switch / curtain, a `key` change, phone ⇄ desk), the stack is empty but the `crmNavN` entries remain in browser history. Back then lands on those entries, finds depth 0 and does nothing. After a few presses it leaves the CRM. Fix one of two ways:
- keep the stack in `sessionStorage`; or
- on mount, if `history.state` carries `crmNav*` keys, rebuild the stack from them, or strip the keys with `replaceState`.

## 4 · Showroom edit (frames 4a–4a·3)
With unsaved changes, Back opens the leave sheet (Save draft / Discard changes / Keep editing) and stays on the page. Only Save draft or Discard then steps back.

## 5 · Desktop code on the phone
`desk/vm/proto-logic.ts` and `desk/nav.ts` push their own history entries with their own `popstate` listeners. Confirm neither is mounted on the phone; two listeners would each handle the same Back.

## Test on an Android phone (installed PWA and Chrome)
Each line: do the moves, then press Back once per arrow and check where you land.
1. Calendar → open a visit's chat → Back → **Calendar** (same month/day as before).
2. Inbox → chat → Attach → photo preview → Back → **chat** (preview closed) → Back → **Inbox**, scroll kept.
3. Inbox → Contacts → a contact's info → Back → **Contacts** → Back → **Inbox**.
4. Team: Insight → Ads performance switch → Back → **Team performance**.
5. Team: Assignment → Ads → an ad → Adjust split → Back → **ad editor** → Back → **Ads**.
6. Profile → Showrooms → change a field → Back → **leave sheet**, page unchanged.
7. Profile → Notifications → Back → **Profile**.
8. Do 40 moves of any kind, then Back 40 times. Every press steps back once, and the CRM is left only at the end.
9. Switch Team ⇄ Mine, leave the app in the background for a minute, come back → Back still steps.
10. On the CRM's first screen with nothing open → Back leaves to the Revenue app (unchanged; confirmed by the owner 2026-11-09).
