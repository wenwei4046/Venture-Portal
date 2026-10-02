import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrmLiveData } from "@/lib/member/crm-live";

// The live read and send are Server Actions; here they answer what the server would.
const fetchCrm = vi.fn();
const sendCrmReply = vi.fn();
vi.mock("@/app/(member)/member/crm-actions", () => ({
  fetchCrm: () => fetchCrm(),
  sendCrmReply: (id: string, text: string) => sendCrmReply(id, text),
}));
const { default: MemberCrm } = await import("./MemberCrm");

afterEach(() => { cleanup(); fetchCrm.mockReset(); sendCrmReply.mockReset(); });

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const data = (extra: Partial<CrmLiveData> = {}, lastCustomerAt = hoursAgo(2)): CrmLiveData => ({
  viewerId: "ann",
  members: [{ id: "ann", name: "Ann Tan", role: "rs", fullTime: true }],
  leads: [{
    id: "c1", name: "Tan Mei Ling", phone: "+60123", adName: "Akemi Fair", pageName: "WhatsApp", campaign: "AD9",
    status: "new", createdAt: hoursAgo(3), unread: 1, assignedTo: "ann", teamId: "tla", lastCustomerAt,
    messages: [{ id: "m1", from: "lead", text: "Is the promotion still on?", at: lastCustomerAt }],
  }],
  appointments: [],
  config: { rules: [], teamRatios: {}, teams: {} },
  ...extra,
});
const openChat = async () => { fireEvent.click(await screen.findByText("Tan Mei Ling")); };

describe("the CRM on live data", () => {
  it("shows the signed-in member's own customers, with no demo switch", async () => {
    fetchCrm.mockResolvedValue({ ok: true, data: data() });
    render(<MemberCrm live salesperson="Ann Tan" />);
    expect(await screen.findByText("Tan Mei Ling")).toBeTruthy();
    expect(screen.queryByLabelText("Demo: view the CRM as")).toBeNull();
  });

  it("replies on WhatsApp inside 24 hours — text only, and nothing else writes yet", async () => {
    fetchCrm.mockResolvedValue({ ok: true, data: data() });
    sendCrmReply.mockResolvedValue({ ok: true, message: { id: "out1", from: "me", text: "Yes, until Sunday!", at: new Date().toISOString(), status: "sent" } });
    render(<MemberCrm live salesperson="Ann Tan" />);
    await openChat();
    expect(screen.getByText(/Replies go to the customer on WhatsApp/)).toBeTruthy();
    expect(screen.queryByLabelText("Send a photo or video")).toBeNull();
    expect(screen.queryByText("Book appointment")).toBeNull();
    expect(screen.queryByLabelText("More actions")).toBeNull();
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "Yes, until Sunday!" } });
    fireEvent.click(screen.getByLabelText("Send"));
    expect(await screen.findByText("Yes, until Sunday!")).toBeTruthy();
    expect(sendCrmReply).toHaveBeenCalledWith("c1", "Yes, until Sunday!");
    expect((screen.getByLabelText("Reply") as HTMLInputElement).value).toBe("");
  });

  it("keeps the draft and says why when WhatsApp refuses", async () => {
    fetchCrm.mockResolvedValue({ ok: true, data: data() });
    sendCrmReply.mockResolvedValue({ ok: false, error: "WhatsApp could not deliver to this number." });
    render(<MemberCrm live salesperson="Ann Tan" />);
    await openChat();
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "Hello?" } });
    fireEvent.click(screen.getByLabelText("Send"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/could not deliver/)).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText("Reply") as HTMLInputElement).value).toBe("Hello?"));
  });

  it("has no reply box after 24 hours, and says why", async () => {
    fetchCrm.mockResolvedValue({ ok: true, data: data({}, hoursAgo(30)) });
    render(<MemberCrm live salesperson="Ann Tan" />);
    await openChat();
    expect(screen.getByText(/More than 24 hours/)).toBeTruthy();
    expect(screen.queryByLabelText("Reply")).toBeNull();
  });

  it("lets the HOD read but never reply", async () => {
    const d = data();
    fetchCrm.mockResolvedValue({ ok: true, data: { ...d, viewerId: "hod", members: [{ id: "hod", name: "Peter", role: "hod" }, ...d.members] } });
    render(<MemberCrm live salesperson="Peter" />);
    await openChat();
    expect(screen.getByText("Is the promotion still on?")).toBeTruthy();
    expect(screen.queryByLabelText("Reply")).toBeNull();
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
  });

  it("never reads or sends live on the preview (the demo)", () => {
    render(<MemberCrm salesperson="Jia En" />);
    expect(fetchCrm).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Demo: view the CRM as")).toBeTruthy();
  });
});
