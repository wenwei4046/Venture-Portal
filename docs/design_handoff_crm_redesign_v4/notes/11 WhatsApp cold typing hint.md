# 11 · WhatsApp cold chat: warning above the typing bar (owner, 2026-11-09)

Picked: frame **6a·2** in `CRM Optimized Phone.dc.html` (turn-6), shown **all the time** while the window is shut, not only once text is typed. The 6a placeholder-only state is not used.

Applies to a WhatsApp chat whose 24 h window is shut (`shut && c.channel === "whatsapp"`, not Facebook-blocked). Messenger is unchanged.

## While the window is shut
- **Warning row** above the typing bar, from the moment the chat opens:
  - `left/right 12px`, `bottom 76px` (sits on the bar), `padding 10px 10px 10px 14px`, `border-radius 16px`, background `#FDE3D2`, text `var(--crm-oxblood)`.
  - Icon `triangle-alert` 16px, then text 500 13px/1.4: **"WhatsApp won't deliver this. After 24 h only a template reaches {first name}."**
  - Right: **Template** button, 36px high, radius 18px, rust background, white 500 13px. It opens the templates (`openTpl`).
- **Typing bar** unchanged: Sticker, box ("Reply to {name}…"), Attach (rust), Camera. Typing is allowed.
- **Send / mic button** grey (`#CDBFB5`) and inactive. The mic can't record (a voice note won't be delivered either).
- The draft stays in the box. Opening a template does not clear it.
- Message list bottom padding: 140px, so the last bubble clears the warning.

## Desktop: same rules
- Desktop chat (`desk/DeskApp.tsx` composer, `desk/vm/chat.ts`): in the same WhatsApp window-shut case, the same warning row sits directly above the composer, from the moment the chat opens.
  - Full composer width, `margin-bottom 8px`, same padding, radius, colours, icon, text and Template button (opens the templates, as the + menu's Cold template does).
- The desktop Send button and mic are grey (`#CDBFB5`) and inactive. Typing is allowed and the draft is kept.
- The + menu keeps Cold template.
- When Suggest a template is off, show the warning without the button.

## Leave alone
- The chat's existing colours: outgoing bubbles in rust, incoming white, the cream chat background. This round only tidies the UI and adjusts behaviour; no colour changes.
- The chat strip (Cold · … / Window closed), the Attach tiles (Cold template stays), and Settings › Suggest a template.
- When Suggest a template is off, show the warning without the Template button.
