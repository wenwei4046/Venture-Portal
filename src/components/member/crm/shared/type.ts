/**
 * The CRM's type is the Revenue app's (2026-10-14, the owner: "把 CRM 里面的字体大小改得跟 Revenue Apps 一样"): a size is the
 * prototype's own px times `--rv-type` — .92 on a phone, 1 on a desktop (the app's shell.module.css, which the CRM sits in) —
 * and no text goes under 10px because of it; a size drawn under 10px already stays as drawn (the app's type-scale.test.ts).
 * The generated screens get the same from tools/crm-design/type-scale.cjs; crm/type-scale.test.ts keeps the two in step.
 */
export const PHONE_TYPE = 0.92;

export function typePx(px: number): string {
  const scaled = `calc(${px}px * var(--rv-type, 1))`;
  return px * PHONE_TYPE >= 10 ? scaled : px >= 10 ? `max(10px, ${scaled})` : `${px}px`;
}
