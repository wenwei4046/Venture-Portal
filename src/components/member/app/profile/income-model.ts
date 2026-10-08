import type { MemberBand } from "@/lib/member/types";
import type { MemberBookOrder, MemberOrderBook } from "@/lib/member/order-book";
import { payLinesTotal, type IncomeBill, type IncomeMonth, type IncomeOverride, type MemberIncome } from "@/lib/member/income";
import { arenaMonthFridays } from "@/lib/member/arena";
import { brandLadder, rowFor } from "../insight/ladder";
import { brandName } from "../insight/insight-model";
import { monthName, monthShort, rm, rm2, shortDay } from "../format";
import type { CoRowVM, CoSheetVM, IncomeOrdersVM, IncomePastVM, IncomeRowVM, IncomeVM, Tone } from "./profile-vm";

/**
 * My income and Commission by order from the member's month (`lib/member/income`)
 * and their order book — the prototype's screens on the engine's own figures.
 */

const PAY_LINE: Record<string, string> = { special_claim: "Special claim", allowance: "Allowance", incentive: "Incentive", deduction: "Deduction" };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (rate: number) => `${(Math.round(rate * 1000) / 10).toFixed(1)}%`;
/** `Incentive Tier 1` for `incentive_tier_1` — a band key the way the scheme names it. */
const bandText = (key: string) => key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

/** A brand list the way the prototype writes it: "Akemi, Ergotex and Zanotti". */
function brandList(codes: readonly string[]): string {
  const names = codes.map(brandName);
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function heroOf(m: IncomeMonth): { label: string; note: string } {
  const month = monthName(m.period);
  if (m.state === "manual") return { label: "Claim form month · portal's working", note: `${month} was paid from the claim form, before the portal paid commission. This is the portal's own working of your bills; your payslip shows what you were paid.` };
  if (m.payrollStatus === "paid") return { label: "Paid income", note: `Paid${m.paidOn ? ` ${shortDay(m.paidOn.slice(0, 10))}` : ""}. Your official payslip shows the deductions.` };
  if (m.state === "closed") return { label: "Closed income · final", note: `Closed${m.closedAt ? ` ${shortDay(m.closedAt.slice(0, 10))}` : ""}. It goes to payroll as it stands. Check your official payslip for payment.` };
  if (m.state === "none") return { label: "Estimated income · not settled", note: m.notice ?? "Nothing to work out for this month yet." };
  return { label: "Estimated income · not settled", note: "Settles after month-end costing. Check your official payslip for payment." };
}

function incentiveSub(m: IncomeMonth): string {
  const pending = m.brands.filter(b => b.marginPct === null).map(b => b.code);
  if (m.incentive > 0 && m.bandKey) return `${brandList(m.brands.map(b => b.code))} at ${bandText(m.bandKey).replace(/^Incentive /, "")}`;
  if (pending.length) return `Held · ${brandList(pending)} ${pending.length === 1 ? "has" : "have"} a bill without cost`;
  return m.brands.length ? "No incentive tier reached yet" : "No sales yet";
}

/** My income: the month's breakdown, then the months payroll has already paid. */
/** `hasTeam`: somebody reports to the member here — the override row stands even at RM 0. */
export function incomeVM(data: MemberIncome, hidden: boolean, hasTeam = false): IncomeVM {
  const m = data.month;
  const money = (v: number) => (hidden ? "RM ••••" : rm2(v));
  const signed = (v: number) => (hidden ? "RM ••••" : v < 0 ? `−${rm2(-v)}` : rm2(v));
  const basic = m.basic ?? 0;
  const held = m.bills.filter(b => b.status === "deposit_pending");
  // A month paid outside the portal keeps no salary here unless payroll did.
  const rows: IncomeRowVM[] = [m.basic === null && m.state === "manual"
    ? { label: "Fixed salary", sub: "Paid outside the portal", amt: "—" }
    : { label: "Fixed salary", sub: m.basic === null ? "Not set" : basic === 0 ? "Commission only" : "Monthly base", amt: money(basic) }];
  rows.push({ label: "Personal sales commission", sub: `${rm(m.countedSales)} counted sales${held.length ? ` · ${plural(held.length, "order")} held` : ""}`, amt: money(m.personal) });
  if ((m.switches.override && hasTeam) || m.override !== 0 || m.overrides.length > 0) {
    const sellers = new Set(m.overrides.map(o => o.seller)).size;
    rows.push({ label: "Team override", sub: sellers ? `From ${plural(sellers, "person", "people")} in your team` : "From your team's sales", amt: money(m.override) });
  }
  if (m.switches.kpi || m.kpi !== 0) rows.push({ label: "KPI pay", sub: plural(m.kpiQty, "item"), amt: money(m.kpi) });
  if (m.switches.openBill || m.openBill !== 0) rows.push({ label: "Open Bill bonus", sub: plural(m.bills.filter(b => b.openBill > 0).length, "open bill"), amt: money(m.openBill) });
  if (m.switches.incentive || m.incentive !== 0) rows.push({ label: "Margin incentive", sub: incentiveSub(m), amt: money(m.incentive) });
  if (m.switches.group || m.group !== 0) rows.push({ label: "Group incentive", sub: "Your team's group reward", amt: money(m.group) });
  if (m.director !== 0) rows.push({ label: "Director pay", sub: "Fixed amount and incentive", amt: money(m.director) });
  for (const l of m.payLines) {
    const v = l.kind === "deduction" ? -Math.abs(l.amount) : l.amount;
    rows.push({ label: PAY_LINE[l.kind] ?? l.kind, sub: l.description || "Added by HR", amt: signed(v), neg: v < 0 });
  }
  const total = Math.round((basic + m.commission + payLinesTotal(m.payLines)) * 100) / 100;
  const hero = heroOf(m);
  const pending = m.brands.filter(b => b.marginPct === null).map(b => b.code);
  const past: IncomePastVM[] = data.past.filter(p => p.period !== m.period).map(p => ({
    period: p.period,
    month: `${monthName(p.period)} ${p.period.slice(0, 4)}`,
    paid: p.status === "paid" ? (p.paidOn ? `Paid ${shortDay(p.paidOn.slice(0, 10))}` : "Paid") : p.status === "submitted" ? "With Finance" : "Completed",
    amt: money(p.gross || p.basic + p.commission),
    status: p.status === "paid" ? "Paid" : p.status === "submitted" ? "With Finance" : "Completed",
    settled: p.status === "paid",
  }));
  return {
    period: m.period,
    periodLabel: monthShort(m.period),
    heroLabel: hero.label,
    amount: hidden ? "RM ••••••" : rm2(total),
    heroNote: hero.note,
    rows,
    total: hidden ? "RM ••••••" : rm2(total),
    held: held.length
      ? { strong: `${plural(held.length, "order")} ${held.length === 1 ? "is" : "are"} waiting for a deposit.`, rest: "Their commission is added in the month the deposit clears." }
      : m.switches.incentive && pending.length
        ? { strong: `${brandList(pending)} ${pending.length === 1 ? "has" : "have"} a bill without cost.`, rest: "The margin incentive waits until every bill is costed." }
        : null,
    past,
    hasOrders: m.bills.length > 0 || m.overrides.length > 0,
    notice: m.state === "none" ? m.notice : null,
  };
}

/** "Week 2" — which of its month's fair weekends a bill was written in. */
function weekOf(order: MemberBookOrder | undefined): string | null {
  if (!order?.week) return null;
  const i = arenaMonthFridays(order.week.slice(0, 7)).indexOf(order.week);
  return i >= 0 ? `Week ${i + 1}` : null;
}

function toneOf(bill: IncomeBill, order: MemberBookOrder | undefined, bands: readonly MemberBand[]): Tone {
  const margin = bill.marginPct ?? order?.margin ?? null;
  const brand = order?.brand ?? bill.brand ?? "";
  return rowFor(margin, brandLadder(bands.filter(b => b.brand === brand)))?.tone ?? "neutral";
}

/** Commission by order: the member's bills, then the override from their team. */
export function incomeOrdersVM(data: MemberIncome, book: MemberOrderBook | null, bands: readonly MemberBand[], hidden: boolean): IncomeOrdersVM {
  const m = data.month;
  const money = (v: number) => (hidden ? "RM ••" : rm2(v));
  const orders = new Map((book?.orders ?? []).map(o => [o.id, o]));
  const sheets: Record<string, CoSheetVM> = {};
  // KPI off for the scheme and nothing paid: a bill's KPI cell says so instead of RM 0.00.
  const kpiCounted = m.switches.kpi || m.bills.some(b => b.kpi !== 0);
  const bills = m.bills.filter(b => b.status !== "excluded" && b.status !== "already_released")
    .sort((a, b) => Number(a.status === "deposit_pending") - Number(b.status === "deposit_pending") || a.no.localeCompare(b.no));

  const mine: CoRowVM[] = bills.map(b => {
    const o = orders.get(b.orderId);
    const waiting = b.status === "deposit_pending";
    const id = `m:${b.orderId}`;
    const brand = brandName(o?.brand ?? b.brand ?? "UNCLASSIFIED");
    const kpiQtyTotal = (o?.lines ?? []).reduce((a, l) => a + l.kpiQty, 0);
    const goods = (o?.lines ?? []).filter(l => l.goods);
    const goodsTotal = goods.reduce((a, l) => a + l.amount, 0);
    const commission = Math.round((b.personal + b.openBill) * 100) / 100;
    const margin = b.marginPct ?? o?.margin ?? null;
    sheets[id] = {
      no: b.no,
      meta: [o?.customer, weekOf(o), o?.venue].filter(Boolean).join(" · ") || brand,
      tag: waiting ? "Waiting for deposit" : margin === null ? "Cost pending" : `${margin.toFixed(1)}% margin`,
      tone: waiting || margin === null ? "warn" : toneOf(b, o, bands),
      amt: rm(o?.total ?? b.orderTotal ?? b.commissionable),
      commLabel: "Commission",
      comm: waiting ? "Waiting" : money(commission),
      kpiPay: kpiCounted ? money(b.kpi) : "—",
      kpiSub: kpiCounted ? plural(b.kpiQty, "item") : "Not counted",
      kpiPaid: true,
      lines: (o?.lines ?? []).map(l => ({
        name: l.name, qty: String(l.qty), amt: l.amount ? rm(l.amount) : "Free",
        pay: waiting ? "Waiting" : l.goods && goodsTotal > 0 ? money(Math.round((l.amount / goodsTotal) * commission * 100) / 100) : "—",
        kpiPay: l.kpiQty > 0 && kpiQtyTotal > 0 && b.kpi > 0 ? money(Math.round((l.kpiQty / kpiQtyTotal) * b.kpi * 100) / 100) : "—",
        kpi: l.kpiQty > 0 && b.kpi > 0,
      })),
      total: money(waiting ? 0 : b.pay),
      note: waiting ? "Its commission is added in the month the deposit clears."
        : `${b.sharePct !== null ? `Your ${Math.round(b.sharePct * 100)}% of a shared bill. ` : ""}Commission is shared across lines by line amount.${b.kpi > 0 ? " Each KPI item pays as listed." : ""}`,
    };
    return {
      id, no: b.no, meta: [o?.customer, weekOf(o), brand].filter(Boolean).join(" · "),
      pay: waiting ? "Waiting" : money(b.pay), held: waiting,
      sub: waiting ? "Deposit due" : b.kpi > 0 ? `incl. KPI ${money(b.kpi)}` : `of ${rm(b.commissionable)}`,
    };
  });

  const ov: CoRowVM[] = m.overrides.map((x: IncomeOverride, i) => {
    const id = `o:${x.orderId || i}`;
    const brand = x.brand ? brandName(x.brand) : null;
    sheets[id] = {
      no: x.no, meta: [x.seller, brand].filter(Boolean).join(" · "), tag: "Override", tone: "good",
      amt: rm(x.orderTotal ?? x.basis), commLabel: "Override", comm: money(x.amount), kpiPay: "—", kpiSub: "Paid to seller", kpiPaid: true,
      lines: [{ name: "Order total", qty: "1", amt: rm(x.orderTotal ?? x.basis), pay: money(x.amount), kpiPay: "—", kpi: false }],
      total: money(x.amount),
      note: `You earn ${pct(x.rate)} override on deposit-cleared orders from your team. KPI pay goes to the seller.`,
    };
    return { id, no: x.no, meta: [x.seller, brand].filter(Boolean).join(" · "), pay: money(x.amount), held: false, sub: `of ${rm(x.basis)}` };
  });

  const counted = bills.filter(b => b.status !== "deposit_pending");
  const held = bills.length - counted.length;
  const commission = counted.reduce((a, b) => a + b.personal + b.openBill, 0);
  const kpi = counted.reduce((a, b) => a + b.kpi, 0);
  const rates = [...new Set(m.overrides.map(o => o.rate))];
  const kpiOn = m.switches.kpi || kpi > 0;
  return {
    periodLabel: monthShort(m.period),
    mine: {
      tab: `My orders · ${bills.length}`,
      label: kpiOn ? "Commission + KPI pay" : "Commission",
      total: money(commission + kpi),
      base: `${money(commission)} commission`,
      rate: [kpiOn ? `${money(kpi)} KPI` : `${plural(counted.length, "bill")} counted`, held ? `${plural(held, "order")} held` : ""].filter(Boolean).join(" · "),
      rows: mine,
      note: kpiOn ? "Tap an order to see each product line, its commission and its KPI pay." : "Tap an order to see each product line and its commission.",
    },
    override: {
      tab: `Override · ${ov.length}`,
      label: "Team override",
      total: money(m.override),
      base: `${plural(ov.length, "order")} · ${rm(m.overrides.reduce((a, o) => a + o.basis, 0))}`,
      rate: rates.length === 1 ? `${pct(rates[0])} of your team's sales` : "of your team's sales",
      rows: ov,
      note: "Override is paid on deposit-cleared orders from your team, in the same commission month.",
    },
    sheets,
  };
}
