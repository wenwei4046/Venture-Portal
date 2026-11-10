# 09 · Remove Suggest reply (owner, 2026-11-09)

Remove the suggested-replies feature everywhere. Nothing replaces it except the Attach tile below.

## Remove
1. **Phone chat · floating logo**: `shared/suggest-float.tsx`, used in `sales/ChatComposer.tsx` (≈ line 366). Delete the component and its mount.
2. **Phone Attach · Suggest reply tile**: `sales/vm/composer.ts` › `TILES[3]`.
3. **Desktop chat · floating logo**: `desk/vm/chat.ts` › `suggest`, `suggestKey`, `pickSuggest` (≈ line 171), and wherever the desktop chat mounts it.
4. **Desktop + menu · Suggest reply**: `desk/vm/chat.ts` › the `view === "auto"` list (≈ lines 143–152) and the `sug` relabel in `ATTACH_TILES`. Do the same in `panel/vm/lead.ts` (≈ line 247).
5. **Reply library settings page**: `desk/DeskReplyLibrary.tsx`, its nav entry, and the `replyLibrary` reads.
6. **Logic and data**: `shared/suggest-reply.ts` (`suggestReplies`, `waitingWords`, `libraryFor`), plus the `replyExamples` reads in `CrmApp.tsx` (≈ lines 151 and 163). Keep `fillReply` / `fillWithFor` / `BLANKS` if Quick replies or templates still use them. Move them to a file named for that use.
7. **ComposerIn**: drop `suggest`, `suggestLogo` and `suggestLibrary`.
8. **Tests**: delete `shared/suggest-reply.test.ts` and `shared/reply-library.test.ts`. Update the tile assertions in `sales/ChatComposer.test.tsx`, `panel/PanelChat.composer.test.tsx`, `sales/vm/composer.test.ts` and `sales/vm/composer.cold.test.ts`.

Leave the server tables and RPCs alone. Only stop reading them.

## Attach tile 4
- Inside the 24 h window, put **Auto replies** back in this slot (icon `bot`, frame M05), with the behaviour it had before 2026-10-29. Take it from git history.
- Past the window (WhatsApp), keep **Cold template** (`coldTile`, `COLD_ICON`, opens `openTpl`), unchanged from 2026-11-04.
- Do the same in the desktop + menu.

## Ask before guessing
- If the pre-10-29 Auto replies tile has no behaviour left to restore, ask the owner what it should open.
