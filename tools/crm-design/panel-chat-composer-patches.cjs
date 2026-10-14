// The chat composer handoff (docs/design/chat-composer, 2026-10-14) on the Team side's chat too — the Control panel's
// (gen-panel-1011.cjs › PanelApp, applied after its other patches). The owner, 2026-10-15: "all need same, as new
// version" — the Principal and the Director answer customers here, and it must be Mine's chat: the same header (40px
// buttons with no ring, a green dot on the avatar), the wallpaper full bleed under a floating header, and the same
// composer (sales/ChatComposer.tsx, its look generated from the prototype by gen-composer.cjs; chat-composer-patches.cjs
// does the same to Mine's chat). What only the Team side has stays, in the header under its row: whose customer it is,
// and the line a reassignment leaves. The view-only mode (lx.viewOnly) is never on — the Principal answers here too
// (2026-10-09) — so its blocks are left as generated. Each [from, to, why] must match once.
module.exports = () => [
  ['<main style={{ position: "relative", flex: "1 1 auto", minHeight: "0", padding: "16px 20px 16px", background: v.chromeBg, display: "flex", flexDirection: "column", gap: "12px" }}>',
    '<main data-chat-screen="" style={{ position: "relative", flex: "1 1 auto", minHeight: "0", background: v.chromeBg }}>',
    "every layer of the chat stands on <main>, as in Mine's: the list, the header and the composer each absolute"],
  // The header: white at 96% over the wallpaper, the prototype's row (2px 16px 12px), one step above the composer (4) for
  // its ⋮ menu — Mine's exactly.
  ['<div style={{ position: "relative", flex: "none", display: "flex", alignItems: "center", gap: "10px", paddingBottom: "10px", borderBottom: "1px solid #EBDDD2" }}>',
    '<div data-chat-head="" style={{ position: "absolute", left: "0", right: "0", top: "0", zIndex: "4", background: "rgba(255,255,255,.96)", borderBottom: "1px solid rgb(235 221 210)" }}>\n            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "10px", padding: "2px 16px 12px" }}>',
    "the header floats over the wallpaper, as Mine's"],
  [/<span onClick=\{v\.ld\.back\} title="Back to Inbox" style=\{\{ flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" \}\}>(\s*)<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1\.8"/,
    '<span onClick={v.ld.back} title="Back to Inbox" style={{ flex: "none", width: "40px", height: "40px", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#3F2B22", cursor: "pointer" }}>$1<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65"',
    "back: 40×40 with no ring, the arrow 22 at 1.65 (the prototype's)"],
  [/<span style=\{\{ position: "relative", flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "650" \}\}>\{v\.ld\.ld\.ini\}<span style=\{\{ position: "absolute", right: "-2px", bottom: "-2px", width: "16px", height: "16px", borderRadius: "50%", background: v\.ld\.lx\.chC, border: "2px solid #fff", display: "grid", placeItems: "center", color: "#fff" \}\}>[\s\S]*?<\/span><\/span>/,
    '<span title={v.ld.lx.chanName} style={{ flex: "none", position: "relative", width: "40px", height: "40px" }}>\n' +
    '                <span style={{ width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", background: "#FFF0E4", color: "#BD4A19", fontSize: "13px", fontWeight: "650" }}>{v.ld.ld.ini}</span>\n' +
    '                <span style={{ position: "absolute", right: "-3px", bottom: "-3px", width: "18px", height: "18px", boxSizing: "border-box", borderRadius: "50%", border: "2px solid #fff", background: "#387557" }}>\n' +
    "                </span>\n              </span>",
    "the avatar with the prototype's green dot, as Mine's (the owner chose the design over the channel badge; its title names the channel)"],
  ['<strong style={{ fontSize: "16px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.ld.name}</strong>',
    '<strong style={{ fontSize: "16px", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.ld.name}</strong>',
    "the name at the prototype's 600"],
  [/<span data-hm-toggle="1" onClick=\{v\.ld\.lx\.toggleMenu\} title="More" style=\{\{ flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" \}\}>(\s*<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">\s*<circle cx="12" cy="5" r=)"1\.7"(>\s*<\/circle>\s*<circle cx="12" cy="12" r=)"1\.7"(>\s*<\/circle>\s*<circle cx="12" cy="19" r=)"1\.7"/,
    '<span data-hm-toggle="1" onClick={v.ld.lx.toggleMenu} title="More" style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: v.ld.lx.menuBg, display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }}>$1"1.8"$2"1.8"$3"1.8"',
    "⋮: 40×40 with no ring, its dots the prototype's 1.8, a tint only while its menu is open (Mine's)"],
  ['<div data-hm-menu="1" style={{ position: "absolute", top: "48px", right: "0", zIndex: "7",', '<div data-hm-menu="1" style={{ position: "absolute", top: "50px", right: "16px", zIndex: "7",',
    "the ⋮ menu 8px under its button and in line with it, as Mine's (the row is 2px 16px 12px now)"],
  // Under the row, in the header (as Mine's pinned message and cold-lead note): whose customer this is, the reply window's
  // note when it has closed, and the line a reassignment leaves (moved from its place after the list's sheets below).
  ['<p style={{ flex: "none", margin: "0", fontSize: "12px", color: "#806B60" }}>{v.ld.ld.ownerName}\'s customer{v.ld.ld.windowNote}</p>',
    '<p style={{ flex: "none", margin: "0 16px 12px", fontSize: "12px", color: "#806B60" }}>{v.ld.ld.ownerName}\'s customer{v.ld.ld.windowNote}</p>\n' +
    '            {!!(v.ld.lx.cold) && (<>\n' +
    '              <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px", margin: "0 16px 12px", padding: "10px 12px", borderRadius: "12px", background: "#E3EAF1", color: "#2E4760" }}>\n' +
    '                <span style={{ fontSize: "13px", fontWeight: "600" }}>Cold lead · {v.ld.lx.coldMsg}</span>\n' +
    "              </div>\n            </>)}\n" +
    '            {!!(v.ld.ld.movedTo) && (<>\n' +
    '              <div style={{ flex: "none", margin: "0 16px 12px", padding: "8px 12px", borderRadius: "12px", background: "#E4F1E8", color: "#2E6B4C", fontSize: "13px", fontWeight: "600" }}>{v.ld.ld.movedTo}</div>\n' +
    "            </>)}\n            </div>",
    "the header block ends after whose customer it is, the cold-lead note (Mine's) and the reassignment line"],
  [/\{!!\(v\.ld\.ld\.movedTo\) && \(<>\s*<div style=\{\{ flex: "none", padding: "8px 12px", borderRadius: "12px", background: "#E4F1E8", color: "#2E6B4C", fontSize: "13px", fontWeight: "600" \}\}>\{v\.ld\.ld\.movedTo\}<\/div>\s*<\/>\)\}\s*(?=<div data-chat-list="1")/, "",
    "the reassignment line rides in the header now"],
  // The message list: Mine's (absolute, full bleed, padded by the header and the composer as they stand — ChatComposer sets
  // --chat-top / --chat-foot — at the bottom while short, a tap closes the keyboard and any panel).
  [/<div data-chat-list="1" style=\{\{ flex: "1", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", gap: "10px", margin: "0 -20px", padding: "10px 20px", (backgroundColor: "#EFE7DE", backgroundImage: "[^"]*", backgroundSize: "240px 240px") \}\}>/,
    '<div data-chat-list="1" onClick={v.ld.lx.dismiss} style={{ position: "absolute", left: "0", right: "0", top: "0", bottom: "calc(0px - var(--safe-bottom, 0px))", overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", boxSizing: "border-box", padding: "calc(var(--chat-top, 55px) + 25px) 16px calc(var(--chat-foot, 64px) + 6px)", $1 }}><div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>',
    "the list is Mine's, full bleed under the header and the composer"],
  // The composer: the recording row, the reply row, the old bar (+, the reply box with its emoji button, camera, send) and
  // the emoji sheet are the composer's now. Exactly those blocks: anything else found there stops the generator.
  [/<\/Fragment>\)\)\}\n {12}<\/div>\n( {12}\{!!\(v\.ld\.lx\.pk\) && \(<PickEditor pk=\{v\.ld\.lx\.pk\} \/>\)\}\n)( {6}\{!!\(v\.ld\.lx\.rec\) && \(<div[\s\S]*?\{!!\(v\.ld\.lx\.emojiOpen\) && \(<div[\s\S]*?\n {6}<\/div>\)\}\n)/,
    (_all, pick, old) => {
      const blocks = [...old.matchAll(/\{!!\(([^)]*)\) && \(/g)].map(m => m[1]);
      const want = ["v.ld.lx.rec", "v.ld.lx.replying", "v.ld.lx.emojiOpen"];
      if (JSON.stringify(blocks) !== JSON.stringify(want)) throw new Error(`PanelApp: the composer's place holds ${JSON.stringify(blocks)}, not ${JSON.stringify(want)}`);
      if (!old.includes("onClick={v.ld.lx.attach}") || !old.includes("<input value={v.ld.lx.draft}")) throw new Error("PanelApp: the old reply bar moved");
      return `</Fragment>))}\n            </div></div>\n${pick}            <ChatComposer key={v.ld.lx.cmp.key} v={v.ld.lx.cmp} />\n`;
    },
    "the composer (sales/ChatComposer.tsx) takes the place of the recording row, the reply row, the bar and the emoji sheet"],
  ['<div style={{ position: "absolute", left: "20px", right: "20px", bottom: "96px", padding: "12px 14px",',
    '<div style={{ position: "absolute", left: "16px", right: "16px", bottom: "74px", zIndex: "6", padding: "12px 14px",',
    "the chat's toast where Mine's stands: 16px in, just above the bar, over the composer"],
];
