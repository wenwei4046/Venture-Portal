/**
 * Customer info's Ad opens the ad itself (the owner, 2026-10-15: "在 customer info 新增一個是廣告的鏈接…業務可以看到他們
 * 影片的內容進行相應的回復"): every Customer info row's value goes through InfoValue (shared/AdLink.tsx), which links
 * the row that carries an href (vm: infoRows' Ad) and shows every other as it was. Applied after a screen's own patches,
 * to every copy of the rows.
 */
const A = "color: r.vFg }}>{r.v}</strong>", B = "color: r.vFg }}><InfoValue v={r.v} href={r.href} /></strong>";
module.exports = body => body.split(A).join(B);
module.exports.IMPORT = (body, from) => (body.includes("<InfoValue") ? `import { InfoValue } from "${from}";\n` : "");
