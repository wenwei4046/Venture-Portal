/**
 * The customer form follows the Control panel's Forms (CRM Desktop rev 1, B5; the owner 2026-10-13: what the Principal
 * or the Director set reaches every RS / TL / TA, the phone's look unchanged). Patches for every copy of the designed
 * form — the salesperson's chat, Contacts, Calendar, Insight, the form alone, the Control panel's chat (`v.cf.`):
 *   - a built-in question the form left out is not asked (Property type, Unit size, Unit location, Requirement, Budget;
 *     Name and Phone are locked in the form, so always asked);
 *   - the form's own questions follow Budget, under their section's name, each in the design's own controls: the field
 *     (Text, Number, Phone, Date), the box (Long text) or the pills (Choice), its label in the design's caps.
 * Each patch must match exactly once in its file; the prefix (`v.` or `v.cf.`) is read from the form itself.
 */
const LABEL = '{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60", textTransform: "uppercase" }';
const FIELD = '{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none" }';
const BOX = '{ boxSizing: "border-box", padding: "12px 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none", resize: "none" }';
const PILL = '{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${fc.bd}`, background: fc.bg, color: fc.fg, display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "600", cursor: "pointer" }';
const HEAD = '<div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}><span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "#BD4A19" }}></span><span style={{ display: "flex", flexDirection: "column", gap: "1px" }}><strong style={{ fontSize: "16px", fontWeight: "700" }}>{fs.title}</strong></span></div>';

const extras = P =>
  `{(${P}cfExtra).map((fs, fs_i) => (<Fragment key={fs_i}>` +
  `{!!(fs.title) && (<>${HEAD}</>)}` +
  `{(fs.fields).map((fq, fq_i) => (<Fragment key={fq_i}>` +
  `<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>` +
  `<span style={${LABEL}}>{fq.label}{!!(fq.req) && (<> <b style={{ color: "#A3371A" }}>*</b></>)}</span>` +
  `{!!(fq.isInput) && (<input value={fq.value} onChange={fq.set} placeholder={fq.ph} type={fq.inputType} inputMode={fq.mode} style={${FIELD}} />)}` +
  `{!!(fq.isLong) && (<textarea value={fq.value} onChange={fq.set} placeholder={fq.ph} rows={2} style={${BOX}}></textarea>)}` +
  `{!!(fq.isChoice) && (<div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>{(fq.chips).map((fc, fc_i) => (<Fragment key={fc_i}><span onClick={fc.pick} style={${PILL}}>{fc.label}</span></Fragment>))}</div>)}` +
  `</div></Fragment>))}</Fragment>))}`;

// Back to the page before, on a paged form (2026-10-16 — the owner chose page by page: Back / Next, Save on the last).
const back = P => `{!!(${P}cfBack) && (<span onClick={${P}cfBack} style={{ flex: "none", alignSelf: "center", padding: "6px 18px", fontSize: "15px", fontWeight: "650", color: "#806B60", cursor: "pointer" }}>‹ Back</span>)}`;

const chips = (caps, k) => new RegExp(`(<div style=\\{\\{ display: "flex", flexDirection: "column", gap: "6px" \\}\\}>\\s*<span style=\\{\\{[^}]*\\}\\}>${caps}</span>[\\s\\S]*?\\{\\((v\\.(?:cf\\.)?)${k}\\)\\.map[\\s\\S]*?</Fragment>\\)\\)\\}\\s*</div>\\s*</div>)`);
const field = (caps, k) => new RegExp(`(<label style=\\{\\{ display: "flex", flexDirection: "column", gap: "6px" \\}\\}>\\s*<span style=\\{\\{[^}]*\\}\\}>${caps}</span>[\\s\\S]*?value=\\{(v\\.(?:cf\\.)?)${k}\\}[\\s\\S]*?</label>)`);
const shown = key => (_m, block, P) => `{!!(${P}cfHas.${key}) && (<>${block}</>)}`;

module.exports = () => [
  [chips("PROPERTY TYPE", "cfType"), shown("type")],
  [chips("UNIT SIZE", "cfSize"), shown("size")],
  [field("UNIT LOCATION", "cfLoc"), shown("loc")],
  [field("REQUIREMENT", "cfReq"), shown("req")],
  [field("BUDGET", "cfBudget"), shown("budget")],
  [/(<span onClick=\{(v\.(?:cf\.)?)cfSave\})/, (_m, save, P) => `${extras(P)}\n${back(P)}${save}`],
  // A paged form (2026-10-16) asks every question through cfExtra, in its saved order: the designed body stands aside.
  [/(\{(v\.(?:cf\.)?)cfStep\}<\/span>\s*<\/div>)([\s\S]*?)(\{\(\2cfExtra\)\.map)/, (_m, head, P, body, tail) => `${head}{!(${P}cfPaged) && (<>${body}</>)}${tail}`],
];
