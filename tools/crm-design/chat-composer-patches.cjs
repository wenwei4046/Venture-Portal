// The chat composer handoff (docs/design/chat-composer, 2026-10-14 — the owner's Claude Design "Typing bar UI mobile chat
// design") on the salesperson's chat (gen-sales.cjs › SalesChat, applied after its other patches): the chat's layers as the
// prototype's phone holds them — the wallpaper full bleed under the message list, the header floating over it in white at
// 96%, the composer at the bottom (sales/ChatComposer.tsx → SalesComposer, generated from the same prototype by
// gen-composer.cjs). The header is the prototype's exactly (the owner, 2026-10-14: "照设计稿一模一样" — 40px buttons with no
// ring, a green dot on the avatar); the messages are the chat's own, unchanged (the handoff: "Message bubbles (unchanged
// from current app)"). Each [from, to, why] must match once.
const PROTO_LIST_PAD = "124px 16px"; // the prototype's list: its 99px header + 25px, 16px at the sides
module.exports = () => {
  if (!require("./composer-proto.cjs").listTag().includes(`padding:${PROTO_LIST_PAD}`)) throw new Error("the prototype's message list padding moved");
  return [
    ['<main style={{ position: "relative", flex: "1 1 auto", minHeight: "0", boxSizing: "border-box", padding: "16px 20px 8px", display: "flex", flexDirection: "column", gap: "12px" }}>',
      '<main data-chat-screen="" style={{ position: "relative", flex: "1 1 auto", minHeight: "0" }}>',
      "every layer of the chat stands on <main> as the prototype's stand on its phone: the list, the header and the composer each absolute"],
    // The header: the prototype's block (white at 96% over the wallpaper, its hairline) and row (2px 16px 12px); the phone's own
    // status bar stands for the prototype's drawn 44px one. The pinned message and the cold-lead note ride in it, under the row.
    // One step above the composer (the prototype's 3): the ⋮ menu lives inside the header, and with the keyboard or a panel
    // up on a small phone it reaches down past the bar's top — at the composer's 3, the composer would cover its last rows.
    ['<div style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "12px", borderBottom: "1px solid rgb(235 221 210)" }}>',
      '<div data-chat-head="" style={{ position: "absolute", left: "0", right: "0", top: "0", zIndex: "4", background: "rgba(255,255,255,.96)", borderBottom: "1px solid rgb(235 221 210)" }}>\n      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "2px 16px 12px" }}>',
      "the header floats over the wallpaper (the prototype's header block and row), above the composer for its ⋮ menu"],
    [/<span onClick=\{v\.closeChat\} style=\{\{ flex: "none", width: "44px", height: "44px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid rgb\(235 221 210\)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" \}\}>(\s*)<svg width="20" height="20"/,
      '<span onClick={v.closeChat} style={{ flex: "none", width: "40px", height: "40px", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>$1<svg width="22" height="22"',
      "back: 40×40 with no ring, the arrow 22 (the prototype)"],
    [/<span style=\{\{ position: "absolute", right: "-3px", bottom: "-3px", width: "18px", height: "18px", boxSizing: "border-box", borderRadius: "50%", border: "2px solid #fff", background: v\.cl\.chanFg, color: "#fff", display: "grid", placeItems: "center" \}\}>\s*<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">\s*<path d=\{v\.cl\.chanIcon\}>\s*<\/path>\s*<\/svg>\s*<\/span>/,
      '<span style={{ position: "absolute", right: "-3px", bottom: "-3px", width: "18px", height: "18px", boxSizing: "border-box", borderRadius: "50%", border: "2px solid #fff", background: "#387557" }}>\n          </span>',
      "the avatar's dot is the prototype's green (the owner chose the design over the channel badge; the avatar's title still names the channel)"],
    ['<span style={{ flex: "none", position: "relative" }}>\n          <span data-hm-toggle="1" onClick={v.hm.toggle} title="More" style={{ width: "44px", height: "44px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid rgb(235 221 210)", background: v.hm.btnBg,',
      '<span style={{ flex: "none", position: "relative", display: "flex" }}>\n          <span data-hm-toggle="1" onClick={v.hm.toggle} title="More" style={{ width: "40px", height: "40px", borderRadius: "50%", background: v.hm.btnBg,',
      "⋮: 40×40 with no ring (the prototype), a tint only while its menu is open; its wrapper adds no line height to the row"],
    ['<div data-hm-menu="1" style={{ position: "absolute", top: "52px",', '<div data-hm-menu="1" style={{ position: "absolute", top: "48px",',
      "the ⋮ menu keeps its 8px under the 40px button"],
    ['<div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "12px", background: "#F5EBE3",',
      '<div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", margin: "0 16px 12px", padding: "8px 12px", borderRadius: "12px", background: "#F5EBE3",',
      "the pinned message sits in the header, under its row"],
    ['<div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px", padding: "10px 12px", borderRadius: "12px", background: "#E3EAF1", color: "#2E4760" }}>',
      '<div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px", margin: "0 16px 12px", padding: "10px 12px", borderRadius: "12px", background: "#E3EAF1", color: "#2E4760" }}>',
      "the cold-lead note sits in the header, under its row"],
    // The message list: the prototype's (absolute, 16px sides, 10px apart, at the bottom when short), padded by the header and
    // the composer as they stand (--chat-top / --chat-foot, ChatComposer; the prototype's 124px and 96 + panel + box), and to
    // the phone's bottom edge. "At the bottom when short" is the first child's margin-top: auto, not justify-content:
    // flex-end, whose overflow a long chat could not scroll back to. A tap on it closes the keyboard and any panel.
    ['\n      <div data-chat-list="1" style={{ flex: "1", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", gap: "10px", margin: "0 -20px", padding: "10px 20px", backgroundColor: v.wallBg, backgroundImage: v.wallImg, backgroundSize: v.wallSize }}>',
      '\n      </div>\n      <div data-chat-list="1" onClick={v.dismiss} style={{ position: "absolute", left: "0", right: "0", top: "0", bottom: "calc(0px - var(--safe-bottom, 0px))", overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", boxSizing: "border-box", padding: "calc(var(--chat-top, 55px) + 25px) 16px calc(var(--chat-foot, 64px) + 6px)", backgroundColor: v.wallBg, backgroundImage: v.wallImg, backgroundSize: v.wallSize }}><div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>',
      "the header block ends here; the list is the prototype's, full bleed under the header and the composer"],
    // The composer: everything the chat drew under its list — the edit / reply rows, "/" quick replies, the template button,
    // the recording row, the reply box with its +, camera and mic, the emoji panel — is the composer's now. Exactly those
    // blocks: anything else found there (a later design's, an earlier patch's) stops the generator instead of vanishing.
    [/        <\/Fragment>\)\)\}\n      <\/div>\n      \{!!\(v\.editText\) && \(<>[\s\S]*?(\{!!\(v\.hm\.apptOpen\) && \(<>)/,
      (span, sheet) => {
        const blocks = [...span.slice(0, span.length - sheet.length).matchAll(/\n      \{!!\(([^)]*(?:\([^)]*\))?[^)]*)\) && \(/g)].map(m => m[1]);
        const want = ["v.editText", "v.replyText", "v.slashOpen", "v.chatCold", "v.chatWarm && v.rec", "v.chatWarm && !v.rec", "v.emojiOpen && v.chatWarm"];
        if (JSON.stringify(blocks) !== JSON.stringify(want)) throw new Error(`SalesChat: the composer's place holds ${JSON.stringify(blocks)}, not ${JSON.stringify(want)}`);
        return `        </Fragment>))}\n      </div></div>\n      <ChatComposer key={v.cmp.key} v={v.cmp} />\n      ${sheet}`;
      },
      "the composer (sales/ChatComposer.tsx) takes the place of the reply rows, the reply box and the emoji panel"],
    [/\{!!\(v\.attOpen\) && \(<>[\s\S]*?\n      <\/>\)\}\n      /, "",
      "the + sheet is the composer's Attach panel now (in the keyboard's place)"],
    ['<div style={{ position: "absolute", left: "20px", right: "20px", bottom: "90px", zIndex: "6", padding: "12px 14px", borderRadius: "14px",',
      '<div style={{ position: "absolute", left: "16px", right: "16px", bottom: "74px", zIndex: "6", padding: "12px 14px", borderRadius: "14px",',
      "the chat's toast where the prototype's stands: 16px in, just above the bar"],
  ];
};
