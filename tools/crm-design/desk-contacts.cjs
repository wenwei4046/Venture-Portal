/**
 * Contacts after v2 (the owner, 2026-10-15): "右邊的畫面有點空" → a side panel where the page has room — the picked
 * customer, else who still lacks property info (DeskContactSide); and the chart card "類似截圖，默認收起" — folded until
 * opened, a pie beside the rows (DeskPie). Where the page has no room (1440 and under) Contacts is exactly the design's.
 */
module.exports = [
  [/\{!!\(v\.kPeople\) && \(<>(\s*)<div style=\{\{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "1180px" \}\}>/,
    '{!!(v.kPeople) && (<>$1<div className={DX.ppWrap}><div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "1180px" }}>',
    "Contacts sits in a row with its side panel (shown only where the page is wide enough — desk-extras.module.css)."],
  [/<\/div>(\s*<\/>\)\}\s*\{!!\(v\.kAudit\))/,
    '</div><aside data-pp-side="1" className={DX.ppSide}><DeskContactSide v={v.ppSide} /></aside></div>$1',
    "The side panel closes the Contacts row."],
  [`onClick={d.open} title="Open chat and Customer info" style={{ display: "grid", gridTemplateColumns: v.ppGrid, gap: "14px", alignItems: "center", padding: "10px 20px", border: "0", borderTop: "1px solid #F5EEE8", background: "#fff",`,
    `onClick={d.open} title="Open chat and Customer info" style={{ display: "grid", gridTemplateColumns: v.ppGrid, gap: "14px", alignItems: "center", padding: "10px 20px", border: "0", borderTop: "1px solid #F5EEE8", background: d.rowBg,`,
    "The customer shown in the side panel is lit in the table."],
  [`<strong style={{ flex: "1", minWidth: "160px", fontSize: "15px", fontWeight: "650" }}>{v.ppChartTitle}</strong>`,
    `<strong onClick={v.ppChartToggle} style={{ flex: "1", minWidth: "160px", fontSize: "15px", fontWeight: "650", cursor: "pointer" }}>{!!(v.ppFoldable) && (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "8px", verticalAlign: "-1px", transform: v.ppChev, transition: "transform .18s" }}><path d="m6 9 6 6 6-6"></path></svg>)}{v.ppChartTitle}{!!(v.ppFoldable) && (<span style={{ marginLeft: "10px", fontSize: "12.5px", fontWeight: "500", color: "#806B60" }}>{v.ppChartSum}</span>)}{!!(v.ppFoldable) && (<span style={{ marginLeft: "12px", display: "inline-flex", alignItems: "center", gap: "5px", height: "26px", padding: "0 11px", borderRadius: "13px", border: "1px solid #E2CFC1", background: "#fff", fontSize: "12px", fontWeight: "650", color: "#BD4A19", verticalAlign: "1px" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12A9 9 0 1 1 12 3v9h9Z"></path><path d="M15 3.5A9 9 0 0 1 20.5 9H15V3.5Z"></path></svg>{v.ppChartBtn}</span>)}</strong>`,
    "The chart card's title folds and opens it, with what it says beside it (folded at first)."],
  [/(<div style=\{\{ display: "flex", gap: "2px", height: "10px", borderRadius: "5px", overflow: "hidden", background: "#F5EEE8" \}\}>\s*\{\(v\.ppStack\)[\s\S]*?\{\(v\.ppBars\)[\s\S]*?<\/Fragment>\)\)\}\s*<\/div>)/,
    '{!!(v.ppChartOpen) && (<div className={DX.ppChartBody}><DeskPie v={v.ppPie} /><div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "14px" }}>$1</div></div>)}',
    "Open, the chart is a pie beside the rows that filter."],
  [/(<div style=\{\{ display: "flex", alignItems: "center", gap: "10px" \}\}>\s*<strong style=\{\{ fontSize: "18px", fontWeight: "700" \}\}>\{v\.calTitle\}<\/strong>)/,
    "{!!(v.calAnOn) && (<DeskAnalysis v={v.calAn} />)}$1",
    "The Calendar's analysis card (customers and salespeople's visits) over its heading, folded until opened — the owner, 2026-10-15."],
  [/(<div style=\{\{ flex: "1", minHeight: "0", marginTop: "16px", display: "flex", flexDirection: "column", background: "#fff", borderRadius: "22px 22px 0 0" \}\}>[\s\S]*?>Save<\/span>\s*<\/div>\s*<\/div>)/,
    "{!(v.cfRealOn) && (<>$1</>)}{!!(v.cfRealOn) && (<DeskPhoneForm v={v.cfReal} scale={v.cfRealScale} />)}",
    "The Customer form's phone preview is the phone's own form (SalesCustomerForm) from the draft — the owner, 2026-10-15 (the design drew a sheet of its own)."],
];
