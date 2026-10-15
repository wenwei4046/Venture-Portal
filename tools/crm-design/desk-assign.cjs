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
];
