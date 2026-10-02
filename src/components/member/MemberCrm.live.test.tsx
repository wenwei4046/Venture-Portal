import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrmLiveData } from "@/lib/member/crm-live";

// The live read is a Server Action; here it answers what the database would for the signed-in person.
const fetchCrm = vi.fn();
vi.mock("@/app/(member)/member/crm-actions", () => ({ fetchCrm: () => fetchCrm() }));
const { default: MemberCrm } = await import("./MemberCrm");

afterEach(() => { cleanup(); fetchCrm.mockReset(); });

const data = (extra: Partial<CrmLiveData> = {}): CrmLiveData => ({
  viewerId: "ann",
  members: [{ id: "ann", name: "Ann Tan", role: "rs", fullTime: true }],
  leads: [{
    id: "c1", name: "Tan Mei Ling", phone: "+60123", adName: "Akemi Fair", pageName: "WhatsApp", campaign: "AD9",
    status: "new", createdAt: "2026-10-02T01:00:00Z", unread: 1, assignedTo: "ann", teamId: "tla",
    messages: [{ id: "m1", from: "lead", text: "Is the promotion still on?", at: "2026-10-02T01:00:00Z" }],
  }],
  appointments: [],
  config: { rules: [], teamRatios: {}, teams: {} },
  ...extra,
});

describe("the CRM on live data", () => {
  it("shows the signed-in member's own customers, with no demo switch", async () => {
    fetchCrm.mockResolvedValue({ ok: true, data: data() });
    render(<MemberCrm live salesperson="Ann Tan" />);
    expect(await screen.findByText("Tan Mei Ling")).toBeTruthy();
    expect(screen.queryByLabelText("Demo: view the CRM as")).toBeNull();
    expect(screen.getByText(/Live · read only for now/)).toBeTruthy();
  });

  it("is read only until sending is built: no reply box, no booking, no Won/Lost", async () => {
    fetchCrm.mockResolvedValue({ ok: true, data: data() });
    render(<MemberCrm live salesperson="Ann Tan" />);
    fireEvent.click(await screen.findByText("Tan Mei Ling"));
    expect(screen.getByText("Is the promotion still on?")).toBeTruthy();
    expect(screen.getByText(/Read only for now — replying from the CRM arrives next/)).toBeTruthy();
    expect(screen.queryByLabelText("Reply")).toBeNull();
    expect(screen.queryByText("Book appointment")).toBeNull();
    expect(screen.queryByLabelText("More actions")).toBeNull();
  });

  it("says so when the person has no CRM role yet", async () => {
    fetchCrm.mockResolvedValue({ ok: true, data: data({ viewerId: null, members: [], leads: [] }) });
    render(<MemberCrm live />);
    expect(await screen.findByText("Your CRM is not set up yet")).toBeTruthy();
  });

  it("says why when it cannot load", async () => {
    fetchCrm.mockResolvedValue({ ok: false, error: "The CRM is not set up for this account yet. Ask your administrator." });
    render(<MemberCrm live />);
    expect(await screen.findByText("The CRM could not open")).toBeTruthy();
    expect(screen.getByText(/Ask your administrator/)).toBeTruthy();
  });

  it("never reads live data on the preview (the demo)", () => {
    render(<MemberCrm salesperson="Jia En" />);
    expect(fetchCrm).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Demo: view the CRM as")).toBeTruthy();
  });
});
