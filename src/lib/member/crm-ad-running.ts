/**
 * Whether an ad is still running (2026-10-22; the owner: "已经结束的广告不需要在apps assign，只保留正在跑的；但在desktop 版
 * 仍然需要保留所有数据 … apps 是要做分页区分暂停/running"). Ads Manager's effective_status, kept hourly in crm_ad_names
 * (mig 20261022100000), decides while it is fresh (read within 3 days): paused, archived, deleted or disapproved at any
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
