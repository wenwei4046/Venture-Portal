// The CRM's type is the Revenue app's (2026-10-14, the owner: "把 CRM 里面的字体大小改得跟 Revenue Apps 一样"): every px font
// size the generated phone screens write is the prototype's own times --rv-type — .92 on a phone, 1 on a desktop (the
// Revenue app's shell.module.css, which the CRM sits in) — floored at 10px; a size drawn under 10px stays as drawn. The same
// rule as src/components/member/crm/shared/type.ts › typePx (hand-written parts); crm/type-scale.test.ts checks both.
//   scaleType(code): the generated JSX with each fontSize: "Npx" so written.
const PHONE_TYPE = 0.92;
function typePx(n) {
  const px = Number(n), scaled = `calc(${n}px * var(--rv-type, 1))`;
  return px * PHONE_TYPE >= 10 ? scaled : px >= 10 ? `max(10px, ${scaled})` : `${n}px`;
}
module.exports = function scaleType(code) {
  return code.replace(/fontSize: "(\d*\.?\d+)px"/g, (_, n) => `fontSize: "${typePx(n)}"`);
};
module.exports.typePx = typePx;
