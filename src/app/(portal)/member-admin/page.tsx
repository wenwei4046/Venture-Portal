import { requirePage } from '@/lib/auth'
import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { adminMemberAction, type AdminMemberData } from "@/lib/member/server";
import { HvPage, PageHead } from "@/components/hrv/kit";
import MemberServicesView from "./_components/MemberServicesView";
import { loadClaimRates, loadFoodClaim, loadRequestFacts } from "./_lib/member-services";
export const dynamic = "force-dynamic";

/**
 * People › Member services (2026-10-10, the HR revamp): the member back
 * office's snapshot plus, with it, what its tabs read — each request's names
 * and history, each memo's readers, the claim rates. Each read asks its own
 * gate; the products the snapshot carries for the Principal (Product options,
 * gone) are not sent to the browser.
 */
export default async function MemberAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  await requirePage('/member-admin')
  const user = await requireAuth();
  // Sales Groups' Review opens one request here (2026-10-10).
  const { request: requestId } = await searchParams;
  // Whoever manages member requests or memos — the Principal holds both
  // keys, so asking the kind as well said nothing (Q7, 2026-10-09).
  const requests = user.permissions.includes("member_requests_manage");
  const memos = user.permissions.includes("member_memos_manage");
  if (!requests && !memos) redirect("/dashboard");
  const [result, facts, claimRates, foodClaim] = await Promise.all([
    adminMemberAction({ action: "list" }),
    requests ? loadRequestFacts() : Promise.resolve(null),
    requests ? loadClaimRates() : Promise.resolve(null),
    requests ? loadFoodClaim() : Promise.resolve(null),
  ]);
  if (!result.ok)
    return (
      <HvPage>
        <PageHead eyebrow="People · Member services" title="Member services" />
        <div className="sheet-danger">{result.error}</div>
      </HvPage>
    );
  const data = { ...(result.data as AdminMemberData), products: [] };
  return (
    <MemberServicesView
      data={data}
      facts={facts}
      claimRates={claimRates}
      foodClaim={foodClaim}
      initialRequestId={requestId && data.requests.some((r) => r.id === requestId) ? requestId : null}
    />
  );
}
