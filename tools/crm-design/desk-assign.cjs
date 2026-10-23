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
    '<div style={{ flex: "1 1 640px", display: "flex", flexDirection: "column", gap: "16px", minWidth: "0" }}>\n                        {!!(v.cfPagesOn) && (<DeskFormPages v={v.cfPages} />)}{(v.cfSecs)',
    "The form's column takes the room first (the owner, 2026-10-16)."],
  ['<aside style={{ position: "sticky", top: "0", display: "flex", flexDirection: "column", gap: "12px", minWidth: "0" }}>',
    '<aside style={{ flex: "0 1 400px", position: "sticky", top: "0", display: "flex", flexDirection: "column", gap: "12px", minWidth: "300px" }}>',
    "The preview's column, 300–400 px (the owner, 2026-10-16)."],
  // The paged Customer form (the owner, 2026-10-16: "變成可以換 page，新增 page，並且每個都可以拖動"; page by page on the
  // phone, fields and sections both dragged — vm/formpage.ts): the page tabs above the sections (DeskFormPages); a
  // section moves by the grip left of its title and lights as something is dragged over it; a section somebody added
  // has its title to type and ×; a field moves by the grip before ↑ ↓, a line showing where it lands.
  ['<section id={sec.anchor} style={{ display: "flex", flexDirection: "column", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff" }}>',
    '<section id={sec.anchor} onDragOver={sec.dragOver} onDrop={sec.drop} style={{ display: "flex", flexDirection: "column", border: sec.bd ?? "1px solid #EBDDD2", borderRadius: "14px", background: "#fff", boxShadow: sec.ring, opacity: sec.op, transition: "box-shadow .15s, opacity .15s" }}>',
    "A section is a drop target and lights as something is dragged over it (2026-10-16)."],
  ['<div style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "16px 20px 12px" }}>',
    '<div style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "16px 20px 12px" }}>{!!(v.cfPagesOn) && (<span draggable={true} onDragStart={sec.grip} onDragEnd={v.cfDragEnd} title="Drag to move this section — onto a page tab to move it to that page" className={DX.grip} style={{ flex: "none", width: "18px", height: "22px", marginLeft: "-8px", display: "grid", placeItems: "center", color: "#B5A398", cursor: "grab" }}><svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor"><circle cx="3" cy="3" r="1.5"></circle><circle cx="9" cy="3" r="1.5"></circle><circle cx="3" cy="8" r="1.5"></circle><circle cx="9" cy="8" r="1.5"></circle><circle cx="3" cy="13" r="1.5"></circle><circle cx="9" cy="13" r="1.5"></circle></svg></span>)}',
    "A section's grip (2026-10-16)."],
  ['<strong style={{ fontSize: "15px", fontWeight: "650" }}>{sec.title}</strong>',
    '{!!(sec.custom) && (<input type="text" value={sec.title} onChange={sec.setTitle} placeholder="Section name" style={{ height: "30px", boxSizing: "border-box", padding: "0 10px", margin: "-4px 0 0 -10px", border: "1px solid #EBDDD2", borderRadius: "8px", background: "#fff", font: "inherit", fontSize: "15px", fontWeight: "650", color: "#3F2B22", outline: "none", maxWidth: "320px" }} />)}{!(sec.custom) && (<strong style={{ fontSize: "15px", fontWeight: "650" }}>{sec.title}</strong>)}',
    "A section somebody added has its name to type (2026-10-16)."],
  ['<span style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap" }}>{sec.count} fields</span>',
    '<span style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap" }}>{sec.count} fields</span>{!!(sec.removable) && (<button type="button" onClick={sec.remove} title="Delete this section and its questions" className={DX.emo} style={{ flex: "none", width: "26px", height: "26px", margin: "-4px -6px 0 0", padding: "0", border: "0", borderRadius: "50%", background: "transparent", color: "#A08E82", display: "grid", placeItems: "center", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg></button>)}',
    "A section somebody added can be deleted (2026-10-16)."],
  ['gridTemplateColumns: "48px minmax(120px, 1fr) 140px minmax(120px, 1.3fr) 108px 28px", gap: "12px", alignItems: "center", padding: "8px 20px", borderTop: f.bt }}>',
    'gridTemplateColumns: "66px minmax(120px, 1fr) 140px minmax(120px, 1.3fr) 108px 28px", gap: "12px", alignItems: "center", padding: "8px 20px", borderTop: f.bt, opacity: f.op }} data-cf-row="" onDragOver={f.dragOver} onDrop={f.drop}>',
    "A field row is a drop target (2026-10-16)."],
  ['gridTemplateColumns: "48px minmax(120px, 1fr) 140px minmax(120px, 1.3fr) 108px 28px", gap: "12px", padding: "8px 20px"',
    'gridTemplateColumns: "66px minmax(120px, 1fr) 140px minmax(120px, 1.3fr) 108px 28px", gap: "12px", padding: "8px 20px"',
    "The table's head keeps the rows' columns (2026-10-16)."],
  ['<span style={{ display: "flex", gap: "2px" }}>',
    '<span style={{ display: "flex", alignItems: "center", gap: "2px" }}>{!!(v.cfPagesOn) && (<span draggable={true} onDragStart={f.grip} onDragEnd={v.cfDragEnd} title="Drag to move — onto another section or a page tab" className={DX.grip} style={{ flex: "none", width: "16px", height: "28px", display: "grid", placeItems: "center", color: "#B5A398", cursor: "grab" }}><svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="2.5" cy="3" r="1.4"></circle><circle cx="7.5" cy="3" r="1.4"></circle><circle cx="2.5" cy="8" r="1.4"></circle><circle cx="7.5" cy="8" r="1.4"></circle><circle cx="2.5" cy="13" r="1.4"></circle><circle cx="7.5" cy="13" r="1.4"></circle></svg></span>)}',
    "A field's grip before ↑ ↓ (2026-10-16)."],
  // Inbox's Customer info folds to a 44 px strip and back, open at first (the owner, 2026-10-16) — as Ad performance.
  [/(<aside style=\{\{ position: "relative", flex: `0 0 \$\{v\.ibInfoW\}px`[\s\S]*?<\/aside>)/,
    m => `{!(v.ibInfoShut) && (<>${m}</>)}{!!(v.ibInfoShut) && (<DeskFoldRail v={v.ibInfoRail} />)}`,
    "Customer info folds to a strip (the owner, 2026-10-16)."],
  ['<strong style={{ flex: "1", minWidth: "0", fontSize: "15px", fontWeight: "650" }}>Customer info</strong>',
    '<button type="button" onClick={v.ibInfoFold} title="Fold Customer info" className={DX.emo} style={{ flex: "0 0 30px", width: "30px", height: "30px", margin: "0 0 0 -8px", padding: "0", border: "0", borderRadius: "50%", background: "transparent", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m13 17 5-5-5-5M6 17l5-5-5-5"></path></svg></button><strong style={{ flex: "1", minWidth: "0", fontSize: "15px", fontWeight: "650" }}>Customer info</strong>',
    "Customer info's » folds it (the owner, 2026-10-16)."],
  ['fontWeight: r.w, color: r.c, overflowWrap: "anywhere", textWrap: "pretty" }}>{r.v}</span>',
    'fontWeight: r.w, color: r.c, overflowWrap: "anywhere", textWrap: "pretty" }}><InfoValue v={r.v} href={r.href} /></span>',
    "Inbox's Customer info column links the ad too (the owner, 2026-10-16: 電腦版尚未有 ad link)."],
  // Active members (2026-10-22, the owner: a member not active for now is off Assignment's lists, their share to the others;
  // its own section after Ads to teams, saved at once through crm_set_locked; vm/settings.ts). Ads to teams says who is locked.
  ['{!!(v.isHistOp) && (<DeskHistory v={v.history} />)}', '{!!(v.isHistOp) && (<DeskHistory v={v.history} />)}{!!(v.isActOp) && (<DeskActive v={v.actVM} />)}{!!(v.addAd?.open) && (<DeskAddAd v={v.addAd} />)}{!!(v.isLbaOp) && (<DeskLeadsByAd v={v.leadsByAd} />)}',
    "Assignment › Active members: each person Active or Locked (crm_set_locked); Ads to teams' + picker (DeskAddAd, crm_add_ad)."],
  // A locked person stays in Ads to teams' list, grey with a lock instead of the box (the owner, 2026-10-22: "不要消失在
  // assignment list 里面，而是改成小锁头，灰色，不能 edit"; vm/assign.ts appends them with `locked`).
  ['<span style={{ fontSize: "13.5px", fontWeight: "600" }}>{m.name}</span>',
    '<span style={{ fontSize: "13.5px", fontWeight: "600", color: m.locked ? "var(--crm-faint)" : undefined }}>{m.name}</span>',
    "Ads to teams: a locked person's name greyed."],
  ['{!!(t.field) && (<>', '{!!(m.locked) && (<span aria-label="Locked" style={{ flex: "0 0 auto", width: "56px", height: "32px", display: "grid", placeItems: "center", color: "var(--crm-faint)" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></span>)}{!!(t.field && !m.locked) && (<>',
    "Ads to teams: a locked person has a lock, no box."],
  // A team's share is typed to the hundredth (2026-10-22, the owner: "帮我调整成可输入，并且能小数点 .00").
  ['<input type="text" inputMode="numeric" value={t.pctStr} onChange={t.onRange} style={{ width: "30px",', '<input type="text" inputMode="decimal" value={t.pctStr} onChange={t.onRange} style={{ width: "50px",',
    "Ads to teams: a team share to two decimals."],
  // Split folds to its strip, as Ad performance does (the owner, 2026-10-22: "圈起来的部分做可收缩式"; vm/assign-v2.ts › splitShut).
  [/(\{!!\(v\.adOpen\) && \(<>\s*)(<aside style=\{\{ flex: v\.splitFlex,[\s\S]*?)display: "flex"/,
    '$1{!!(v.splitShut) && (<DeskFoldRail v={v.splitRail} />)}$2display: v.splitShut ? "none" : "flex"', "Ads to teams: Split folds to its strip."],
  // A long team name takes two lines instead of pushing the share box (the owner, 2026-10-22: "名字太长的你就分 2 行").
  ['flex: "0 0 104px", display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", fontWeight: "650", whiteSpace: "nowrap" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: t.color }}>',
    'flex: "0 0 132px", minWidth: "0", display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", fontWeight: "650", lineHeight: "1.25", overflowWrap: "anywhere" }}><span style={{ flex: "none", width: "8px", height: "8px", borderRadius: "50%", background: t.color }}>',
    "Ads to teams: a team name wraps."],
  // Member work type: one list, team after team, scrolled down (the owner, 2026-10-22: "active member & member work type 做成往下滑的名单").
  [/<div style=\{\{ display: "grid", gridTemplateColumns: "repeat\(auto-fill, minmax\(340px, 1fr\)\)", gap: "14px", alignItems: "stretch" \}\}>(\s*\{\(v\.mwtTeams\)\.map)/,
    '<div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "760px" }}>$1', "Member work type: one vertical list."],
  // …and each team folds to its head (2026-10-23, the owner: "这些名单做可收缩及展开的功能"; vm/settings.ts › mwtTeams.shut / fold).
  [/(\{\(v\.mwtTeams\)\.map\(\(g, g_i\) => \(<Fragment key=\{g_i\}>\s*<div style=\{\{[^}]*\}\}>\s*)<div style=\{\{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", borderBottom: "[^"]*" \}\}>([\s\S]*?)<\/div>(\s*)\{\(g\.people\)\.map\(/,
    '$1<button type="button" onClick={g.fold} aria-expanded={!g.shut} style={{ width: "100%", display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", border: "0", borderBottom: g.shut ? "0" : "1px solid var(--crm-field)", background: "transparent", font: "inherit", textAlign: "left", cursor: "pointer" }}><span style={{ display: "flex", color: "var(--crm-ink-soft)", transform: g.shut ? "rotate(-90deg)" : "none", transition: "transform .16s" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span>$2</button>$3{!g.shut && (g.people).map(',
    "Member work type: a team folds to its head."],
];
