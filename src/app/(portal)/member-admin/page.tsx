import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { adminMemberAction } from "@/lib/member/server";
import MemberAdmin from "@/components/member/MemberAdmin";
export const dynamic = "force-dynamic";
export default async function MemberAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const user = await requireAuth();
  // Sales Groups' Review opens one request here (2026-10-10).
  const { request: requestId } = await searchParams;
  // Whoever manages member requests or memos — the Principal holds both
  // keys, so asking the kind as well said nothing (Q7, 2026-10-09).
  if (
    !user.permissions.some((p) =>
      ["member_requests_manage", "member_memos_manage"].includes(p),
    )
  )
    redirect("/dashboard");
  const result = await adminMemberAction({ action: "list" });
  if (!result.ok)
    return (
      <div>
        <div className="page-head">
          <div>
            <div className="page-eyebrow">
              <em>I.</em> PEOPLE · MEMBER SERVICES
            </div>
            <h1 className="page-title">Member services</h1>
          </div>
        </div>
        <div className="sheet-danger">{result.error}</div>
      </div>
    );
  // `portal`: this page sits on the portal's white sheet (lib/sheet-routes.ts),
  // so it wears the portal's page head and tabs rather than the member app's.
  return <MemberAdmin initialData={result.data} portal initialRequestId={requestId ?? null} />;
}
