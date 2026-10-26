/**
 * Shares to the hundredth (2026-10-22, the owner, of the team split: "帮我调整成可输入，并且能小数点 .00"; phone and desktop).
 * `pctText` keeps what is being typed — digits and one point, two decimals at most — so "33." is not lost; `pctOf` reads
 * it; `pctShow` writes a share without trailing zeros; `is100` compares in hundredths (the database adds numerics exactly).
 */
export const r2 = (n: number) => Math.round(n * 100) / 100;
export function pctText(raw: string): string {
  const s = raw.replace(/[^\d.]/g, ""), i = s.indexOf(".");
  const t = i < 0 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "").slice(0, 2);
  return t.replace(/^0+(?=\d)/, "").slice(0, 6);
}
export const pctOf = (text: string) => Math.max(0, Math.min(100, r2(parseFloat(text) || 0)));
export const pctShow = (n: number) => String(r2(n));
export const is100 = (n: number) => Math.round(n * 100) === 10000;
