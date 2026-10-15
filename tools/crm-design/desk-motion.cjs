/**
 * The right-hand panels slide in rather than appear (the owner, 2026-10-15: "點右邊功能鍵的時候要有一點 motion，不要好像
 * 直接跳出來的感覺"): every side sheet, Ad performance and the Audit log carry DX.slideIn (desk-extras.module.css). Applied
 * after the patches to every copy of each panel's opening tag, so it reaches the sheets the design draws alike.
 */
const SHEETS = [
  'aside style={{ flex: `0 0 ${v.menuW}px`, width: `${v.menuW}px`,',
  'aside style={{ flex: v.splitFlex, width: `${v.sheetW}px`,',
  'aside style={{ flex: `0 0 ${v.sheetW}px`, width: `${v.sheetW}px`,',
  "aside style={v.adLogStyle}",
];
module.exports = body => {
  for (const a of SHEETS) {
    if (!body.includes(`<${a}`)) throw new Error(`desk-motion: no ${a}`);
    body = body.split(`<${a}`).join(`<aside className={DX.slideIn} ${a.slice("aside ".length)}`);
  }
  return body;
};
