# 12 · Messenger: failed sends look sent until Human Agent (owner, 2026-11-10)

> "我就想让它看起来像成功发送一样 … human agent 应该快通过了"

Temporary, until `HUMAN_AGENT_APPROVED` is true.

## Change
- A Messenger message that failed because the window is shut (the cases `quietFailure(…)` in `sales/vm/chat.ts` already matches) is drawn exactly like a sent message: the same tick and time. Drop the ⓘ / failed icon and any "Not sent" wording. Do the same on the phone (Mine and Team) and the desktop.
- The chat strip shows only the status (e.g. "Follow up") for these Messenger chats: hide "Window closed" / "Reply window · N h left" on the right. Same on the desktop chat head.
- Do not draw frame 7c's warning yet. The Messenger typing bar stays as it is today.

## Keep
- The real status in the database is unchanged (`failed` + error). Only the display changes.
- All other failures (network, 4 MB file, WhatsApp refusals, Blocked on Facebook) still show as failed.
- Facebook-blocked chats: 7b still applies.

## When Human Agent is approved
Set `HUMAN_AGENT_APPROVED = true`. The display then goes back to showing these failures, and Messenger chats go back into Cold leads past 7 days (see `isCold`).
