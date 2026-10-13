import React from "react";
import { getAccountUser, getMemberUser } from "@/lib/auth";
import { PdfDocument, PdfTable } from "@/lib/export/pdf";
import { renderPdfBuffer } from "@/lib/export/pdf";
import { canDo } from "@/lib/permission-actions";
import { officeTime } from "@/lib/office-time";
import { adsReportFromParam } from "@/lib/member/crm-ads-report";

/**
 * GET /member/crm-ads-report?d=… — Ads Performance's Download report › PDF (CRM Desktop rev 1, F1), in the portal's
 * PDF house style. A read-only file download (CLAUDE.md › Coding Conventions): it lays out the table the screen already
 * shows its reader — `d` carries that table, checked and capped — and reads and writes nothing. CRM · Manage only, as
 * the page. The PDF library stays on the server (its WebAssembly is not the browser's to load).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deny = (status: number, message: string) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });

export async function GET(request: Request) {
  const user = await getMemberUser();
  if (!user?.is_active) return deny(401, "Sign in first.");
  const account = await getAccountUser();
  if (!account?.is_active || !canDo(account, "crm", "manage")) return deny(403, "You may not do that.");
  const report = adsReportFromParam(new URL(request.url).searchParams.get("d"));
  if (!report) return deny(400, "That report could not be read.");

  const name = Math.max(140, 760 - (report.head.length - 1) * 70);
  const doc = (
    <PdfDocument title="Ads Performance" subtitle={report.title} periodLabel={officeTime().format("D MMMM YYYY")} orientation="landscape">
      <PdfTable
        columns={report.head.map((label, i) => (i === 0 ? { label, width: name } : { label, width: 70, align: "right" as const }))}
        numberFormat="plain"
        rows={report.rows}
        repeatHeader
      />
    </PdfDocument>
  );
  const body = await renderPdfBuffer(doc);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ads-performance-${officeTime().format("YYYY-MM-DD")}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
