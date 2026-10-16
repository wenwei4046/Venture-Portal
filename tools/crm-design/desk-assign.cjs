/**
 * Assignment › Ads to teams, after v2 (the owner, 2026-10-15: "ads performance 我想要也能收起的功能，同時如果它被打開，它的
 * 背景要有不一樣 … 當點 audit log，它會在 ads performance 右邊 … 我們整體的畫面一定要有層次感，或顏色的區分"):
 * Ad performance folds to a 44 px strip (DeskFoldRail) and, open, sits on the sand #FBF6F2 so it reads apart from the
 * white split; the Audit log always docks at its right (vm/assign-v2.ts › adLogStyle), folding Ad performance where the
 * page is narrow. The panels' slide-in is desk-motion.cjs.
 */
module.exports = [
  [/(<aside style=\{\{ position: "relative", flex: `0 1 \$\{v\.perfW\}px`[\s\S]*?<\/aside>)/,
    m => `{!(v.perfShut) && (<>${m.replace('minWidth: "220px", boxSizing: "border-box", background: "#fff",', 'minWidth: "220px", boxSizing: "border-box", background: "#FBF6F2",')}</>)}{!!(v.perfShut) && (<DeskFoldRail v={v.perfRail} />)}`,
    "Ad performance folds to a strip, and open sits on sand (the owner, 2026-10-15)."],
  ['<strong style={{ flex: "1", fontSize: "15px", fontWeight: "650" }}>Ad performance</strong>',
    '<button type="button" onClick={v.perfFold} title="Fold Ad performance" className={DX.emo} style={{ flex: "0 0 30px", width: "30px", height: "30px", margin: "0 6px 0 -8px", padding: "0", border: "0", borderRadius: "50%", background: "transparent", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m13 17 5-5-5-5M6 17l5-5-5-5"></path></svg></button><strong style={{ flex: "1", fontSize: "15px", fontWeight: "650" }}>Ad performance</strong>',
    "Ad performance's » folds it (the owner, 2026-10-15)."],
  // Customer form: the fields' table needs ~640 px and the preview 400 — below that the preview lay over the table's last
  // column (the owner's screenshot, 2026-10-16: "是我卡頓了嗎？"). The two now wrap: the preview drops under the form.
  ['<div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 400px", gap: "20px", alignItems: "start" }}>',
    '<div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>',
    "Customer form and its preview wrap instead of overlapping on a narrower window (the owner, 2026-10-16)."],
  ['<div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: "0" }}>\n                        {(v.cfSecs)',
    '<div style={{ flex: "1 1 640px", display: "flex", flexDirection: "column", gap: "16px", minWidth: "0" }}>\n                        {(v.cfSecs)',
    "The form's column takes the room first (the owner, 2026-10-16)."],
  ['<aside style={{ position: "sticky", top: "0", display: "flex", flexDirection: "column", gap: "12px", minWidth: "0" }}>',
    '<aside style={{ flex: "0 1 400px", position: "sticky", top: "0", display: "flex", flexDirection: "column", gap: "12px", minWidth: "300px" }}>',
    "The preview's column, 300–400 px (the owner, 2026-10-16)."],
  ['fontWeight: r.w, color: r.c, overflowWrap: "anywhere", textWrap: "pretty" }}>{r.v}</span>',
    'fontWeight: r.w, color: r.c, overflowWrap: "anywhere", textWrap: "pretty" }}><InfoValue v={r.v} href={r.href} /></span>',
    "Inbox's Customer info column links the ad too (the owner, 2026-10-16: 電腦版尚未有 ad link)."],
];
