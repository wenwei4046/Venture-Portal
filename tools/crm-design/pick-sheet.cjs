// The chats' photo / video preview (shared/pick.ts, user 2026-10-13): the markup both generators patch in — salesperson
// (gen-sales.cjs) and Control panel (panel-1011-patches.cjs). V = the view model's path; it shows while it is set.
// Since 2026-10-14 it is WhatsApp's editor, full screen, written by hand (shared/pick-editor.tsx: save, HD, crop and
// turn, stickers, text, drawing; a video's trim and sound) — the generators import PickEditor when a screen uses it.
const PICK_SHEET = V => `{!!(${V}) && (<PickEditor pk={${V}} />)}
      `;
module.exports = { PICK_SHEET };
