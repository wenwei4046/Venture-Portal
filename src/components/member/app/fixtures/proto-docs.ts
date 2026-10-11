/**
 * Documentation on the round-2 handoff's own sample (`Revenue App.dc.html`
 * DOCS, the files shared with Revenue; the member app's `seenDocs` — Kar Jun
 * has opened all but the newest). Server-side only, like the rest of the
 * preview's fixtures.
 */
import type { MemberDocument } from "@/lib/documentation/member";

const doc = (id: string, name: string, fileName: string, uploadedAt: string, seen: boolean): MemberDocument => ({
  id, name, fileName, ext: (fileName.split(".").pop() ?? "").toUpperCase().slice(0, 4), contentType: null, size: null, uploadedAt, seen,
});

export function protoDocs(): MemberDocument[] {
  return [
    doc("L-104", "Price list · October 2026", "Price_List_Oct2026.xlsx", "2026-10-01T02:00:00Z", false),
    doc("L-103", "Employee handbook", "HV_Employee_Handbook_v3.2.pdf", "2026-09-01T02:00:00Z", true),
    doc("L-102", "Akemi brand catalogue 2026", "Akemi_Catalogue_2026.pdf", "2026-08-12T02:00:00Z", true),
    doc("L-101", "Claim policy", "Claim_Policy_2026.pdf", "2026-01-02T02:00:00Z", true),
  ];
}
