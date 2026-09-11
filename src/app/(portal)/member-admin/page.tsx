import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { adminMemberAction } from "@/lib/member/server";
import MemberAdmin from "@/components/member/MemberAdmin";
export const dynamic = "force-dynamic";
export default async function MemberAdminPage() {
  const user = await requireAuth();
  if (
    user.role !== "principal" &&
    !user.permissions.some((p) =>
      ["member_requests_manage", "member_memos_manage"].includes(p),
    )
  )
    redirect("/dashboard");
  const result = await adminMemberAction({ action: "list" });
  if (!result.ok)
    return (
      <div className="page-head">
        <div>
          <div className="page-eyebrow">REVENUE · MEMBER SERVICES</div>
          <h1 className="page-title">Member services</h1>
          <p className="text-graphite mt-4">{result.error}</p>
        </div>
      </div>
    );
  return <MemberAdmin initialData={result.data} />;
}
