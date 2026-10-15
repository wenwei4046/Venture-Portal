/**
 * Contacts and the Calendar after v2 (the owner, 2026-10-15). Their charts and Contacts' customer panel live in a
 * right-hand rail like Inbox's Chat progress — 44 px with « while folded, folded at first ("做成这个的收起栏",
 * DeskRail, vm/rail.ts); the page's own chart card leaves the page on the live screen (the prototype harness keeps it
 * as the design draws it, ppRail false). And the Customer form's Phone preview is the phone's own form.
 */
module.exports = [
  [`onClick={d.open} title="Open chat and Customer info" style={{ display: "grid", gridTemplateColumns: v.ppGrid, gap: "14px", alignItems: "center", padding: "10px 20px", border: "0", borderTop: "1px solid #F5EEE8", background: "#fff",`,
    `onClick={d.open} title="Open chat and Customer info" style={{ display: "grid", gridTemplateColumns: v.ppGrid, gap: "14px", alignItems: "center", padding: "10px 20px", border: "0", borderTop: "1px solid #F5EEE8", background: d.rowBg,`,
    "The customer shown in the rail is lit in the table."],
  [/(<div style=\{\{ display: "flex", flexDirection: "column", gap: "14px", padding: "18px 20px", border: "1px solid #EBDDD2", borderRadius: "14px" \}\}>\s*<div style=\{\{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" \}\}>\s*<strong[^\n]*\{v\.ppChartTitle\}[\s\S]*?)(\s*\{!!\(v\.ppHas\) && \(<>)/,
    "{!(v.ppRail) && (<>$1</>)}$2",
    "Contacts' chart lives in the rail on the live screen (the owner: 收起栏)."],
  [/(\n {10}\{!!\(v\.ibCols\) && \(<>)/,
    "{!!(v.railOn) && (<DeskRail v={v.rail} />)}$1",
    "Contacts' and the Calendar's rail, at the page's right edge as Inbox's Chat progress."],
  [/(<div style=\{\{ flex: "1", minHeight: "0", marginTop: "16px", display: "flex", flexDirection: "column", background: "#fff", borderRadius: "22px 22px 0 0" \}\}>[\s\S]*?>Save<\/span>\s*<\/div>\s*<\/div>)/,
    "{!(v.cfRealOn) && (<>$1</>)}{!!(v.cfRealOn) && (<DeskPhoneForm v={v.cfReal} scale={v.cfRealScale} />)}",
    "The Customer form's phone preview is the phone's own form (SalesCustomerForm) from the draft — the owner, 2026-10-15 (the design drew a sheet of its own)."],
  [/(\n(\s*)\{!!\(v\.ppEmpty\) && \(<>)/,
    "\n$2{!!(v.ppPagerOn) && (<DeskPager v={v.ppPager} />)}$1",
    "Contacts shown 10 · 20 · 50 a page, the pager under the table (the owner, 2026-10-15)."],
  [`fontWeight: r.w, color: r.c, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.v}</span>`,
    `fontWeight: r.w, color: r.c, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><InfoValue v={r.v} href={r.href} /></span>`,
    "Customer info's Ad opens the ad (its video or picture) — the owner, 2026-10-15 (ad-link.cjs does the phone's)."],
  [/(\{!!\(v\.calMonth\) && \(<>\s*<div style=\{\{ )(background: "#fff", border: "1px solid #EBDDD2", borderRadius: "18px", overflow: "hidden" \}\}>)/,
    "$1flex: \"0 0 auto\", $2",
    "The month keeps its height so the page scrolls to its last week (it shrank to the page and cut off — the owner, 2026-10-15: 卡住了無法往下拉)."],
  [/(<div style=\{\{ flex: "0 0 auto", display: "grid", gridTemplateColumns: "repeat\(6, minmax\(0, 1fr\)\) minmax\(0, 1\.8fr\)"[\s\S]*?\{\(v\.calTeamBars\)[\s\S]*?<\/Fragment>\)\)\}\s*<\/span>\s*<\/div>)/,
    "{!(v.calRail) && (<>$1</>)}",
    "The Calendar's figures band moves into the rail on the live screen (the owner, 2026-10-15: 放到右邊（可收開式）)."],
];
