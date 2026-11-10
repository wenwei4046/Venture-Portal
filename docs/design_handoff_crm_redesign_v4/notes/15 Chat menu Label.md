# 15 · Chat ⋮ menu: Label (owner, 2026-11-10)

> "mine 的用回自己的，但是在聊天室里右上的3个点，加label功能"

- **Inbox (Mine) = frame 10b** (owner, 2026-11-10: "10b mine 加多一个是广告来源"). See notes/16.
- **Approved (owner, 2026-11-10: "11a 11b use").** Spec: frames 11a, 11b in `CRM Optimized Phone.dc.html` (turn-11).

## Change (`sales/vm/chat.ts` › `hm.items`)
- Add a last item after "Appointment": label **Label**, icon path `M3 12V4h8l10 10-8 8L3 12Zm5-4h.01`, tile bg `#FFF0D1` (amber tint), fg `#7A4E00`.
- Sub line: the chat's label names joined with " · " (same source as the Inbox: `data.customerLabels[c.id]`), or "Add a label" when none.
- Tap: close the menu and open the Label sheet over the chat. Reuse the Inbox More sheet's label view as-is — `labelItems`, edit (pencil), New label, label form, Save/Delete — and the same `act.setLabel` / `act.saveLabels` / `ensure()` logic. Move that logic from `sales/vm/inbox.ts` into a shared helper so both use one code path.
- The sheet gets a **Done** in its header (closes, back to the chat). No Back link to the Inbox More menu here.
- Show to everyone who can open the chat (desktop chat ⋮ menu too, same item).

## Keep
- Inbox swipe › More › Label stays.
- Labels on Inbox rows unchanged.
