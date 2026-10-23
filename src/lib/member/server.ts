import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMemberUser } from "@/lib/auth";
import { isPrincipalAccount } from "@/lib/view-as";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { dropStaged, formFile } from "@/lib/storage/staged";
import { parseStagedRef } from "@/lib/storage/staging";
import { calculateQuote, cents, customerQuote } from "./calculator";
import { quoteCostRules, quoteKpiItems } from "./quote-rules";
import { isCompatibleGift, productImageUrl, quoteLineKey } from "./catalog";
import { catalogueModelsOf, pricedCatalogueOf } from "./priced-catalogue";
import { principalReadContext } from "./read-access";
import { readInsightRange, readOrderBook, type MemberInsightRange, type MemberOrderBook } from "./order-book";
import { closedIncome, liveIncome, type DepartmentIncome, type IncomeMonth, type IncomePast, type IncomePayLine, type MemberIncome, type OverrideFacts } from "./income";
import { memberPay, salaryFromRow, salaryFromSchedule, taxModeOf, type PayrollRowFacts, type PaySalary } from "./income-pay";
import { parseCloseSummary } from "@/lib/commission/closes";
import { buildCommissionWorkbench, workbenchStaffIds } from "@/lib/commission/workbench";
import type { StatementDto } from "@/lib/commission/run-payload";
import { fetchByKeys } from "@/lib/paginate";
import { startRead } from "@/lib/start-read";
import { loadCommissionInput } from "@/app/(portal)/revenue/_lib/commission-input";
import { previewWageWindow, scheduleStatutory, statutoryLookup } from "@/app/(portal)/revenue/_lib/pay-preview-before-run";
import { monthFinishes, type HonourBoard } from "./honours";
import { formFromRow, type WaitingForm } from "@/lib/commission/waiting-form";
import { SIGNED_FORM_KINDS, WORD_DOC, WORD_DOCX, WORD_MACROS_REFUSAL, letterKind } from "@/lib/commission/waiting-add";
import { waitingAnswersFrom, type WaitingAnswer } from "./waiting-answers";
import { ANY_TIME, isAnyTime } from "./waiting-start";
import { queuesFrom, type WaitingQueue } from "./waiting-queue";
import { SEND_REFUSED, appClosed, requestPageOf } from "./app-pages";
import { readFoodWeeks, type FoodWeekPick } from "./claim-rules";
import { signatureProblem } from "@/lib/memos/signature";
import type { MemberArenaSnapshot } from "./arena";
import type { ArenaHistorySnapshot } from "./arena-history";
import type {
  BedframeBuild,
  MemberBand,
  MemberCatalogue,
  MemberData,
  MemberInsight,
  MemberMemo,
  MemberOrgMap,
  MemberProduct,
  MemberRequest,
  MemberReadContext,
  QuoteInput,
  QuoteResult,
} from "./types";

export type MemberOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
export interface MemoReceipt {
  id: string;
  readAt: string;
  acknowledgedAt: string | null;
  version: number;
}
export interface AdminMemberCommand {
  action: string;
  requestId?: string;
  subDepartmentId?: string;
  note?: string;
  [key: string]: unknown;
}
export type AdminMemberInput = AdminMemberCommand;
export interface AdminMemberData {
  canManageRequests: boolean;
  canPublishMemos: boolean;
  canConfigureProducts: boolean;
  requests: MemberRequest[];
  departments: {
    id: string;
    name: string;
    capacity: number | null;
    occupied: number;
    reserved: number;
  }[];
  memos: MemberMemo[];
  products: MemberProduct[];
  candidates: {
    id: string;
    name: string;
    departmentId: string;
    titleId: string | null;
  }[];
  titles: {
    id: string;
    name: string;
    departmentId: string | null;
    subDepartmentIds: string[];
  }[];
  uplines: {
    id: string;
    name: string;
    subDepartmentId: string;
    titleId: string | null;
  }[];
  events: {
    request_id: string;
    actor_id: string | null;
    from_status: string | null;
    to_status: string;
    note: string | null;
    created_at: string;
  }[];
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// 100 MB since 2026-10-23 (3 MB until then): the file goes ahead of the request (lib/storage/stage.ts), and
// member_request_attachments keeps up to that much (mig 20261024006800).
const MAX_INVOICE = 100 * 1024 * 1024;
const uuid = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !UUID.test(value))
    throw new Error(`Invalid ${label}. Refresh and try again.`);
  return value;
};
const field = (form: FormData, name: string, max = 300): string => {
  const value = form.get(name);
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > max) throw new Error(`${name} is too long.`);
  return text;
};
const date = (value: string, label: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error(`Enter the ${label}.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new Error(`Invalid ${label}.`);
  return value;
};
function message(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : "The action could not be completed. Please try again.";
  if (
    /service.role|SUPABASE_|API key|JWT|schema cache|does not exist|could not find the function|permission denied for (table|schema)/i.test(
      raw,
    )
  ) {
    return "Member services are not fully configured. Please contact your administrator to complete the setup.";
  }
  if (/duplicate key|unique constraint/i.test(raw))
    return "A matching active request already exists. Follow its progress in My requests instead of submitting it again.";
  return raw.slice(0, 400);
}
async function session(
  permission?: string,
  allowPrincipal = false,
): Promise<SupabaseClient> {
  const user = await getMemberUser();
  if (!user?.is_active) throw new Error("Sign in with an active work account.");
  if (
    permission &&
    !user.permissions.includes(permission) &&
    !(allowPrincipal && isPrincipalAccount(user))
  )
    throw new Error(
      "This account does not have access to this member feature.",
    );
  return (await createClient()) as unknown as SupabaseClient;
}
async function rpc<T>(
  client: SupabaseClient,
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
async function outcome<T>(work: () => Promise<T>): Promise<MemberOutcome<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

// Translate generated legacy labels, while retaining names and authored memo content.
const legacyLabels: Record<string, string> = {
  "Title 待配置": "Title not configured",
  "Rank 待配置": "Rank not configured",
  个人销售: "Personal sales",
  团队销售: "Team sales",
  "KPI 商品": "KPI products",
  件: "units",
  未分类: "Uncategorised",
};
const legacyLabel = (value: string): string => legacyLabels[value] ?? value;

function publicProduct(
  p: MemberProduct & {
    image_url?: unknown;
    metadata?: { imageUrl?: unknown; image_url?: unknown };
  },
): MemberProduct {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    brand: p.brand ?? null,
    category: p.category,
    size: p.size,
    color: p.color,
    available: p.available,
    gift: p.gift,
    // The grid's choices only — never a cost.
    options: Array.isArray(p.options)
      ? p.options.flatMap((option) =>
          option &&
          typeof option === "object" &&
          typeof option.height === "string" &&
          typeof option.tier === "string"
            ? [{ height: option.height, tier: option.tier }]
            : [],
        )
      : undefined,
    // Which build a line takes and whose dropdowns it reads — not money.
    modelId: typeof p.modelId === "string" ? p.modelId : null,
    kind: typeof p.kind === "string" ? p.kind : null,
    baseModel: typeof p.baseModel === "string" ? p.baseModel : null,
    moduleCode: typeof p.moduleCode === "string" ? p.moduleCode : null,
    imageUrl: productImageUrl(
      p.imageUrl ??
        p.image_url ??
        p.metadata?.imageUrl ??
        p.metadata?.image_url,
    ),
    version: p.version,
  };
}

function requestLabels(request: MemberRequest): MemberRequest {
  return {
    ...request,
    title: request.title
      .replace(/ · 住宿报销$/, " · Accommodation claim")
      .replace(/^释放席位 · Replacement$/, "Release position · Replacement"),
  };
}

/**
 * No demo fallback and no privileged row query: the database resolves the caller.
 *
 * `lite` (2026-10-08) is the Revenue app's first screen: the snapshot without
 * the Quote's catalogue and the recent orders (`p_full => false`, mig
 * 20261008160000) — 5 ms and 13 KB instead of 610 ms and 480 KB for the
 * Principal, which every open of the app used to wait for. The catalogue is
 * read on its own when the Quote needs it (`loadMemberCatalogue`).
 */
export async function loadMemberData(options: { lite?: boolean } = {}): Promise<MemberData> {
  const user = await getMemberUser();
  const principalView = !!user && isPrincipalAccount(user);
  const empty: MemberData = {
    demo: false,
    principalView,
    configured: false,
    refreshedAt: new Date().toISOString(),
    profile: {
      id: "",
      userId: user?.id ?? "",
      name: user?.name ?? "Team member",
      email: user?.email ?? "",
      salary: null,
    },
    memberships: [],
    departments: [],
    products: [],
    bands: [],
    incomes: [],
    orders: [],
    requests: [],
    memos: [],
  };
  try {
    const client = await session("member_portal", principalView);
    const data = await rpc<MemberData>(
      client,
      principalView ? "member_principal_snapshot" : "member_data_snapshot",
      options.lite ? { p_full: false } : undefined,
    );
    if (!data || !Array.isArray(data.memberships) || !data.profile?.id)
      throw new Error("Member information is temporarily unavailable.");
    // Defense in depth: explicitly project catalogue fields even if a future
    // database migration accidentally adds private columns to its JSON.
    return {
      ...data,
      demo: false,
      principalView,
      memberships: data.memberships.map((membership) => ({
        ...membership,
        title: legacyLabel(membership.title),
        rank: legacyLabel(membership.rank),
        people: membership.people.map((person) => ({
          ...person,
          title: legacyLabel(person.title),
          rank: legacyLabel(person.rank),
        })),
      })),
      incomes: (data.incomes ?? []).map((income) => ({
        ...income,
        rank: legacyLabel(income.rank),
        kpis: income.kpis.map((kpi) => ({
          ...kpi,
          label: legacyLabel(kpi.label),
          unit: legacyLabel(kpi.unit),
        })),
      })),
      orders: (data.orders ?? []).map((order) => ({
        ...order,
        brand: legacyLabel(order.brand),
      })),
      requests: (data.requests ?? []).map(requestLabels),
      products: (data.products ?? []).map(publicProduct),
      catalogueModels: catalogueModelsOf(data.catalogueModels),
    };
  } catch (error) {
    return { ...empty, message: message(error) };
  }
}

/**
 * The Quote's catalogue (2026-10-08): the full snapshot's products and model
 * options, through the same projection as before — read when the Quote opens
 * (the phone shows the one it kept meanwhile), not with every open of the app.
 */
export async function loadMemberCatalogue(): Promise<MemberOutcome<MemberCatalogue>> {
  return outcome(async () => {
    const data = await loadMemberData();
    if (!data.configured) throw new Error(data.message ?? "The catalogue is temporarily unavailable.");
    return { products: data.products, catalogueModels: data.catalogueModels ?? [] };
  });
}

/**
 * Insight — live performance, fetched on demand rather than folded into the
 * member snapshot. The board spans a whole department, so making Today pay
 * for it on every load would slow the page most people open most often.
 */
export async function loadMemberInsight(
  period?: string,
  context?: MemberReadContext,
): Promise<MemberOutcome<MemberInsight>> {
  return outcome(async () => {
    const user = await getMemberUser();
    if (!user?.is_active) throw new Error("Sign in with an active work account.");
    const principal = principalReadContext(user, context);
    const client = await session("member_insight", principal);
    const data = await rpc<MemberInsight>(client, principal ? "member_principal_insight_snapshot" : "member_insight_snapshot", {
      p_period: /^\d{4}-\d{2}$/.test(period ?? "") ? period : null,
      ...(principal ? { p_staff: context!.staffId, p_sub_department: context!.subDepartmentId } : {}),
    });
    if (!data || !Array.isArray(data.blocks))
      throw new Error("Performance information is temporarily unavailable.");
    return {
      ...data,
      blocks: data.blocks.map((block) => ({
        ...block,
        title: legacyLabel(block.title),
        rank: legacyLabel(block.rank),
        boards: (block.boards ?? []).map((board) => ({
          ...board,
          rows: (board.rows ?? []).map((row) => ({
            ...row,
            title: legacyLabel(row.title),
          })),
        })),
        downline: (block.downline ?? []).map((row) => ({
          ...row,
          title: legacyLabel(row.title),
        })),
        orders: (block.orders ?? []).map((order) => ({
          ...order,
          brand: legacyLabel(order.brand),
        })),
      })),
    };
  });
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Insight's month, quarter or year: 'YYYY-MM' to 'YYYY-MM', checked here and again by the RPC. */
function insightWindow(subDepartmentId: string, from: string, until: string, context?: MemberReadContext) {
  uuid(subDepartmentId, "department");
  if (!MONTH.test(from) || !MONTH.test(until) || until < from)
    throw new Error("Choose a month, a quarter or a year.");
  if (context && context.subDepartmentId !== subDepartmentId)
    throw new Error("Choose a valid member and department.");
}

/**
 * One member's bills, line by line, over a month, a quarter or a year — what
 * Insight's bills, KPI and brand pages are built from. No cost: a bill carries
 * its layer-2 margin percentage only.
 */
export async function loadMemberOrderBook(
  subDepartmentId: string,
  from: string,
  until: string,
  context?: MemberReadContext,
): Promise<MemberOutcome<MemberOrderBook>> {
  return outcome(async () => {
    const user = await getMemberUser();
    if (!user?.is_active) throw new Error("Sign in with an active work account.");
    const principal = principalReadContext(user, context);
    insightWindow(subDepartmentId, from, until, context);
    const client = await session("member_insight", principal);
    const data = await rpc<unknown>(client, principal ? "member_principal_order_book" : "member_order_book", {
      p_sub_department: subDepartmentId, p_from: from, p_until: until,
      ...(principal ? { p_staff: context!.staffId } : {}),
    });
    const book = readOrderBook(data);
    if (!book) throw new Error("Your bills are temporarily unavailable.");
    return { ...book, orders: book.orders.map((order) => ({ ...order, brand: legacyLabel(order.brand) })) };
  });
}

/** Insight › Quarter / Year: the member and their team, `me` and `downline` over the range. */
export async function loadMemberInsightRange(
  subDepartmentId: string,
  from: string,
  until: string,
  context?: MemberReadContext,
): Promise<MemberOutcome<MemberInsightRange>> {
  return outcome(async () => {
    const user = await getMemberUser();
    if (!user?.is_active) throw new Error("Sign in with an active work account.");
    const principal = principalReadContext(user, context);
    insightWindow(subDepartmentId, from, until, context);
    const client = await session("member_insight", principal);
    const data = await rpc<unknown>(client, principal ? "member_principal_insight_range" : "member_insight_range", {
      p_sub_department: subDepartmentId, p_from: from, p_until: until,
      ...(principal ? { p_staff: context!.staffId } : {}),
    });
    const range = readInsightRange(data);
    if (!range) throw new Error("Performance information is temporarily unavailable.");
    return { ...range, downline: range.downline.map((row) => ({ ...row, title: legacyLabel(row.title) })) };
  });
}

/**
 * My income (2026-10-05, user: 跟着 up to date … close 的时候就是 fix): the
 * member's month worked out by Comm Cal's own engine — `loadCommissionInput`
 * and the workbench — until HR closes them, then the close's figures. A month
 * before the portal paid was paid from the claim form, outside the portal: it
 * shows the portal's own working of it, as Comm Cal's month page does, and
 * says so (user: 显示 VP 自己算的). The engine needs the whole
 * sub-department's bills and costs, which only the service role may read, so
 * the member's session is authorised FIRST (their own membership, or a
 * Principal's view of one) and only that person's own money and bills leave
 * this module — never a cost.
 */
export async function loadMemberIncome(
  subDepartmentId: string,
  period: string,
  context?: MemberReadContext,
): Promise<MemberOutcome<MemberIncome>> {
  return outcome(async () => {
    const user = await getMemberUser();
    if (!user?.is_active) throw new Error("Sign in with an active work account.");
    insightWindow(subDepartmentId, period, period, context);
    const principal = principalReadContext(user, context);
    const client = await session("member_insight", principal);
    // The member's own session says whose month it is — before anything is read for it.
    const staffId = await rpc<string>(client, "member_income_context", {
      p_sub_department: subDepartmentId, p_staff: principal ? context!.staffId : null,
    });
    if (typeof staffId !== "string" || !staffId) throw new Error("This department is not available to your account.");
    const admin = adminClient() as unknown as SupabaseClient;
    const first = `${period}-01`;
    // Payroll pays the month's commission from every sub-department at once, the fixed salary out of all of it:
    // started now, beside this sub-department's own engine.
    const elsewhere = startRead(commissionElsewhere(admin, staffId, subDepartmentId, first));
    const [cutover, closes, payroll, lines, staff, runs] = await Promise.all([
      admin.from("comm_cutovers").select("first_paid_month").eq("sub_department_id", subDepartmentId).maybeSingle(),
      admin.from("comm_salesperson_closes").select("closed_at, summary, statement, deferred_orders")
        .eq("sub_department_id", subDepartmentId).eq("period_month", first).eq("staff_id", staffId).is("reopened_at", null).maybeSingle(),
      admin.from("hr_monthly_payroll").select("period_month, status, basic_salary, commission_amount, gross, net, statutory_allowance, "
        + "non_statutory_allowance, ot_amount, deduction_amount, skbbk_amount, prorata_days_worked, prorata_days_in_month, "
        + "epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee, pcb, commission_adjustment_amount")
        .eq("staff_id", staffId).order("period_month", { ascending: false }).limit(13),
      admin.from("revenue_pay_lines").select("kind, description, amount, sort_order").eq("staff_id", staffId).eq("period_month", first).order("sort_order"),
      admin.from("hr_staff_costs").select("basic_salary, hire_date, resignation_date, epf_category, socso_category, pcb_category, "
        + "children_count, is_epf_exempt, tax_mode, withholding_rate").eq("id", staffId).maybeSingle(),
      admin.from("payroll_runs").select("period_month, paid_at").not("paid_at", "is", null).order("period_month", { ascending: false }).limit(13),
    ]);
    for (const r of [cutover, closes, payroll, lines, staff, runs]) if (r.error) throw new Error(r.error.message);
    const paidAt = new Map(((runs.data ?? []) as { period_month: string; paid_at: string }[]).map(r => [r.period_month.slice(0, 7), r.paid_at]));
    const rows = (payroll.data ?? []) as unknown as ({ period_month: string; status: string; commission_amount: number | string | null;
      gross: number | string | null; net: number | string | null } & PayrollRowFacts)[];
    const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));
    const past: IncomePast[] = rows.filter(r => r.status !== "draft").map(r => ({
      period: r.period_month.slice(0, 7), status: r.status, basic: num(r.basic_salary), commission: num(r.commission_amount),
      gross: num(r.gross), net: num(r.net), paidOn: r.status === "paid" ? paidAt.get(r.period_month.slice(0, 7)) ?? null : null,
    }));
    const row = rows.find(r => r.period_month.slice(0, 7) === period);
    const firstPaid = ((cutover.data as { first_paid_month: string } | null)?.first_paid_month ?? null)?.slice(0, 7) ?? null;
    // Paid from the claim form, before the portal paid: the portal's own working, said as such.
    const byHand = firstPaid !== null && period < firstPaid;
    const payLines: IncomePayLine[] = ((lines.data ?? []) as { kind: string; description: string | null; amount: number | string }[])
      .map(l => ({ kind: l.kind, description: l.description ?? "", amount: num(l.amount) }));
    const record = staff.data as {
      basic_salary: number | string | null; hire_date: string | null; resignation_date: string | null; epf_category: string;
      socso_category: string; pcb_category: string; children_count: number; is_epf_exempt: boolean; tax_mode: string | null;
      withholding_rate: number | string | null;
    } | null;
    const extra = {
      period, payLines,
      // A month paid outside the portal has no salary here unless payroll kept one — never today's contract.
      basic: row ? num(row.basic_salary) : !byHand && record ? num(record.basic_salary) : null,
      payrollStatus: row?.status ?? null,
      paidOn: row?.status === "paid" ? paidAt.get(period) ?? null : null,
    };
    // The salary HR pays the month (2026-10-20): the payroll row as HR keeps it, any EPF / SOCSO / EIS / PCB
    // typed over the schedule included; before the row exists, what the close will write — the record's basic,
    // with the schedules' figures on it. Started now, beside the engine; read once the commission is known.
    const salary: Promise<PaySalary | null> = startRead(row ? Promise.resolve(salaryFromRow(row))
      : byHand || !record ? Promise.resolve(null)
      : (async () => {
        const basic = num(record.basic_salary);
        const window = previewWageWindow(first, { ...record, basic_salary: basic, allowances: 0 });
        const statutory = await scheduleStatutory(statutoryLookup(admin), { ...record, tax_mode: record.tax_mode ?? "pcb" }, window, first);
        return salaryFromSchedule(basic, window, statutory);
      })());
    const withPay = async (month: IncomeMonth): Promise<IncomeMonth> => {
      const [s, other] = await Promise.all([salary, elsewhere]);
      return {
        ...month,
        pay: s ? memberPay({
          commission: month.commission, elsewhere: other.amount, elsewhereFrom: other.names, payLines, salary: s,
          taxMode: taxModeOf(record?.tax_mode), withholdingRate: record?.withholding_rate == null ? null : num(record.withholding_rate),
        }) : null,
      };
    };
    const empty = (state: IncomeMonth["state"], notice: string): IncomeMonth => ({
      ...extra, state, asOf: new Date().toISOString(), closedAt: null, rankLabel: null, rate: 0,
      personal: 0, kpi: 0, kpiQty: 0, openBill: 0, incentive: 0, override: 0, group: 0, director: 0,
      commission: 0, countedSales: 0, bandKey: null, brands: [],
      bills: [], overrides: [], switches: { kpi: false, openBill: false, incentive: false, override: false, group: false }, notice,
      pay: null,
    });

    const { data: scheme, error: schemeError } = await admin.from("comm_schemes")
      .select("enable_kpi, enable_open_bill, enable_margin_incentive, enable_override, enable_group_incentive")
      .eq("sub_department_id", subDepartmentId).eq("is_active", true).is("effective_to", null).maybeSingle();
    if (schemeError) throw new Error(schemeError.message);
    const sw = (scheme ?? {}) as Record<string, boolean | null>;
    const switches = { kpi: !!sw.enable_kpi, openBill: !!sw.enable_open_bill, incentive: !!sw.enable_margin_incentive, override: !!sw.enable_override, group: !!sw.enable_group_incentive };

    // Closed by HR: the close's own figures, fixed.
    const close = closes.data as { closed_at: string; summary: unknown; statement: StatementDto | null; deferred_orders: { orderId: string }[] | null } | null;
    if (close && !byHand) {
      const ov = (close.statement?.lines ?? []).filter(l => l.component === "override");
      const orderIds = [...new Set(ov.map(l => l.source_order_id).filter((v): v is string => !!v))];
      const sellerIds = [...new Set(ov.map(l => l.source_staff_id).filter((v): v is string => !!v))];
      // A leader's override lines name every bill of their team's month — a
      // few hundred ids in one `.in()` nears the ~500 where the URL fails
      // outright (2026-10-08). 100 a time; ids are unique, so each answer is
      // its chunk's own rows and only feeds lookups by id.
      const byIds = (table: string, columns: string, ids: string[], label: string) =>
        fetchByKeys<unknown, string>(ids, chunk => admin.from(table).select(columns).in("id", chunk) as unknown as PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, label)
          .then(data => ({ data, error: null }), (e: Error) => ({ data: null, error: { message: e.message } }));
      const [orders, sellers] = await Promise.all([
        orderIds.length ? byIds("sales_orders", "id, order_no, brand_code, order_total, staff_id", orderIds, "Could not read the team's bills") : Promise.resolve({ data: [], error: null }),
        sellerIds.length ? byIds("hr_staff_costs", "id, employee_name", sellerIds, "Could not read the team's names") : Promise.resolve({ data: [], error: null }),
      ]);
      if (orders.error || sellers.error) throw new Error((orders.error ?? sellers.error)!.message);
      const names = new Map(((sellers.data ?? []) as { id: string; employee_name: string }[]).map(s => [s.id, s.employee_name]));
      const facts = new Map<string, OverrideFacts>();
      for (const o of (orders.data ?? []) as { id: string; order_no: string; brand_code: string | null; order_total: number | string; staff_id: string | null }[]) {
        facts.set(o.id, { no: o.order_no, seller: (o.staff_id && names.get(o.staff_id)) || "Your team", brand: o.brand_code, orderTotal: num(o.order_total) });
      }
      for (const [id, name] of names) facts.set(`staff:${id}`, { no: "", seller: name, brand: null, orderTotal: null });
      const month = closedIncome({ closedAt: close.closed_at, summary: parseCloseSummary(close.summary, ""), statement: close.statement, deferred: close.deferred_orders ?? [] },
        facts, { ...extra, switches });
      return { month: await withPay(month), past, cutover: firstPaid };
    }

    // Still open (or paid by hand): the engine's figure now, exactly as Comm Cal shows it.
    const board = await liveWorkbench(admin, subDepartmentId, first, staffId);
    if (!board) return { month: await withPay(empty("none", "No bills have arrived for this month yet.")), past, cutover: firstPaid };
    const person = board.people.find(p => p.staffId === staffId) ?? null;
    const month = liveIncome(person, { ...extra, asOf: new Date().toISOString(), switches });
    return { month: await withPay(byHand ? { ...month, state: "manual" } : month), past, cutover: firstPaid };
  });
}

/**
 * What the member earns the same month in their OTHER sub-departments
 * (2026-10-20). Payroll pays every sub-department's commission in one row
 * (`comm_standing_close_total`) and takes the fixed salary out of all of it
 * once — so My income in any one of them carves the salary out of the whole:
 * where they are closed, the close's figure; anywhere else they sit or direct,
 * that sub-department's engine now. Read with the service role, like the month
 * itself, only after `member_income_context` authorised the session.
 */
async function commissionElsewhere(admin: SupabaseClient, staffId: string, subDepartmentId: string, first: string): Promise<{ amount: number; names: string[] }> {
  const [y, m] = first.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const [closes, seats, directs] = await Promise.all([
    admin.from("comm_salesperson_closes").select("sub_department_id, total_commission")
      .eq("staff_id", staffId).eq("period_month", first).is("reopened_at", null).neq("sub_department_id", subDepartmentId),
    admin.from("comm_hierarchy").select("comm_schemes!inner (sub_department_id, is_active, effective_to)")
      .eq("staff_id", staffId).eq("comm_schemes.is_active", true).is("comm_schemes.effective_to", null)
      .lte("effective_from", last).or(`effective_to.is.null,effective_to.gte.${first}`),
    admin.from("comm_director_pay").select("comm_schemes!inner (sub_department_id, is_active, effective_to)")
      .eq("staff_id", staffId).eq("comm_schemes.is_active", true).is("comm_schemes.effective_to", null),
  ]);
  for (const r of [closes, seats, directs]) if (r.error) throw new Error(r.error.message);
  const closed = new Map<string, number>();
  for (const c of (closes.data ?? []) as { sub_department_id: string; total_commission: number | string | null }[]) {
    closed.set(c.sub_department_id, (closed.get(c.sub_department_id) ?? 0) + Number(c.total_commission ?? 0));
  }
  const schemeSubs = (rows: unknown[] | null) => (rows ?? []).map(r => (r as { comm_schemes: { sub_department_id: string } }).comm_schemes.sub_department_id);
  const open = [...new Set([...schemeSubs(seats.data), ...schemeSubs(directs.data)])].filter(id => id !== subDepartmentId && !closed.has(id));
  const live = await Promise.all(open.map(async id => {
    const board = await liveWorkbench(admin, id, first, staffId);
    return [id, board?.people.find(p => p.staffId === staffId)?.totalCommission ?? 0] as const;
  }));
  const earned = [...closed.entries(), ...live].filter(([, amount]) => amount !== 0);
  if (!earned.length) return { amount: 0, names: [] };
  const { data: subs, error } = await admin.from("comm_sub_departments").select("id, name").in("id", earned.map(([id]) => id));
  if (error) throw new Error(error.message);
  const name = new Map(((subs ?? []) as { id: string; name: string }[]).map(s => [s.id, s.name]));
  return {
    amount: Math.round(earned.reduce((a, [, amount]) => a + amount, 0) * 100) / 100,
    names: earned.map(([id]) => name.get(id) ?? "Another department"),
  };
}

/**
 * A month as Comm Cal's engine works it out now, for the whole sub-department
 * — null when nothing has been imported for it yet. It carries what Comm Cal
 * carries (lib/commission/carry.ts): a bill of an earlier month only once that
 * month is closed for its salesperson, so the live month never counts the one
 * still being closed a second time.
 */
async function liveWorkbench(client: SupabaseClient, subDepartmentId: string, first: string, alsoStaffId?: string) {
  const run = await client.from("comm_runs").select("id").eq("sub_department_id", subDepartmentId).eq("period_month", first).maybeSingle();
  if (run.error) throw new Error(run.error.message);
  let loaded: Awaited<ReturnType<typeof loadCommissionInput>>;
  try {
    loaded = await loadCommissionInput(first, subDepartmentId, client, { replayRunId: (run.data as { id: string } | null)?.id });
  } catch (error) {
    if (/Nothing has been imported/i.test(error instanceof Error ? error.message : "")) return null;
    throw error;
  }
  const { input } = loaded;
  const ids = [...new Set([...workbenchStaffIds(input), ...(alsoStaffId ? [alsoStaffId] : [])])];
  const people = await fetchByKeys<{ id: string; employee_name: string }, string>(ids, keys =>
    client.from("hr_staff_costs").select("id, employee_name").in("id", keys));
  return buildCommissionWorkbench(input, { people: people.map(p => ({ staffId: p.id, name: p.employee_name })) });
}

/**
 * Today for a Principal viewing nobody (2026-10-06): the sub-department's month
 * as Comm Cal works it out now — everybody's commission, before salaries. Read
 * with the Principal's own session: Comm Cal is theirs to read, so no service
 * role is needed.
 */
export async function loadDepartmentIncome(subDepartmentId: string, period: string): Promise<MemberOutcome<DepartmentIncome>> {
  return outcome(async () => {
    const user = await getMemberUser();
    if (!user?.is_active || !isPrincipalAccount(user)) throw new Error("Only Principal can see a whole department's commission.");
    insightWindow(subDepartmentId, period, period);
    const client = await session("member_insight", true);
    const board = await liveWorkbench(client, subDepartmentId, `${period}-01`);
    if (!board) return { period, state: "none", commission: 0, countedSales: 0 };
    const round2 = (n: number) => Math.round(n * 100) / 100;
    return {
      period, state: "live",
      commission: round2(board.people.reduce((a, p) => a + p.totalCommission, 0)),
      countedSales: round2(board.people.reduce((a, p) => a + (p.statement?.productRevenue ?? 0), 0)),
    };
  });
}

export interface MemberHonours {
  finishes: { period: string; board: HonourBoard; title: string; sub: string; place: number }[];
  /** Months of the window that are final — their finishes stand; the rest are still moving. */
  final: string[];
  /** Final months nobody in the sub-department sold in: nothing to win, nothing to compare with. */
  empty: string[];
}

const monthsBetween = (from: string, until: string): string[] => {
  const out: string[] = [];
  for (let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7)); `${y}-${String(m).padStart(2, "0")}` <= until; m === 12 ? (y++, m = 1) : m++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
};

/**
 * My honours (2026-10-05): the member's finishes over a window of months,
 * worked out from the Arena the member's own session reads, for everybody in
 * the sub-department. A month the portal CLOSED is kept with the service role
 * (`member_honours`) the first time it is opened after it is final, so a
 * closing rank stays the closing rank; the database forgets it when a close or
 * run of it is reopened, a brand week of it changes or one of its bills
 * changes (a Recost too), and the next open takes it afresh. A month before the
 * cutover was paid by hand and never closes here, so it is never kept (23HON):
 * it is worked out afresh on every open, and HR's brand-week corrections or a
 * Recost reach it exactly as they reach the Arena's boards.
 */
export async function loadMemberHonours(
  subDepartmentId: string,
  from: string,
  until: string,
  context?: MemberReadContext,
): Promise<MemberOutcome<MemberHonours>> {
  return outcome(async () => {
    const user = await getMemberUser();
    if (!user?.is_active) throw new Error("Sign in with an active work account.");
    // Its box unticked (People › Permissions › Revenue app, 2026-10-11): the finishes are read with the service
    // role below, which has no tabs to ask, so this is the gate.
    if (appClosed(user.closed).pages.includes("honours")) throw new Error("My honours is not open to your account.");
    insightWindow(subDepartmentId, from, until, context);
    const principal = principalReadContext(user, context);
    const client = await session("member_insight", principal);
    const staffId = await rpc<string>(client, "member_income_context", {
      p_sub_department: subDepartmentId, p_staff: principal ? context!.staffId : null,
    });
    if (typeof staffId !== "string" || !staffId) throw new Error("This department is not available to your account.");
    const admin = adminClient() as unknown as SupabaseClient;
    // A month still running is never final; nor is one before any bill arrived worth asking about.
    const current = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
    const window = monthsBetween(from, until > current ? current : until);
    const ended = window.filter(m => m < current);
    const [keptRows, firstBill, cutover] = await Promise.all([
      admin.from("member_honour_months").select("period_month, finishes").eq("sub_department_id", subDepartmentId)
        .in("period_month", ended.map(m => `${m}-01`)),
      admin.from("sales_orders").select("period_month, sales_import_batches!inner (sub_department_id)")
        .eq("sales_import_batches.sub_department_id", subDepartmentId).order("period_month").limit(1).maybeSingle(),
      admin.from("comm_cutovers").select("first_paid_month").eq("sub_department_id", subDepartmentId).maybeSingle(),
    ]);
    if (keptRows.error || firstBill.error || cutover.error) throw new Error((keptRows.error ?? firstBill.error ?? cutover.error)!.message);
    const paysFrom = (cutover.data as { first_paid_month: string } | null)?.first_paid_month?.slice(0, 7) ?? null;
    const byHand = (m: string) => paysFrom !== null && m < paysFrom;
    const kept = new Map(((keptRows.data ?? []) as { period_month: string; finishes: number | string }[])
      .map(r => [r.period_month.slice(0, 7), Number(r.finishes)] as const).filter(([m]) => !byHand(m)));
    const earliest = ((firstBill.data as { period_month: string } | null)?.period_month ?? "9999-12").slice(0, 7);
    const final = new Set<string>(), empty = new Set<string>();
    // Months before the first bill are as final as they will ever be: nothing to win.
    for (const m of ended) if (m < earliest) { final.add(m); empty.add(m); }
    for (const [m, n] of kept) { final.add(m); if (n === 0) empty.add(m); }
    const live: MemberHonours["finishes"] = [];
    const ask = ended.filter(m => m >= earliest && !kept.has(m));
    if (ask.length) {
      const { data: scheme, error: schemeError } = await admin.from("comm_schemes").select("id, enable_kpi")
        .eq("sub_department_id", subDepartmentId).eq("is_active", true).is("effective_to", null).maybeSingle();
      if (schemeError) throw new Error(schemeError.message);
      const s = scheme as { id: string; enable_kpi: boolean | null } | null;
      let threshold: number | null = null;
      if (s?.enable_kpi) {
        const { data: t } = await admin.from("comm_kpi_thresholds").select("min_qty").eq("scheme_id", s.id).order("min_qty").limit(1).maybeSingle();
        threshold = t ? Number((t as { min_qty: number | string }).min_qty) : null;
      }
      const kpi = { enabled: !!s?.enable_kpi, threshold };
      const [snapshots, history] = await Promise.all([
        Promise.all(ask.map(month => rpc<MemberArenaSnapshot>(client, principal ? "member_principal_arena_snapshot" : "member_arena_snapshot", {
          p_sub_department: subDepartmentId, p_period: month, p_window: "monthly", ...(principal ? { p_staff: context!.staffId } : {}),
        }))),
        client.rpc(principal ? "member_principal_arena_booth_history" : "member_arena_booth_history", {
          p_sub_department: subDepartmentId, ...(principal ? { p_staff: context!.staffId } : {}),
        }).then(h => (!h.error && h.data && Array.isArray((h.data as ArenaHistorySnapshot).events) ? (h.data as ArenaHistorySnapshot) : null)),
      ]);
      for (const [i, month] of ask.entries()) {
        const snapshot = snapshots[i];
        if (!snapshot || !Array.isArray(snapshot.people) || !snapshot.final) continue;
        const finishes = monthFinishes({ month, snapshot, history, kpi });
        final.add(month);
        if (!finishes.length) empty.add(month);
        // Paid by hand: read afresh every time, never kept.
        if (byHand(month)) {
          for (const f of finishes) if (f.staffId === staffId) live.push({ period: month, board: f.board, title: f.title, sub: f.sub, place: f.place });
          continue;
        }
        // Kept once: the first to arrive writes the month; anybody after reads it.
        const { data: claimed, error: keepError } = await admin.from("member_honour_months")
          .upsert({ sub_department_id: subDepartmentId, period_month: `${month}-01`, finishes: finishes.length },
            { onConflict: "sub_department_id,period_month", ignoreDuplicates: true }).select("period_month");
        if (keepError) throw new Error(keepError.message);
        if ((claimed ?? []).length && finishes.length) {
          const { error } = await admin.from("member_honours").insert(finishes.map(f => ({
            sub_department_id: subDepartmentId, period_month: `${month}-01`, staff_id: f.staffId, board: f.board, title: f.title, sub: f.sub, place: f.place,
          })));
          if (error) {
            await admin.from("member_honour_months").delete().eq("sub_department_id", subDepartmentId).eq("period_month", `${month}-01`);
            throw new Error(error.message);
          }
        }
      }
    }
    const { data: rows, error: rowsError } = await admin.from("member_honours").select("period_month, board, title, sub, place")
      .eq("staff_id", staffId).eq("sub_department_id", subDepartmentId).gte("period_month", `${from}-01`).lte("period_month", `${until}-01`);
    if (rowsError) throw new Error(rowsError.message);
    const inWindow = (m: string) => m >= from && m <= until;
    return {
      finishes: [
        ...((rows ?? []) as { period_month: string; board: HonourBoard; title: string; sub: string; place: number }[])
          .filter(r => !byHand(r.period_month.slice(0, 7)))
          .map(r => ({ period: r.period_month.slice(0, 7), board: r.board, title: r.title, sub: r.sub, place: r.place })),
        ...live,
      ],
      final: [...final].filter(inWindow).sort(),
      empty: [...empty].filter(inWindow).sort(),
    };
  });
}

/** The mapping map behind My team. Names, titles and reporting lines; no pay. */
export async function loadMemberOrgMap(context?: Pick<MemberReadContext, "subDepartmentId">): Promise<MemberOutcome<MemberOrgMap>> {
  return outcome(async () => {
    const user = await getMemberUser();
    if (!user?.is_active) throw new Error("Sign in with an active work account.");
    const principal = principalReadContext(user, context, true);
    const client = await session("member_portal", principal);
    const data = await rpc<MemberOrgMap>(client, principal ? "member_principal_org_map" : "member_org_map",
      principal ? { p_sub_department: context!.subDepartmentId } : undefined);
    if (!data || !Array.isArray(data.people))
      throw new Error("The team map is temporarily unavailable.");
    return {
      ...data,
      people: data.people.map((person) => ({
        ...person,
        title: legacyLabel(person.title),
      })),
    };
  });
}

/** Private costs remain inside this server-only module and never enter an RPC response. */
export async function calculateMemberQuote(
  input: QuoteInput,
): Promise<MemberOutcome<QuoteResult>> {
  return outcome(async () => {
    uuid(input?.schemeId, "department");
    if (
      !Array.isArray(input.lines) ||
      input.lines.length < 1 ||
      input.lines.length > 30
    )
      throw new Error(
        "Select products first. A quote can contain up to 30 product lines.",
      );
    // Each line as the calculator may read it: its own bed frame build (2026-10-05)
    // checked for shape, anything else on the line dropped.
    const lines: QuoteInput["lines"] = input.lines.map((line) => {
      uuid(line?.productId, "product");
      if (
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > 100 ||
        typeof line.gift !== "boolean"
      )
        throw new Error("The product quantity is invalid.");
      const bedframe = bedframeBuild(line.bedframe);
      return { productId: line.productId, quantity: line.quantity, gift: line.gift, ...(bedframe ? { bedframe } : {}) };
    });
    const lineKeys = lines.map((line) => quoteLineKey(line));
    if (new Set(lineKeys).size !== lineKeys.length)
      throw new Error(
        "Combine quantities of the same product and gift status in one cart line.",
      );
    const ids = [...new Set(input.lines.map((line) => line.productId))];
    if (
      typeof input.price !== "string" ||
      typeof input.delivery !== "string" ||
      cents(input.price) === null ||
      cents(input.delivery || "0") === null
    )
      throw new Error("Enter a valid amount with up to two decimal places.");
    const user = await getMemberUser();
    if (appClosed(user?.closed).sends.includes("quote")) throw new Error(SEND_REFUSED.quote);
    const principalView = !!user && isPrincipalAccount(user);
    const build = quoteBuild(input.build);
    const client = await session("member_quote", principalView);
    const context = await rpc<{ bands: MemberBand[]; kpiItems?: unknown }>(
      client,
      principalView ? "member_principal_quote_context" : "member_quote_context",
      { p_scheme: input.schemeId },
    );
    const brands = [...new Set(context.bands.map((b) => b.brand))];
    if (!brands.length)
      throw new Error("Margin rules have not been configured for Fair.");
    // The portal's own prices (user 2026-09-24): the Product List's catalogue,
    // priced, for the cart's SKUs plus the pillows a gift suggestion may offer
    // — never a whole price list — and how the scheme works out the Revenue
    // Team's cost (2026-10-05: the context a member's own login can call no
    // longer carries it). Service role only, after the member's own session
    // has been authorised above; nothing priced and no ratio leaves this module.
    const admin = adminClient() as unknown as SupabaseClient;
    const [{ data: catalogue, error: catalogueError }, { data: costRules, error: rulesError }] = await Promise.all([
      admin.rpc("member_catalogue", {
        p_brands: brands,
        p_ids: ids,
        p_priced: true,
        p_suggest: 20,
      }),
      admin.rpc("member_quote_cost_rules", { p_scheme: input.schemeId }),
    ]);
    if (catalogueError) throw new Error(catalogueError.message);
    const rules = rulesError ? null : quoteCostRules(costRules);
    if (!rules)
      throw new Error("The margin rules for this department are not configured.");
    const { products, pricing } = pricedCatalogueOf(catalogue);
    for (const line of input.lines) {
      const product = products.find((p) => p.id === line.productId);
      if (
        !product ||
        !product.available ||
        (line.gift && !product.gift)
      )
        throw new Error(
          "The product or free gift is unavailable. Please select it again.",
        );
    }
    const mainProducts = input.lines
      .filter((line) => !line.gift)
      .map((line) => products.find((p) => p.id === line.productId)!);
    if (!mainProducts.length)
      throw new Error("Add a product to your cart first.");
    if (
      input.lines.some(
        (line) =>
          line.gift &&
          !isCompatibleGift(
            products.find((p) => p.id === line.productId)!,
            mainProducts,
          ),
      )
    )
      throw new Error(
        "A free gift size does not match a product in this cart. Please select a matching size.",
      );
    const checked: QuoteInput = { ...input, lines, build };
    const result = calculateQuote(
      checked,
      products,
      context.bands,
      { ...rules, kpiItems: quoteKpiItems(context.kpiItems) },
      pricing,
    );
    if (!result.valid)
      throw new Error(result.error ?? "The quote could not be calculated.");
    // The ratio stays here: the phone is told the margin, never how the cost
    // behind it is made up (user 2026-10-05).
    return { ...result, customerText: customerQuote(checked, products, result) };
  });
}

/**
 * The cart's builds, validated for SHAPE: short strings or nothing. Whether a
 * choice is one the cart's models offer is the calculator's check, against
 * the catalogue it was priced from.
 */
function quoteBuild(raw: unknown): QuoteInput["build"] {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("The build is invalid.");
  // Seat height and tier are plain; an option may carry an inch mark or a
  // parenthesis (`4"`, `Right Drawer (10")`) but never a control character.
  const plain = (value: unknown, label: string): string | undefined => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string" || value.length > 20 || /[^\w .\-/]/.test(value))
      throw new Error(`The sofa ${label} is invalid.`);
    return value;
  };
  const unsafe = (s: string) =>
    [...s].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 || ch === "<" || ch === ">");
  const option = (value: unknown, label: string): string | undefined => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string" || value.length > 80 || unsafe(value))
      throw new Error(`The ${label} is invalid.`);
    return value;
  };
  const options = (value: unknown, label: string): string[] | undefined => {
    if (value === undefined || value === null) return undefined;
    if (!Array.isArray(value) || value.length > 20) throw new Error(`The ${label} are invalid.`);
    const list = [...new Set(value.map((v) => option(v, label)).filter((v): v is string => !!v))];
    return list.length ? list : undefined;
  };
  const b = raw as Record<string, unknown>;
  // A seat height is whatever the Product List's grid calls it (`28`, `75cm`,
  // `STD`, even `?`) and is matched against the SKU's own grid, so it needs
  // only the options' shape check; the tier is one of three words.
  const height = option(b.height, "sofa seat height");
  if (height && height.length > 20) throw new Error("The sofa seat height is invalid.");
  const build: NonNullable<QuoteInput["build"]> = {
    height,
    tier: plain(b.tier, "fabric tier"),
  };
  const leg = option(b.leg, "sofa leg height");
  if (leg) build.leg = leg;
  const specials = options(b.specials, "sofa specials");
  if (specials) build.specials = specials;
  const frame = bedframeBuild(b.bedframe);
  if (frame) build.bedframe = frame;
  return build;
}

const unsafeText = (s: string) =>
  [...s].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 || ch === "<" || ch === ">");

/**
 * A bed frame build, validated for SHAPE — the cart's (legacy) or one line's
 * own (2026-10-05). Whether its options are ones the model offers is the
 * calculator's check. Empty = no build.
 */
function bedframeBuild(raw: unknown): BedframeBuild | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("The bed frame build is invalid.");
  const option = (value: unknown, label: string): string | undefined => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string" || value.length > 80 || unsafeText(value)) throw new Error(`The ${label} is invalid.`);
    return value;
  };
  const f = raw as Record<string, unknown>;
  const frame: BedframeBuild = {};
  const divan = option(f.divan, "divan height");
  const leg = option(f.leg, "bed frame leg height");
  const total = option(f.total, "total height");
  const gap = option(f.gap, "gap");
  if (f.specials !== undefined && f.specials !== null && (!Array.isArray(f.specials) || f.specials.length > 20))
    throw new Error("The bed frame specials are invalid.");
  const specials = [...new Set(((f.specials as unknown[] | undefined) ?? []).map((v) => option(v, "bed frame special")).filter((v): v is string => !!v))];
  if (divan) frame.divan = divan;
  if (leg) frame.leg = leg;
  if (total) frame.total = total;
  if (gap) frame.gap = gap;
  if (specials.length) frame.specials = specials;
  return Object.keys(frame).length ? frame : undefined;
}

interface VerifiedInvoice {
  bytes: Uint8Array;
  mime: string;
  extension: string;
  name: string;
}
async function invoice(form: FormData): Promise<VerifiedInvoice> {
  return verifiedUpload(form, "invoice", "invoice");
}
/**
 * A file the member attached, looked at byte by byte: a JPG, PNG or PDF of 3 MB
 * or less, whatever its name says — a claim's invoice, a waiting list's signed
 * application form (2026-10-10). A signed form — the waiting list's or the
 * replacement's — may be a Word file too (`word`; 2026-10-20, the user, once
 * HR's own uploads took Word: "need as well"): a .docx or an old .doc, known by
 * its bytes and refused when it holds macros (`letterKind`, the rule HR's
 * uploads keep). An invoice stays a JPG, PNG or PDF.
 */
async function verifiedUpload(form: FormData, fieldName: string, noun: string, word = false): Promise<VerifiedInvoice> {
  // Sent ahead to the member's own folder since 2026-10-23 (lib/storage/staging.ts — a Server Action's body stops at
  // 4 MB), or the File itself from an older page. Read here once; the staged copy goes straight after.
  const db = (await createClient()) as unknown as SupabaseClient;
  const sent = await formFile(db, form, fieldName);
  if (!sent.ok) throw new Error(sent.reason);
  const file = sent.file;
  if (!file || file.size < 1)
    throw new Error(noun === "invoice" ? "Upload an invoice." : `Upload the ${noun}.`);
  let read: Uint8Array | null = null;
  try {
    if (file.size > MAX_INVOICE)
      throw new Error(`The ${noun} must be 100 MB or smaller.`);
    read = await file.bytes();
  } finally {
    await dropStaged(db, [file]);
  }
  const bytes = read;
  if (word) {
    const kind = letterKind(bytes, file.type);
    if (kind === "macros") throw new Error(WORD_MACROS_REFUSAL);
    if (!kind) throw new Error(`The ${noun} must be ${SIGNED_FORM_KINDS}.`);
    return { bytes, mime: kind.mime, extension: kind.extension, name: file.name.slice(0, 200) };
  }
  let mime = "",
    extension = "";
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
  ) {
    mime = "image/png";
    extension = "png";
  } else if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  ) {
    mime = "image/jpeg";
    extension = "jpg";
  } else if (
    bytes.length >= 5 &&
    [37, 80, 68, 70, 45].every((b, i) => bytes[i] === b)
  ) {
    mime = "application/pdf";
    extension = "pdf";
  }
  if (!mime || (file.type && file.type !== mime))
    throw new Error(`The ${noun} must be a valid JPG, PNG or PDF file.`);
  return { bytes, mime, extension, name: file.name.slice(0, 200) };
}

/**
 * A verified file kept on the member's draft request — a claim's invoice, a
 * waiting list's signed form: uploaded under their own folder, then attested
 * by the service role (members cannot spoof the MIME check by calling the
 * submission RPC directly). Once per file: the same bytes are not kept twice.
 */
async function attachVerified(
  client: SupabaseClient,
  prepared: { id: string; userId: string },
  file: VerifiedInvoice,
  hash: string,
): Promise<void> {
  const existing = await client
    .from("member_request_attachments")
    .select("id")
    .eq("request_id", prepared.id)
    .eq("content_sha256", hash)
    .limit(1);
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data?.length) return;
  const path = `${prepared.userId}/${prepared.id}/${randomUUID()}.${file.extension}`;
  const upload = await client.storage
    .from("member-invoices")
    .upload(path, file.bytes, { contentType: file.mime, upsert: false });
  if (upload.error) throw new Error(upload.error.message);
  const attestation = await (adminClient() as unknown as SupabaseClient)
    .from("member_request_attachments")
    .insert({
      request_id: prepared.id,
      uploaded_by: prepared.userId,
      object_path: path,
      mime_type: file.mime,
      size_bytes: file.bytes.length,
      content_sha256: hash,
    });
  if (attestation.error) {
    await client.storage.from("member-invoices").remove([path]);
    throw new Error(attestation.error.message);
  }
}

/** Draft + immutable verified attachment + atomic claim/request submission. */
export async function submitMemberRequest(
  form: FormData,
): Promise<MemberOutcome<MemberRequest>> {
  return outcome(async () => {
    const client = await session("member_requests");
    const kind = field(form, "kind");
    if (!["claim", "replacement", "waiting"].includes(kind))
      throw new Error("Select a request type.");
    await mustSend(requestPageOf(kind));
    let subDepartmentId = field(form, "subDepartmentId");
    if (!subDepartmentId) {
      const data = await rpc<MemberData>(client, "member_data_snapshot");
      const requested = field(form, "schemeId") || field(form, "department");
      subDepartmentId =
        data.memberships.find(
          (m) =>
            m.schemeId === requested ||
            m.id === requested ||
            m.name === requested,
        )?.id ?? "";
    }
    if (kind === "waiting" && field(form, "targetDepartmentId"))
      subDepartmentId = field(form, "targetDepartmentId");
    uuid(subDepartmentId, "department");
    const detail: Record<string, string | number | boolean> = {};
    // A food claim's weekends and their days (2026-10-13): the only list a claim sends.
    let foodWeeks: FoodWeekPick[] | null = null;
    let verified: VerifiedInvoice | null = null;
    // A waiting list or a replacement: HR's own questions and its signed form.
    let answers: WaitingAnswer[] = [];
    let signedForm: VerifiedInvoice | null = null;
    const claimType = kind === "claim" ? field(form, "claimType") : "";
    if (claimType) {
      // A fair claim (2026-10-05): its amount is the rate HR set, worked out by
      // `member_prepare_request`. Only the weekend is the member's to say: the
      // fair is their brand week's, its region the one HR set for the venue
      // (2026-10-06). Outstation goes by the route's spots and needs no invoice
      // — unless the region is flown to, when the ticket's price is typed with
      // its invoice and HR checks one against the other. Airbnb: the invoice's
      // total is typed and paid up to a limit by head count — HR's figure a
      // night for a small group, the rate × people × nights for a bigger one
      // (2026-10-12: that rate is a limit too, not a fixed amount).
      if (claimType !== "outstation" && claimType !== "airbnb" && claimType !== "food") throw new Error("Choose Outstation, Airbnb or a food claim.");
      if (claimType === "food") {
        // A food claim (2026-10-13 — "submit by total month … dont by week submit"): a month, its weekends and the
        // days of each they worked. The database checks each is their own brand week's, the days its fair's and
        // come already, the month over and claimed by no other food claim of theirs, and pays HR's rate a day.
        const month = field(form, "month");
        if (!MONTH.test(month)) throw new Error("Choose the month the food claim is for.");
        let weeks: unknown = null;
        try {
          weeks = JSON.parse(field(form, "weeks", 6000) || "null");
        } catch {
          weeks = null;
        }
        foodWeeks = readFoodWeeks(weeks, month);
        if (!foodWeeks) throw new Error("Tick the days you worked at the fairs.");
        Object.assign(detail, { claimType, month, notes: field(form, "notes", 1500) });
      } else {
        Object.assign(detail, {
          claimType,
          week: date(field(form, "week"), "brand week"),
          notes: field(form, "notes", 1500),
        });
      }
      if (claimType === "outstation") {
        const price = field(form, "amount");
        if (price) {
          const amount = cents(price);
          if (amount === null || amount < 1) throw new Error("Enter the plane ticket's price, as its invoice shows.");
          verified = await invoice(form);
          Object.assign(detail, {
            amount: amount / 100,
            invoiceName: verified.name,
            invoiceHash: createHash("sha256").update(verified.bytes).digest("hex"),
          });
        }
      } else if (claimType === "airbnb") {
        const count = (name: string) => {
          const n = Number(field(form, name));
          if (!Number.isInteger(n) || n < 0 || n > 40) throw new Error("Check who stayed.");
          return n;
        };
        verified = await invoice(form);
        Object.assign(detail, {
          start: date(field(form, "start"), "check-in date"),
          end: date(field(form, "end"), "check-out date"),
          male: count("male"),
          female: count("female"),
          invoiceName: verified.name,
          invoiceHash: createHash("sha256").update(verified.bytes).digest("hex"),
        });
        if (detail.end <= detail.start) throw new Error("Check-out must be after check-in.");
        if (Number(detail.male) + Number(detail.female) < 1) throw new Error("Add who stayed.");
        // Every group types it now; a stay sent without it is the database's to refuse.
        const total = field(form, "amount");
        if (total) {
          const amount = cents(total);
          if (amount === null || amount < 1) throw new Error("Enter the stay's total from its invoice.");
          detail.invoiceAmount = amount / 100;
        }
      }
    } else if (kind === "claim") {
      const amount = cents(field(form, "amount"));
      if (amount === null || amount < 1)
        throw new Error("Enter a claim amount greater than 0.");
      verified = await invoice(form);
      Object.assign(detail, {
        amount: amount / 100,
        location: field(form, "location"),
        category: field(form, "category") || "Outstation accommodation",
        start: date(field(form, "start"), "arrival date"),
        end: date(field(form, "end"), "departure date"),
        invoiceName: verified.name,
        invoiceHash: createHash("sha256").update(verified.bytes).digest("hex"),
      });
      if (!detail.location || detail.end < detail.start)
        throw new Error("Check the location, arrival date and departure date.");
    } else {
      detail.newPerson = field(form, "newPerson", 160);
      if (kind === "replacement") {
        detail.replacementSource = field(form, "replacementSource") || "new";
        // The approved waiting-list request the replacement comes from, when it does.
        const waiting = field(form, "waitingRequestId");
        if (waiting) detail.waitingRequestId = uuid(waiting, "waiting-list request");
      }
      if (!detail.newPerson && detail.replacementSource !== "vacancy")
        throw new Error("Enter the new member name.");
      if (kind === "waiting") {
        const consent = form.get("consent");
        Object.assign(detail, {
          contact: field(form, "contact", 60),
          // A day, or "Any time ready" (2026-10-14): ready whenever HR calls them.
          start: isAnyTime(field(form, "start")) ? ANY_TIME : date(field(form, "start"), "preferred start date"),
          signature: field(form, "signature", 160),
          consent: consent === "on" || consent === "true" || consent === "1",
        });
        if (!detail.contact || !detail.signature || !detail.consent)
          throw new Error(
            "Enter contact details, provide a signature and confirm the intention to join.",
          );
        const signatureImage = field(form, "signatureImage", 100000);
        if (signatureImage) {
          if (
            !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(
              signatureImage,
            )
          )
            throw new Error(
              "The signature format is invalid. Draw it again or use a typed signature.",
            );
          const bytes = Buffer.from(signatureImage.split(",")[1], "base64");
          if (
            bytes.length > 65536 ||
            bytes.length < 8 ||
            ![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
          )
            throw new Error(
              "A drawn signature must be a PNG of 64 KB or smaller. You can use a typed signature instead.",
            );
          detail.signatureImage = signatureImage;
        }
      } else {
        const destination = field(form, "destination");
        Object.assign(detail, {
          originalStaffId: uuid(
            field(form, "originalStaffId") || field(form, "original"),
            "current member",
          ),
          destination: ["exit", "company_exit"].includes(destination)
            ? "resignation"
            : destination === "department_exit"
              ? "member_exit"
              : destination,
          effective: date(field(form, "effective"), "effective date"),
          reason: field(form, "reason", 3000),
        });
        if (
          !["member_exit", "resignation", "transfer"].includes(
            String(detail.destination),
          ) ||
          !detail.reason
        )
          throw new Error(
            "Choose the current member arrangement and enter a reason.",
          );
        if (detail.destination === "transfer")
          detail.targetDepartmentId = uuid(
            field(form, "targetDepartmentId") || field(form, "target"),
            "receiving department",
          );
      }
      // HR's own questions and the signed form — the waiting list's since
      // 2026-10-10, the replacement's since 2026-10-11 (each list's Form
      // settings on Sales Groups versions its own form).
      answers = waitingAnswersFrom(field(form, "answers", 40000));
      const version = Number(field(form, "formVersion"));
      if (Number.isInteger(version) && version > 0) detail.formVersion = version;
      // A file in the form, or (2026-10-23) the line of one sent ahead.
      const signedFile = form.get("signedForm");
      if (signedFile && (typeof signedFile === "string" ? parseStagedRef(signedFile) !== null : signedFile.size > 0)) {
        signedForm = await verifiedUpload(form, "signedForm", kind === "waiting" ? "signed application form" : "signed replacement form", true);
        detail.signedFormName = signedForm.name;
        detail.signedFormHash = createHash("sha256").update(signedForm.bytes).digest("hex");
      } else if (field(form, "requestId")) {
        // A revision keeps the form it was sent with (member_submit_request
        // still finds it attached to this request, by its hash).
        const name = field(form, "signedFormName", 200);
        const hash = field(form, "signedFormHash", 64);
        if (name && /^[0-9a-f]{64}$/.test(hash)) {
          detail.signedFormName = name;
          detail.signedFormHash = hash;
        }
      }
    }
    const revision = field(form, "requestId")
      ? uuid(field(form, "requestId"), "request")
      : null;
    let key = field(form, "idempotencyKey") || randomUUID();
    if (revision) {
      // RLS limits this read to the owner/reviewer; the RPC independently
      // enforces owner + editable status and serializes concurrent retries.
      const prior = await client
        .from("member_requests")
        .select("idempotency_key")
        .eq("id", revision)
        .maybeSingle();
      if (prior.error || !prior.data)
        throw new Error(
          "No request was found that can accept additional information.",
        );
      key = prior.data.idempotency_key;
    }
    uuid(key, "submission reference");
    const prepared = await rpc<{ id: string; userId: string; status: string }>(
      client,
      "member_prepare_request",
      {
        p_kind: kind,
        p_sub_department: subDepartmentId,
        p_detail: { ...detail, ...(foodWeeks ? { weeks: foodWeeks } : {}), ...(answers.length ? { answers } : {}) },
        p_idempotency: key,
        p_revision: revision,
      },
    );
    if (kind === "claim" && prepared.status === "draft" && verified)
      await attachVerified(client, prepared, verified, String(detail.invoiceHash));
    if ((kind === "waiting" || kind === "replacement") && prepared.status === "draft" && signedForm)
      await attachVerified(client, prepared, signedForm, String(detail.signedFormHash));
    return requestLabels(
      await rpc<MemberRequest>(client, "member_submit_request", {
        p_request: prepared.id,
      }),
    );
  });
}

export interface MemberRequestEvent {
  at: string;
  status: string;
  from: string | null;
  actor: "you" | "hr" | "finance" | "system" | "principal";
  actorName: string | null;
  note: string | null;
}

/** Who moved a request, when and why — the member's own, or anybody's for the Principal and HR. */
export async function loadMemberRequestHistory(id: string): Promise<MemberOutcome<MemberRequestEvent[]>> {
  return outcome(async () => {
    const user = await getMemberUser();
    if (!user?.is_active) throw new Error("Sign in with an active work account.");
    const client = await session(undefined);
    const data = await rpc<unknown>(client, "member_request_history", { p_request: uuid(id, "request") });
    if (!Array.isArray(data)) throw new Error("The request's history is temporarily unavailable.");
    const actors = ["you", "hr", "finance", "system", "principal"] as const;
    return data.flatMap((raw) => {
      const e = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
      if (!e || typeof e.at !== "string" || typeof e.status !== "string") return [];
      const actor = actors.find((a) => a === e.actor) ?? "system";
      return [{
        at: e.at, status: e.status, from: typeof e.from === "string" ? e.from : null, actor,
        actorName: typeof e.actorName === "string" && e.actorName ? e.actorName : null,
        note: typeof e.note === "string" && e.note ? e.note : null,
      }];
    });
  });
}

/** Withdraw a request HR has not acted on: still pending, or returned for more information. */
export async function cancelMemberRequest(id: string): Promise<MemberOutcome<MemberRequest>> {
  return outcome(async () => {
    const client = await session("member_requests");
    // Withdrawing is sending too: the request's own page's Create (RLS keeps the read to its owner).
    const { data: sent } = await client.from("member_requests").select("kind").eq("id", uuid(id, "request")).maybeSingle();
    if (sent) await mustSend(requestPageOf((sent as { kind: string }).kind));
    return requestLabels(await rpc<MemberRequest>(client, "member_cancel_request", { p_request: uuid(id, "request") }));
  });
}

/** Refuses a send whose page's Create box was unticked for the caller (lib/member/app-pages.ts). */
async function mustSend(page: "requests" | "track"): Promise<void> {
  if (appClosed((await getMemberUser())?.closed).sends.includes(page)) throw new Error(SEND_REFUSED[page]);
}

/**
 * HR's claim rates: the base, the rate per spot, Airbnb per person per night, the regions' spots.
 * The function is `member_claim_settings()`; `member_claim_rates` is HR's TABLE, and asking for it
 * as a function failed every time — the form had no region and no rate, so no claim could be sent
 * (found 2026-10-06).
 */
export async function loadMemberClaimRates(): Promise<MemberOutcome<unknown>> {
  return outcome(async () => {
    const user = await getMemberUser();
    const client = await session("member_portal", !!user && isPrincipalAccount(user));
    return rpc<unknown>(client, "member_claim_settings");
  });
}

/** The waiting-list form as HR set it (Sales Groups › Form settings). */
export interface MemberWaitingForm {
  form: WaitingForm;
}

/**
 * The waiting-list form the Revenue app draws (2026-10-10, HR revamp 7a):
 * `member_waiting_form()` lets the Revenue team in (`member_requests`). The
 * phone keeps this answer, so it carries no link that could expire — HR's
 * uploaded application form is asked for when Download is pressed
 * (`loadMemberWaitingFormLink`).
 */
export async function loadMemberWaitingForm(): Promise<MemberOutcome<MemberWaitingForm>> {
  return outcome(async () => {
    const user = await getMemberUser();
    const client = await session("member_requests", !!user && isPrincipalAccount(user));
    const form = formFromRow(await rpc<unknown>(client, "member_waiting_form"));
    if (!form) throw new Error("The waiting-list form could not be read. Pull to refresh.");
    return { form };
  });
}

/**
 * The replacement form the Revenue app draws (2026-10-11, round 2's README
 * 18.5): Sales Groups › Replacement list's Form settings, read the waiting
 * list's way — `member_replacement_form()` lets the Revenue team in, and the
 * answer carries no link.
 */
export async function loadMemberReplacementForm(): Promise<MemberOutcome<MemberWaitingForm>> {
  return outcome(async () => {
    const user = await getMemberUser();
    const client = await session("member_requests", !!user && isPrincipalAccount(user));
    const form = formFromRow(await rpc<unknown>(client, "member_replacement_form"), "replacement");
    if (!form) throw new Error("The replacement form could not be read. Pull to refresh.");
    return { form };
  });
}

/** Download form on a replacement: HR's upload through a ten-minute link, or null when the app builds it. */
export async function loadMemberReplacementFormLink(): Promise<MemberOutcome<{ url: string; name: string } | null>> {
  return outcome(async () => {
    const user = await getMemberUser();
    const client = await session("member_requests", !!user && isPrincipalAccount(user));
    const form = formFromRow(await rpc<unknown>(client, "member_replacement_form"), "replacement");
    if (!form) throw new Error("The replacement form could not be read. Pull to refresh.");
    if (!form.templatePath) return null;
    const signed = await client.storage.from("member-forms").createSignedUrl(form.templatePath, 600, { download: form.templateName });
    if (signed.error || !signed.data?.signedUrl) throw new Error("HR's replacement form could not be downloaded. Try again.");
    return { url: signed.data.signedUrl, name: form.templateName };
  });
}

/**
 * Waiting list & replacements (2026-10-10, HR revamp 7b): the waiting list of
 * each sub-department the member belongs to, in the order HR accepted them —
 * their own applicants by name, everybody else's by a first name and an
 * initial (`member_waiting_queue`). The Principal reads a viewed member's.
 */
export async function loadMemberWaitingQueue(context?: Pick<MemberReadContext, "staffId">): Promise<MemberOutcome<WaitingQueue[]>> {
  return outcome(async () => {
    const user = await getMemberUser();
    if (!user?.is_active) throw new Error("Sign in with an active work account.");
    const principal = isPrincipalAccount(user);
    if (context !== undefined && !principal) throw new Error("Only Principal can select another member to view.");
    if (principal && context === undefined) throw new Error("Choose a member to view this feature.");
    const client = await session("member_requests", principal);
    return queuesFrom(await rpc<unknown>(client, "member_waiting_queue", principal ? { p_staff: uuid(context!.staffId, "member") } : undefined));
  });
}

/**
 * Download form: a ten-minute link to the application form HR uploaded (the
 * `member-forms` bucket's templates/ read policy lets the Revenue team in),
 * or null when HR uploaded none and the app builds the black-and-white one.
 */
export async function loadMemberWaitingFormLink(): Promise<MemberOutcome<{ url: string; name: string } | null>> {
  return outcome(async () => {
    const user = await getMemberUser();
    const client = await session("member_requests", !!user && isPrincipalAccount(user));
    const form = formFromRow(await rpc<unknown>(client, "member_waiting_form"));
    if (!form) throw new Error("The waiting-list form could not be read. Pull to refresh.");
    if (!form.templatePath) return null;
    const signed = await client.storage.from("member-forms").createSignedUrl(form.templatePath, 600, { download: form.templateName });
    if (signed.error || !signed.data?.signedUrl) throw new Error("HR's application form could not be downloaded. Try again.");
    return { url: signed.data.signedUrl, name: form.templateName };
  });
}

/** View as: which memos the viewed person has read and acknowledged (their receipts, not the Principal's). */
export async function loadPrincipalMemoReceipts(staffId: string): Promise<MemberOutcome<{ memoId: string; readAt: string | null; acknowledgedAt: string | null }[]>> {
  return outcome(async () => {
    const user = await getMemberUser();
    if (!user?.is_active || !isPrincipalAccount(user)) throw new Error("Only the Principal can view another member's memos.");
    const client = await session(undefined, true);
    const data = await rpc<unknown>(client, "member_principal_memo_receipts", { p_staff: uuid(staffId, "member") });
    if (!Array.isArray(data)) return [];
    return data.flatMap((raw) => {
      const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
      return r && typeof r.memoId === "string"
        ? [{ memoId: r.memoId, readAt: typeof r.readAt === "string" ? r.readAt : null, acknowledgedAt: typeof r.acknowledgedAt === "string" ? r.acknowledgedAt : null }]
        : [];
    });
  });
}

/**
 * Read (`ack` false) or acknowledged — acknowledged with the member's own signature (2026-10-20, mig 20261021013000:
 * the pad's PNG, kept on the receipt with the first acknowledgement; the database refuses an Acknowledge without one).
 */
export async function acknowledgeMemberMemo(
  id: string,
  ack: boolean,
  signature?: string | null,
): Promise<MemberOutcome<MemoReceipt>> {
  return outcome(async () => {
    const client = await session("member_memos");
    const acking = ack === true;
    const problem = acking ? signatureProblem(signature) : null;
    if (problem) throw new Error(problem);
    return rpc<MemoReceipt>(client, "member_acknowledge_memo", {
      p_memo: uuid(id, "Memo"),
      p_ack: acking,
      p_signature: acking ? signature : null,
    });
  });
}

export async function adminMemberAction(
  command: AdminMemberCommand & { action: "list" },
): Promise<MemberOutcome<AdminMemberData>>;
export async function adminMemberAction(
  command: AdminMemberCommand,
): Promise<MemberOutcome<unknown>>;
export async function adminMemberAction(
  command: AdminMemberCommand,
): Promise<MemberOutcome<unknown>> {
  return outcome(async () => {
    const client = await session();
    if (!command || typeof command.action !== "string")
      throw new Error("Select an action.");
    if (command.action === "list") {
      const data = await rpc<AdminMemberData>(client, "member_admin_snapshot");
      return {
        ...data,
        products: (data.products ?? []).map(publicProduct),
        requests: (data.requests ?? []).map(requestLabels),
      };
    }
    if (command.action === "invoice" || command.action === "signed_form") {
      // RLS authorizes either the submitter or the HR reviewer, never another member.
      // A claim's invoice, or a waiting list's signed application form (2026-10-10).
      const key = command.action === "invoice" ? "invoiceHash" : "signedFormHash";
      const what = command.action === "invoice" ? "invoice" : "signed form";
      const requestId = uuid(command.requestId, "request");
      const request = await client
        .from("member_requests")
        .select("detail")
        .eq("id", requestId)
        .maybeSingle();
      if (request.error || !request.data?.detail?.[key])
        throw new Error(`No accessible ${what} was found.`);
      const result = await client
        .from("member_request_attachments")
        .select("object_path, mime_type")
        .eq("request_id", requestId)
        .eq("content_sha256", request.data.detail[key])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (result.error || !result.data)
        throw new Error(`No accessible ${what} was found.`);
      // A browser opens a PDF or a picture where it is, but saves a Word file
      // (2026-10-20, once members could send one): it is handed over under
      // the name it was sent with, not the bucket's, and `download` says so.
      const name = String(request.data.detail.signedFormName ?? "").trim();
      const saved = command.action === "signed_form" && !!name && [WORD_DOCX, WORD_DOC].includes(result.data.mime_type);
      const signed = saved
        ? await client.storage.from("member-invoices").createSignedUrl(result.data.object_path, 120, { download: name })
        : await client.storage.from("member-invoices").createSignedUrl(result.data.object_path, 120);
      if (signed.error) throw new Error(signed.error.message);
      return { url: signed.data.signedUrl, expiresIn: 120, ...(saved ? { download: name } : {}) };
    }
    if (command.action === "publish_memo") {
      const departments = command.departments;
      if (!Array.isArray(departments))
        throw new Error("Select the departments for this memo.");
      return rpc(client, "member_publish_memo", {
        p_title: command.title,
        p_body: command.body,
        p_sender: command.sender,
        p_effective: command.effectiveAt,
        p_requires_ack: command.requiresAck !== false,
        p_departments: departments.map((id) => uuid(id, "department")),
        p_version: command.version ?? 1,
      });
    }
    if (command.action === "configure_product") {
      return rpc(client, "member_configure_product", {
        p_product: uuid(command.productId, "product"),
        p_category: command.category,
        p_size: command.size ?? "",
        p_color: command.color ?? "",
        p_gift: command.gift === true,
        p_available: command.available !== false,
      });
    }
    const { action, requestId, ...data } = command;
    return rpc(client, "member_admin_action", {
      p_action: action,
      p_request: requestId ? uuid(requestId, "request") : null,
      p_data: data,
    });
  });
}
