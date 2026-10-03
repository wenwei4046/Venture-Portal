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
  config: { rules: [], teams: {} },
  showrooms: [{ id: "kl", name: "Kuala Lumpur Showroom", active: true }, { id: "old", name: "Old Showroom", active: false }],
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
    fireEvent.click(screen.getByRole("button", { name: "Mark Won" }));
    await waitFor(() => expect(crmWrite).toHaveBeenCalledWith("crm_set_status", { p_contact: "c1", p_status: "won", p_reason: null, p_note: null }));
    expect(await screen.findByText(/moves back to Follow up if the customer writes again/)).toBeTruthy();
  });

  it("changes nothing and says why when the database says no", async () => {
    fetchCrm.mockResolvedValue({ ok: true, data: data() });
    crmWrite.mockResolvedValue({ ok: false, error: "You may not change this customer." });
    render(<MemberCrm live salesperson="Ann Tan" />);
    await openChat();
    fireEvent.click(screen.getByRole("button", { name: "Mark Won" }));
    expect(await screen.findByText(/You may not change this customer/)).toBeTruthy();
    expect(screen.queryByText(/moves back to Follow up if the customer writes again/)).toBeNull();
  });

  it("books through the database and does not claim the customer was told", async () => {
    fetchCrm.mockResolvedValue({ ok: true, data: data() });
    crmWrite.mockResolvedValue({ ok: true, data: { id: "appt-db-1" } });
    render(<MemberCrm live salesperson="Ann Tan" />);
    await openChat();
    fireEvent.click(screen.getByRole("button", { name: "Book visit" }));
    // Only the database's open showrooms are offered.
    expect(screen.getAllByRole("radio").map(o => o.textContent)).toEqual(["Kuala LumpurShowroom"]);
    fireEvent.click(screen.getAllByRole("button").find(b => /^[0-9]{1,2}:00/.test(b.textContent ?? "") && !(b as HTMLButtonElement).disabled)!);
    fireEvent.click(screen.getByText("Confirm"));
    await waitFor(() => expect(crmWrite).toHaveBeenCalledWith("crm_book", expect.objectContaining({ p_contact: "c1", p_showroom: "kl", p_minutes: 60 })));
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

  const tl = { id: "tla", name: "Kelvin", role: "tl" as const, teamName: "Team Kelvin" };
  const tl2 = { id: "tlb", name: "Priya", role: "tl" as const, teamName: "Team Priya" };
  const asPrincipal = (extra: Partial<CrmLiveData> = {}) => {
    const d = data();
    return { ...d, viewerId: "boss", members: [{ id: "boss", name: "Loo", role: "boss" as const }, tl, tl2, { ...d.members[0], uplineId: "tla" }], ...extra };
  };

  it("opens the Principal on the numbers — no Inbox, no Contacts", async () => {
    fetchCrm.mockResolvedValue({ ok: true, data: asPrincipal() });
    render(<MemberCrm live salesperson="Principal" />);
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeTruthy();
    expect(screen.getByText("Appt rate")).toBeTruthy();
    expect(screen.getByText("Show-up rate")).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Team Kelvin" })).toBeTruthy();
    const bar = screen.getByRole("navigation", { name: "CRM" });
    expect(Array.from(bar.querySelectorAll("button")).map(b => b.textContent?.replace(/\d+/g, ""))).toEqual(["Overview", "Assignment", "Calendar"]);
  });

  it("lets the Principal hand an ad to teams — saved only on Save", async () => {
    fetchCrm.mockResolvedValue({ ok: true, data: asPrincipal() });
    crmWrite.mockResolvedValue({ ok: true, data: {} });
    render(<MemberCrm live salesperson="Principal" />);
    fireEvent.click(await screen.findByRole("button", { name: /Assignment/ }));
    expect(screen.getByText("Akemi Fair")).toBeTruthy();
    expect(screen.getByText("Not set · going evenly to every team")).toBeTruthy();
    expect(screen.queryByText(/Next 10 enquiries/)).toBeNull();
    fireEvent.click(screen.getByText("Choose teams"));
    fireEvent.click(screen.getByRole("button", { name: "Team Priya" }));
    expect(crmWrite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(crmWrite).toHaveBeenCalledWith("crm_save_ad_rule", { p_ad: "AD9", p_label: "Akemi Fair", p_tls: ["tlb"], p_shares: null }));
    expect(await screen.findByText(/^Team Priya/, { selector: "span" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
  });

  it("lets the Principal split an ad by % — Save waits for 100%", async () => {
    fetchCrm.mockResolvedValue({ ok: true, data: asPrincipal() });
    crmWrite.mockResolvedValue({ ok: true, data: {} });
    render(<MemberCrm live salesperson="Principal" />);
    fireEvent.click(await screen.findByRole("button", { name: /Assignment/ }));
    fireEvent.click(screen.getByText("Choose teams"));
    fireEvent.click(screen.getByRole("radio", { name: "Split by %" }));
    fireEvent.change(screen.getByLabelText("Team Kelvin share of Akemi Fair (%)"), { target: { value: "60" } });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Team Priya share of Akemi Fair (%)"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(crmWrite).toHaveBeenCalledWith("crm_save_ad_rule", { p_ad: "AD9", p_label: "Akemi Fair", p_tls: ["tla", "tlb"], p_shares: { tla: 60, tlb: 40 } }));
    expect(await screen.findByText("60%")).toBeTruthy();
    expect(screen.getByText("40%")).toBeTruthy();
  });

  it("opens on the member the Principal picked in Today", async () => {
    fetchCrm.mockResolvedValue({ ok: true, data: asPrincipal() });
    render(<MemberCrm live salesperson="Principal" viewingStaffId="ann" />);
    expect(await screen.findByText("Ann Tan")).toBeTruthy();
    expect(screen.getByText("Reply within 24 h")).toBeTruthy();
    expect(screen.getByText("Tan Mei Ling")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Back to Overview"));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeTruthy();
  });

  it("gives the HOD their own enquiries to answer, and Mine / Teams", async () => {
    const d = data();
    const own = { ...d.leads[0], id: "c2", name: "Lim Ah Kow", assignedTo: "hod", teamId: undefined };
    fetchCrm.mockResolvedValue({ ok: true, data: { ...d, viewerId: "hod", members: [{ id: "hod", name: "Peter", role: "hod" }, { ...tl, uplineId: "hod" }, { ...d.members[0], uplineId: "tla" }], leads: [...d.leads, own] } });
    render(<MemberCrm live salesperson="Peter" />);
    expect(await screen.findByRole("radio", { name: /Teams/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Mine/ }));
    expect(screen.queryByText("Tan Mei Ling")).toBeNull();
    fireEvent.click(screen.getByText("Lim Ah Kow"));
    expect(await screen.findByLabelText("Reply")).toBeTruthy();
  });

  it("lets the HOD read but never reply", async () => {
    const d = data();
    fetchCrm.mockResolvedValue({ ok: true, data: { ...d, viewerId: "hod", members: [{ id: "hod", name: "Peter", role: "hod" }, ...d.members] } });
    render(<MemberCrm live salesperson="Peter" />);
    await openChat();
    expect(screen.getByText("Is the promotion still on?")).toBeTruthy();
    expect(screen.queryByLabelText("Reply")).toBeNull();
  });

  it("lets the HOD add a showroom in Settings — saved first", async () => {
    const d = data();
    fetchCrm.mockResolvedValue({ ok: true, data: { ...d, viewerId: "hod", members: [{ id: "hod", name: "Peter", role: "hod" }, ...d.members] } });
    crmWrite.mockResolvedValue({ ok: true, data: { id: "new-1", name: "Penang Showroom", active: true } });
    render(<MemberCrm live salesperson="Peter" />);
    fireEvent.click(await screen.findByLabelText("Settings"));
    fireEvent.change(screen.getByPlaceholderText("e.g. Penang Showroom"), { target: { value: "Penang Showroom" } });
    fireEvent.click(screen.getByText("Add showroom"));
    await waitFor(() => expect(crmWrite).toHaveBeenCalledWith("crm_save_showroom", { p_id: null, p_name: "Penang Showroom", p_active: true }));
    expect(await screen.findByDisplayValue("Penang Showroom")).toBeTruthy();
  });

  it("shows a salesperson no showroom settings", async () => {
    fetchCrm.mockResolvedValue({ ok: true, data: data() });
    render(<MemberCrm live salesperson="Ann Tan" />);
    fireEvent.click(await screen.findByLabelText("Settings"));
    expect(screen.queryByText("Add showroom")).toBeNull();
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
