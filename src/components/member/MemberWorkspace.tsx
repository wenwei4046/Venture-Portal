/* Local invoice and signature previews use object/data URLs without image proxying. */
/* eslint-disable @next/next/no-img-element */
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import InstallSteps from "@/components/pwa/InstallSteps";
import { useInstallApp } from "@/components/pwa/install-store";
import { bandFor } from "@/lib/member/calculator";
import MemberInsightPanel from "./MemberInsightPanel";
import MemberOrgMap from "./MemberOrgMap";
import MemberQuoteBuilder from "./MemberQuoteBuilder";
import MemberSearch, { type MemberSearchItem } from "./MemberSearch";
import PortalViewSwitcher from "@/components/layout/PortalViewSwitcher";
import PrincipalRevenuePanels, { RevenueManagementButton } from "./PrincipalRevenuePanels";
import CrmApp from "./crm/CrmApp";
import principalStyles from "./PrincipalRevenuePanels.module.css";
import { categoryLabel } from "@/lib/member/catalog";
import {
  getMemberBackTarget,
  goMemberBack,
  MEMBER_ROUTE_CHANGE,
  pushMemberRoute,
} from "@/lib/member/navigation";
import { memberInsightDemo, memberOrgMapDemo } from "@/lib/member/demo-insight";
import { selectOwnTeam } from "@/lib/member/team-directory";
import { selectViewedBranch } from "@/lib/member/principal-context";
import type {
  MemberData,
  MemberInsight,
  MemberMembership,
  MemberMemo,
  MemberOrgMap as MemberOrgMapData,
  MemberPage,
  MemberRequest,
  MemberReadContext,
  QuoteInput,
  RequestKind,
} from "@/lib/member/types";
import {
  submitMemberRequest,
  acknowledgeMemberMemo,
  fetchMemberInsight,
  fetchMemberOrgMap,
  refreshMemberData,
} from "@/app/(member)/member/actions";
import {
  Empty,
  Icon,
  Pill,
  Progress,
  date,
  fmt,
  initials,
} from "./MemberUI";
import memberStyles from "./member.module.css";
import previewStyles from "./design-preview/RevenueWorkspacePreview.module.css";
import { RevenuePreviewHeader, RevenuePreviewNav } from "./design-preview/RevenuePreviewChrome";
import { BrandMarginList } from "./design-preview/BrandMarginList";
import { selectOrders, summarizeBrandMargins } from "./design-preview/insight-model";
import motion from "./design-preview/ArenaMotion.module.css";
import TodayKpiSummary from "./design-preview/TodayKpiSummary";
import { todayKpiSummary } from "./design-preview/today-kpi-model";
import liveStyles from "./MemberLiveWorkspace.module.css";
import { MemberLiveHeader, MemberLiveNav } from "./MemberLiveChrome";
import { LiveBrandMarginList, hasCompleteLiveOrders, hasNoGoodsMargin } from "./LiveBrandMarginList";
import { fetchMemberKpiSummary } from "@/app/(member)/member/kpi-summary-actions";
import type { MemberKpiSummary } from "@/lib/member/kpi-summary";
import MemberArena from "./MemberArena";
import { stageFiles } from "@/lib/storage/stage";

const s = memberStyles;
// Shared presentation classes keep the approved C design consistent across roles.
const previewClassNames = Object.fromEntries(
  Object.entries(memberStyles).map(([name, className]) => [
    name,
    previewStyles[name] ? `${className} ${previewStyles[name]}` : className,
  ]),
);

const labels: Record<MemberPage, string> = {
  today: "Today",
  insight: "Insight",
  arena: "Arena",
  income: "My income",
  quote: "Quick quote",
  team: "My team",
  requests: "Requests",
  memos: "Memos & notifications",
  crm: "CRM",
  account: "Profile",
};
const statusLabels: Record<string, string> = {
  draft: "Draft",
  submitted: "Awaiting HR review",
  approved: "Approved",
  rejected: "Rejected",
  returned: "More information needed",
  needs_info: "More information needed",
  accepted: "Accepted by applicant",
  waiting: "Waiting list",
  reserved: "Position reserved",
  confirmed: "Interest confirmed",
  scheduled: "Scheduled",
  executed: "Executed",
  allocated: "Allocated",
  paid: "Paid",
  withdrawn: "Withdrawn",
  expired: "Reservation expired",
  applied: "Settled",
};
const requestFieldLabels: Record<string, string> = {
  category: "Claim category",
  amount: "Claim amount",
  location: "Location",
  start: "Start / joining date",
  end: "End date",
  newPerson: "New member / replacement",
  department: "Requesting department",
  subDepartmentId: "Requesting department",
  targetDepartmentId: "Preferred / receiving department",
  destination: "Original member arrangement",
  replacementSource: "Replacement source",
  effective: "Planned effective date",
  reason: "Reason and details",
  invoiceName: "Invoice",
  contact: "Phone number",
  signature: "Signed by",
  originalStaffId: "Original member",
  allocatedStaffId: "Linked new member",
  reservationExpiresAt: "Reservation expires",
};
const requestValueLabels: Record<string, string> = {
  department_exit: "Leave this department only",
  member_exit: "Leave this department only",
  transfer: "Transfer to another department",
  company_exit: "Leave the company",
  resignation: "Leave the company",
  exit: "Leave the company",
  new: "New member joining",
  existing: "Existing member",
  waiting: "Waiting List",
  vacancy: "Release position without replacement",
};
// Translate historical category values without changing stored requests.
const legacyClaimCategories: Record<string, string> = {
  "Outstation 住宿": "Outstation accommodation",
  "Airbnb 住宿": "Airbnb accommodation",
};
function requestValue(key: string, value: unknown, data: MemberData) {
  const raw = String(value);
  if (key === "category") return legacyClaimCategories[raw] ?? raw;
  if (key === "amount")
    return Number.isFinite(Number(value)) ? fmt(Number(value)) : raw;
  if (key === "destination" || key === "replacementSource")
    return requestValueLabels[raw] ?? raw;
  if (key === "subDepartmentId" || key === "targetDepartmentId")
    return (
      (data.departments ?? data.memberships).find((d) => d.id === raw)?.name ??
      `Department ID · ${raw}`
    );
  if (key === "originalStaffId" || key === "allocatedStaffId")
    return (
      data.memberships.flatMap((m) => m.people).find((p) => p.id === raw)
        ?.name ?? `Member ID · ${raw}`
    );
  if (key === "reservationExpiresAt")
    return new Date(raw).toLocaleString("en-MY", {
      timeZone: "Asia/Kuala_Lumpur",
    });
  return raw;
}
function formDestination(value: unknown) {
  return value === "member_exit"
    ? "department_exit"
    : value === "resignation" || value === "exit"
      ? "company_exit"
      : String(value ?? "department_exit");
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const shell = document.getElementById("member-shell");
    shell?.setAttribute("inert", "");
    (
      ref.current?.querySelector<HTMLElement>("[data-autofocus]") ??
      ref.current?.querySelector<HTMLButtonElement>("button")
    )?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = [
          ...(ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          ) ?? []),
        ].filter((el) => el.getClientRects().length);
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = scroll;
      shell?.removeAttribute("inert");
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className={s.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={s.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-dialog-title"
        ref={ref}
      >
        <header className={s.dialogHeader}>
          <h2 id="member-dialog-title">{title}</h2>
          <button className={s.iconButton} onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className={s.dialogBody}>{children}</div>
      </section>
    </div>
  );
}

export default function MemberWorkspace({
  initialData,
  previewDesign,
  productionLayout = false,
}: {
  initialData: MemberData;
  previewDesign?: "a" | "c";
  /** Admin/development preview of the responsive live layout, with explicit sample data. */
  productionLayout?: boolean;
}) {
  const liveDesign = !initialData.demo || productionLayout;
  const isDesignPreview = initialData.demo && !!previewDesign;
  const design = liveDesign ? "c" : initialData.demo ? previewDesign : undefined;
  const s = liveDesign ? Object.fromEntries(Object.entries(previewClassNames).map(([name, className]) => [
    name, liveStyles[name] ? `${className} ${liveStyles[name]}` : className,
  ])) : design ? previewClassNames : memberStyles;
  const [data, setData] = useState(initialData),
    [page, setPage] = useState<MemberPage>("today"),
    [department, setDepartment] = useState(
      initialData.memberships[0]?.id ?? "",
    ),
    [privateMode, setPrivateMode] = useState(false),
    [dark, setDark] = useState(false),
    [online, setOnline] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [toast, setToast] = useState("");
  const [dialog, setDialog] = useState<{
      title: string;
      content: ReactNode;
    } | null>(null),
    [requestKind, setRequestKind] = useState<RequestKind | null>(null),
    [revisionRequest, setRevisionRequest] = useState<MemberRequest | null>(
      null,
    ),
    [selectedMemo, setSelectedMemo] = useState<string | null>(null),
    [selectedRequest, setSelectedRequest] = useState<string | null>(null),
    [period, setPeriod] = useState(""),
    [orderFilter, setOrderFilter] = useState("All"),
    [requestFilter, setRequestFilter] = useState("All"),
    [treeMode, setTreeMode] = useState(true),
    [teamSearch, setTeamSearch] = useState(""),
    [busyAck, setBusyAck] = useState(false);
  // Profile › Install the app: a real prompt on Android, the Share steps on
  // iOS, nothing once opened from the home screen (src/lib/pwa/install.ts).
  const appInstall = useInstallApp();
  // Insight and the team map are fetched when their tab is first opened: a
  // department-wide board on every Today load would slow the page most people
  // open most often, for a number most of them are not looking at.
  const [insight, setInsight] = useState<MemberInsight | null>(null),
    [insightBusy, setInsightBusy] = useState(false),
    [insightError, setInsightError] = useState<string | null>(null),
    [orgMap, setOrgMap] = useState<MemberOrgMapData | null>(null),
    [mapBusy, setMapBusy] = useState(false),
    [mapError, setMapError] = useState<string | null>(null);
  const [viewedStaffId, setViewedStaffId] = useState("");
  // The member the Principal picked in Today, for the CRM (null: none picked — the CRM shows everyone).
  const [crmViewing, setCrmViewing] = useState<string | null>(null);
  const [insightEntry, setInsightEntry] = useState<{ screen: "overview" | "orders"; brand?: string }>({ screen: "overview" });
  const insightSequence = useRef(0);
  const mapSequence = useRef(0);
  const [liveKpi, setLiveKpi] = useState<MemberKpiSummary | null>(null);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const membershipsRef = useRef(data.memberships);
  const principalView = data.principalView === true;
  membershipsRef.current = data.memberships;
  const member =
    data.memberships.find((m) => m.id === department) ?? data.memberships[0];
  const viewedPerson = principalView ? member?.people.find(person => person.id === viewedStaffId) ?? member?.people[0] : undefined;
  const selectedStaffId = viewedPerson?.id;
  const departmentId = member?.id;
  const readContext = useMemo<MemberReadContext | undefined>(() => principalView && selectedStaffId && departmentId
    ? { staffId: selectedStaffId, subDepartmentId: departmentId } : undefined, [principalView, selectedStaffId, departmentId]);
  const contextKey = principalView ? `${member?.id ?? ""}:${viewedPerson?.id ?? ""}` : "self";
  const canReadPerformance = !principalView || !!readContext;
  const currentIncomes = data.incomes
    .filter((i) => i.schemeId === member?.schemeId)
    .sort((a, b) => b.period.localeCompare(a.period));
  const income =
    currentIncomes.find((i) => i.period === period) ?? currentIncomes[0];
  const memos = data.memos.filter(
    (m) => !m.departments.length || m.departments.includes(member?.name ?? ""),
  );
  const actionCount = principalView ? 0 : memos.filter(
    (m) => m.requiresAck && !m.acknowledgedAt,
  ).length;
  const attentionCount =
    actionCount +
    data.requests.filter((r) =>
      ["returned", "needs_info", "reserved"].includes(r.status),
    ).length;
  const quoteInputInitial: QuoteInput = {
    schemeId: member?.schemeId ?? "",
    price: "",
    delivery: "0",
    lines: [],
  };
  const [quoteInput, setQuoteInput] = useState(quoteInputInitial);
  const [productSelection, setProductSelection] = useState<{
    id: string;
    key: number;
  } | null>(null);
  const searchSequence = useRef(0);
  const [backTarget, setBackTarget] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null),
    toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeDialog = useCallback(() => {
    setDialog(null);
    setRequestKind(null);
    setRevisionRequest(null);
    setSelectedMemo(null);
    setSelectedRequest(null);
  }, []);
  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(""), 4200);
  }, []);
  const navigate = useCallback((next: MemberPage) => {
    if (isDesignPreview && next === "insight") {
      window.location.assign(`/member/preview?design=${design}&view=insight`);
      return;
    }
    if (next !== "quote") setProductSelection(null);
    setInsightEntry({ screen: "overview" });
    setPage(next);
    const url = new URL(window.location.href);
    if (isDesignPreview && design) {
      url.searchParams.set("design", design);
      url.searchParams.delete("view");
    }
    url.searchParams.set("page", next);
    url.searchParams.delete("screen");
    url.searchParams.delete("brand");
    pushMemberRoute(url);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [design, isDesignPreview]);
  useEffect(() => {
    function updateBackTarget() {
      const current = new URL(window.location.href);
      const currentPage = current.searchParams.get("page") || "today";
      const isEntryPage =
        currentPage === "today" ||
        (currentPage === "quote" &&
          current.searchParams.get("quoteView") !== "calculator");
      setBackTarget(isEntryPage ? null : getMemberBackTarget()?.href ?? null);
    }
    updateBackTarget();
    window.addEventListener(MEMBER_ROUTE_CHANGE, updateBackTarget);
    window.addEventListener("popstate", updateBackTarget);
    return () => {
      window.removeEventListener(MEMBER_ROUTE_CHANGE, updateBackTarget);
      window.removeEventListener("popstate", updateBackTarget);
    };
  }, []);
  const backLabel = backTarget
    ? (() => {
        const target = new URL(backTarget);
        const destination = target.searchParams.get("page") as MemberPage;
        return destination === "quote"
          ? target.searchParams.get("quoteView") === "calculator"
            ? "Back to calculator"
            : "Back to products"
          : `Back to ${labels[destination] ?? "Today"}`;
      })()
    : "Back";
  function handleBack() {
    closeDialog();
    goMemberBack();
  }
  useEffect(() => {
    function readUrl() {
      setProductSelection(null);
      const url = new URL(window.location.href);
      const p = url.searchParams.get("page");
      const d = url.searchParams.get("department");
      const selected =
        membershipsRef.current.find((m) => m.id === d) ??
        membershipsRef.current[0];
      let next: MemberPage =
        p && Object.hasOwn(labels, p) ? (p as MemberPage) : "today";
      if (next === "quote" && !selected?.calculator) next = "today";
      setPage(next);
      setInsightEntry({ screen: url.searchParams.get("screen") === "orders" ? "orders" : "overview", brand: url.searchParams.get("brand") ?? undefined });
      setDepartment(selected?.id ?? "");
      setViewedStaffId(initialData.principalView ? selected?.people.find(person => person.id === url.searchParams.get("staff"))?.id ?? selected?.people[0]?.id ?? "" : "");
      // The CRM opens on a member only when the Principal picked one (the URL names them), not on the first by default.
      setCrmViewing(initialData.principalView ? selected?.people.find(person => person.id === url.searchParams.get("staff"))?.id ?? null : null);
      if (p && p !== next) {
        url.searchParams.set("page", next);
        history.replaceState(history.state, "", url);
      }
      closeDialog();
    }
    function onBackNavigation() {
      readUrl();
      window.scrollTo({ top: 0, behavior: "instant" });
      requestAnimationFrame(() =>
        mainRef.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true }),
      );
    }
    readUrl();
    setDark(document.documentElement.dataset.theme === "dark");
    setOnline(navigator.onLine);
    try {
      setPrivateMode(localStorage.getItem("member-hide-amounts") === "true");
      const saved = JSON.parse(
        localStorage.getItem(`member-cart-v1-${initialData.profile.userId}`) ??
          "null",
      );
      if (
        saved &&
        Array.isArray(saved.lines) &&
        typeof saved.price === "string" &&
        typeof saved.delivery === "string"
      )
        setQuoteInput(saved);
      if (initialData.demo) {
        const d = JSON.parse(localStorage.getItem("member-demo-v3") ?? "null");
        if (d && Array.isArray(d.requests) && Array.isArray(d.memos))
          setData((old) => ({ ...old, requests: d.requests, memos: d.memos }));
      }
    } catch {}
    window.addEventListener("popstate", onBackNavigation);
    const onOnline = () => setOnline(true),
      onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("popstate", onBackNavigation);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
    };
  }, [initialData]);
  useEffect(() => {
    if (member) {
      setQuoteInput((q) =>
        q.schemeId === member.schemeId
          ? q
          : { ...q, schemeId: member.schemeId },
      );
      const url = new URL(window.location.href);
      let changed = false;
      if (department !== member.id) {
        setDepartment(member.id);
        url.searchParams.set("department", member.id);
        changed = true;
      }
      if (!member.calculator && page === "quote") {
        setPage("today");
        url.searchParams.set("page", "today");
        changed = true;
      }
      if (changed) history.replaceState(history.state, "", url);
    }
  }, [member, page, department]);
  useEffect(() => {
    setPeriod("");
    setOrderFilter("All");
    setTeamSearch("");
  }, [member?.id]);
  useEffect(() => {
    try {
      localStorage.setItem("member-hide-amounts", String(privateMode));
    } catch {}
  }, [privateMode]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          `member-cart-v1-${data.profile.userId}`,
          JSON.stringify(quoteInput),
        );
      } catch {}
    }, 350);
    return () => clearTimeout(timer);
  }, [quoteInput, data.profile.userId]);
  useEffect(() => {
    if (data.demo) {
      try {
        localStorage.setItem(
          "member-demo-v3",
          JSON.stringify({ requests: data.requests, memos: data.memos }),
        );
      } catch {}
    }
  }, [data]);
  useEffect(() => {
    ++insightSequence.current;
    ++mapSequence.current;
    setInsight(null);
    setInsightBusy(false);
    setInsightError(null);
    setOrgMap(null);
    setMapBusy(false);
    setMapError(null);
    setLiveKpi(null);
    setKpiError(null);
    setTeamSearch("");
  }, [contextKey]);
  const refresh = useCallback(async () => {
    if (data.demo) {
      notify("Demo data retained. Live accounts refresh the latest data.");
      return;
    }
    setRefreshing(true);
    try {
      const result = await refreshMemberData();
      if (result.ok && result.data) setData(result.data);
      else notify(result.error ?? "Unable to refresh data. Please try again.");
    } catch {
      notify("Unable to connect. Your current data is preserved.");
    } finally {
      setRefreshing(false);
    }
  }, [data.demo, notify]);
  const loadInsight = useCallback(async (selectedPeriod?: string) => {
    if (principalView && !readContext) return;
    if (data.demo) {
      setInsight(memberInsightDemo());
      return;
    }
    setInsightBusy(true);
    setInsightError(null);
    const sequence = ++insightSequence.current;
    try {
      const result = await (readContext ? fetchMemberInsight(selectedPeriod, readContext) : fetchMemberInsight(selectedPeriod));
      if (sequence !== insightSequence.current) return;
      if (result.ok) setInsight(result.data);
      else setInsightError(result.error);
    } catch {
      if (sequence === insightSequence.current) setInsightError("Unable to connect. Check your connection and try again.");
    } finally {
      if (sequence === insightSequence.current) setInsightBusy(false);
    }
  }, [data.demo, principalView, readContext]);
  const loadOrgMap = useCallback(async () => {
    if (principalView && !departmentId) return;
    if (data.demo) {
      setOrgMap(memberOrgMapDemo());
      return;
    }
    setMapBusy(true);
    setMapError(null);
    const sequence = ++mapSequence.current;
    try {
      const result = await (principalView ? fetchMemberOrgMap({ subDepartmentId: departmentId! }) : fetchMemberOrgMap());
      if (sequence !== mapSequence.current) return;
      if (result.ok) setOrgMap(result.data);
      else setMapError(result.error);
    } catch {
      if (sequence === mapSequence.current) setMapError("Unable to connect. Check your connection and try again.");
    } finally {
      if (sequence === mapSequence.current) setMapBusy(false);
    }
  }, [data.demo, principalView, departmentId]);
  useEffect(() => {
    if (canReadPerformance && page === "insight" && !insight && !insightBusy && !insightError) void loadInsight();
    if (page === "team" && !orgMap && !mapBusy && !mapError) void loadOrgMap();
  }, [page, canReadPerformance, liveDesign, insight, insightBusy, insightError, orgMap, mapBusy, mapError, loadInsight, loadOrgMap]);
  useEffect(() => {
    if (liveDesign && canReadPerformance && page === "today") void loadInsight();
  }, [liveDesign, canReadPerformance, page, data.refreshedAt, loadInsight]);
  useEffect(() => {
    if (!liveDesign || !canReadPerformance || data.demo || page !== "today" || !member?.calculator) return;
    let active = true;
    setLiveKpi(null);
    setKpiError(null);
    (readContext ? fetchMemberKpiSummary(member.schemeId, readContext) : fetchMemberKpiSummary(member.schemeId)).then(result => {
      if (!active) return;
      if (result.ok) setLiveKpi(result.data);
      else setKpiError(result.error);
    }).catch(() => { if (active) setKpiError("KPI quantities could not be loaded. Please refresh."); });
    return () => { active = false; };
  }, [liveDesign, canReadPerformance, readContext, data.demo, data.refreshedAt, page, member?.schemeId, member?.calculator]);
  useEffect(() => {
    if (data.demo) return;
    const timer = setInterval(() => {
      if (!document.hidden && navigator.onLine) void refresh();
    }, 60000);
    return () => clearInterval(timer);
  }, [data.demo, refresh]);
  const money = (value: number | null | undefined) =>
    privateMode ? "••••••" : value == null ? "To be confirmed" : fmt(value);
  function changeDepartment(value: string) {
    setProductSelection(null);
    setDepartment(value);
    setPeriod("");
    setOrderFilter("All");
    setTeamSearch("");
    const url = new URL(window.location.href);
    url.searchParams.set("department", value);
    if (principalView) {
      ++insightSequence.current;
      ++mapSequence.current;
      setInsight(null);
      setOrgMap(null);
      setLiveKpi(null);
      setInsightEntry({ screen: "overview" });
      const staffId = data.memberships.find(membership => membership.id === value)?.people[0]?.id ?? "";
      setViewedStaffId(staffId);
      if (staffId) url.searchParams.set("staff", staffId); else url.searchParams.delete("staff");
      url.searchParams.delete("screen");
      url.searchParams.delete("brand");
      closeDialog();
    }
    if (
      page === "quote" &&
      !data.memberships.find((m) => m.id === value)?.calculator
    ) {
      setPage("today");
      url.searchParams.set("page", "today");
    }
    history.replaceState(history.state, "", url);
    window.dispatchEvent(new Event(MEMBER_ROUTE_CHANGE));
  }
  function changeViewedStaff(value: string) {
    if (!member?.people.some(person => person.id === value)) return;
    ++insightSequence.current;
    ++mapSequence.current;
    setInsight(null);
    setOrgMap(null);
    setLiveKpi(null);
    setViewedStaffId(value);
    setCrmViewing(value);
    setInsightEntry({ screen: "overview" });
    closeDialog();
    const url = new URL(window.location.href);
    url.searchParams.set("staff", value);
    url.searchParams.delete("screen");
    url.searchParams.delete("brand");
    history.replaceState(history.state, "", url);
  }
  function theme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  }
  function openWorkspaceSearch() {
    const quotedProduct = quoteInput.lines.find((line) => !line.gift);
    const quotedBrand = data.products.find(
      (product) => product.id === quotedProduct?.productId,
    )?.brand;
    const items: (MemberSearchItem & { action: () => void })[] = [
      {
        id: "today",
        label: "Today",
        description: "Your daily progress",
        keywords: "home dashboard kpi target",
        group: "Quick links",
        action: () => navigate("today"),
      },
      ...(member?.calculator
        ? [
            {
              id: "quote",
              label: "Products & calculator",
              description: "Build an offer and check margin",
              keywords:
                "quote quotation price mattress sofa bed frame accessory",
              group: "Quick links",
              action: () => navigate("quote"),
            },
          ]
        : []),
      ...[
            {
              id: "insight",
              label: "Insight",
              description: "Live sales, ranking and downline · in Profile",
              keywords: "ranking leaderboard margin downline performance target 100k profile",
              group: "Quick links",
              action: () => navigate("insight"),
            },
          ],
      { id: "arena", label: "Arena", description: "Sales, margin and KPI rankings", keywords: "leaderboard brand weeks championship", group: "Quick links", action: () => navigate("arena") },
      {
        id: "income",
        label: principalView ? "Team income" : "My income",
        description: "Commission, salary and incentives",
        keywords: "rank payout earnings",
        group: "Quick links",
        action: () => navigate("income"),
      },
      {
        id: "team",
        label: principalView ? "Team hierarchy" : "My team",
        description: "People and reporting relationships",
        keywords: "hierarchy members capacity",
        group: "Quick links",
        action: () => navigate("team"),
      },
      {
        id: "requests",
        label: "Requests",
        description: "Claims, replacement and waiting list",
        keywords: "hr submit reimbursement invoice outstation",
        group: "Quick links",
        action: () => navigate("requests"),
      },
      {
        id: "memos",
        label: "Memos & notifications",
        description: "Updates from your team",
        keywords: "announcements hr acknowledge",
        group: "Quick links",
        action: () => navigate("memos"),
      },
      {
        id: "account",
        label: principalView ? "Principal profile" : "Profile",
        description: "Insight, department, appearance and preferences",
        keywords: "settings account profile insight dark light fair ir switch",
        group: "Quick links",
        action: () => navigate("account"),
      },
      ...(member?.calculator
        ? data.products
            .filter(
              (product) =>
                product.available &&
                (!quotedBrand || product.brand === quotedBrand),
            )
            .map((product) => ({
              id: `product:${product.id}`,
              label: `${product.name} · ${product.size}`,
              description: [
                product.brand,
                categoryLabel(product.category),
                product.color,
              ]
                .filter(Boolean)
                .join(" · "),
              keywords: `${product.code} product${product.gift ? " free gift eligible" : ""}`,
              group: "Products",
              action: () => {
                const url = new URL(window.location.href);
                url.searchParams.set("quoteView", "catalog");
                window.history.replaceState({}, "", url);
                setProductSelection({
                  id: product.id,
                  key: ++searchSequence.current,
                });
                navigate("quote");
              },
            }))
        : []),
      ...(principalView ? selectViewedBranch(member?.people ?? [], viewedPerson?.id ?? "") : selectOwnTeam(member?.people ?? [])).map((person) => ({
        id: `person:${person.id}`,
        label: person.name,
        description: person.title,
        keywords: person.rank,
        group: "People",
        action: () => {
          setTeamSearch(person.name);
          navigate("team");
        },
      })),
      ...memos.map((memo) => ({
        id: `memo:${memo.id}`,
        label: memo.title,
        description: memo.sender,
        keywords: memo.body,
        group: "Memos",
        action: () => {
          navigate("memos");
          setSelectedMemo(memo.id);
        },
      })),
    ];
    setDialog({
      title: "Search workspace",
      content: (
        <MemberSearch
          items={items}
          onSelect={(id) => {
            const item = items.find((entry) => entry.id === id);
            if (!item) return;
            closeDialog();
            item.action();
          }}
        />
      ),
    });
  }
  function showScheme() {
    setDialog({
      title: `${member?.name ?? "Revenue"} · My commission scheme`,
      content: (
        <div className={s.stack}>
          <div className={s.notice}>
            <Icon name="info" />
            <span>
              Title, commission rank and fixed salary are managed separately.
              Your settlement statement confirms actual earnings.
            </span>
          </div>
          <dl className={s.dl}>
            <dt>Current title</dt>
            <dd>{member?.title || "Not assigned"}</dd>
            <dt>Current rank</dt>
            <dd>{member?.rank || "Not configured"}</dd>
            <dt>Current commission rate</dt>
            <dd>{((member?.rate ?? 0) * 100).toFixed(1)}%</dd>
            <dt>This month&apos;s payroll rank</dt>
            <dd>{income?.rank || "No settlement yet"}</dd>
            <dt>Fixed salary</dt>
            <dd>{money(data.profile.salary)}</dd>
            <dt>Appointment effective date</dt>
            <dd>{member?.effective}</dd>
          </dl>
          {member?.calculator ? (
            <>
              <h3>Margin tiers · current rules</h3>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Brand</th>
                      <th>Tier</th>
                      <th>Threshold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bands
                      .filter((b) => b.kind !== "penalty")
                      .map((b, i) => (
                        <tr key={i}>
                          <td>{b.brand}</td>
                          <td>{b.key}</td>
                          <td>≥ {b.threshold}%</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <p className={s.sub}>
                Every sold brand must meet its monthly threshold to qualify for
                the margin incentive. Gift costs are included; delivery and
                disposal charges are excluded.
              </p>
            </>
          ) : (
            <p className={s.sub}>
              IR has its own team rewards and commission scheme. Fair gift KPIs
              and margin incentives do not apply.
            </p>
          )}
          <p className={s.caption}>
            Promotions follow your department&apos;s eligibility rules and
            official HR records. Unconfigured targets are not treated as
            achieved.
          </p>
        </div>
      ),
    });
  }
  async function readMemo(m: MemberMemo) {
    setSelectedMemo(m.id);
    if (principalView) return;
    if (m.readAt) return;
    if (data.demo) {
      setData((d) => ({
        ...d,
        memos: d.memos.map((x) =>
          x.id === m.id ? { ...x, readAt: new Date().toISOString() } : x,
        ),
      }));
      return;
    }
    try {
      const result = await acknowledgeMemberMemo(m.id, false);
      if (result.ok)
        setData((d) => ({
          ...d,
          memos: d.memos.map((x) =>
            x.id === m.id ? { ...x, readAt: new Date().toISOString() } : x,
          ),
        }));
      else
        notify(result.error ?? "Unable to save read status. Please try again.");
    } catch {
      notify("Unable to save read status right now.");
    }
  }
  async function ackMemo(m: MemberMemo) {
    if (principalView) return;
    setBusyAck(true);
    try {
      if (!data.demo) {
        const result = await acknowledgeMemberMemo(m.id, true);
        if (!result.ok) {
          notify(result.error ?? "Unable to confirm. Please try again.");
          return;
        }
      }
      setData((d) => ({
        ...d,
        memos: d.memos.map((x) =>
          x.id === m.id
            ? {
                ...x,
                readAt: x.readAt ?? new Date().toISOString(),
                acknowledgedAt: new Date().toISOString(),
              }
            : x,
        ),
      }));
      notify(
        data.demo
          ? "Demo acknowledgement recorded"
          : "Acknowledgement recorded",
      );
    } catch {
      notify("Unable to confirm. Your reading position is preserved.");
    } finally {
      setBusyAck(false);
    }
  }
  function requestCreated(request: MemberRequest) {
    setData((d) => ({
      ...d,
      requests: [request, ...d.requests.filter((r) => r.id !== request.id)],
    }));
    closeDialog();
    navigate("requests");
    notify(
      data.demo
        ? "Demo request saved. You can view its progress."
        : "Request submitted to HR.",
    );
  }
  const navItems: { page: MemberPage; icon: string; label: string }[] = [
    { page: "today", icon: "home", label: "Today" },
    { page: "income", icon: "wallet", label: "Income" },
    ...(member?.calculator
      ? [{ page: "quote" as const, icon: "calculator", label: "Quote" }]
      : []),
    { page: "team", icon: "team", label: "Team" },
    { page: "account", icon: "user", label: "Profile" },
  ];
  const renderNav = (desktop = false) =>
    (desktop
      ? [
          ...navItems.slice(0, -1),
          { page: "requests" as const, icon: "receipt", label: "Requests" },
          { page: "memos" as const, icon: "bell", label: "Memos" },
          navItems[navItems.length - 1],
        ]
      : navItems
    ).map((n) => (
      <button
        key={n.page}
        className={`${s.navButton} ${n.page === "quote" ? s.navPrimary : ""}`}
        aria-current={
          page === n.page ||
          (n.page === "account" &&
            (page === "insight" ||
              (!desktop && ["requests", "memos"].includes(page))))
            ? "page"
            : undefined
        }
        onClick={() => navigate(n.page)}
      >
        <Icon name={n.icon} />
        <span>{n.label}</span>
        {desktop && n.page === "memos" && actionCount > 0 ? (
          <Pill tone="warning">{actionCount}</Pill>
        ) : null}
      </button>
    ));

  function MarginBrands() {
    if (!member?.calculator) return null;
    if (!canReadPerformance) return null;
    if (liveDesign && page === "today") {
      const currentMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).format(new Date());
      if (insightBusy || !insight || insight.period !== currentMonth) return <section className={s.card} aria-label="This month's margin">
        <h2>This month&apos;s margin</h2><p className={s.sub} role="status">{insightError ?? "Loading current brand margins…"}</p>
        {insightError && <button className={s.link} onClick={() => void loadInsight()}>Try again</button>}
      </section>;
      const block = insight.blocks.find(item => item.membershipId === member.id);
      return <LiveBrandMarginList title="This month's margin" orders={block?.orders ?? []} bands={data.bands}
        privateMode={privateMode} complete={block ? hasCompleteLiveOrders(block) : false}
        onBrand={brand => {
          navigate("insight");
          setInsightEntry({ screen: "orders", brand });
          const url = new URL(window.location.href);
          url.searchParams.set("screen", "orders");
          url.searchParams.set("brand", brand);
          history.replaceState(history.state, "", url);
        }} />;
    }
    if (isDesignPreview && design && page === "today") {
      return (
        <BrandMarginList
          title="This month's margin"
          rows={summarizeBrandMargins(selectOrders({ personId: "jia", period: "month" }))}
          hrefForBrand={(brand) => `/member/preview?${new URLSearchParams({
            design, view: "insight-orders", brand,
          })}`}
        />
      );
    }
    return (
      <section className={s.card}>
        <div className={s.sectionHead}>
          <h2>This month&apos;s margin</h2>
          <Pill tone="neutral">By brand</Pill>
        </div>
        {income?.brands.length ? (
          income.brands.map((b) => {
            const band = bandFor(
              b.margin,
              data.bands.filter((x) => x.brand === b.brand),
            );
            return (
              <div className={s.listRow} key={b.brand}>
                <div>
                  <h3>{b.brand}</h3>
                  <p className={s.caption}>
                    {b.margin === null
                      ? "Cost data needed"
                      : b.tier
                        ? "Brand threshold reached"
                        : "Below incentive threshold"}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className={s.statValue}>
                    {b.margin === null ? "—" : `${b.margin.toFixed(2)}%`}
                  </div>
                  <Pill tone={band.tone}>
                    {b.tier ??
                      (b.margin === null ? "Pending data" : "Below Tier 1")}
                  </Pill>
                </div>
              </div>
            );
          })
        ) : (
          <Empty title="No brand margins yet">
            Margins appear after orders are synced and calculated.
          </Empty>
        )}
        <p className={s.sub} style={{ marginTop: 16 }}>
          All brands must qualify for the monthly incentive. A quote does not
          count towards monthly rewards.
        </p>
        <button
          className={s.link}
          onClick={() => {
            navigate("income");
            setTimeout(
              () =>
                document
                  .getElementById("member-orders")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" }),
              50,
            );
          }}
        >
          View orders and margins <Icon name="arrow" size={16} />
        </button>
      </section>
    );
  }
  function TodayAttention() {
    return (
      <section className={`${s.card} ${design ? previewStyles.todayAttention : ""}`} aria-label="Needs your attention">
        <div className={s.sectionHead}>
          {design && <span className={previewStyles.attentionIcon}><Icon name="bell" size={25} /></span>}
          <h2>Needs your attention</h2>
          {attentionCount > 0 && (
            <Pill tone="warning">{attentionCount} items</Pill>
          )}
        </div>
        {memos
          .filter((m) => m.requiresAck && !m.acknowledgedAt)
          .map((m) => (
            <button
              key={m.id}
              className={`${s.listRow} ${s.listButton}`}
              onClick={() => principalView ? setSelectedMemo(m.id) : void readMemo(m)}
            >
              <div>
                <h3>{m.title}</h3>
                <p className={s.caption}>
                  {m.sender} · {principalView ? "Team acknowledgement requested" : "Acknowledgement required"}
                </p>
              </div>
              <Icon name="chevron" size={16} />
            </button>
          ))}
        {data.requests
          .filter((r) =>
            ["returned", "needs_info", "reserved"].includes(r.status) && (!principalView || !r.detail.subDepartmentId || r.detail.subDepartmentId === member?.id),
          )
          .map((r) => (
            <button
              key={r.id}
              className={`${s.listRow} ${s.listButton}`}
              onClick={() => setSelectedRequest(r.id)}
            >
              <div>
                <h3>{r.title}</h3>
                <p className={s.caption}>{statusLabels[r.status]}</p>
              </div>
              <Icon name="chevron" size={16} />
            </button>
          ))}
        {actionCount === 0 &&
          !data.requests.some((r) =>
            ["returned", "needs_info", "reserved"].includes(r.status),
          ) && <p className={s.sub}>You are all caught up.</p>}
        <button className={s.link} onClick={() => navigate("memos")}>
          View all notifications <Icon name="arrow" size={16} />
        </button>
      </section>
    );
  }

  function Today() {
    const currentMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).format(new Date());
    const block = insight?.period === currentMonth && !insightBusy && !insightError ? insight.blocks.find(item => item.membershipId === member?.id) : undefined;
    const visibleGoals = principalView ? block ? [
      { label: "Personal sales", current: block.me.sales, target: block.target?.personal ?? null, unit: "RM" },
      { label: "Team sales", current: block.me.sales + block.downline.reduce((sum, person) => sum + person.sales, 0), target: block.target?.group ?? null, unit: "RM" },
    ] : [] : income?.kpis.slice(0, member?.calculator ? 3 : 2) ?? [];
    const kpi = visibleGoals.find(item => item.unit === "RM");
    const percent = kpi?.target
      ? Math.round((kpi.current / kpi.target) * 100)
      : 0;
    return (
      <>
        <div className={s.titleRow}>
          <div>
            <p className={s.eyebrow}>{principalView ? "PRINCIPAL · REVENUE TODAY" : "YOUR DAY, YOUR PROGRESS"}</p>
            <h1>Hello, {data.profile.name.split(" ")[0]}</h1>
            <p className={`${s.sub} ${s.intro}`}>
              {member?.name} · {principalView ? "Team income and member progress." : "Make every effort count."}
            </p>
          </div>
          <div className={s.avatar + " " + s.avatarLarge}>
            {initials(data.profile.name)}
          </div>
        </div>
        <div className={s.grid}>
          <div className={s.stack}>
            <section className={s.hero}>
              <div className={s.row}>
                <span className={s.sub}>
                  {income?.period ?? "This month"} ·{" "}
                  {principalView ? "Team commission" : income?.status === "applied"
                    ? "Settled commission"
                    : "Estimated income"}
                </span>
                <button
                  className={s.iconButton}
                  onClick={() => setPrivateMode((p) => !p)}
                  aria-label={
                    privateMode
                      ? "Show all income amounts"
                      : "Hide all income amounts"
                  }
                >
                  <Icon name={privateMode ? "eyeOff" : "eye"} />
                </button>
              </div>
              <div className={s.heroValue}>
                {privateMode ? (
                  "••••••"
                ) : income ? (
                  <>
                    <span className={s.currency}>RM</span>
                    {new Intl.NumberFormat("en-MY", {
                      minimumFractionDigits: 2,
                    }).format(
                      income.status === "applied"
                        ? income.total
                        : (data.profile.salary ?? 0) + income.total,
                    )}
                  </>
                ) : (
                  "Awaiting data"
                )}
              </div>
              <p className={s.caption}>
                {principalView ? "Combined commission for this department, excluding fixed salaries." : income?.status === "applied"
                  ? "Commission is settled. Check salary and payment status separately."
                  : "Fixed salary plus estimated commission for this department. Final amounts follow your statement."}
              </p>
              <hr className={s.divider} />
              <div className={`${s.row} ${s.rowWrap}`}>
                {!principalView && <span className={s.sub}>
                  Fixed salary{" "}
                  <strong style={{ color: "inherit" }}>
                    {money(data.profile.salary)}
                  </strong>
                </span>}
                <button className={s.link} onClick={() => navigate("income")}>
                  {principalView ? "View team income" : "Income details"} <Icon name="arrow" size={16} />
                </button>
              </div>
            </section>
            {design && <TodayAttention />}
            <section className={s.card}>
              <div className={s.row}>
                <div>
                  <p className={s.eyebrow}>THIS MONTH</p>
                  <h2>{principalView ? viewedPerson ? `${viewedPerson.name} · progress` : "Member progress" : "Closer to your goal"}</h2>
                </div>
                <svg
                  className={s.ring}
                  viewBox="0 0 80 80"
                  role="img"
                  aria-label={`Sales target completion ${percent}%`}
                >
                  <circle
                    cx="40"
                    cy="40"
                    r="33"
                    fill="none"
                    stroke="currentColor"
                    opacity=".12"
                    strokeWidth="6"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="33"
                    fill="none"
                    stroke="rgb(var(--accent))"
                    strokeWidth="6"
                    strokeDasharray={`${Math.min(percent, 100) * 2.073} 208`}
                    transform="rotate(-90 40 40)"
                    strokeLinecap="round"
                  />
                  <text
                    x="40"
                    y="45"
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="18"
                    fontWeight="600"
                  >
                    {kpi?.target ? `${percent}%` : "—"}
                  </text>
                </svg>
              </div>
              {principalView && !canReadPerformance ? <Empty title="No active members">Member progress becomes available when this department has an eligible member.</Empty> : visibleGoals.length || liveDesign ? (
                <>
                  {principalView && !block && <div><p className={s.sub} role="status">{insightError ?? "Loading member progress…"}</p>{insightError && <button className={s.link} onClick={() => void loadInsight()}>Retry member progress</button>}</div>}
                  {visibleGoals.filter(item => item.unit === "RM").map(item => (
                    <Progress key={item.label} label={item.label} value={item.current}
                      target={item.target} unit={item.unit} privateMode={privateMode} />
                  ))}
                  {design && data.demo && member?.calculator ? (
                    <TodayKpiSummary {...todayKpiSummary(income?.kpis ?? [])} />
                  ) : liveDesign && member?.calculator ? (
                    liveKpi?.enabled === false ? null : <>
                      <TodayKpiSummary items={liveKpi?.items.map(item => ({ label: item.label, quantity: item.quantity })) ?? []}
                        total={liveKpi?.total ?? null} threshold={liveKpi?.threshold ?? null} hit={liveKpi?.hit ?? null} />
                      {kpiError && <p className={s.caption} role="status">{kpiError}</p>}
                    </>
                  ) : visibleGoals.some(item => item.unit !== "RM") && (
                    <section className={design ? previewStyles.todayKpi : undefined} aria-label="KPI item progress">
                      <div className={design ? previewStyles.kpiHeading : s.sectionHead}>
                        {design && <span className={previewStyles.kpiIcon}><Icon name="receipt" size={25} /></span>}
                        <div><h3>KPI items</h3><p className={s.caption}>Your item quantity targets</p></div>
                      </div>
                      {visibleGoals.filter(item => item.unit !== "RM").map(item => (
                        <Progress key={item.label} label={item.label} value={item.current}
                          target={item.target} unit={item.unit} />
                      ))}
                    </section>
                  )}
                </>
              ) : (
                <Empty title="Targets coming soon">
                  Confirmed targets and progress will appear here.
                </Empty>
              )}
            </section>
          </div>
          <div className={s.stack}>
            {!member?.calculator && (
              <section className={s.card}>
                <h2>{principalView ? "IR progress" : "Your IR progress"}</h2>
                <p className={s.sub}>
                  Team sales, personal commission and group rewards follow
                  IR&apos;s own rules.
                </p>
                <button className={s.link} onClick={() => navigate("income")}>
                  View reward progress <Icon name="arrow" size={16} />
                </button>
              </section>
            )}
            {!design && <TodayAttention />}
            <MarginBrands />
          </div>
        </div>
      </>
    );
  }
  function Income() {
    const entries = member?.calculator
      ? [
          ["Personal sales commission", income?.personal],
          ["Team override", income?.override],
          ["KPI allowance", income?.kpi],
          ["Open Bill bonus", income?.openBill],
          ["Margin incentive", income?.incentive],
        ]
      : [
          ["Personal sales commission", income?.personal],
          ["Team override", income?.override],
          ["IR group reward", income?.group],
        ];
    const allOrders = member?.calculator ? data.orders : [];
    const orderBand = (order: (typeof allOrders)[number]) => hasNoGoodsMargin(order)
      ? { label: "No goods margin", tone: "neutral" as const, multiplier: 1 }
      : bandFor(order.margin, data.bands.filter(band => band.brand === order.brand));
    const orders = allOrders.filter((o) => {
      const band = orderBand(o);
      return (
        orderFilter === "All" ||
        (orderFilter === "Pending data" && o.margin === null && !hasNoGoodsMargin(o)) ||
        (orderFilter === "With deductions" && band.multiplier < 1) ||
        band.label.startsWith(orderFilter)
      );
    });
    return (
      <>
        <div className={s.titleRow}>
          <div>
            <p className={s.eyebrow}>EARNINGS & GROWTH</p>
            <h1>My income</h1>
            <p className={`${s.sub} ${s.intro}`}>
              {member?.name} · Track estimates, settlements and payments.
            </p>
          </div>
          <label className={s.field}>
            <span className={s.srOnly}>Income month</span>
            <select
              aria-label="Income month"
              value={income?.period ?? ""}
              onChange={(e) => setPeriod(e.target.value)}
            >
              {currentIncomes.length ? (
                currentIncomes.map((i) => (
                  <option key={i.period} value={i.period}>
                    {i.period}
                  </option>
                ))
              ) : (
                <option>No settlement periods</option>
              )}
            </select>
          </label>
        </div>
        <div className={s.grid}>
          <div className={s.stack}>
            <section className={s.hero}>
              <div className={s.row}>
                <span className={s.sub}>
                  {income?.status === "applied"
                    ? "Settled commission"
                    : "Estimated commission"}
                </span>
                <button
                  className={s.iconButton}
                  onClick={() => setPrivateMode((p) => !p)}
                  aria-label={
                    privateMode
                      ? "Show all income amounts"
                      : "Hide all income amounts"
                  }
                >
                  <Icon name={privateMode ? "eyeOff" : "eye"} />
                </button>
              </div>
              <div className={s.heroValue}>{money(income?.total)}</div>
              <p className={s.caption}>
                {income?.status === "applied"
                  ? "Applied to payroll. Check your official payslip for payment details."
                  : "This is the current estimate and has not been settled."}
              </p>
            </section>
            <section className={s.card}>
              <h2>Income breakdown</h2>
              {income ? (
                entries.map(([label, value]) => (
                  <div className={s.listRow} key={String(label)}>
                    <span>{label}</span>
                    <strong className={s.amount}>
                      {money(Number(value ?? 0))}
                    </strong>
                  </div>
                ))
              ) : (
                <Empty title="No commission for this period">
                  Details appear once HR completes the calculation.
                </Empty>
              )}
              <hr className={s.divider} />
              <div className={s.row}>
                <span className={s.sub}>Fixed salary · Counted once</span>
                <strong className={s.amount}>
                  {money(data.profile.salary)}
                </strong>
              </div>
              <p className={s.caption} style={{ marginTop: 14 }}>
                If you belong to multiple sub-departments, your fixed salary is
                counted once. Your official payslip confirms deductions and net
                income.
              </p>
            </section>
            <section className={s.card}>
              <h2>{member?.calculator ? "My KPIs" : "My IR targets"}</h2>
              {income?.kpis.length ? (
                income.kpis.map((k) => (
                  <Progress
                    key={k.label}
                    label={k.label}
                    value={k.current}
                    target={k.target}
                    unit={k.unit}
                    privateMode={privateMode && k.unit === "RM"}
                  />
                ))
              ) : (
                <Empty title="No targets configured" />
              )}
              {!!income?.deferred && (
                <p className={s.sub} style={{ marginTop: 18 }}>
                  Sales awaiting payment eligibility: {money(income.deferred)}.
                  These are not yet included in payable commission.
                </p>
              )}
            </section>
          </div>
          <div className={s.stack}>
            <section className={s.card}>
              <p className={s.eyebrow}>YOUR CURRENT POSITION</p>
              <h2>{member?.title || "Title not assigned"}</h2>
              <dl className={s.dl}>
                <dt>Current rank</dt>
                <dd>{member?.rank || "Not configured"}</dd>
                <dt>Commission rate</dt>
                <dd>{((member?.rate ?? 0) * 100).toFixed(1)}%</dd>
                <dt>This month&apos;s payroll rank</dt>
                <dd>{income?.rank || "Not calculated yet"}</dd>
                <dt>Fixed salary</dt>
                <dd>{money(data.profile.salary)}</dd>
                <dt>Appointment effective date</dt>
                <dd>{member?.effective}</dd>
              </dl>
              <button className={s.link} onClick={showScheme}>
                Commission scheme & promotion criteria{" "}
                <Icon name="arrow" size={16} />
              </button>
            </section>
            <MarginBrands />
          </div>
        </div>
        {member?.calculator && (
          <section
            className={s.card}
            id="member-orders"
            style={{ marginTop: 24, scrollMarginTop: 24 }}
          >
            <div className={s.sectionHead}>
              <h2>My orders · margin</h2>
              <span className={s.caption}>Recorded product sales</span>
            </div>
            <div className={s.filters}>
              {[
                "All",
                "Pending data",
                "Low",
                "Standard",
                "Tier 1",
                "Tier 2",
                "With deductions",
              ].map((f) => (
                <button
                  key={f}
                  className={s.filter}
                  aria-pressed={orderFilter === f}
                  onClick={() => setOrderFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            {orders.length ? (
              orders.map((o) => {
                const b = orderBand(o);
                return (
                  <button
                    key={o.id}
                    className={`${s.listRow} ${s.listButton}`}
                    onClick={() =>
                      setDialog({
                        title: o.number,
                        content: (
                          <div className={s.stack}>
                            <div className={s.row}>
                              <span className={s.quoteValue}>
                                {hasNoGoodsMargin(o) || o.margin === null
                                  ? "—"
                                  : o.margin.toFixed(2) + "%"}
                              </span>
                              <Pill tone={b.tone}>{b.label}</Pill>
                            </div>
                            <dl className={s.dl}>
                              <dt>Brand</dt>
                              <dd>{o.brand}</dd>
                              <dt>Order date</dt>
                              <dd>{o.date}</dd>
                              <dt>Commissionable amount</dt>
                              <dd>{money(o.revenue)}</dd>
                              <dt>Margin source</dt>
                              <dd>
                                {hasNoGoodsMargin(o) ? "Not applicable" : o.manual
                                  ? "Manual adjustment"
                                  : "Product and gift costs"}
                              </dd>
                            </dl>
                            <p className={s.sub}>
                              {hasNoGoodsMargin(o) ? "This order has no positive goods revenue as a margin basis. Its sales and KPI quantities remain in their totals; no goods margin applies." : o.margin === null
                                ? "Cost data is incomplete. Margin cannot be assessed yet."
                                : b.multiplier < 1
                                  ? `Product commission, Open Bill and upline override for this order use ×${b.multiplier}. Fixed KPI allowances are unaffected.`
                                  : "This label reflects order margin. All brands must qualify for the monthly incentive."}
                            </p>
                          </div>
                        ),
                      })
                    }
                  >
                    <div>
                      <h3>{o.number}</h3>
                      <p className={s.caption}>
                        {o.brand} · {date(o.date)} · {money(o.revenue)}
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className={s.amount}>
                        {hasNoGoodsMargin(o) ? "Not applicable" : o.margin === null
                          ? "Awaiting cost"
                          : o.margin.toFixed(2) + "%"}
                      </div>
                      <Pill tone={b.tone}>{b.label}</Pill>
                    </div>
                  </button>
                );
              })
            ) : (
              <Empty title="No matching orders">
                Try another filter or check again after orders sync.
              </Empty>
            )}
          </section>
        )}
      </>
    );
  }
  function Team() {
    if (!member) return null;
    const self = principalView ? viewedPerson : member.people.find((p) => p.self),
      direct = member.people.filter((p) => p.parentId === self?.id);
    // The map spans departments; the list starts at each of the caller's
    // memberships and follows only that membership's reporting descendants.
    const viewedRoot = orgMap?.people.find(person => person.staffId === viewedPerson?.id && person.departmentId === member.id);
    const teamPeople = orgMap ? principalView ? selectViewedBranch(orgMap.people, viewedRoot?.id ?? "") : selectOwnTeam(orgMap.people) : null;
    const fallbackPeople = principalView ? selectViewedBranch(member.people, viewedPerson?.id ?? "") : selectOwnTeam(member.people);
    const ownTeam = teamPeople
      ? teamPeople.map((person) => ({
          key: person.id,
          id: person.staffId,
          name: person.name,
          title: person.title,
          department:
            orgMap?.departments.find((d) => d.id === person.departmentId)?.name ??
            person.departmentId,
          self: person.self,
          upline: orgMap?.people.find((p) => p.id === person.parentId)?.name ?? null,
          reports: teamPeople.filter((p) => p.parentId === person.id).length,
          mine: person.mine,
        }))
      : fallbackPeople.map((person) => ({
          key: person.id,
          id: person.id,
          name: person.name,
          title: person.title,
          department: member.name,
          self: person.self === true,
          upline: member.people.find((p) => p.id === person.parentId)?.name ?? null,
          reports: fallbackPeople.filter((p) => p.parentId === person.id).length,
          mine: true,
        }));
    const directory = ownTeam
      .filter((person) => person.name.toLowerCase().includes(teamSearch.toLowerCase()))
      .sort(
        (a, b) =>
          Number(b.self) - Number(a.self) ||
          a.department.localeCompare(b.department) ||
          a.name.localeCompare(b.name),
      );
    const directoryCard = (person: (typeof directory)[number]) => (
      <button
        key={person.key}
        className={`${s.orgPerson} ${person.self ? s.orgSelf : ""}`}
        onClick={() =>
          setDialog({
            title: person.name,
            content: (
              <div className={s.stack}>
                <dl className={s.dl}>
                  <dt>Department</dt>
                  <dd>{person.department}</dd>
                  <dt>Title</dt>
                  <dd>{person.title}</dd>
                  <dt>Reports to</dt>
                  <dd>{person.upline ?? "Top of this tree"}</dd>
                  <dt>Direct reports</dt>
                  <dd>{person.reports || "None"}</dd>
                </dl>
                <p className={s.sub}>
                  Names, titles and reporting lines only. Other members&apos;
                  salaries and private requests remain private.
                </p>
              </div>
            ),
          })
        }
      >
        <div className={s.row}>
          <div style={{ minWidth: 0 }}>
            <div className={`${s.row} ${s.rowWrap}`}>
              <h3>{person.name}</h3>
              {person.self && <Pill tone="active">You</Pill>}
            </div>
            <p className={s.treeMeta}>
              {person.department} · {person.title}
            </p>
          </div>
          <span className={s.avatar}>{initials(person.name)}</span>
        </div>
      </button>
    );
    return (
      <>
        <div className={s.titleRow}>
          <div>
            <p className={s.eyebrow}>GROW TOGETHER</p>
            <h1>{principalView ? "Team" : "My team"}</h1>
            <p className={`${s.sub} ${s.intro}`}>
              {treeMode
                ? "Every department and how the teams connect."
                : principalView ? `${viewedPerson?.name ?? "The selected member"} and their reporting tree.` : "You and the people in your own reporting tree."}
            </p>
          </div>
          <Pill tone="active">Direct reports: {direct.length} members</Pill>
        </div>
        <div className={s.grid}>
          <section className={s.card}>
            <div className={s.tabs}>
              <button aria-pressed={treeMode} onClick={() => setTreeMode(true)}>
                <Icon name="map" size={17} />
                Map
              </button>
              <button
                aria-pressed={!treeMode}
                onClick={() => setTreeMode(false)}
              >
                <Icon name="list" size={17} />
                Member list
              </button>
            </div>
            <label className={s.field} style={{ marginBottom: 20 }}>
              <span className={s.srOnly}>{treeMode ? "Search members by name" : "Search your team by name"}</span>
              <input
                type="search"
                placeholder={treeMode ? "Search members by name" : "Search your team by name"}
                aria-label={treeMode ? "Search members by name" : "Search your team by name"}
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
              />
            </label>
            {treeMode ? (
              <MemberOrgMap
                key={contextKey}
                map={orgMap}
                viewedMembershipId={principalView ? viewedRoot?.id : undefined}
                busy={mapBusy}
                error={mapError}
                search={teamSearch}
                onRefresh={() => {
                  setOrgMap(null);
                  setMapError(null);
                  void loadOrgMap();
                }}
                onDialog={setDialog}
              />
            ) : directory.length ? (
              directory.map(directoryCard)
            ) : (
              <Empty title="No matching team members">
                {principalView ? "The selected member and their reporting tree appear here." : "Only your own reporting tree appears here. Clear the search to see your team."}
              </Empty>
            )}
          </section>
          <div className={s.stack}>
            <section className={s.card}>
              <h2>Department capacity</h2>
              <div className={s.row}>
                <span className={s.statValue}>
                  {member.occupied}{" "}
                  <span className={s.sub}>
                    / {member.capacity ?? "No limit set"}
                  </span>
                </span>
                <Pill
                  tone={
                    member.capacity && member.occupied >= member.capacity
                      ? "warning"
                      : "neutral"
                  }
                >
                  {member.capacity && member.occupied >= member.capacity
                    ? "At capacity"
                    : "Allocated by eligibility"}
                </Pill>
              </div>
              <p className={s.sub} style={{ marginTop: 14 }}>
                Waiting-list matches consider eligibility, start dates and
                available positions. Department and direct-report capacities are
                checked separately.
              </p>
              {principalView ? <RevenueManagementButton>Manage capacity & waiting list</RevenueManagementButton> : <button
                className={s.link}
                onClick={() => setRequestKind("waiting")}
              >
                Submit Waiting List <Icon name="arrow" size={16} />
              </button>}
            </section>
            <section className={s.card}>
              <h2>Team changes</h2>
              <p className={s.sub} style={{ marginBottom: 16 }}>
                Submit member replacements, department exits, transfers or
                company exits for HR review.
              </p>
              {principalView ? <RevenueManagementButton>Manage team requests</RevenueManagementButton> : <button
                className={`${s.button} ${s.full}`}
                onClick={() => setRequestKind("replacement")}
              >
                <Icon name="replace" />
                Submit Replacement
              </button>}
            </section>
          </div>
        </div>
      </>
    );
  }
  function Requests() {
    const filtered = data.requests.filter(
      (r) => requestFilter === "All" || r.kind === requestFilter,
    );
    return (
      <>
        <div className={s.titleRow}>
          <div>
            <p className={s.eyebrow}>LESS ADMIN, MORE MOMENTUM</p>
            <h1>Requests</h1>
            <p className={`${s.sub} ${s.intro}`}>
              Submit requests, track progress and update details here.
            </p>
          </div>
        </div>
        <div className={s.requestColumns}>
          <div className={s.card} style={{ marginBottom: 24 }}>
            {(
              [
                [
                  "claim",
                  "receipt",
                  "Submit Claim",
                  "Outstation / Airbnb accommodation claims",
                ],
                [
                  "replacement",
                  "replace",
                  "Submit Replacement",
                  "Member replacements, transfers and exits",
                ],
                [
                  "waiting",
                  "list",
                  "Submit Waiting List",
                  "Joining requests and waiting-list allocation",
                ],
              ] as const
            ).map(([kind, icon, title, description]) => (
              <button
                key={kind}
                className={`${s.listRow} ${s.listButton}`}
                onClick={() => setRequestKind(kind)}
              >
                <div className={s.listIcon}>
                  <Icon name={icon} />
                  <div>
                    <h3>{title}</h3>
                    <p className={s.sub}>{description}</p>
                  </div>
                </div>
                <Icon name="chevron" size={16} />
              </button>
            ))}
          </div>
          <div className={s.notice}>
            <Icon name="info" />
            <span>
              Each submission receives a request ID. HR approval, execution and
              payment are tracked separately.
            </span>
          </div>
        </div>
        <section className={s.card}>
          <h2>My requests</h2>
          <div className={s.filters}>
            {[
              ["All", "All"],
              ["claim", "Claim"],
              ["replacement", "Replacement"],
              ["waiting", "Waiting List"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={s.filter}
                aria-pressed={requestFilter === key}
                onClick={() => setRequestFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {filtered.length ? (
            filtered.map((r) => (
              <button
                className={`${s.listRow} ${s.listButton}`}
                key={r.id}
                onClick={() => setSelectedRequest(r.id)}
              >
                <div>
                  <h3>{r.title}</h3>
                  <p className={s.caption}>
                    {date(r.createdAt)} · {r.id.slice(0, 12)}
                  </p>
                </div>
                <Pill
                  tone={
                    ["rejected", "returned", "needs_info"].includes(r.status)
                      ? "danger"
                      : ["paid", "executed", "allocated"].includes(r.status)
                        ? "good"
                        : "warning"
                  }
                >
                  {statusLabels[r.status] ?? r.status}
                </Pill>
              </button>
            ))
          ) : (
            <Empty title="No requests of this type">
              Choose a request type above to get started.
            </Empty>
          )}
        </section>
      </>
    );
  }
  function Memos() {
    return (
      <>
        <div className={s.titleRow}>
          <div>
            <p className={s.eyebrow}>STAY IN THE LOOP</p>
            <h1>Memos & notifications</h1>
            <p className={`${s.sub} ${s.intro}`}>
              {member?.name} · Stay up to date.
            </p>
          </div>
          {actionCount > 0 && (
            <Pill tone="warning">{actionCount} awaiting acknowledgement</Pill>
          )}
        </div>
        <section className={s.card}>
          {memos.length ? (
            [...memos]
              .sort(
                (a, b) =>
                  Number(b.requiresAck && !b.acknowledgedAt) -
                  Number(a.requiresAck && !a.acknowledgedAt),
              )
              .map((m) => (
                <button
                  key={m.id}
                  className={`${s.listRow} ${s.listButton}`}
                  onClick={() => void readMemo(m)}
                >
                  <div>
                    <h3>{m.title}</h3>
                    <p className={s.caption}>
                      {m.sender} · {date(m.publishedAt)} · v{m.version}
                    </p>
                  </div>
                  <Pill
                    tone={
                      m.acknowledgedAt
                        ? "good"
                        : m.requiresAck
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {m.acknowledgedAt
                      ? "Acknowledged"
                      : m.requiresAck
                        ? "Action needed"
                        : m.readAt
                          ? "Read"
                          : "Unread"}
                  </Pill>
                </button>
              ))
          ) : (
            <Empty title="No new memos">
              Announcements for your department will appear here.
            </Empty>
          )}
        </section>
      </>
    );
  }
  function Account() {
    return (
      <>
        <div className={s.titleRow}>
          <div>
            <p className={s.eyebrow}>YOUR WORKSPACE</p>
            <h1>{data.profile.name}</h1>
            <p className={`${s.sub} ${s.intro}`}>{data.profile.email}</p>
          </div>
          <span className={`${s.avatar} ${s.avatarLarge}`}>
            {initials(data.profile.name)}
          </span>
        </div>
        <div className={s.grid}>
          <div className={s.stack}>
            {!principalView && (
              <section className={s.card}>
                <p className={s.eyebrow}>WHERE YOU STAND TODAY</p>
                <h2>Insight</h2>
                <p className={s.sub} style={{ marginBottom: 18 }}>
                  Your live sales, the department ranking and your downline,
                  read from committed orders.
                </p>
                <button
                  className={`${s.button} ${s.primary} ${s.full}`}
                  onClick={() => navigate("insight")}
                >
                  <Icon name="chart" />
                  Open Insight
                  <Icon name="arrow" size={17} />
                </button>
              </section>
            )}
            <section className={s.card}>
              <h2>Current role</h2>
              <label className={s.field}>
                <span>Sub-department</span>
                <select
                  value={member?.id}
                  onChange={(e) => changeDepartment(e.target.value)}
                >
                  {data.memberships.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <dl className={s.dl} style={{ marginTop: 20 }}>
                <dt>Title</dt>
                <dd>{member?.title}</dd>
                <dt>Rank</dt>
                <dd>{member?.rank}</dd>
                <dt>Fixed salary</dt>
                <dd>{money(data.profile.salary)}</dd>
              </dl>
              <button className={s.link} onClick={showScheme}>
                View commission scheme <Icon name="arrow" size={16} />
              </button>
            </section>
            <section className={s.card}>
              <h2>My work</h2>
              {design && (
                <>
                  <button className={`${s.listRow} ${s.listButton}`} onClick={() => navigate("income")}>
                    <div className={s.listIcon}><Icon name="wallet" /><strong>My income</strong></div>
                    <Icon name="chevron" size={16} />
                  </button>
                  <Link className={`${s.listRow} ${s.listButton}`} href={isDesignPreview ? `/member/preview?design=${design}&view=badges` : "/member?page=arena"} onClick={liveDesign ? event => { event.preventDefault(); navigate("arena"); } : undefined}>
                    <div className={s.listIcon}><Icon name="trophy" /><strong>My honours</strong></div>
                    <Icon name="chevron" size={16} />
                  </Link>
                </>
              )}
              {(
                [
                  ...(principalView
                    ? []
                    : ([["insight", "chart", "Insight · sales, ranking & downline"]] as const)),
                  ["requests", "receipt", "Requests"],
                  ["memos", "bell", "Memos & notifications"],
                  ["crm", "chat", "CRM"],
                  ["team", "team", "Team & capacity"],
                ] as const
              ).map(([p, i, l]) => (
                <button
                  className={`${s.listRow} ${s.listButton}`}
                  key={p}
                  onClick={() => navigate(p)}
                >
                  <div className={s.listIcon}>
                    <Icon name={i} />
                    <strong>{l}</strong>
                  </div>
                  <Icon name="chevron" size={16} />
                </button>
              ))}
            </section>
          </div>
          <section className={s.card}>
            <h2>Profile preferences</h2>
            <button
              className={s.listRow}
              onClick={() => setPrivateMode((v) => !v)}
            >
              <div className={s.listIcon}>
                <Icon name={privateMode ? "eyeOff" : "eye"} />
                <span>Hide income amounts</span>
              </div>
              <Pill tone={privateMode ? "active" : "neutral"}>
                {privateMode ? "On" : "Off"}
              </Pill>
            </button>
            {!liveDesign && <button className={s.listRow} onClick={theme}>
              <div className={s.listIcon}>
                <Icon name={dark ? "moon" : "sun"} />
                <span>Appearance</span>
              </div>
              <Pill>{dark ? "Dark" : "Light"}</Pill>
            </button>}
            <button
              className={s.listRow}
              onClick={() =>
                setDialog({
                  title: "Notification preferences",
                  content: (
                    <div className={s.stack}>
                      <p>
                        Important memos and request updates stay in your in-app
                        notification centre. Browser site settings control
                        notification permissions.
                      </p>
                      <p className={s.sub}>
                        This version has no background push notifications. Read
                        status and acknowledgement are recorded separately.
                      </p>
                    </div>
                  ),
                })
              }
            >
              <div className={s.listIcon}>
                <Icon name="bell" />
                <span>Notification preferences</span>
              </div>
              <Icon name="chevron" size={16} />
            </button>
            {(appInstall.path === "prompt" ||
              appInstall.path === "ios" ||
              appInstall.path === "in-app") && (
              <button
                className={s.listRow}
                onClick={async () => {
                  const path = appInstall.path;
                  if (path === "ios" || path === "in-app") {
                    setDialog({
                      title: "Install the app",
                      content: (
                        <div className={s.stack}>
                          <InstallSteps path={path} />
                        </div>
                      ),
                    });
                    return;
                  }
                  if ((await appInstall.install()) === "accepted")
                    notify("Venture is on your home screen");
                }}
              >
                <div className={s.listIcon}>
                  <Icon name="install" />
                  <span>Install the app</span>
                </div>
                <Icon name="chevron" size={16} />
              </button>
            )}
            <Link className={s.listRow} href="/login">
              <div className={s.listIcon}>
                <Icon name="user" />
                <span>Member sign-in</span>
              </div>
              <Icon name="chevron" size={16} />
            </Link>
            {!data.demo && (
              <form action="/member/signout" method="post">
                <button className={s.listRow} type="submit">
                  <div className={s.listIcon}>
                    <Icon name="logout" />
                    <span>Sign out</span>
                  </div>
                </button>
              </form>
            )}
            <p className={s.caption} style={{ marginTop: 20 }}>
              You see data authorised for your account. Switching departments
              updates the income rules and reporting relationships.
            </p>
            {data.demo && (
              <div className={s.previewSettings}>
                <p className={s.caption}>Design preview · Sample data only</p>
                <button
                  className={s.link}
                  onClick={() => {
                    try {
                      localStorage.removeItem("member-demo-v3");
                      localStorage.removeItem(
                        `member-cart-v1-${data.profile.userId}`,
                      );
                    } catch {}
                    window.location.assign(design ? `/member/preview?design=${design}&page=account` : window.location.pathname);
                  }}
                >
                  Reset demo
                </button>
              </div>
            )}
          </section>
        </div>
      </>
    );
  }
  const activeMemo = data.memos.find((m) => m.id === selectedMemo),
    activeRequest = data.requests.find((r) => r.id === selectedRequest);
  // CRM is an app of its own: its own top bar and Inbox / Calendar / Profile
  // bar replace the workspace chrome. Back returns to Profile.
  if (page === "crm" && member) {
    return <div className={`${s.workspace} ${liveDesign ? liveStyles.workspace : ""}`} lang="en-MY">
      <CrmApp salesperson={data.profile.name} onExit={() => navigate("account")} live={!data.demo} />
    </div>;
  }
  return (
    <div className={`${s.workspace} ${design ? motion.shell : ""} ${liveDesign ? liveStyles.workspace : ""}`} lang="en-MY" data-arena-design={design} data-revenue-design={design} data-revenue-preview={isDesignPreview ? design : undefined}>
      <div id="member-shell">
        {!isDesignPreview && <aside className={`${s.sidebar} ${liveDesign ? liveStyles.sidebar : ""}`}>
          <div className={s.wordmark}>
            HOUZS VENTURE<small>REVENUE WORKSPACE</small>
          </div>
          <nav className={s.sideNav} aria-label="Desktop navigation">
            {liveDesign ? <MemberLiveNav active={page} canQuote={!!member?.calculator} principalView={principalView} desktop onSelect={navigate} /> : renderNav(true)}
          </nav>
          <div className={s.sideFooter}>
            <div className={s.listIcon}>
              <span className={s.avatar}>{initials(data.profile.name)}</span>
              <div>
                <h3>{data.profile.name}</h3>
                <p className={s.caption}>
                  {member?.name} · {member?.title}
                </p>
              </div>
            </div>
            <p className={s.caption}>A little closer, every day.</p>
          </div>
        </aside>}
        <div className={s.shell}>
          {isDesignPreview && design && <RevenuePreviewHeader design={design} onProfile={() => navigate("account")} departmentLabel={member?.name} profileInitials={initials(data.profile.name)} />}
          {liveDesign && <MemberLiveHeader name={data.profile.name} department={member?.name} onProfile={() => navigate("account")} onHome={() => navigate("today")} />}
          <header className={`${s.topbar} ${principalView ? s.principalTopbar : ""}`}>
            {principalView && <div className={principalStyles.toolbar} role="group" aria-label="Workspace view and department">
              <PortalViewSwitcher value="revenue_member" />
              <label title="Revenue department"><span className={s.srOnly}>Department</span><select aria-label="Revenue department" value={member?.id ?? ""} onChange={event => changeDepartment(event.target.value)}>
                {data.memberships.map(membership => <option key={membership.id} value={membership.id}>{membership.name}</option>)}
              </select></label>
            </div>}
            <div className={s.workspaceTools}>
            {backTarget && (
              <button
                type="button"
                className={s.workspaceBack}
                aria-label={backLabel}
                title={backLabel}
                onClick={handleBack}
              >
                <Icon name="back" size={22} />
              </button>
            )}
            <button
              type="button"
              className={s.workspaceSearch}
              aria-label="Search workspace"
              aria-haspopup="dialog"
              onClick={openWorkspaceSearch}
            >
              <Icon name="search" size={20} />
              <span>
                {member?.name ? `Search in ${member.name}` : "Search workspace"}
              </span>
            </button>
            <button
              type="button"
              className={s.workspaceNotifications}
              aria-label={principalView ? "Team memos" : `Notifications, ${actionCount} awaiting acknowledgement`}
              onClick={() => navigate("memos")}
            >
              <Icon name="bell" size={21} />
              {actionCount > 0 && (
                <span className={s.notificationDot} aria-hidden="true" />
              )}
            </button>
            </div>
          </header>
          <main
            className={`${s.main} ${page === "quote" ? s.quoteMain : ""} ${design && page === "quote" ? previewStyles.quoteSurface : ""}`}
            ref={mainRef}
            key={design ? page : undefined}
            data-preview-page={design ? page : undefined}
          >
            {!online && (
              <div className={`${s.notice} ${s.noticeWarning}`} role="status">
                <Icon name="info" />
                <span>
                  You are offline. Drafts are saved. Reconnect to confirm quotes
                  or submit requests.
                </span>
              </div>
            )}
            {principalView && member && ["today", "insight", "arena", "team"].includes(page) && <section className={principalStyles.readContext} aria-label="Member viewing context">
              <div><span className={principalStyles.contextIcon}><Icon name="user" size={25} /></span><div><strong>Member performance</strong><p>Read-only · Signed in as {data.profile.name}</p></div></div>
              <label><span>Viewing member</span><select aria-label="Viewing member" value={viewedPerson?.id ?? ""} onChange={event => changeViewedStaff(event.target.value)} disabled={!member.people.length}>
                {!member.people.length && <option value="">No active members</option>}
                {member.people.map(person => <option key={person.id} value={person.id}>{person.name} · {person.title}</option>)}
              </select></label>
            </section>}
            {!data.configured || !member ? (
              <>
                <div className={s.titleRow}>
                  <div>
                    <h1>{principalView ? "Revenue setup" : "Your workspace is being prepared"}</h1>
                    <p className={`${s.sub} ${s.intro}`}>
                      {data.message ??
                        (principalView ? "Configure an active Revenue scheme to open the team workspace." : "Ask HR to link your member account and sub-department.")}
                    </p>
                  </div>
                </div>
                <Empty title={principalView ? "Revenue information is not available yet" : "No member profile linked"}>
                  {principalView ? "Your Principal account can manage Revenue configuration and member services." : "Your income and team become available once your access and appointment are confirmed."}
                </Empty>
                {principalView && <RevenueManagementButton destination="/revenue">Revenue configuration</RevenueManagementButton>}
              </>
            ) : (
              <>
                {principalView && ["income", "requests", "memos", "account"].includes(page) && <PrincipalRevenuePanels
                  key={`${member.id}-${page}`} data={data} member={member} page={page}
                  navigate={navigate} onRequest={setSelectedRequest} onMemo={setSelectedMemo}
                  dark={dark} onTheme={theme} privateMode={privateMode} onPrivateMode={() => setPrivateMode(value => !value)}
                />}
                {page === "today" && Today()}
                {page === "arena" && canReadPerformance && <MemberArena key={`${member.id}-${contextKey}`} membershipId={member.id} context={readContext} />}
                {page === "insight" && canReadPerformance && (
                  <MemberInsightPanel
                    key={`${member.id}-${contextKey}-${insightEntry.screen}-${insightEntry.brand ?? "all"}`}
                    insight={insight}
                    membershipId={member?.id ?? ""}
                    viewedStaffId={readContext?.staffId}
                    bands={data.bands}
                    privateMode={privateMode}
                    busy={insightBusy}
                    error={insightError}
                    onRefresh={() => {
                      setInsight(null);
                      setInsightError(null);
                      void loadInsight(insight?.period);
                    }}
                    onDialog={setDialog}
                    initialScreen={insightEntry.screen}
                    initialBrand={insightEntry.brand}
                    onPeriodChange={selectedPeriod => void loadInsight(selectedPeriod)}
                    onScreenChange={(screen, brand) => {
                      const url = new URL(window.location.href);
                      if (screen === "orders") url.searchParams.set("screen", "orders"); else url.searchParams.delete("screen");
                      if (screen === "orders" && brand && brand !== "all") url.searchParams.set("brand", brand); else url.searchParams.delete("brand");
                      history.replaceState(history.state, "", url);
                    }}
                  />
                )}
                {principalView && !canReadPerformance && ["insight", "arena"].includes(page) && <section className={s.card}>
                  <h1>{labels[page]}</h1><Empty title="No active members in this department">Choose another Revenue department to view member performance, or manage this department in Member Services.</Empty><RevenueManagementButton />
                </section>}
                {!principalView && page === "income" && Income()}
                {page === "quote" && member.calculator && (
                  <MemberQuoteBuilder
                    data={data}
                    input={quoteInput}
                    setInput={setQuoteInput}
                    online={online}
                    notify={notify}
                    openDialog={setDialog}
                    closeDialog={closeDialog}
                    productSelection={productSelection}
                  />
                )}{" "}
                {page === "team" && Team()}
                {!principalView && page === "requests" && Requests()}
                {!principalView && page === "memos" && Memos()}
                {!principalView && page === "account" && Account()}
              </>
            )}
            <div className={s.freshness}>
              <Icon name="refresh" size={13} />
              <span>
                {data.demo
                  ? "Preview · Sample data only"
                  : `Updated ${new Date(data.refreshedAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
              </span>
              <button
                className={s.link}
                style={{ fontSize: 12 }}
                disabled={refreshing}
                onClick={() => void refresh()}
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </main>
        </div>
        {liveDesign ? <MemberLiveNav active={page} canQuote={!!member?.calculator} principalView={principalView} onSelect={navigate} /> : design ? <RevenuePreviewNav
          design={design}
          active={page === "today" ? "today" : page === "quote" ? "quote" : page === "income" || page === "insight" ? "insight" : "profile"}
          onSelect={{ today: () => navigate("today"), quote: () => navigate("quote"), profile: () => navigate("account") }}
        /> : <nav className={s.bottomNav} aria-label="Mobile navigation">
          {renderNav()}
        </nav>}
      </div>
      {dialog && (
        <Modal title={dialog.title} onClose={closeDialog}>
          {dialog.content}
        </Modal>
      )}
      {requestKind && member && !principalView && (
        <Modal
          title={
            {
              claim: "Submit Claim",
              replacement: "Submit Replacement",
              waiting: "Submit Waiting List",
            }[requestKind]
          }
          onClose={closeDialog}
        >
          <RequestForm
            key={revisionRequest?.id ?? requestKind}
            initialRequest={revisionRequest}
            kind={requestKind}
            data={data}
            member={
              data.memberships.find(
                (m) => m.id === revisionRequest?.detail.subDepartmentId,
              ) ?? member
            }
            onDone={requestCreated}
            online={online}
          />
        </Modal>
      )}
      {activeMemo && (
        <Modal title={activeMemo.title} onClose={closeDialog}>
          <div className={s.stack}>
            <div className={`${s.row} ${s.rowWrap}`}>
              <Pill
                tone={
                  activeMemo.acknowledgedAt
                    ? "good"
                    : activeMemo.requiresAck
                      ? "warning"
                      : "neutral"
                }
              >
                {principalView ? "Team memo" : activeMemo.acknowledgedAt
                  ? "Acknowledged"
                  : activeMemo.requiresAck
                    ? "Your acknowledgement is needed"
                    : "Information"}
              </Pill>
              <span className={s.caption}>
                {activeMemo.sender} · v{activeMemo.version}
              </span>
            </div>
            <p className={s.caption}>
              Published {date(activeMemo.publishedAt)} · Effective{" "}
              {activeMemo.effectiveAt}
            </p>
            <div className={s.memoBody}>{activeMemo.body}</div>
            {activeMemo.requiresAck && !principalView && (
              <button
                className={`${s.button} ${s.primary} ${s.full}`}
                disabled={!!activeMemo.acknowledgedAt || busyAck || !online}
                onClick={() => void ackMemo(activeMemo)}
              >
                <Icon name="check" />
                {activeMemo.acknowledgedAt
                  ? "Acknowledgement recorded"
                  : busyAck
                    ? "Saving…"
                    : "I have read and acknowledge"}
              </button>
            )}
            {activeMemo.acknowledgedAt && (
              <p className={s.caption}>
                Acknowledged:{" "}
                {new Date(activeMemo.acknowledgedAt).toLocaleString("en-MY", {
                  timeZone: "Asia/Kuala_Lumpur",
                })}
              </p>
            )}
          </div>
        </Modal>
      )}
      {activeRequest && (
        <Modal title={activeRequest.title} onClose={closeDialog}>
          <RequestDetail
            data={data}
            request={activeRequest}
            onEdit={() => {
              setRevisionRequest(activeRequest);
              setRequestKind(activeRequest.kind);
              setSelectedRequest(null);
            }}
          />
        </Modal>
      )}
      {toast && (
        <div className={s.toast} role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function RequestDetail({
  request,
  data,
  onEdit,
}: {
  request: MemberRequest;
  data: MemberData;
  onEdit: () => void;
}) {
  const steps =
    request.kind === "claim"
      ? ["Submitted", "HR review", "Approved, awaiting payment", "Paid"]
      : request.kind === "waiting"
        ? [
            "Submitted",
            "Eligibility review",
            "Waiting list",
            "Position reserved",
            "Applicant confirmation",
            "Onboarding complete",
          ]
        : [
            "Submitted",
            "HR review",
            "Approved, awaiting effective date",
            "Executed",
          ];
  const stepForStatus: Record<string, number> =
    request.kind === "claim"
      ? {
          submitted: 1,
          needs_info: 1,
          returned: 1,
          rejected: 1,
          approved: 2,
          paid: 3,
        }
      : request.kind === "waiting"
        ? {
            submitted: 1,
            needs_info: 1,
            returned: 1,
            rejected: 1,
            waiting: 2,
            reserved: 3,
            expired: 3,
            accepted: 4,
            confirmed: 4,
            allocated: 5,
          }
        : {
            submitted: 1,
            needs_info: 1,
            returned: 1,
            rejected: 1,
            approved: 2,
            scheduled: 2,
            executed: 3,
          };
  const currentStep = stepForStatus[request.status] ?? 0;
  const finished = ["paid", "executed", "allocated"].includes(request.status);
  const stopped = [
    "rejected",
    "withdrawn",
    "expired",
    "needs_info",
    "returned",
  ].includes(request.status);
  return (
    <div className={s.stack}>
      <div className={s.row}>
        <Pill
          tone={
            finished
              ? "good"
              : request.status === "rejected"
                ? "danger"
                : "warning"
          }
        >
          {statusLabels[request.status] ?? request.status}
        </Pill>
        <span className={s.caption}>{date(request.createdAt)}</span>
      </div>
      <p className={s.caption}>Request ID · {request.id}</p>
      {data.principalView && <RevenueManagementButton>Review in Member Services</RevenueManagementButton>}
      {!data.principalView && ["needs_info", "returned"].includes(request.status) && (
        <button className={s.button + " " + s.primary} onClick={onEdit}>
          Update details and resubmit
        </button>
      )}
      <dl className={s.dl}>
        {Object.entries(request.detail)
          .filter(
            ([key, value]) =>
              requestFieldLabels[key] &&
              value != null &&
              value !== "" &&
              typeof value !== "object" &&
              !(key === "subDepartmentId" && request.detail.department),
          )
          .map(([key, value]) => (
            <div key={key} style={{ display: "contents" }}>
              <dt>{requestFieldLabels[key]}</dt>
              <dd>{requestValue(key, value, data)}</dd>
            </div>
          ))}
      </dl>
      {typeof request.detail.signatureImage === "string" &&
        /^data:image\/png;base64,/.test(request.detail.signatureImage) && (
          <div>
            <h3>Applicant&apos;s handwritten signature</h3>
            <img
              src={request.detail.signatureImage}
              alt="Handwritten signature submitted by the applicant"
              className={s.receiptPreview}
            />
          </div>
        )}
      {request.note && (
        <div className={s.notice}>
          <Icon name="info" />
          <span>{request.note}</span>
        </div>
      )}
      <div>
        <h3>Request progress</h3>
        <div className={s.timeline}>
          {steps.map((step, i) => {
            const complete = i < currentStep || (finished && i === currentStep);
            return (
              <div
                key={step}
                className={`${s.timelineItem} ${complete ? s.timelineDone : ""}`}
                aria-current={
                  !finished && i === currentStep ? "step" : undefined
                }
              >
                <strong>{step}</strong>
                <p className={s.caption}>
                  {complete
                    ? "Completed"
                    : i === currentStep
                      ? `${stopped ? "Current status" : "Current step"} · ${statusLabels[request.status] ?? request.status}`
                      : "Pending"}
                  {i === 0 ? ` · ${date(request.createdAt)}` : ""}
                </p>
              </div>
            );
          })}
        </div>
        <p className={s.sub}>
          {request.kind === "claim"
            ? "HR approval does not mean payment is complete. Check the payment status."
            : request.kind === "waiting"
              ? "Positions are matched by eligibility and capacity. A reservation is followed by confirmation of joining interest."
              : "Approved requests are processed by their effective date. Submission does not immediately change appointments."}
        </p>
      </div>
    </div>
  );
}

function RequestForm({
  kind,
  data,
  member,
  onDone,
  online,
  initialRequest,
}: {
  kind: RequestKind;
  data: MemberData;
  member: MemberMembership;
  onDone: (r: MemberRequest) => void;
  online: boolean;
  initialRequest: MemberRequest | null;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [stage, setStage] = useState<"edit" | "review">("edit"),
    [destination, setDestination] = useState(() =>
      formDestination(initialRequest?.detail.destination),
    ),
    [target, setTarget] = useState(() =>
      String(
        initialRequest?.detail.targetDepartmentId ??
          (kind === "waiting"
            ? (initialRequest?.detail.subDepartmentId ?? member.id)
            : ""),
      ),
    ),
    [file, setFile] = useState<File | null>(null),
    [fileUrl, setFileUrl] = useState(""),
    [saved, setSaved] = useState<FormData | null>(null),
    [signatureMode, setSignatureMode] = useState<"typed" | "draw">("typed"),
    [signatureImage, setSignatureImage] = useState("");
  const formRef = useRef<HTMLFormElement>(null),
    canvasRef = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false),
    hasDrawn = useRef(false),
    key = useRef("");
  useEffect(() => {
    key.current = crypto.randomUUID();
    if (initialRequest) {
      for (const [name, value] of Object.entries(initialRequest.detail)) {
        const control = formRef.current?.elements.namedItem(name);
        if (
          control instanceof HTMLInputElement &&
          control.type !== "file" &&
          control.type !== "checkbox"
        )
          control.value = String(value ?? "");
        if (
          control instanceof HTMLTextAreaElement ||
          control instanceof HTMLSelectElement
        )
          control.value =
            name === "category"
              ? (legacyClaimCategories[String(value ?? "")] ??
                String(value ?? ""))
              : String(value ?? "");
      }
      setDestination(formDestination(initialRequest.detail.destination));
      setTarget(
        String(
          initialRequest.detail.targetDepartmentId ??
            (kind === "waiting"
              ? (initialRequest.detail.subDepartmentId ?? member.id)
              : ""),
        ),
      );
    }
  }, [initialRequest, member.id]);
  useEffect(() => {
    if (file?.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setFileUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setFileUrl("");
  }, [file]);
  function review(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    fd.set("kind", kind);
    fd.set("subDepartmentId", member.id);
    fd.set("schemeId", member.schemeId);
    fd.set("idempotencyKey", key.current);
    if (initialRequest) fd.set("requestId", initialRequest.id);
    if (kind === "claim") {
      if (!file) {
        setError("Please attach an invoice.");
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        setError(
          "Invoices must be 100 MB or smaller. Please compress the file and retry.",
        );
        return;
      }
      if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) {
        setError("Choose a JPG, PNG or PDF file.");
        return;
      }
      if (String(fd.get("end")) < String(fd.get("start"))) {
        setError("Check-out cannot be earlier than check-in.");
        return;
      }
      fd.set("invoice", file);
    }
    if (kind === "waiting") {
      if (
        String(fd.get("start")) <
        new Date().toLocaleDateString("en-CA", {
          timeZone: "Asia/Kuala_Lumpur",
        })
      ) {
        setError("Preferred start date cannot be in the past.");
        return;
      }
      if (signatureMode === "draw") {
        if (!hasDrawn.current) {
          setError("Please add your signature.");
          return;
        }
        const value = canvasRef.current?.toDataURL("image/png") ?? "";
        setSignatureImage(value);
        fd.set("signatureImage", value);
      }
      if (fd.get("consent") !== "on") {
        setError("Please confirm your details and joining interest.");
        return;
      }
    }
    if (
      kind === "replacement" &&
      String(fd.get("effective")) <
        new Date().toLocaleDateString("en-CA", {
          timeZone: "Asia/Kuala_Lumpur",
        })
    ) {
      setError("Planned effective date cannot be in the past.");
      return;
    }
    setSaved(fd);
    setStage("review");
  }
  async function submit() {
    if (!saved || busy) return;
    setBusy(true);
    setError("");
    try {
      if (data.demo) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const detail: Record<string, unknown> = {};
        saved.forEach((v, k) => {
          if (
            typeof v === "string" &&
            ![
              "idempotencyKey",
              "requestId",
              "schemeId",
              "kind",
              "consent",
            ].includes(k)
          )
            detail[k] = v;
        });
        if (file) detail.invoiceName = file.name;
        detail.department =
          (data.departments ?? data.memberships).find(
            (m) => m.id === String(saved.get("targetDepartmentId")),
          )?.name ?? member.name;
        const title =
          kind === "claim"
            ? `${String(saved.get("location"))} · Accommodation claim`
            : `${String(saved.get("newPerson") || saved.get("originalStaffId") || "Member arrangement")} · ${kind === "waiting" ? "Waiting-list request" : "Replacement"}`;
        onDone({
          id:
            initialRequest?.id ??
            "DEMO-" + key.current.slice(0, 8).toUpperCase(),
          kind,
          title,
          status: "submitted",
          createdAt: initialRequest?.createdAt ?? new Date().toISOString(),
          detail,
        });
        return;
      }
      // The invoice goes ahead of the request (2026-10-24, lib/storage/stage.ts) — from a copy, so a retry after a
      // refusal sends the kept file again.
      const sending = new FormData();
      saved.forEach((v, k) => sending.append(k, v));
      await stageFiles(sending);
      const response = await submitMemberRequest(sending);
      if (response.ok) onDone(response.data);
      else
        setError(
          response.error ??
            "Submission failed. Your details are saved. Please try again.",
        );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to connect. Your details are saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  const destinations = data.departments ?? data.memberships;
  const selectedDepartment = destinations.find((m) => m.id === target);
  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - box.left) * e.currentTarget.width) / box.width,
      y: ((e.clientY - box.top) * e.currentTarget.height) / box.height,
    };
  }
  return (
    <div className={s.stack}>
      {data.demo && (
        <div className={s.notice}>
          <Icon name="info" />
          <span>
            Demo requests stay in this browser. Invoices are not uploaded and
            nothing is submitted to HR.
          </span>
        </div>
      )}
      <div className={s.row}>
        <Pill tone={stage === "edit" ? "active" : "neutral"}>
          1 · Enter details
        </Pill>
        <Icon name="arrow" size={15} />
        <Pill tone={stage === "review" ? "active" : "neutral"}>
          2 · Review & submit
        </Pill>
      </div>
      <form
        className={s.form}
        onSubmit={review}
        ref={formRef}
        hidden={stage !== "edit"}
      >
        {kind === "claim" ? (
          <>
            <label className={s.field}>
              <span>Claim category</span>
              <select name="category">
                <option>Outstation accommodation</option>
                <option>Airbnb accommodation</option>
              </select>
            </label>
            <label className={s.field}>
              <span>Trip location</span>
              <input
                name="location"
                placeholder="e.g. Johor Bahru"
                maxLength={150}
                required
              />
            </label>
            <div className={s.two}>
              <label className={s.field}>
                <span>Check-in date</span>
                <input type="date" name="start" required />
              </label>
              <label className={s.field}>
                <span>Check-out date</span>
                <input type="date" name="end" required />
              </label>
            </div>
            <label className={s.field}>
              <span>Claim amount (RM)</span>
              <input
                name="amount"
                inputMode="decimal"
                type="number"
                step="0.01"
                min="0.01"
                max="999999.99"
                required
              />
            </label>
            <label className={s.field}>
              <span>Invoice</span>
              <input
                name="invoice"
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </label>
            {file && (
              <div className={s.selectedSummary}>
                <div className={`${s.row} ${s.rowWrap}`}>
                  <span>
                    {file.name} · {(file.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    className={s.link}
                    type="button"
                    onClick={() => {
                      setFile(null);
                      const el = formRef.current?.elements.namedItem(
                        "invoice",
                      ) as HTMLInputElement | null;
                      if (el) el.value = "";
                    }}
                  >
                    Remove
                  </button>
                </div>
                {fileUrl && (
                  <img
                    src={fileUrl}
                    className={s.receiptPreview}
                    alt="Selected invoice preview"
                  />
                )}
              </div>
            )}
            <p className={s.caption}>
              JPG, PNG or PDF, up to 100 MB each. Choose a photo or take a clear
              picture of your receipt.
            </p>
            <label className={s.field}>
              <span>Notes (optional)</span>
              <textarea name="reason" rows={2} maxLength={1500} />
            </label>
          </>
        ) : kind === "replacement" ? (
          <>
            <label className={s.field}>
              <span>Original member</span>
              <select name="originalStaffId" required>
                {member.people
                  .filter(
                    (p) =>
                      p.self ||
                      p.id !== member.people.find((x) => x.self)?.parentId,
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className={s.field}>
              <span>Original member arrangement</span>
              <select
                name="destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                <option value="department_exit">
                  Leave this sub-department only
                </option>
                <option value="transfer">
                  Move · Transfer to another sub-department
                </option>
                <option value="company_exit">Exit · Leave the company</option>
              </select>
            </label>
            {destination === "transfer" && (
              <label className={s.field}>
                <span>Receiving sub-department</span>
                <select
                  name="targetDepartmentId"
                  required
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="" disabled>
                    Select receiving department
                  </option>
                  {destinations
                    .filter((m) => m.id !== member.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className={s.field}>
              <span>Replacement source</span>
              <select name="replacementSource">
                <option value="new">New member joining</option>
                <option value="existing">Existing member</option>
                <option value="waiting">Waiting List</option>
                <option value="vacancy">
                  Release position without replacement
                </option>
              </select>
            </label>
            <label className={s.field}>
              <span>
                Replacement name / request ID (optional if no replacement)
              </span>
              <input name="newPerson" maxLength={150} />
            </label>
            <label className={s.field}>
              <span>Planned effective date</span>
              <input type="date" name="effective" required />
            </label>
            <label className={s.field}>
              <span>Reason and arrangement details</span>
              <textarea name="reason" rows={3} required maxLength={1500} />
            </label>
            <p className={s.sub}>
              Transfers require receiving-department confirmation. Member and
              payroll records change after approval and processing.
            </p>
          </>
        ) : (
          <>
            <div className={s.card}>
              <div className={s.row}>
                <strong>Current department capacity</strong>
                <span className={s.amount}>
                  {selectedDepartment?.occupied ?? "—"} /{" "}
                  {selectedDepartment?.capacity ?? "No limit set"}
                </span>
              </div>
            </div>
            <label className={s.field}>
              <span>New member name</span>
              <input
                name="newPerson"
                autoComplete="name"
                required
                maxLength={150}
              />
            </label>
            <label className={s.field}>
              <span>Phone number</span>
              <input
                name="contact"
                type="tel"
                inputMode="tel"
                required
                maxLength={32}
              />
            </label>
            <label className={s.field}>
              <span>Preferred sub-department</span>
              <select
                name="targetDepartmentId"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {destinations.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={s.field}>
              <span>Preferred start date</span>
              <input name="start" type="date" required />
            </label>
            <div className={s.tabs}>
              <button
                type="button"
                aria-pressed={signatureMode === "typed"}
                onClick={() => {
                  setSignatureMode("typed");
                  setSignatureImage("");
                  hasDrawn.current = false;
                }}
              >
                Type signature
              </button>
              <button
                type="button"
                aria-pressed={signatureMode === "draw"}
                onClick={() => {
                  setSignatureMode("draw");
                  setSignatureImage("");
                  hasDrawn.current = false;
                }}
              >
                Draw signature
              </button>
            </div>
            <label className={s.field}>
              <span>Your full name</span>
              <input
                name="signature"
                autoComplete="off"
                required
                maxLength={150}
              />
            </label>
            {signatureMode === "draw" && (
              <div>
                <canvas
                  ref={canvasRef}
                  className={s.signCanvas}
                  width={600}
                  height={220}
                  aria-label="Signature canvas. You can also choose a typed signature."
                  onPointerDown={(e) => {
                    drawing.current = true;
                    hasDrawn.current = true;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const ctx = e.currentTarget.getContext("2d");
                    const p = canvasPoint(e);
                    if (ctx) {
                      ctx.beginPath();
                      ctx.moveTo(p.x, p.y);
                      ctx.lineWidth = 3;
                      ctx.strokeStyle = "#5A3E2B";
                      ctx.lineCap = "round";
                    }
                  }}
                  onPointerMove={(e) => {
                    if (!drawing.current) return;
                    const ctx = e.currentTarget.getContext("2d"),
                      p = canvasPoint(e);
                    ctx?.lineTo(p.x, p.y);
                    ctx?.stroke();
                  }}
                  onPointerUp={() => (drawing.current = false)}
                  onPointerCancel={() => (drawing.current = false)}
                />
                <button
                  className={s.link}
                  type="button"
                  onClick={() => {
                    canvasRef.current
                      ?.getContext("2d")
                      ?.clearRect(0, 0, 600, 220);
                    hasDrawn.current = false;
                  }}
                >
                  Clear signature
                </button>
              </div>
            )}
            <label className={s.check}>
              <input name="consent" type="checkbox" required />
              <span>
                I confirm my details and joining interest, and consent to HR
                contacting me based on eligibility and available positions.
              </span>
            </label>
            <p className={s.caption}>
              Waiting-list requests require review. If a position is reserved,
              we will confirm your joining interest. A specific start date is
              not guaranteed.
            </p>
          </>
        )}
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <button className={`${s.button} ${s.primary} ${s.full}`} type="submit">
          Review request <Icon name="arrow" size={17} />
        </button>
      </form>
      {stage === "review" && saved && (
        <div className={s.stack}>
          <h3>Confirm request details</h3>
          <dl className={s.dl}>
            {[
              ["category", "Claim category"],
              ["location", "Location"],
              ["amount", "Amount (RM)"],
              ["originalStaffId", "Original member"],
              ["destination", "Original member arrangement"],
              ["targetDepartmentId", "Preferred / receiving department"],
              ["replacementSource", "Replacement source"],
              ["newPerson", "New member / replacement"],
              ["contact", "Phone number"],
              ["start", "Start / joining date"],
              ["end", "Check-out date"],
              ["effective", "Effective date"],
              ["signature", "Signed by"],
              ["reason", "Details"],
            ]
              .filter(([key]) => saved.get(key))
              .map(([key, label]) => (
                <div key={key} style={{ display: "contents" }}>
                  <dt>{label}</dt>
                  <dd>
                    {key === "category"
                      ? requestValue(key, saved.get(key), data)
                      : key === "originalStaffId"
                        ? (member.people.find((p) => p.id === saved.get(key))
                            ?.name ?? String(saved.get(key)))
                        : key === "targetDepartmentId"
                          ? (destinations.find((d) => d.id === saved.get(key))
                              ?.name ?? String(saved.get(key)))
                          : ((
                              {
                                department_exit: "Leave this department only",
                                member_exit: "Leave this department only",
                                transfer: "Transfer to another department",
                                company_exit: "Leave the company",
                                resignation: "Leave the company",
                                new: "New member joining",
                                existing: "Existing member",
                                waiting: "Waiting List",
                                vacancy: "Release position without replacement",
                              } as Record<string, string>
                            )[String(saved.get(key))] ??
                            String(saved.get(key)))}
                  </dd>
                </div>
              ))}
            {file && (
              <>
                <dt>Invoice</dt>
                <dd>{file.name}</dd>
              </>
            )}
          </dl>
          {signatureImage && (
            <img
              src={signatureImage}
              alt="Applicant's handwritten signature"
              className={s.receiptPreview}
            />
          )}
          <p className={s.sub}>
            Requesting department: {member.name}. Please check that your details
            and attachments are correct.
          </p>
          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
          <div className={s.dialogActions}>
            <button
              className={s.button}
              disabled={busy}
              onClick={() => setStage("edit")}
            >
              Back to edit
            </button>
            <button
              className={`${s.button} ${s.primary}`}
              disabled={busy || !online}
              onClick={() => void submit()}
            >
              {busy
                ? "Submitting…"
                : data.demo
                  ? "Submit demo request"
                  : "Submit to HR"}
              <Icon name="check" size={17} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
