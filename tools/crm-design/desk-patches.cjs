// Changes to the generated desktop CRM (gen-desk.cjs) that the design does not carry. Each is [from, to, why]; each
// must match exactly once in the generated markup, so a regenerated design that moved it fails loudly here.
// Every one is listed for the owner in docs/design/crm-desktop-rev1/BUILD-NOTES.md.
module.exports = [
  [`Not assigned yet · leads wait in Inbox unassigned</span>`, `Not assigned yet · dealt evenly across teams</span>`,
    "No Organic Leads (the owner, 2026-10-13): an ad nobody set is dealt evenly across the teams — no lead waits unassigned; an enquiry from no ad goes to the Revenue Director."],
  // ── v2's sidebar: Sign out signs out; CRM alerts counts the alerts (the design writes a sample 7).
  [/(<button type="button" onClick=)\{v\.closeMeMenu\}( style=\{\{[^\n]*?\}\} className=\{DH\.h\d+\}><svg[\s\S]*?<\/svg>Sign out<\/button>)/, "$1{v.signOutMe}$2",
    "The profile menu's Sign out signs out of the Revenue app (it only closed the menu in the prototype)."],
  [/(<span>CRM alerts<\/span>\s*<\/>\)\}\s*)<span style=\{\{([^\n]*?)\}\}>7<\/span>/, "$1{!!(v.alertsHas) && (<span style={{$2}}>{v.alertsN}</span>)}",
    "CRM alerts' badge is the number of alerts (rev 1 drew the design's sample 7 whatever there was); none, no badge."],
  // ── The Revenue app's own top bar: its real words and buttons (the prototype draws them as text) ──
  [`borderRadius: "14px", background: "#FFFFFF", fontFamily: "Inter, sans-serif", color: "#3F2B22", WebkitFontSmoothing: "antialiased", boxShadow: "0 1px 2px rgba(63,43,34,.08), 0 12px 40px rgba(63,43,34,.10)" }}`,
    `borderRadius: v.frameRadius, background: "#FFFFFF", fontFamily: "Inter, sans-serif", color: "#3F2B22", WebkitFontSmoothing: "antialiased", boxShadow: v.frameShadow }}`,
    "The prototype's frame is a picture on its canvas (rounded, shadowed); in the app it is the screen itself."],
  [`fontSize: "15px" }}>Good morning, <span`, `fontSize: "15px" }}>{v.greetWord}, <span`, "The greeting follows the time of day, as the Revenue app's does."],
  [`boxSizing: "border-box" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#BD4A19" }}>
          </span>Fair view<svg`,
    `boxSizing: "border-box", cursor: v.subCur }} onClick={v.openSubDept}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#BD4A19" }}>
          </span>{v.subLabel}<svg`,
    "The sub-department switcher: its real name, and it opens the Revenue app's switcher."],
  [`whiteSpace: "nowrap" }}>Sat 3 Oct 2026 · Q4 2026</span>`, `whiteSpace: "nowrap" }}>{v.dateLine}</span>`, "Today's date (the office's), not the prototype's."],
  // ── Controls the design draws but does not wire ──
  [/(\{\(v\.filters\)\.map\(\(f, f_i\) => \(<Fragment key=\{f_i\}>\s*<span) style=\{\{/, `$1 onClick={f.pick} style={{ cursor: "pointer", `,
    "Inbox's status chips filter the list (the design draws them; C1)."],
  [/(\{!!\(o\.off\) && \(<>\s*<span) style=\{\{ height: "28px", lineHeight: "28px", padding: "0 12px", borderRadius: "8px", color: "#806B60", fontSize: "13px", fontWeight: "550", whiteSpace: "nowrap" \}\}>\{o\.label\}/,
    `$1 onClick={o.pick} style={{ height: "28px", lineHeight: "28px", padding: "0 12px", borderRadius: "8px", color: "#806B60", fontSize: "13px", fontWeight: "550", whiteSpace: "nowrap", cursor: "pointer" }}>{o.label}`,
    "Insight's period switch switches (Today / This week / This month / Custom)."],
  [/(\{!!\(v\.showPeriodCompact\) && \(<>\s*<span) style=\{\{/, `$1 onClick={v.cyclePeriod} style={{ cursor: "pointer", `,
    "The compact period chip (Director, 1280) steps through the periods."],
  [`color: "#C9B8AC" }}>Free · 2 per slot</span>`, `color: "#C9B8AC" }}>{v.freeLabel}</span>`, "A free slot says the showroom's own booking limit."],
  [/(<button type="button" onClick=)\{v\.awMenuToggle\}( style=\{\{[^\n]*\n(?:[^\n]*\n){4}\s*<\/span>Customer info<\/button>)/, `$1{v.awInfo}$2`, "Awaiting reply's ⋮ Customer info opens Customer info."],
  [/(<button type="button" onClick=)\{v\.awMenuToggle\}( style=\{\{[^\n]*\n(?:[^\n]*\n){4}\s*<\/span>Appointment<\/button>)/, `$1{v.awBook}$2`, "Awaiting reply's ⋮ Appointment books / changes the visit."],
  [/(<span) (style=\{\{ display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid #EBDDD2", color: "#BD4A1[^\n]*?)\}\}>(\s*<svg[^\n]*\n\s*<path d="M12 20h9M16\.5 3\.5a2\.1 2\.1 0 0 1 3 3L7 19l-4 1 1-4Z">)/,
    `$1 onClick={v.editInfo} $2 }}>$3`, "Customer info's Edit edits the customer (the form the Principal / Director set)."],
  // ── Screens the design does not draw, in its style (desk/DeskExtras.tsx) ──
  ["{!!(v.kAlerts) && (<>", "{!!(v.kBook) && (<DeskBook v={v.book} />)}{!!(v.kNote) && (<DeskNote v={v.note} />)}{!!(v.kForm) && (<DeskCustomerForm v={v.cform} />)}{!!(v.kAlerts) && (<>",
    "Booking a visit, a note and editing a customer open in the pane (built in the design's style)."],
  ["{!!(v.isMwtOp) && (<>", "{!!(v.isHistOp) && (<DeskHistory v={v.history} />)}{!!(v.isMwtOp) && (<>", "Settings › History (the owner, 2026-10-13): who changed which setting, when."],
  // v2's chat, every message in its markup (desk-chat-v2.cjs). Awaiting reply's chat left the menu in v2 (unreachable; unpatched).
  ...require("./desk-chat-v2.cjs"),
  // Meta is not connected yet (PROPOSALS.md C, waiting for the owner): the line says so instead of the sample's
  // "Synced from Meta Ads · 9:00 am". The compact page's first, then the full page's (the only one left).
  [/(>Ads Performance<\/strong>\s*<span [^>]*><span style=\{\{ width: "7px", height: "7px", borderRadius: "50%", background: )"#3FA06B"( \}\}>\s*<\/span>)Synced from Meta Ads · 9:00 am/,
    "$1v.metaDot$2{v.metaSync}", "Ads Performance (compact) says whether Meta is connected."],
  [/(<span style=\{\{ width: "7px", height: "7px", borderRadius: "50%", background: )"#3FA06B"( \}\}>\s*<\/span>)Synced from Meta Ads · 9:00 am/,
    "$1v.metaDot$2{v.metaSync}", "Ads Performance says whether Meta is connected."],
  // (rev 1's Full time editor height fix is gone: v2's editor has no clipped boxes for the scroller to squeeze.)
  // Insight › Ads Performance: "+ Metrics · N" before View all picks the cards (the owner, 2026-10-13).
  ['<button type="button" onClick={v.goAdsPerf}', '<DeskCardPicker v={v} />\n                  <button type="button" onClick={v.goAdsPerf}', "Insight's ad cards are picked as Ads Performance's columns are."],
  // Ads Performance: drag a header's right edge to size its column (the owner, 2026-10-13) — resize-patches.cjs.
  ...require("./resize-patches.cjs"),
  // Insight › Ads Performance's table sorts and sizes as Ads Performance's (the owner, 2026-10-13) — insight-table-patches.cjs.
  ...require("./insight-table-patches.cjs"),
];

