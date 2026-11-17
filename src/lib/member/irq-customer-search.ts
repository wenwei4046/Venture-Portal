/**
 * IR Quote's CRM customer search (step 1, and Send to CRM chat): what PostgREST's `or` filter is for what was typed.
 *
 * Nothing typed lists the CRM's latest customers, as a dropdown would (the user, 2026-11-17, on Send to CRM chat's
 * empty search: "除了搜寻，也连接 contact 下拉式"); one letter lists the names that START with it, A–Z ("打 M，可以看到
 * M 的客户"); two or more find the name anywhere in it, or the phone by its digits, as before (latest first).
 */
export function irqCustomerFilter(q: string): { or: string | null; limit: number; byName: boolean } {
  const term = String(q ?? "").trim();
  const like = term.replace(/[%_,()*]/g, " ").trim();
  if (!like) return { or: null, limit: 30, byName: false };
  if (term.length === 1) return /\d/.test(like) ? { or: `phone.ilike.%${like}%`, limit: 30, byName: false } : { or: `name.ilike.${like}%`, limit: 30, byName: true };
  const digits = term.replace(/\D/g, "").replace(/^(60|0)/, "");
  return { or: [`name.ilike.%${like}%`, ...(digits.length >= 3 ? [`phone.ilike.%${digits}%`] : [])].join(","), limit: 20, byName: false };
}
