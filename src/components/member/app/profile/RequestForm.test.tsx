import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUILT_FORM_NAME, BUILTIN_FIELDS, type WaitingForm } from "@/lib/commission/waiting-form";
import RequestForm, { type ClaimWeek, type FormLink, type FormOptions } from "./RequestForm";
import RequestsPage from "./RequestsPage";

afterEach(cleanup);

const week = (over: Partial<ClaimWeek>): ClaimWeek => ({
  key: "2026-10-02", month: "OCT", n: "W1", brandWeek: "Akemi week", brand: "AKEMI", dates: "2–4 Oct", venue: "PENANG WATERFRONT", org: "Homedec",
  fairId: "penang-fair", start: "2026-10-02", end: "2026-10-04", auto: false, claimable: true, color: "red", tint: "pink", ...over,
});

// Fair as HR set it: Penang is 4 spots at RM 50, Sabah is flown to, KL is local; Airbnb RM 65 a person a
// night. The weekends come newest first, each at the member's own brand week's fair (user 2026-10-06).
const options: FormOptions = {
  subName: "Fair",
  weeks: [
    week({}),
    week({ key: "2026-09-25", month: "SEP", n: "W4", brandWeek: "No brand week", brand: null, dates: "25–27 Sep", venue: null, org: null, fairId: null, start: null, end: null, claimable: false }),
    week({ key: "2026-09-18", month: "SEP", n: "W3", brandWeek: "Zanotti week", brand: "ZANOTTI", dates: "18–20 Sep", venue: "SICC", fairId: "sabah-fair", start: "2026-09-18", end: "2026-09-20", auto: true }),
    week({ key: "2026-09-11", month: "SEP", n: "W2", dates: "11–13 Sep", venue: "MID VALLEY", fairId: "kl-fair", start: "2026-09-11", end: "2026-09-13" }),
    week({ key: "2026-09-04", month: "SEP", n: "W1", dates: "4–6 Sep", venue: "MVEC SOUTHKEY", fairId: "johor-fair", start: "2026-09-04", end: "2026-09-06" }),
  ],
  rates: {
    base: "Klang Valley", perSpot: 50, perPaxNight: 65, groupMaxPax: 3, groupCapPerNight: null,
    regions: [
      { id: "kl", name: "KL", spots: 0, planeTicket: false },
      { id: "penang", name: "Penang", spots: 4, planeTicket: false },
      { id: "sabah", name: "Sabah", spots: 6, planeTicket: true },
    ],
    fairs: {
      "penang-fair": { venue: "PENANG WATERFRONT", regionId: "penang" },
      "sabah-fair": { venue: "SICC", regionId: "sabah" },
      "kl-fair": { venue: "MID VALLEY", regionId: "kl" },
      "johor-fair": { venue: "MVEC SOUTHKEY", regionId: null },
    },
  },
  members: [{ id: "yuny", name: "YUNY" }],
  departments: [{ id: "fair", name: "Fair", capacity: 27, occupied: 26 }, { id: "ir", name: "IR", capacity: null, occupied: 4 }],
  departmentId: "fair",
  waitingList: [],
};

const claimForm = (readOnly: boolean, onSubmit = vi.fn(), opts: FormOptions = options) =>
  render(<RequestForm kind="claim" options={opts} revising={null} readOnly={readOnly} onSubmit={onSubmit} onClose={() => {}} />);
const pick = (title: RegExp) => fireEvent.click(screen.getByRole("button", { name: title }));
const sent = (onSubmit: ReturnType<typeof vi.fn>) =>
  Object.fromEntries([...(onSubmit.mock.calls[0][0] as FormData).entries()].filter(([key]) => key !== "idempotencyKey"));

describe("Requests in View as (user 2026-10-06: 只能看，不能送出)", () => {
  it("each way to start a request opens its form — nothing on the page is switched off", () => {
    const onNew = vi.fn();
    render(<RequestsPage rows={[]} filter="all" onFilter={() => {}} onBack={() => {}} onNew={onNew} onOpen={() => {}} />);
    for (const [label, kind] of [["Submit claim", "claim"], ["Submit replacement", "replacement"], ["Submit waiting list", "waiting"]] as const) {
      const row = screen.getByRole("button", { name: new RegExp(label) });
      expect(row).toBeEnabled();
      fireEvent.click(row);
      expect(onNew).toHaveBeenLastCalledWith(kind);
    }
  });

  it("fills in with the viewed person's brand week, its region and HR's amount, and sends nothing", () => {
    const onSubmit = vi.fn();
    claimForm(true, onSubmit);
    expect(screen.getByText("Penang")).toBeInTheDocument();
    expect(screen.getByText("RM 200.00")).toBeInTheDocument();
    const cta = screen.getByRole("button", { name: "Read-only while viewing as" });
    expect(cta).toBeDisabled();
    fireEvent.click(cta);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each(["replacement", "waiting"] as const)("the %s form says the same", kind => {
    render(<RequestForm kind={kind} options={options} revising={null} readOnly onSubmit={vi.fn()} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Read-only while viewing as" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Review & submit" })).not.toBeInTheDocument();
  });
});

describe("a member's own claim (user 2026-10-06)", () => {
  it("starts at the newest brand week, with the month on each weekend", () => {
    claimForm(false);
    const weeks = screen.getAllByRole("button", { name: /week ·/ });
    expect(weeks.map(b => b.textContent?.slice(0, 6))).toEqual(["OCTW1A", "SEPW4N", "SEPW3Z", "SEPW2A", "SEPW1A"]);
    expect(weeks[0]).toHaveAttribute("aria-pressed", "true");
  });

  it("cannot claim a weekend with no brand week", () => {
    claimForm(false);
    const none = screen.getByRole("button", { name: /No brand week/ });
    expect(none).toBeDisabled();
    expect(none).toHaveTextContent("Not picked, and nothing sold that weekend");
  });

  it("sends only the weekend — the region is the one HR set for its venue, not picked here", async () => {
    const onSubmit = vi.fn(async (form: FormData) => { void form; return { ok: true as const, code: "RQ-2610-001" }; });
    claimForm(false, onSubmit);
    expect(screen.queryByRole("button", { name: "Sabah" })).not.toBeInTheDocument();
    expect(screen.getByText("Set by HR for PENANG WATERFRONT")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
    expect(await screen.findByText("Request submitted")).toBeInTheDocument();
    expect(screen.getByText("RQ-2610-001")).toBeInTheDocument();
    expect(sent(onSubmit)).toEqual({ kind: "claim", subDepartmentId: "fair", claimType: "outstation", week: "2026-10-02", notes: "" });
  });

  it("says when HR has not set the venue's region, and sends nothing", () => {
    const onSubmit = vi.fn();
    claimForm(false, onSubmit);
    pick(/MVEC SOUTHKEY/);
    expect(screen.getByText("HR has not set the region for MVEC SOUTHKEY yet. It can be claimed once they have.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
    expect(screen.getByRole("alert")).toHaveTextContent("HR has not set the region for MVEC SOUTHKEY yet");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("knows a local fair has nothing to claim", () => {
    claimForm(false);
    pick(/MID VALLEY/);
    expect(screen.getByText("MID VALLEY is local to Klang Valley, so there is no outstation claim.")).toBeInTheDocument();
  });

  it("a flown-to region asks for the ticket's price and its invoice, and sends both", async () => {
    const onSubmit = vi.fn(async (form: FormData) => { void form; return { ok: true as const, code: "RQ-2610-002" }; });
    const { container } = claimForm(false, onSubmit);
    pick(/Zanotti week/);
    expect(screen.getByText("Plane ticket")).toBeInTheDocument();
    expect(screen.getByText("SICC · Homedec · auto-located")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the plane ticket's price, as its invoice shows.");
    fireEvent.change(screen.getByPlaceholderText("e.g. 456.70"), { target: { value: "456.70" } });
    expect(screen.getByText("RM 456.70")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Add the plane ticket's invoice.");
    const invoice = new File(["%PDF-1.7"], "flight.pdf", { type: "application/pdf" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [invoice] } });
    fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
    expect(await screen.findByText("RQ-2610-002")).toBeInTheDocument();
    const { invoice: file, ...fields } = sent(onSubmit);
    expect((file as File).name).toBe("flight.pdf");
    expect(fields).toEqual({ kind: "claim", subDepartmentId: "fair", claimType: "outstation", week: "2026-09-18", notes: "", amount: "456.70" });
  });

  // User 2026-10-06: up to HR's small group (3, RM 220 a night) the member keys the invoice and is
  // paid it up to cap × nights — "2， claim 220*2=440"; four or more are RM 65 each, nothing typed.
  describe("an Airbnb stay", () => {
    const capped: FormOptions = { ...options, rates: { ...options.rates, groupCapPerNight: 220 } };
    const stay = (male: number, female: number) => {
      pick(/Airbnb accommodation/);
      fireEvent.change(screen.getByLabelText("Check-in"), { target: { value: "2026-10-02" } });
      fireEvent.change(screen.getByLabelText("Check-out"), { target: { value: "2026-10-04" } });
      for (let i = 0; i < male; i++) fireEvent.click(screen.getByRole("button", { name: "More male" }));
      for (let i = 0; i < female; i++) fireEvent.click(screen.getByRole("button", { name: "More female" }));
    };
    const claimed = () => screen.getByText("Claim amount").nextElementSibling?.textContent;

    it("a small group keys the invoice's total and is paid it, up to the cap a night", async () => {
      const onSubmit = vi.fn(async (form: FormData) => { void form; return { ok: true as const, code: "RQ-2610-003" }; });
      const { container } = claimForm(false, onSubmit, capped);
      stay(1, 1);
      expect(screen.getByText("Up to, per night").nextElementSibling).toHaveTextContent("RM 220.00");
      expect(screen.getByText("Most for this stay").nextElementSibling).toHaveTextContent("RM 440.00");
      fireEvent.change(screen.getByLabelText("Invoice total (RM)"), { target: { value: "380.50" } });
      expect(claimed()).toBe("RM 380.50");
      fireEvent.change(screen.getByLabelText("Invoice total (RM)"), { target: { value: "500" } });
      expect(claimed()).toBe("RM 440.00");
      expect(screen.getByText("The invoice is over the limit, so the claim is RM 440.00. HR checks it against the invoice.")).toBeInTheDocument();
      const invoice = new File(["%PDF-1.7"], "stay.pdf", { type: "application/pdf" });
      fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [invoice] } });
      fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
      expect(await screen.findByText("RQ-2610-003")).toBeInTheDocument();
      const { invoice: file, ...fields } = sent(onSubmit);
      expect((file as File).name).toBe("stay.pdf");
      expect(fields).toEqual({ kind: "claim", subDepartmentId: "fair", claimType: "airbnb", week: "2026-10-02", notes: "",
        start: "2026-10-02", end: "2026-10-04", male: "1", female: "1", amount: "500" });
    });

    it("one person is a small group too, and nothing goes without the invoice's total", () => {
      const onSubmit = vi.fn();
      claimForm(false, onSubmit, capped);
      stay(0, 1);
      expect(screen.getByLabelText("Invoice total (RM)")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Enter the stay's total from its invoice.");
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("more than the small group is paid per person, and there is nothing to key", () => {
      claimForm(false, vi.fn(), capped);
      stay(2, 2);
      expect(screen.queryByLabelText("Invoice total (RM)")).not.toBeInTheDocument();
      expect(screen.getByText("Rate per pax per night").nextElementSibling).toHaveTextContent("RM 65.00");
      expect(claimed()).toBe("RM 520.00");
      expect(screen.getByText("More than 3 pax are paid the fixed rate per pax. You can't edit the amount.")).toBeInTheDocument();
    });

    it("follows the head count HR sets", () => {
      claimForm(false, vi.fn(), { ...capped, rates: { ...capped.rates, groupMaxPax: 2 } });
      stay(2, 1);
      expect(screen.queryByLabelText("Invoice total (RM)")).not.toBeInTheDocument();
      expect(claimed()).toBe("RM 390.00");
    });

    // User 2026-10-06: "airbnb only allow claim outstation fair, then date stay limit in 7 days".
    it("is for an outstation fair only: a local one has no Airbnb claim, and sends nothing", () => {
      const onSubmit = vi.fn();
      claimForm(false, onSubmit, capped);
      pick(/Airbnb accommodation/);
      pick(/MID VALLEY/);
      expect(screen.getByText("MID VALLEY is local to Klang Valley, so there is no Airbnb claim.")).toBeInTheDocument();
      expect(screen.queryByLabelText("Check-in")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
      expect(screen.getByRole("alert")).toHaveTextContent("MID VALLEY is local to Klang Valley, so there is no Airbnb claim.");
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("waits for HR to set the venue's region, and a flown-to fair counts as outstation", () => {
      claimForm(false, vi.fn(), capped);
      pick(/Airbnb accommodation/);
      pick(/MVEC SOUTHKEY/);
      expect(screen.getByText("HR has not set the region for MVEC SOUTHKEY yet. It can be claimed once they have.")).toBeInTheDocument();
      expect(screen.queryByLabelText("Check-in")).not.toBeInTheDocument();
      pick(/Zanotti week/);
      expect(screen.getByLabelText("Check-in")).toBeInTheDocument();
    });

    it("takes a stay of up to 7 nights that covers the fair's days", () => {
      claimForm(false, vi.fn(), capped);
      pick(/Airbnb accommodation/);
      expect(screen.getByText("Up to 7 nights, covering the fair's days (2–4 Oct).")).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Check-in"), { target: { value: "2026-09-28" } });
      fireEvent.change(screen.getByLabelText("Check-out"), { target: { value: "2026-10-05" } });
      expect(screen.getByText("Nights").nextElementSibling).toHaveTextContent("7 nights");
      expect(screen.getByText("Up to 7 nights, covering the fair's days (2–4 Oct).")).toBeInTheDocument();
    });

    it("refuses an eighth night, and pays nothing while it is there", () => {
      const onSubmit = vi.fn();
      claimForm(false, onSubmit, capped);
      stay(1, 1);
      fireEvent.change(screen.getByLabelText("Check-in"), { target: { value: "2026-09-27" } });
      fireEvent.change(screen.getByLabelText("Check-out"), { target: { value: "2026-10-05" } });
      fireEvent.change(screen.getByLabelText("Invoice total (RM)"), { target: { value: "500" } });
      expect(screen.getByText("A stay is at most 7 nights.")).toBeInTheDocument();
      expect(claimed()).toBe("RM 0.00");
      fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
      expect(screen.getByRole("alert")).toHaveTextContent("A stay is at most 7 nights.");
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("refuses a stay that misses the fair", () => {
      const onSubmit = vi.fn();
      claimForm(false, onSubmit, capped);
      stay(1, 1);
      fireEvent.change(screen.getByLabelText("Check-in"), { target: { value: "2026-09-29" } });
      fireEvent.change(screen.getByLabelText("Check-out"), { target: { value: "2026-10-02" } });
      expect(screen.getByText("The stay must cover the fair's days (2–4 Oct).")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
      expect(screen.getByRole("alert")).toHaveTextContent("The stay must cover the fair's days (2–4 Oct).");
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("with no cap set, every stay is per person", () => {
      claimForm(false, vi.fn());
      stay(1, 1);
      expect(screen.queryByLabelText("Invoice total (RM)")).not.toBeInTheDocument();
      expect(claimed()).toBe("RM 260.00");
      expect(screen.getByText("Set by the fixed rate. You can't edit the amount.")).toBeInTheDocument();
    });
  });
});

// HR revamp 7a (2026-10-10): the waiting list is drawn from the form Sales Groups › Form settings
// versions — the four built-ins, HR's own questions, the application form to download and upload.
describe("a waiting list, on HR's form", () => {
  const form = (over: Partial<WaitingForm> = {}): WaitingForm => ({
    version: 3, requireUpload: true, templatePath: null, templateName: BUILT_FORM_NAME, createdAt: null,
    fields: [
      ...BUILTIN_FIELDS,
      { id: "ic", label: "IC number", type: "text", required: true, placeholder: "e.g. 900101-14-5678" },
      { id: "heard", label: "How did they hear about us", type: "dropdown", required: false, options: ["Referral", "Roadshow"] },
      { id: "transport", label: "Has own transport", type: "yesno", required: false },
    ],
    ...over,
  });
  const waiting = (onSubmit = vi.fn(), over: Partial<WaitingForm> = {}, extra: { revising?: { id: string; detail: Record<string, unknown> }; formLink?: FormLink } = {}) =>
    render(<RequestForm kind="waiting" options={{ ...options, waitingForm: { form: form(over) } }} revising={extra.revising ?? null} readOnly={false}
      onSubmit={onSubmit} onClose={() => {}} formLink={extra.formLink} />);
  const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value } });
  const fill = () => {
    type("New member name", "Amelia Tan");
    type("Phone number", "012-345 6789");
    type("Preferred start date", "2026-11-01");
    type("IC number", "900101-14-5678");
    fireEvent.click(screen.getByRole("button", { name: "Roadshow" }));
    fireEvent.change(screen.getByPlaceholderText("Type your full name"), { target: { value: "Jia En" } });
  };
  const upload = (container: HTMLElement, name = "form.pdf") =>
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["%PDF-1.7"], name, { type: "application/pdf" })] } });

  it("asks HR's questions after the built-ins, the optional ones marked, under the capacity", () => {
    waiting();
    expect(screen.getByText("Fair capacity").nextElementSibling).toHaveTextContent("1 of 27 open");
    expect(screen.getByText("How did they hear about us (optional)")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Has own transport" })).toHaveTextContent("YesNo");
    expect(screen.getByRole("group", { name: "Preferred sub-department" })).toHaveTextContent("FairIR");
    expect(screen.getByText("Application form")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload signed form" })).toBeInTheDocument();
  });

  it("names what is missing, marks each, then wants the signed form, then the signature", () => {
    const onSubmit = vi.fn();
    const { container } = waiting(onSubmit);
    fireEvent.click(screen.getByRole("button", { name: "Review & submit" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Fill in new member name, phone number, preferred start date, IC number.");
    expect(screen.getAllByText("Required")).toHaveLength(4);
    fill();
    fireEvent.change(screen.getByPlaceholderText("Type your full name"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Review & submit" }));
    expect(screen.queryAllByText("Required")).toHaveLength(0);
    expect(screen.getByRole("alert")).toHaveTextContent("Upload the signed application form.");
    upload(container);
    expect(screen.getByText("✓ form.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace file" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review & submit" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Type your full name to sign.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("sends the built-ins as before, HR's answers with the form's version, and the signed form", async () => {
    const onSubmit = vi.fn(async (data: FormData) => { void data; return { ok: true as const, code: "RQ-2610-009" }; });
    const { container } = waiting(onSubmit);
    fill();
    upload(container);
    fireEvent.click(screen.getByRole("button", { name: "IR" }));
    expect(screen.getByText("IR capacity").nextElementSibling).toHaveTextContent("4 · no limit");
    fireEvent.click(screen.getByRole("button", { name: "Review & submit" }));
    expect(await screen.findByText("RQ-2610-009")).toBeInTheDocument();
    expect(screen.getByText("Signed form attached · form.pdf")).toBeInTheDocument();
    const { signedForm, answers, ...fields } = sent(onSubmit);
    expect((signedForm as File).name).toBe("form.pdf");
    expect(JSON.parse(String(answers))).toEqual([
      { id: "ic", label: "IC number", value: "900101-14-5678" },
      { id: "heard", label: "How did they hear about us", value: "Roadshow" },
      { id: "transport", label: "Has own transport", value: "" },
    ]);
    expect(fields).toEqual({ kind: "waiting", subDepartmentId: "fair", newPerson: "Amelia Tan", contact: "012-345 6789", targetDepartmentId: "ir",
      start: "2026-11-01", consent: "true", formVersion: "3", signature: "Jia En" });
  });

  it("goes without a signed form when HR does not ask for one", async () => {
    const onSubmit = vi.fn(async (data: FormData) => { void data; return { ok: true as const, code: "RQ-2610-010" }; });
    waiting(onSubmit, { requireUpload: false });
    expect(screen.getByText("Application form (optional)")).toBeInTheDocument();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Review & submit" }));
    expect(await screen.findByText("RQ-2610-010")).toBeInTheDocument();
    expect(sent(onSubmit)).not.toHaveProperty("signedForm");
  });

  it("an update keeps the answers and the signed form it was sent with", async () => {
    const onSubmit = vi.fn(async (data: FormData) => { void data; return { ok: true as const, code: "RQ-2610-011" }; });
    const hash = "a".repeat(64);
    waiting(onSubmit, {}, { revising: { id: "r1", detail: { newPerson: "Amelia Tan", contact: "012", start: "2026-11-01", targetDepartmentId: "fair",
      answers: [{ id: "ic", label: "IC number", value: "900101" }], signedFormName: "signed.jpg", signedFormHash: hash } } });
    expect(screen.getByLabelText("IC number", { exact: false })).toHaveValue("900101");
    expect(screen.getByText("✓ signed.jpg")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Type your full name"), { target: { value: "Jia En" } });
    fireEvent.click(screen.getByRole("button", { name: "Send the update" }));
    expect(await screen.findByText("RQ-2610-011")).toBeInTheDocument();
    expect(sent(onSubmit)).toMatchObject({ requestId: "r1", signedFormName: "signed.jpg", signedFormHash: hash });
    expect(sent(onSubmit)).not.toHaveProperty("signedForm");
  });

  describe("Download form", () => {
    const saved: { name: string; href: string }[] = [];
    beforeEach(() => {
      saved.length = 0;
      URL.createObjectURL = vi.fn(() => "blob:form");
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { saved.push({ name: this.download, href: this.href }); });
    });
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

    it("builds the black-and-white form from the questions when HR uploaded none", async () => {
      const formLink = vi.fn();
      waiting(vi.fn(), {}, { formLink });
      fireEvent.click(screen.getByRole("button", { name: "Download form" }));
      await waitFor(() => expect(saved).toEqual([{ name: BUILT_FORM_NAME, href: "blob:form" }]));
      expect(formLink).not.toHaveBeenCalled();
      const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
      const html = await blob.text();
      expect(html).toContain("Revenue Department · Fair · Form v3");
      expect(html).toContain("IC number *");
    });

    it("hands over HR's own form through a fresh link", async () => {
      const formLink = vi.fn(async () => ({ ok: true as const, data: { url: "https://files.example/form.pdf?token=1", name: "HR form.pdf" } }));
      const fetchMock = vi.fn(async () => new Response(new Blob(["%PDF-1.7"]), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      waiting(vi.fn(), { templatePath: "templates/x/HR form.pdf", templateName: "HR form.pdf" }, { formLink });
      fireEvent.click(screen.getByRole("button", { name: "Download form" }));
      await waitFor(() => expect(saved).toEqual([{ name: "HR form.pdf", href: "blob:form" }]));
      expect(formLink).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith("https://files.example/form.pdf?token=1");
    });

    it("says when HR's form cannot be fetched", async () => {
      waiting(vi.fn(), { templatePath: "templates/x/HR form.pdf" }, { formLink: async () => ({ ok: false as const, error: "HR's application form could not be downloaded. Try again." }) });
      fireEvent.click(screen.getByRole("button", { name: "Download form" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("HR's application form could not be downloaded. Try again.");
      expect(saved).toEqual([]);
    });
  });
});
