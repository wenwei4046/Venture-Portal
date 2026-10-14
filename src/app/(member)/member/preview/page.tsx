import { Suspense } from "react";
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
import { interTight } from "@/components/member/app/fonts";
import DeskProto from "@/components/member/crm/desk/DeskProto";
import AppError from "@/components/member/app/shell/AppError";
import AppLoading from "@/components/member/app/shell/AppLoading";
import { protoData, protoFixture } from "@/components/member/app/fixtures/proto";
import { APP_PAGE_TABS, type AppPage } from "@/lib/member/app-pages";

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
    /** `proto`: the app on the prototype's data; `loading` / `error`: what /member shows while it loads / when it cannot. */
    app?: string;
    brand?: string;
    sheet?: string;
    /** `1`: the fixture's bed frames carry charged options (2026-10-05). */
    charges?: string;
    /** `sample`: Waiting list & replacements on the handoff's sample requests (2026-10-10). */
    track?: string;
    /**
     * The app as somebody whose ticks close these pages / sends (2026-10-11, lib/member/app-pages.ts):
     * `closed=arena,insight`, `sends=quote,requests,track`.
     */
    closed?: string;
    sends?: string;
  }>;
}) {
  if (process.env.NODE_ENV !== "development") {
    const user = await getUser();
    if (!user || !user.permissions.includes("member_requests_manage")) notFound();
  }
  const params = await searchParams;
  // The rebuilt app on the prototype's own content, drawn in the prototype's
  // device frame — laid over a screenshot of the prototype to compare.
  // The CRM desktop on the prototype's own logic and data (CRM Desktop rev 1), drawn exactly where the prototype draws
  // a frame: its props are the frame's (w, variant, tab, role, pane, kind, toast, collapsed, flow, stage).
  if (params.app === "desk-proto") {
    const raw = await searchParams as unknown as Record<string, string | undefined>;
    const props = Object.fromEntries(Object.entries(raw).filter(([k]) => k !== "app")
      .map(([k, v]) => [k, v === "true" ? true : v === "false" ? false : v])) as Record<string, string | boolean | undefined>;
    return <div style={{ padding: 0, margin: 0, background: "#EFE8E2", minHeight: "100vh" }}><DeskProto props={props} /></div>;
  }
  if (params.app === "proto") {
    const device = params.device === "android" || params.device === "desktop" ? params.device : "ios";
    const search = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
    // In the app's own display face, as /member draws it (its layout's wrapper): compared against the prototype, the
    // titles and amounts must be Inter Tight, not the Inter it falls back to (2026-10-14).
    return <div className={interTight.variable} style={{ display: "contents" }}>
      <RevenueApp initialData={protoData({ principal: params.role === "principal" })} initialSearch={search ? `?${search}` : ""} device={device} today="2026-10-03" fixture={protoFixture({ brand: params.brand, sheet: params.sheet, charges: params.charges === "1", track: params.track === "sample" })}
        closed={{ pages: appPages(params.closed), sends: appPages(params.sends) }} />
    </div>;
  }
  // What /member shows while it loads (loading.tsx) or when it cannot (error.tsx), held on
  // screen: `&page=` picks the tab.
  if (params.app === "loading") return <Suspense><AppLoading /></Suspense>;
  if (params.app === "error") return <Suspense><AppError digest="1234567890" /></Suspense>;
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

/** A comma-separated list of the app's pages, anything else dropped. */
function appPages(list: string | undefined): AppPage[] {
  return (list ?? "").split(",").filter((page): page is AppPage => Object.hasOwn(APP_PAGE_TABS, page));
}
