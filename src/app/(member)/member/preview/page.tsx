import { notFound } from "next/navigation";
import type { ResolvingViewport, Viewport } from "next";
import { getUser } from "@/lib/auth";
import { memberDemo } from "@/lib/member/demo";
import MemberWorkspace from "@/components/member/MemberWorkspace";
import MemberAdmin from "@/components/member/MemberAdmin";
import MemberLoginScreen from "@/components/member/MemberLoginScreen";
import InsightDesignPreview from "@/components/member/design-preview/InsightDesignPreview";
import InsightDesignReview from "@/components/member/design-preview/InsightDesignReview";
import ArenaDesignReview from "@/components/member/design-preview/ArenaDesignReview";
import ArenaDesignPreview from "@/components/member/design-preview/ArenaDesignPreview";
import type { AdminMemberData } from "@/lib/member/server";
import RevenueApp from "@/components/member/app/RevenueApp";
import { protoData, protoFixture } from "@/components/member/app/fixtures/proto";

export const dynamic = "force-dynamic";
export const metadata = { title: "Revenue · Mobile & Desktop Preview" };

export async function generateViewport({ searchParams }: {
  searchParams: Promise<{ design?: string; view?: string }>;
}, parent: ResolvingViewport): Promise<Viewport> {
  const params = await searchParams;
  const arena = ["a", "b", "c", "live"].includes(params.design ?? "");
  const inherited = await parent;
  return {
    width: "device-width", initialScale: 1, viewportFit: "cover",
    themeColor: arena ? params.design === "c" || params.design === "live" ? "rgb(255 255 255)" : params.design === "b" ? "rgb(255 250 244)" : "rgb(255 252 247)" : inherited.themeColor,
    ...(arena ? { colorScheme: "light" as const } : {}),
  };
}

export default async function MemberPreview({
  searchParams,
}: {
  searchParams: Promise<{
    admin?: string;
    device?: string;
    width?: string;
    height?: string;
    page?: string;
    quoteView?: string;
    design?: string;
    view?: string;
    role?: string;
    app?: string;
    brand?: string;
    sheet?: string;
    /** `1`: the fixture's bed frames carry charged options (2026-10-05). */
    charges?: string;
  }>;
}) {
  if (process.env.NODE_ENV !== "development") {
    const user = await getUser();
    if (!user || !["principal", "hr"].includes(user.role)) notFound();
  }
  const params = await searchParams;
  // The rebuilt app on the prototype's own content, drawn in the prototype's
  // device frame — laid over a screenshot of the prototype to compare.
  if (params.app === "proto") {
    const device = params.device === "android" || params.device === "desktop" ? params.device : "ios";
    const search = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
    return <RevenueApp initialData={protoData()} initialSearch={search ? `?${search}` : ""} device={device} today="2026-10-03" fixture={protoFixture({ brand: params.brand, sheet: params.sheet, charges: params.charges === "1" })} />;
  }
  if (params.design === "live") {
    const preview = memberDemo();
    if (params.role === "principal") {
      preview.principalView = true;
      preview.profile = { ...preview.profile, name: "Principal", salary: null };
      preview.incomes = [];
      preview.memberships = preview.memberships.map(membership => ({ ...membership,
        title: "Principal", rank: "All members", rate: 0,
        people: membership.people.map(person => ({ ...person, self: false })),
      }));
    }
    return <MemberWorkspace initialData={preview} productionLayout />;
  }
  if (params.view?.startsWith("insight")) {
    if (params.design === "compare") return <InsightDesignReview />;
    if (params.design === "a" || params.design === "b" || params.design === "c") {
      return <InsightDesignPreview design={params.design} />;
    }
  }
  if (params.design === "compare") return <ArenaDesignReview />;
  if ((params.design === "a" || params.design === "c") && params.page &&
      ["today", "income", "quote", "account", "team", "requests", "memos"].includes(params.page)) {
    return <MemberWorkspace initialData={memberDemo()} previewDesign={params.design} />;
  }
  if (params.design === "a" || params.design === "b" || params.design === "c") {
    return <ArenaDesignPreview design={params.design} initialView={params.view} />;
  }
  if (params.device === "phone") {
    const phoneWidth =
      params.width && ["320", "375", "390", "430"].includes(params.width)
        ? Number(params.width)
        : 390;
    const phoneHeight =
      params.height && ["568", "667", "844"].includes(params.height)
        ? Number(params.height)
        : "min(844px, calc(100dvh - 145px))";
    const viewParams = new URLSearchParams();
    if (
      params.page &&
      [
        "today",
        "insight",
        "income",
        "quote",
        "team",
        "requests",
        "memos",
        "account",
        "login",
      ].includes(params.page)
    )
      viewParams.set("page", params.page);
    if (params.quoteView === "catalog" || params.quoteView === "calculator")
      viewParams.set("quoteView", params.quoteView);
    const previewPath = `/member/preview${viewParams.size ? `?${viewParams}` : ""}`;
    return (
      <main
        style={{
          minHeight: "100vh",
          padding: "16px 12px",
          background: "#ded8ce",
          color: "#2b1f17",
        }}
      >
        <div
          style={{ maxWidth: 560, margin: "0 auto 12px", textAlign: "center" }}
        >
          <p style={{ fontSize: 10, letterSpacing: 2, marginBottom: 4 }}>
            HOUZS VENTURE · DESIGN PREVIEW
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Mobile workspace</h1>
          <a
            href={previewPath}
            style={{
              display: "inline-block",
              padding: "10px 12px",
              color: "#2e5c8a",
            }}
          >
            Desktop preview →
          </a>
          <a
            href="/member/preview?admin=1"
            style={{
              display: "inline-block",
              padding: "10px 12px",
              color: "#2e5c8a",
            }}
          >
            HR admin preview →
          </a>
        </div>
        <iframe
          title="Revenue mobile workspace · Interactive preview"
          src={previewPath}
          allow="clipboard-write"
          style={{
            display: "block",
            width: phoneWidth,
            boxSizing: "content-box",
            maxWidth: "100%",
            height: phoneHeight,
            minHeight: 420,
            margin: "0 auto",
            border: "1px solid #bfb1a2",
            borderRadius: 24,
            background: "#f2efea",
            boxShadow: "0 16px 48px #2b1f1720",
          }}
        />
      </main>
    );
  }
  if (params.page === "login")
    return (
      <MemberLoginScreen
        preview
        previewHref="/member/preview?page=today"
      />
    );
  const data = memberDemo();
  if (params.admin === "1") {
    const admin: AdminMemberData = {
      canManageRequests: true,
      canPublishMemos: true,
      canConfigureProducts: true,
      requests: [
        ...data.requests,
        {
          id: "demo-reserved",
          kind: "waiting",
          title: "Amelia · Waiting list request",
          status: "reserved",
          createdAt: data.refreshedAt,
          detail: {
            newPerson: "Amelia Tan",
            subDepartmentId: "fair",
            targetDepartmentId: "fair",
            department: "Fair",
            signature: "Amelia Tan",
            start: "2026-09-11",
          },
        },
        {
          id: "demo-replacement",
          kind: "replacement",
          title: "Marcus · Replacement",
          status: "approved",
          createdAt: data.refreshedAt,
          detail: {
            originalStaffId: "marcus",
            subDepartmentId: "fair",
            newPerson: "Ryan Tan",
            destination: "member_exit",
            effective: "2026-09-10",
          },
        },
      ],
      departments: (data.departments ?? []).map((d) => ({
        ...d,
        occupied: 27,
        reserved: d.id === "fair" ? 1 : 0,
      })),
      memos: data.memos,
      products: data.products.map((product) => ({
        ...product,
        cost: undefined,
      })),
      candidates: [
        {
          id: "candidate-1",
          name: "Ryan Tan",
          departmentId: "fair",
          titleId: "specialist",
        },
      ],
      titles: [
        {
          id: "specialist",
          name: "Revenue Specialist",
          departmentId: "revenue",
          subDepartmentIds: ["fair", "ir"],
        },
      ],
      uplines: [
        {
          id: "jia",
          name: "Jia En",
          subDepartmentId: "fair",
          titleId: "leader",
        },
      ],
      events: [],
    };
    return <MemberAdmin initialData={admin} demo />;
  }
  return <MemberWorkspace initialData={data} />;
}
