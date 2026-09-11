import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUser } from "@/lib/auth";
import { isPrincipalAccount } from "@/lib/view-as";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { calculateQuote, cents, customerQuote } from "./calculator";
import { isCompatibleGift, productImageUrl, quoteLineKey } from "./catalog";
import type {
  MemberBand,
  MemberData,
  MemberInsight,
  MemberMemo,
  MemberOrgMap,
  MemberProduct,
  MemberRequest,
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
const MAX_INVOICE = 3 * 1024 * 1024;
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
  const user = await getUser();
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
    brand: p.brand,
    category: p.category,
    size: p.size,
    color: p.color,
    available: p.available,
    gift: p.gift,
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

/** No demo fallback and no privileged row query: the database resolves the caller. */
export async function loadMemberData(): Promise<MemberData> {
  const user = await getUser();
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
    };
  } catch (error) {
    return { ...empty, message: message(error) };
  }
}

/**
 * Insight — live performance, fetched on demand rather than folded into the
 * member snapshot. The board spans a whole department, so making Today pay
 * for it on every load would slow the page most people open most often.
 */
export async function loadMemberInsight(
  period?: string,
): Promise<MemberOutcome<MemberInsight>> {
  return outcome(async () => {
    const client = await session("member_insight");
    const data = await rpc<MemberInsight>(client, "member_insight_snapshot", {
      p_period: /^\d{4}-\d{2}$/.test(period ?? "") ? period : null,
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

/** The mapping map behind My team. Names, titles and reporting lines; no pay. */
export async function loadMemberOrgMap(): Promise<MemberOutcome<MemberOrgMap>> {
  return outcome(async () => {
    const client = await session("member_portal");
    const data = await rpc<MemberOrgMap>(client, "member_org_map");
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

interface CostRow {
  id: string;
  item_code: string;
  product_name: string | null;
  brand_code: string | null;
  unit_cost: number | string | null;
  is_active: boolean;
  updated_at: string;
  member_product_options:
    | {
        category: string;
        size: string;
        color: string;
        gift: boolean;
        available: boolean;
        updated_at: string;
      }
    | {
        category: string;
        size: string;
        color: string;
        gift: boolean;
        available: boolean;
        updated_at: string;
      }[]
    | null;
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
    const lineKeys = input.lines.map((line) => {
      uuid(line?.productId, "product");
      if (
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > 100 ||
        typeof line.gift !== "boolean"
      )
        throw new Error("The product quantity is invalid.");
      return quoteLineKey(line);
    });
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
    const user = await getUser();
    const principalView = !!user && isPrincipalAccount(user);
    const client = await session("member_quote", principalView);
    const context = await rpc<{ bands: MemberBand[] }>(
      client,
      principalView ? "member_principal_quote_context" : "member_quote_context",
      { p_scheme: input.schemeId },
    );
    const brands = [...new Set(context.bands.map((b) => b.brand))];
    if (!brands.length)
      throw new Error("Margin rules have not been configured for Fair.");
    const admin = adminClient() as unknown as SupabaseClient;
    const projection =
      "id,item_code,product_name,brand_code,unit_cost,is_active,updated_at,member_product_options!inner(category,size,color,gift,available,updated_at)";
    // Fetch only selected products plus eligible pillow suggestions, never a
    // whole cost catalogue. Both reads follow successful session authorization.
    const [chosen, gifts] = await Promise.all([
      admin
        .from("comm_products")
        .select(projection)
        .in("id", ids)
        .in("brand_code", brands),
      admin
        .from("comm_products")
        .select(projection)
        .in("brand_code", brands)
        .eq("is_active", true)
        .eq("member_product_options.gift", true)
        .eq("member_product_options.available", true)
        .in("member_product_options.category", [
          "枕头",
          "Pillow",
          "pillow",
          "Pillows",
          "pillows",
        ])
        .limit(20),
    ]);
    if (chosen.error || gifts.error)
      throw new Error(chosen.error?.message ?? gifts.error!.message);
    const rows = new Map<string, CostRow>();
    for (const row of [
      ...(chosen.data ?? []),
      ...(gifts.data ?? []),
    ] as unknown as CostRow[])
      rows.set(row.id, row);
    const products: MemberProduct[] = [...rows.values()].flatMap((row) => {
      const option = Array.isArray(row.member_product_options)
        ? row.member_product_options[0]
        : row.member_product_options;
      if (!option || !row.brand_code) return [];
      return [
        {
          id: row.id,
          code: row.item_code,
          name: row.product_name ?? row.item_code,
          brand: row.brand_code,
          category: option.category,
          size: option.size,
          color: option.color,
          available: row.is_active && option.available,
          gift: option.gift,
          cost: row.unit_cost === null ? null : Number(row.unit_cost),
          version: `${row.updated_at}:${option.updated_at}`,
        },
      ];
    });
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
    const result = calculateQuote(input, products, context.bands);
    if (!result.valid)
      throw new Error(result.error ?? "The quote could not be calculated.");
    return { ...result, customerText: customerQuote(input, products, result) };
  });
}

interface VerifiedInvoice {
  bytes: Uint8Array;
  mime: string;
  extension: string;
  name: string;
}
async function invoice(form: FormData): Promise<VerifiedInvoice> {
  const file = form.get("invoice");
  if (!file || typeof file === "string" || file.size < 1)
    throw new Error("Upload an invoice.");
  if (file.size > MAX_INVOICE)
    throw new Error("The invoice must be 3 MB or smaller.");
  const bytes = new Uint8Array(await file.arrayBuffer());
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
    throw new Error("The invoice must be a valid JPG, PNG or PDF file.");
  return { bytes, mime, extension, name: file.name.slice(0, 200) };
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
    let verified: VerifiedInvoice | null = null;
    if (kind === "claim") {
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
      if (kind === "replacement")
        detail.replacementSource = field(form, "replacementSource") || "new";
      if (!detail.newPerson && detail.replacementSource !== "vacancy")
        throw new Error("Enter the new member name.");
      if (kind === "waiting") {
        const consent = form.get("consent");
        Object.assign(detail, {
          contact: field(form, "contact", 60),
          start: date(field(form, "start"), "preferred start date"),
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
        p_detail: detail,
        p_idempotency: key,
        p_revision: revision,
      },
    );
    if (kind === "claim" && prepared.status === "draft" && verified) {
      const existing = await client
        .from("member_request_attachments")
        .select("id")
        .eq("request_id", prepared.id)
        .eq("content_sha256", detail.invoiceHash)
        .limit(1);
      if (existing.error) throw new Error(existing.error.message);
      if (!existing.data?.length) {
        const path = `${prepared.userId}/${prepared.id}/${randomUUID()}.${verified.extension}`;
        const upload = await client.storage
          .from("member-invoices")
          .upload(path, verified.bytes, {
            contentType: verified.mime,
            upsert: false,
          });
        if (upload.error) throw new Error(upload.error.message);
        // Only service-role can attest attachments; members cannot spoof the
        // MIME validation by invoking the submission RPC directly.
        const attestation = await (adminClient() as unknown as SupabaseClient)
          .from("member_request_attachments")
          .insert({
            request_id: prepared.id,
            uploaded_by: prepared.userId,
            object_path: path,
            mime_type: verified.mime,
            size_bytes: verified.bytes.length,
            content_sha256: detail.invoiceHash,
          });
        if (attestation.error) {
          await client.storage.from("member-invoices").remove([path]);
          throw new Error(attestation.error.message);
        }
      }
    }
    return requestLabels(
      await rpc<MemberRequest>(client, "member_submit_request", {
        p_request: prepared.id,
      }),
    );
  });
}

export async function acknowledgeMemberMemo(
  id: string,
  ack: boolean,
): Promise<MemberOutcome<MemoReceipt>> {
  return outcome(async () => {
    const client = await session("member_memos");
    return rpc<MemoReceipt>(client, "member_acknowledge_memo", {
      p_memo: uuid(id, "Memo"),
      p_ack: ack === true,
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
    if (command.action === "invoice") {
      // RLS authorizes either the submitter or the HR reviewer, never another member.
      const requestId = uuid(command.requestId, "request");
      const request = await client
        .from("member_requests")
        .select("detail")
        .eq("id", requestId)
        .maybeSingle();
      if (request.error || !request.data?.detail?.invoiceHash)
        throw new Error("No accessible invoice was found.");
      const result = await client
        .from("member_request_attachments")
        .select("object_path")
        .eq("request_id", requestId)
        .eq("content_sha256", request.data.detail.invoiceHash)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (result.error || !result.data)
        throw new Error("No accessible invoice was found.");
      const signed = await client.storage
        .from("member-invoices")
        .createSignedUrl(result.data.object_path, 120);
      if (signed.error) throw new Error(signed.error.message);
      return { url: signed.data.signedUrl, expiresIn: 120 };
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
