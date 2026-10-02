import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrmLiveData } from "@/lib/member/crm-live";

// The live read and send are Server Actions; here they answer what the server would.
const fetchCrm = vi.fn();
const sendCrmReply = vi.fn();
const crmWrite = vi.fn();
vi.mock("@/app/(member)/member/crm-actions", () => ({
  fetchCrm: () => fetchCrm(),
  sendCrmReply: (id: string, text: string) => sendCrmReply(id, text),
  crmWrite: (name: string, args: Record<string, unknown>) => crmWrite(name, args),
}));
const { default: MemberCrm } = await import("./MemberCrm");

afterEach(() => { cleanup(); fetchCrm.mockReset(); sendCrmReply.mockReset(); crmWrite.mockReset(); });

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const data = (extra: Partial<CrmLiveData> = {}, lastCustomerAt = hoursAgo(2)): CrmLiveData => ({
  viewerId: "ann",
  setup: null,
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

  it("replies on WhatsApp inside 24 hours — text only", async () => {
    fetchCrm.mockResolvedValue({ ok: true, data: data() });
    sendCrmReply.mockResolvedValue({ ok: true, message: { id: "out1", from: "me", text: "Yes, until Sunday!", at: new Date().toISOString(), status: "sent" } });
    render(<MemberCrm live salesperson="Ann Tan" />);
    await openChat();
    expect(screen.queryByLabelText("Send a photo or video")).toBeNull();
    expect(screen.queryByText(/Demo: send a message/)).toBeNull();
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

  it("saves Won to the database before showing it", async () => {
    fetchCrm.mockResolvedValue({ ok: true, data: data() });
    crmWrite.mockResolvedValue({ ok: true, data: { status: "won" } });
    render(<MemberCrm live salesperson="Ann Tan" />);
    await openChat();
    fireEvent.click(screen.getByLabelText("More actions"));
    fireEvent.click(screen.getByText("Mark as Won"));
    await waitFor(() => expect(crmWrite).toHaveBeenCalledWith("crm_set_status", { p_contact: "c1", p_status: "won", p_reason: null, p_note: null }));
    expect(await screen.findByText(/moves back to Follow up if the customer writes again/)).toBeTruthy();
  });

  it("changes nothing and says why when the database says no", async () => {
    fetchCrm.mockResolvedValue({ ok: true, data: data() });
    crmWrite.mockResolvedValue({ ok: false, error: "You may not change this customer." });
    render(<MemberCrm live salesperson="Ann Tan" />);
    await openChat();
    fireEvent.click(screen.getByLabelText("More actions"));
    fireEvent.click(screen.getByText("Mark as Won"));
    expect(await screen.findByText(/You may not change this customer/)).toBeTruthy();
    expect(screen.queryByText(/moves back to Follow up if the customer writes again/)).toBeNull();
  });

  it("books through the database and does not claim the customer was told", async () => {
    fetchCrm.mockResolvedValue({ ok: true, data: data() });
    crmWrite.mockResolvedValue({ ok: true, data: { id: "appt-db-1" } });
    render(<MemberCrm live salesperson="Ann Tan" />);
    await openChat();
    fireEvent.click(screen.getByText("Book appointment"));
    fireEvent.click(screen.getAllByRole("button").find(b => /^[0-9]{1,2}:00/.test(b.textContent ?? "") && !(b as HTMLButtonElement).disabled)!);
    fireEvent.click(screen.getByText("Confirm"));
    await waitFor(() => expect(crmWrite).toHaveBeenCalledWith("crm_book", expect.objectContaining({ p_contact: "c1", p_minutes: 60 })));
    expect(await screen.findByText(/Not sent to the customer — tell them in the chat/)).toBeTruthy();
    expect(screen.queryByText("APPOINTMENT CONFIRMED")).toBeNull();
  });

  it("on Messenger, still replies after 24 hours as a person — until 7 days", async () => {
    const d = data({}, hoursAgo(30));
    fetchCrm.mockResolvedValue({ ok: true, data: { ...d, leads: d.leads.map(l => ({ ...l, channel: "messenger" as const, pageName: "Messenger" })) } });
    render(<MemberCrm live salesperson="Ann Tan" />);
    await openChat();
    expect(screen.getByText(/Human Agent/)).toBeTruthy();
    expect(screen.getByLabelText("Reply")).toBeTruthy();
    cleanup();
    const old = data({}, hoursAgo(24 * 8));
    fetchCrm.mockResolvedValue({ ok: true, data: { ...old, leads: old.leads.map(l => ({ ...l, channel: "messenger" as const })) } });
    render(<MemberCrm live salesperson="Ann Tan" />);
    await openChat();
    expect(screen.getByText(/More than 7 days/)).toBeTruthy();
    expect(screen.queryByLabelText("Reply")).toBeNull();
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

  it("says which link is missing: the login, or a CRM role for the title", async () => {
    fetchCrm.mockResolvedValue({ ok: true, data: data({ viewerId: null, setup: "not_linked", members: [], leads: [] }) });
    render(<MemberCrm live />);
    expect(await screen.findByText("Your CRM is not set up yet")).toBeTruthy();
    expect(screen.getByText(/login is not linked to your employee record/)).toBeTruthy();
    cleanup();
    fetchCrm.mockResolvedValue({ ok: true, data: data({ viewerId: null, setup: "no_role", members: [], leads: [] }) });
    render(<MemberCrm live />);
    expect(await screen.findByText(/job title has no role in the CRM/)).toBeTruthy();
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
