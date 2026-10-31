import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/storage/stage", () => import("@/test/stage-in-place"));
import { BUILT_FORM_NAME, BUILTIN_FIELDS, REPLACEMENT_BUILTIN_FIELDS, REPLACEMENT_FORM_NAME, type WaitingForm } from "@/lib/commission/waiting-form";
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
    for (const [label, kind] of [["Submit transport claim", "claim"], ["Submit replacement", "replacement"], ["Submit waiting list", "waiting"]] as const) {
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
  // paid it up to cap × nights — "2， claim 220*2=440". User 2026-10-12: a bigger group keys its
  // invoice too — RM 65 a pax a night is "set as a cap … not auto calculate", unlike Outstation's spots.
  describe("an Airbnb stay", () => {
    const capped: FormOptions = { ...options, rates: { ...options.rates, groupCapPerNight: 220 } };
    // The brand week's fair is Fri 2 – Sun 4 Oct, so the calendar opens Thu 1 – Mon 5 Oct.
    const day = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}(,|$)`) });
    const tap = (...labels: string[]) => labels.forEach(label => fireEvent.click(day(label)));
    const stay = (male: number, female: number) => {
      pick(/Airbnb accommodation/);
      tap("Fri, 2 Oct", "Sun, 4 Oct");
      for (let i = 0; i < male; i++) fireEvent.click(screen.getByRole("button", { name: "More male" }));
      for (let i = 0; i < female; i++) fireEvent.click(screen.getByRole("button", { name: "More female" }));
    };
    const invoiceTotal = (value: string) => fireEvent.change(screen.getByLabelText("Invoice total (RM)"), { target: { value } });
    const claimed = () => screen.getByText("Claim amount").nextElementSibling?.textContent;
    const row = (label: string) => screen.getByText(label).nextElementSibling;
    /** The two boxes under the calendar: what check-in and check-out say. */
    const ends = () => ["Check-in", "Check-out"].map(label => `${label}${row(label)?.textContent}`);

    it("a small group keys the invoice's total and is paid it, up to the cap a night", async () => {
      const onSubmit = vi.fn(async (form: FormData) => { void form; return { ok: true as const, code: "RQ-2610-003" }; });
      const { container } = claimForm(false, onSubmit, capped);
      stay(1, 1);
      expect(row("Up to, per night")).toHaveTextContent("RM 220.00");
      expect(row("Most for this stay")).toHaveTextContent("RM 440.00");
      invoiceTotal("380.50");
      expect(claimed()).toBe("RM 380.50");
      invoiceTotal("500");
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
      fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Enter the stay's total from its invoice.");
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("more than the small group keys its invoice too, and is paid it up to RM 65 a pax a night", async () => {
      const onSubmit = vi.fn(async (form: FormData) => { void form; return { ok: true as const, code: "RQ-2610-004" }; });
      const { container } = claimForm(false, onSubmit, capped);
      stay(2, 2);
      expect(row("Up to, per pax per night")).toHaveTextContent("RM 65.00");
      expect(row("Most for this stay")).toHaveTextContent("RM 520.00");
      expect(claimed()).toBe("RM 0.00");
      expect(screen.getByText("More than 3 pax claim the invoice's total, up to RM 65 per pax a night. HR checks it against the invoice.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Enter the stay's total from its invoice.");
      invoiceTotal("480");
      expect(claimed()).toBe("RM 480.00");
      invoiceTotal("600");
      expect(claimed()).toBe("RM 520.00");
      expect(screen.getByText("The invoice is over the limit, so the claim is RM 520.00. HR checks it against the invoice.")).toBeInTheDocument();
      fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["%PDF-1.7"], "stay.pdf", { type: "application/pdf" })] } });
      fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
      expect(await screen.findByText("RQ-2610-004")).toBeInTheDocument();
      expect(sent(onSubmit)).toMatchObject({ claimType: "airbnb", male: "2", female: "2", amount: "600" });
    });

    it("follows the head count HR sets", () => {
      claimForm(false, vi.fn(), { ...capped, rates: { ...capped.rates, groupMaxPax: 2 } });
      stay(2, 1);
      expect(row("Most for this stay")).toHaveTextContent("RM 390.00");
      invoiceTotal("500");
      expect(claimed()).toBe("RM 390.00");
    });

    it("with no small-group figure, every stay is capped by the person", () => {
      claimForm(false, vi.fn());
      stay(1, 1);
      expect(row("Most for this stay")).toHaveTextContent("RM 260.00");
      invoiceTotal("200");
      expect(claimed()).toBe("RM 200.00");
      expect(screen.getByText("You claim the invoice's total, up to RM 65 per pax a night. HR checks it against the invoice.")).toBeInTheDocument();
    });

    it("says so on the category, which is not fixed like Outstation's spots", () => {
      claimForm(false, vi.fn());
      expect(screen.getByRole("button", { name: /Airbnb accommodation/ })).toHaveTextContent("Up to RM 65 per pax per night");
      expect(screen.getByRole("button", { name: /^Outstation/ })).toHaveTextContent("Fixed by spots for the route");
    });

    // User 2026-10-06: "airbnb only allow claim outstation fair".
    it("is for an outstation fair only: a local one has no Airbnb claim, and sends nothing", () => {
      const onSubmit = vi.fn();
      claimForm(false, onSubmit, capped);
      pick(/Airbnb accommodation/);
      pick(/MID VALLEY/);
      expect(screen.getByText("MID VALLEY is local to Klang Valley, so there is no Airbnb claim.")).toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Check-in and check-out" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
      expect(screen.getByRole("alert")).toHaveTextContent("MID VALLEY is local to Klang Valley, so there is no Airbnb claim.");
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("waits for HR to set the venue's region, and a flown-to fair counts as outstation", () => {
      claimForm(false, vi.fn(), capped);
      pick(/Airbnb accommodation/);
      pick(/MVEC SOUTHKEY/);
      expect(screen.getByText("HR has not set the region for MVEC SOUTHKEY yet. It can be claimed once they have.")).toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Check-in and check-out" })).not.toBeInTheDocument();
      pick(/Zanotti week/);
      expect(screen.getByRole("group", { name: "Check-in and check-out" })).toBeInTheDocument();
    });

    // User 2026-10-12: one calendar, opened on the brand week — "开始天减一到结束天加一 … 这个 17 到 21 号
    // 就是 maximum 他们可以定的日期范围。那个 range 直接开放给他们，他们只需要在里面点这几天就行".
    it("opens one calendar on the brand week: the day before the fair to the day after, and nothing else", () => {
      claimForm(false, vi.fn(), capped);
      pick(/Airbnb accommodation/);
      const calendar = screen.getByRole("group", { name: "Check-in and check-out" });
      expect(calendar).toHaveTextContent("Oct 2026");
      const open = [...calendar.querySelectorAll("button[aria-label]")].filter(b => !(b as HTMLButtonElement).disabled).map(b => b.getAttribute("aria-label"));
      expect(open).toEqual(["Thu, 1 Oct", "Fri, 2 Oct, fair day", "Sat, 3 Oct, fair day", "Sun, 4 Oct, fair day", "Mon, 5 Oct"]);
      expect(day("Wed, 30 Sep")).toBeDisabled();
      expect(day("Tue, 6 Oct")).toBeDisabled();
      expect(screen.getByText("Open from the day before the fair to the day after (1–5 Oct). Dots mark the fair's days.")).toBeInTheDocument();
      expect(ends()).toEqual(["Check-inTap a day", "Check-out—"]);
    });

    it("tapping 2, 3 and 4 Oct is in on the 2nd, out on the 4th — two nights", () => {
      claimForm(false, vi.fn(), capped);
      pick(/Airbnb accommodation/);
      tap("Fri, 2 Oct");
      expect(ends()).toEqual(["Check-inFri, 2 Oct", "Check-outTap a day"]);
      tap("Sat, 3 Oct", "Sun, 4 Oct");
      expect(ends()).toEqual(["Check-inFri, 2 Oct", "Check-outSun, 4 Oct"]);
      expect(row("Nights")).toHaveTextContent("2 nights");
      expect(day("Sat, 3 Oct")).toHaveAttribute("aria-pressed", "true");
      expect(day("Thu, 1 Oct")).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(screen.getByRole("button", { name: "Clear" }));
      expect(ends()).toEqual(["Check-inTap a day", "Check-out—"]);
    });

    it("takes the whole of it — in the day before, out the day after", () => {
      claimForm(false, vi.fn(), capped);
      stay(1, 1);
      tap("Thu, 1 Oct", "Mon, 5 Oct");
      expect(row("Nights")).toHaveTextContent("4 nights");
      expect(row("Most for this stay")).toHaveTextContent("RM 880.00");
      expect(screen.getByText("Open from the day before the fair to the day after (1–5 Oct). Dots mark the fair's days.")).toBeInTheDocument();
    });

    it("refuses only the night before the fair, and pays nothing while it is picked", () => {
      const onSubmit = vi.fn();
      claimForm(false, onSubmit, capped);
      pick(/Airbnb accommodation/);
      tap("Thu, 1 Oct", "Fri, 2 Oct");
      for (const who of ["More male", "More female"]) fireEvent.click(screen.getByRole("button", { name: who }));
      invoiceTotal("200");
      expect(screen.getByText("The stay must cover the fair's days (2–4 Oct).")).toBeInTheDocument();
      expect(claimed()).toBe("RM 0.00");
      fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
      expect(screen.getByRole("alert")).toHaveTextContent("The stay must cover the fair's days (2–4 Oct).");
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("asks for the days on the calendar before anything goes", () => {
      const onSubmit = vi.fn();
      claimForm(false, onSubmit, capped);
      pick(/Airbnb accommodation/);
      tap("Fri, 2 Oct");
      fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Tap your check-in and check-out days on the calendar.");
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("another brand week opens on its own days, and drops a stay outside them", () => {
      claimForm(false, vi.fn(), capped);
      pick(/Airbnb accommodation/);
      tap("Fri, 2 Oct", "Sun, 4 Oct");
      pick(/Zanotti week/);
      const calendar = screen.getByRole("group", { name: "Check-in and check-out" });
      expect(calendar).toHaveTextContent("Sep 2026");
      expect(ends()).toEqual(["Check-inTap a day", "Check-out—"]);
      expect([...calendar.querySelectorAll("button[aria-label]")].filter(b => !(b as HTMLButtonElement).disabled).map(b => b.getAttribute("aria-label")))
        .toEqual(["Thu, 17 Sep", "Fri, 18 Sep, fair day", "Sat, 19 Sep, fair day", "Sun, 20 Sep, fair day", "Mon, 21 Sep"]);
    });

    it("a brand week whose fair has no days of its own opens on its weekend, Friday to Sunday", () => {
      claimForm(false, vi.fn(), { ...capped, weeks: [week({ start: null, end: null }), ...capped.weeks.slice(1)] });
      pick(/Airbnb accommodation/);
      expect(day("Thu, 1 Oct")).toBeEnabled();
      expect(day("Fri, 2 Oct, fair day")).toBeEnabled();
      expect(day("Mon, 5 Oct")).toBeEnabled();
      expect(day("Tue, 6 Oct")).toBeDisabled();
    });
  });
});

// The user, 2026-10-31: "我要加多一个 Air ticket claim 的 column … if the venue is accept for air ticket, then these guys
// with tick can claim，就算他们没有 tick transport claim，但是其他除了 ticket 以外，他就不能给 因为他没有 tick 那个
// transport claim". HR's two ticks: by road and an Airbnb stay (Transport claim), the plane ticket (Air ticket claim).
describe("a transport claim's parts, as HR ticked the title (2026-10-31)", () => {
  const planeOnly: FormOptions = { ...options, transport: { road: false, plane: true }, title: "Team Leader" };
  const roadOnly: FormOptions = { ...options, transport: { road: true, plane: false }, title: "Revenue Specialist" };

  it("a title ticked for the air ticket alone opens on its newest fair flown to, and claims the plane ticket", async () => {
    const onSubmit = vi.fn(async (form: FormData) => { void form; return { ok: true as const, code: "RQ-2610-010" }; });
    const { container } = claimForm(false, onSubmit, planeOnly);
    expect(screen.getByText("A plane ticket to a fair you fly to")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Zanotti week/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Outstation/ })).toHaveTextContent("Plane ticket only");
    expect(screen.queryByRole("button", { name: /Airbnb accommodation/ })).not.toBeInTheDocument();
    expect(screen.getByText("Plane ticket")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("e.g. 456.70"), { target: { value: "380" } });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["%PDF-1.7"], "flight.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
    expect(await screen.findByText("RQ-2610-010")).toBeInTheDocument();
    const { invoice, ...fields } = sent(onSubmit);
    expect((invoice as File).name).toBe("flight.pdf");
    expect(fields).toEqual({ kind: "claim", subDepartmentId: "fair", claimType: "outstation", week: "2026-09-18", notes: "", amount: "380" });
  });

  it("but not a fair reached by road, nor a local one — said in place of the spots, and nothing goes", () => {
    const onSubmit = vi.fn();
    claimForm(false, onSubmit, planeOnly);
    pick(/PENANG WATERFRONT/);
    const why = "Team Leader may claim a plane ticket only. HR picks the titles that may claim the rest.";
    expect(screen.getByText(why)).toBeInTheDocument();
    expect(screen.queryByText("spots, worked out for you")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
    expect(screen.getByRole("alert")).toHaveTextContent(why);
    pick(/MID VALLEY/);
    expect(screen.getByText(why)).toBeInTheDocument();
    expect(screen.queryByText(/is local to Klang Valley/)).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("a fair whose region HR has not set says so first, as for anybody", () => {
    claimForm(false, vi.fn(), planeOnly);
    pick(/MVEC SOUTHKEY/);
    expect(screen.getByText("HR has not set the region for MVEC SOUTHKEY yet. It can be claimed once they have.")).toBeInTheDocument();
    expect(screen.queryByText(/may claim a plane ticket only/)).not.toBeInTheDocument();
  });

  it("a title ticked for the transport claim alone claims by road and an Airbnb stay, not the plane ticket", () => {
    const onSubmit = vi.fn();
    claimForm(false, onSubmit, roadOnly);
    expect(screen.getByText("Outstation or Airbnb stay for a fair")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PENANG WATERFRONT/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("RM 200.00")).toBeInTheDocument();
    pick(/Zanotti week/);
    const why = "A plane ticket claim is not open to Revenue Specialist. HR picks the titles that may claim it.";
    expect(screen.getByText(why)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("e.g. 456.70")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
    expect(screen.getByRole("alert")).toHaveTextContent(why);
    expect(onSubmit).not.toHaveBeenCalled();
    pick(/Airbnb accommodation/);
    expect(screen.getByRole("group", { name: "Check-in and check-out" })).toBeInTheDocument();
    expect(screen.queryByText(why)).not.toBeInTheDocument();
  });

  it("both ticks: everything, as before", () => {
    claimForm(false, vi.fn(), { ...options, transport: { road: true, plane: true }, title: "Revenue Specialist" });
    expect(screen.getByRole("button", { name: /^Outstation/ })).toHaveTextContent("Fixed by spots for the route");
    expect(screen.getByRole("button", { name: /Airbnb accommodation/ })).toBeInTheDocument();
    pick(/Zanotti week/);
    expect(screen.getByPlaceholderText("e.g. 456.70")).toBeInTheDocument();
  });

  it("the Requests row says a plane ticket for a title ticked for it alone", () => {
    const { rerender } = render(<RequestsPage rows={[]} filter="all" planeOnly onFilter={() => {}} onBack={() => {}} onNew={() => {}} onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: /Submit transport claim/ })).toHaveTextContent("Plane tickets to a fair you fly to");
    rerender(<RequestsPage rows={[]} filter="all" onFilter={() => {}} onBack={() => {}} onNew={() => {}} onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: /Submit transport claim/ })).toHaveTextContent("Outstation and Airbnb stays");
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

  // 2026-10-20, the user, once HR's own uploads took Word: "need as well".
  it("takes the filled-in Word file as the signed form too", async () => {
    const onSubmit = vi.fn(async (data: FormData) => { void data; return { ok: true as const, code: "RQ-2610-010" }; });
    const { container } = waiting(onSubmit);
    expect(screen.getByText(/then upload a photo or scan — or the filled-in Word file\./)).toBeInTheDocument();
    const input = container.querySelector('input[type="file"]')!;
    expect(input.getAttribute("accept")!.split(",")).toEqual(expect.arrayContaining([
      "application/pdf", "image/jpeg", "image/png", "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".doc", ".docx",
    ]));
    fill();
    fireEvent.change(input, { target: { files: [new File(["PK"], "Amelia application.docx", { type: "" })] } });
    expect(screen.getByText("✓ Amelia application.docx")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review & submit" }));
    expect(await screen.findByText("RQ-2610-010")).toBeInTheDocument();
    expect((sent(onSubmit).signedForm as File).name).toBe("Amelia application.docx");
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

  // 2026-10-14, the user: some are ready any time — "just wait us to let them join".
  it("takes Any time ready for the start date — the day then left empty", async () => {
    const onSubmit = vi.fn(async (data: FormData) => { void data; return { ok: true as const, code: "RQ-2610-012" }; });
    const { container } = waiting(onSubmit);
    fill();
    const anyTime = screen.getByRole("button", { name: "Any time ready" });
    expect(anyTime).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(anyTime);
    const day = screen.getByLabelText("Preferred start date", { exact: false }) as HTMLInputElement;
    expect(day).toBeDisabled();
    expect(day.value).toBe("");
    expect(anyTime).toHaveAttribute("aria-pressed", "true");
    upload(container);
    fireEvent.click(screen.getByRole("button", { name: "Review & submit" }));
    expect(await screen.findByText("RQ-2610-012")).toBeInTheDocument();
    expect(sent(onSubmit)).toMatchObject({ start: "anytime" });
  });

  it("an update of one sent as Any time ready opens with it chosen", () => {
    waiting(vi.fn(), {}, { revising: { id: "r2", detail: { newPerson: "Joan Quek", contact: "018", start: "anytime", targetDepartmentId: "fair" } } });
    expect(screen.getByRole("button", { name: "Any time ready" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Preferred start date", { exact: false })).toBeDisabled();
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

// Round 2's README 18.5 (2026-10-11): a replacement is sent on the form Sales Groups › Replacement list ›
// Form settings versions — its five built-ins with this form's own controls, HR's own questions where HR
// put them, and the replacement form to download and upload.
describe("a replacement, on HR's form", () => {
  const form = (over: Partial<WaitingForm> = {}): WaitingForm => ({
    version: 2, requireUpload: true, templatePath: null, templateName: REPLACEMENT_FORM_NAME, createdAt: null,
    fields: [
      ...REPLACEMENT_BUILTIN_FIELDS,
      { id: "q_handover", label: "Handover done?", type: "yesno", required: true },
      { id: "q_notes", label: "Notes for HR", type: "text", required: false },
    ],
    ...over,
  });
  const replacement = (onSubmit = vi.fn(), over: Partial<WaitingForm> | null = {}, extra: { revising?: { id: string; detail: Record<string, unknown> }; replFormLink?: FormLink } = {}) =>
    render(<RequestForm kind="replacement" options={over === null ? options : { ...options, replacementForm: { form: form(over) } }} revising={extra.revising ?? null}
      readOnly={false} onSubmit={onSubmit} onClose={() => {}} formLink={vi.fn()} replFormLink={extra.replFormLink} />);
  const fillBuiltIns = () => {
    fireEvent.click(screen.getByRole("button", { name: "YUNY" }));
    fireEvent.change(screen.getByPlaceholderText("Optional if no replacement"), { target: { value: "Ryan Tan" } });
    fireEvent.change(screen.getByLabelText("Planned effective date"), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByPlaceholderText("Why, and how the handover works"), { target: { value: "Moving to Penang" } });
  };
  const upload = (container: HTMLElement, name = "form.pdf") =>
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["%PDF-1.7"], name, { type: "application/pdf" })] } });
  const labels = () => [...document.querySelectorAll("[class*=fieldLabel]")].map(e => e.firstChild?.textContent ?? "");

  it("asks HR's own questions after the built-ins, and offers the replacement form", () => {
    replacement();
    expect(screen.getByRole("group", { name: "Handover done?" })).toHaveTextContent("YesNo");
    expect(screen.getByText("Notes for HR (optional)")).toBeInTheDocument();
    expect(screen.getByText("Replacement form")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload signed form" })).toBeInTheDocument();
    expect(labels().slice(-2)).toEqual(["Handover done?", "Notes for HR (optional)"]);
  });

  it("draws HR's own question where HR put it", () => {
    replacement(vi.fn(), { fields: [REPLACEMENT_BUILTIN_FIELDS[0], { id: "q_seat", label: "Seat number", type: "text", required: false }, ...REPLACEMENT_BUILTIN_FIELDS.slice(1)] });
    const all = labels();
    expect(all.indexOf("Seat number (optional)")).toBe(all.indexOf("Original member") + 1);
  });

  it("wants HR's required answers after the built-ins, then the signed form", () => {
    const onSubmit = vi.fn();
    replacement(onSubmit);
    fillBuiltIns();
    fireEvent.click(screen.getByRole("button", { name: "Review & submit" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Fill in handover done?.");
    expect(screen.getAllByText("Required")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    fireEvent.click(screen.getByRole("button", { name: "Review & submit" }));
    expect(screen.queryAllByText("Required")).toHaveLength(0);
    expect(screen.getByRole("alert")).toHaveTextContent("Upload the signed replacement form.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("sends the built-ins as before, HR's answers with the form's version, and the signed form", async () => {
    const onSubmit = vi.fn(async (data: FormData) => { void data; return { ok: true as const, code: "RQ-2610-020" }; });
    const { container } = replacement(onSubmit);
    fillBuiltIns();
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    upload(container);
    fireEvent.click(screen.getByRole("button", { name: "Review & submit" }));
    expect(await screen.findByText("RQ-2610-020")).toBeInTheDocument();
    expect(screen.getByText("Signed form attached · form.pdf")).toBeInTheDocument();
    const { signedForm, answers, ...fields } = sent(onSubmit);
    expect((signedForm as File).name).toBe("form.pdf");
    expect(JSON.parse(String(answers))).toEqual([
      { id: "q_handover", label: "Handover done?", value: "Yes" },
      { id: "q_notes", label: "Notes for HR", value: "" },
    ]);
    expect(fields).toEqual({ kind: "replacement", subDepartmentId: "fair", originalStaffId: "yuny", destination: "department_exit",
      replacementSource: "new", newPerson: "Ryan Tan", effective: "2026-11-01", reason: "Moving to Penang", formVersion: "2" });
  });

  it("goes without a signed form when HR does not ask for one", async () => {
    const onSubmit = vi.fn(async (data: FormData) => { void data; return { ok: true as const, code: "RQ-2610-021" }; });
    replacement(onSubmit, { requireUpload: false });
    expect(screen.getByText("Replacement form (optional)")).toBeInTheDocument();
    fillBuiltIns();
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    fireEvent.click(screen.getByRole("button", { name: "Review & submit" }));
    expect(await screen.findByText("RQ-2610-021")).toBeInTheDocument();
    expect(sent(onSubmit)).not.toHaveProperty("signedForm");
  });

  it("an update keeps the answers and the signed form it was sent with", async () => {
    const onSubmit = vi.fn(async (data: FormData) => { void data; return { ok: true as const, code: "RQ-2610-022" }; });
    const hash = "b".repeat(64);
    replacement(onSubmit, {}, { revising: { id: "r2", detail: { originalStaffId: "yuny", destination: "member_exit", replacementSource: "new", newPerson: "Ryan Tan",
      effective: "2026-11-01", reason: "Moving to Penang", answers: [{ id: "q_handover", label: "Handover done?", value: "No" }],
      signedFormName: "signed.jpg", signedFormHash: hash } } });
    expect(screen.getByRole("button", { name: "No" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("✓ signed.jpg")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send the update" }));
    expect(await screen.findByText("RQ-2610-022")).toBeInTheDocument();
    expect(sent(onSubmit)).toMatchObject({ requestId: "r2", signedFormName: "signed.jpg", signedFormHash: hash, formVersion: "2" });
    expect(sent(onSubmit)).not.toHaveProperty("signedForm");
  });

  it("until HR's form arrives, asks the five built-ins and offers the built form", () => {
    replacement(vi.fn(), null);
    expect(screen.queryByRole("group", { name: "Handover done?" })).not.toBeInTheDocument();
    expect(screen.getByText("Replacement form (optional)")).toBeInTheDocument();
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

    it("builds the black-and-white replacement form when HR uploaded none", async () => {
      const replFormLink = vi.fn();
      replacement(vi.fn(), {}, { replFormLink });
      fireEvent.click(screen.getByRole("button", { name: "Download form" }));
      await waitFor(() => expect(saved).toEqual([{ name: REPLACEMENT_FORM_NAME, href: "blob:form" }]));
      expect(replFormLink).not.toHaveBeenCalled();
      const html = await (vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob).text();
      expect(html).toContain("HOUZS Venture · Replacement form");
      expect(html).toContain("Revenue Department · Fair · Form v2");
      expect(html).toContain("Handover done? *");
    });

    it("hands over HR's own replacement form through its own link, not the waiting list's", async () => {
      const replFormLink = vi.fn(async () => ({ ok: true as const, data: { url: "https://files.example/r.pdf?token=1", name: "HR replacement.pdf" } }));
      vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["%PDF-1.7"]), { status: 200 })));
      replacement(vi.fn(), { templatePath: "templates/x/HR replacement.pdf", templateName: "HR replacement.pdf" }, { replFormLink });
      fireEvent.click(screen.getByRole("button", { name: "Download form" }));
      await waitFor(() => expect(saved).toEqual([{ name: "HR replacement.pdf", href: "blob:form" }]));
      expect(replFormLink).toHaveBeenCalledTimes(1);
    });
  });
});
