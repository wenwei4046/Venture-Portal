/**
 * Whether an ad is still running (2026-10-22; the owner: "已经结束的广告不需要在apps assign，只保留正在跑的；但在desktop 版
 * 仍然需要保留所有数据 … apps 是要做分页区分暂停/running"). Ads Manager's effective_status, kept hourly in crm_ad_names
 * (mig 20261022120000), decides while it is fresh (read within 3 days): paused, archived, deleted or disapproved at any
 * level = paused, anything else = running. An ad the token cannot see (or not read lately) goes by its last lead: one in
 * the last 7 days = running.
 */
export const AD_STATUS_FRESH_MS = 3 * 24 * 60 * 60_000;
export const AD_QUIET_MS = 7 * 24 * 60 * 60_000;
const STOPPED = new Set(["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "ARCHIVED", "DELETED", "DISAPPROVED"]);

export function adRunning(
  meta: { status?: string | null; statusAt?: string | null } | undefined,
  lastLeadAt: string | null | undefined,
  now: Date,
): boolean {
  const at = meta?.statusAt ? new Date(meta.statusAt).getTime() : NaN;
  if (meta?.status && Number.isFinite(at) && now.getTime() - at <= AD_STATUS_FRESH_MS) return !STOPPED.has(meta.status.toUpperCase());
  const last = lastLeadAt ? new Date(lastLeadAt).getTime() : NaN;
  return Number.isFinite(last) && now.getTime() - last <= AD_QUIET_MS;
}

/** Statuses of an ad Meta has running or about to run (the desktop adds these by itself; 2026-10-22). */
export const AD_LIVE_STATUSES = new Set(["ACTIVE", "PENDING_REVIEW", "PREAPPROVED", "IN_PROCESS", "WITH_ISSUES", "PENDING_BILLING_INFO"]);
const PENDING = new Set(["PENDING_REVIEW", "PREAPPROVED", "IN_PROCESS", "PENDING_BILLING_INFO"]);

/** Whether the desktop should add a Meta ad by itself: live, or its run has not ended. */
export function adToSync(ad: { status: string; start: string | null; end: string | null }, now: Date): boolean {
  if (ad.end && new Date(ad.end).getTime() < now.getTime()) return false;
  return AD_LIVE_STATUSES.has(ad.status);
}

/**
 * An ad's run in a line (2026-10-22, the owner: "广告开始跑，或者 pending 要跑（几时开始，几时结束），在 desktop 都要看到"):
 * "Scheduled · starts 25 Oct, 9:00 am · ends 30 Oct", "Pending review · 25 Oct – 30 Oct", "Running · since 19 Oct",
 * "Ended 30 Oct", "Paused". Empty when Meta told us nothing. The office's clock.
 */
export function adRunLine(meta: { status?: string | null; startAt?: string | null; endAt?: string | null } | undefined, now: Date): string {
  if (!meta) return "";
  const tz = "Asia/Kuala_Lumpur";
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: tz });
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit", timeZone: tz }).toLowerCase();
  const st = (meta.status ?? "").toUpperCase(), t = now.getTime();
  const start = meta.startAt ? new Date(meta.startAt).getTime() : NaN, end = meta.endAt ? new Date(meta.endAt).getTime() : NaN;
  const ends = meta.endAt ? ` · ends ${day(meta.endAt)}` : "";
  if (Number.isFinite(end) && end < t) return `Ended ${day(meta.endAt!)}`;
  if (["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"].includes(st)) return "Paused";
  if (["ARCHIVED", "DELETED"].includes(st)) return "Ended";
  if (st === "DISAPPROVED") return "Rejected by Meta";
  if (PENDING.has(st)) return `Pending review${meta.startAt ? ` · ${day(meta.startAt)}${meta.endAt ? ` – ${day(meta.endAt)}` : ""}` : ""}`;
  if (Number.isFinite(start) && start > t) return `Scheduled · starts ${day(meta.startAt!)}, ${time(meta.startAt!)}${ends}`;
  if (st === "ACTIVE" || st === "WITH_ISSUES") return `Running${meta.startAt ? ` · since ${day(meta.startAt)}` : ""}${ends}`;
  return "";
}
