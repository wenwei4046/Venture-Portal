import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RequestForm, { type ClaimWeek, type FormOptions, type SubmitOutcome } from "./RequestForm";
import RequestsPage from "./RequestsPage";
import type { RequestRowVM } from "./profile-vm";

// The food claim (2026-10-13 — the user: "当他 submit 的时候，他就可以选他的 week（星期本身可以点）… 他可以点开它，
// 选他是 claim 9 号到 10 号全部，或者只 claim 其中的某几天"; Fair's only, for the titles HR picks; then "they will
// submit by total month, for every pax, dont by week submit" — one claim a person a month, once it is over).

afterEach(cleanup);

const week = (over: Partial<ClaimWeek>): ClaimWeek => ({
  key: "2026-10-09", month: "OCT", n: "W2", brandWeek: "Zanotti week", brand: "ZANOTTI", dates: "9–11 Oct", venue: "IOIGECC", org: "Homedec",
  fairId: "oct-fair", start: "2026-10-09", end: "2026-10-11", auto: false, claimable: true, worked: true, color: "amber", tint: "gold", ...over,
});

const options: FormOptions = {
  subName: "Fair",
  weeks: [
    week({}),
    // The ERP's booth, no fair in the portal yet: Outstation cannot be claimed for it, a meal can.
    week({ key: "2026-10-02", n: "W1", brandWeek: "Akemi week", brand: "AKEMI", dates: "2–4 Oct", venue: "MITEC", fairId: null,
      start: "2026-10-02", end: "2026-10-04", claimable: false, color: "red", tint: "pink" }),
    week({ key: "2026-09-25", month: "SEP", n: "W4", brandWeek: "No brand week", brand: null, dates: "25–27 Sep", venue: null, org: null,
      fairId: null, start: null, end: null, claimable: false, worked: false }),
    week({ key: "2026-09-18", month: "SEP", n: "W3", dates: "18–20 Sep", venue: "MVEC SOUTHKEY", fairId: "sep-3", start: "2026-09-18", end: "2026-09-20" }),
    week({ key: "2026-09-11", month: "SEP", n: "W2", brandWeek: "Akemi week", brand: "AKEMI", dates: "11–13 Sep", venue: "MID VALLEY", fairId: "sep-2",
      start: "2026-09-11", end: "2026-09-13", color: "red", tint: "pink" }),
  ],
  rates: {
    base: "Klang Valley", perSpot: 50, perPaxNight: 65, groupMaxPax: 3, groupCapPerNight: null, regions: [], fairs: {},
    food: { subDepartmentId: "fair", perDay: 20, titles: ["Team Leader"] },
  },
  members: [],
  departments: [{ id: "fair", name: "Fair", capacity: null, occupied: 0 }],
  departmentId: "fair",
  waitingList: [],
  today: "2026-10-13",
  foodClaims: [],
};

const ok = (code = "RQ-2610-007") => vi.fn(async (form: FormData): Promise<SubmitOutcome> => { void form; return { ok: true, code }; });
const foodForm = (onSubmit = ok(), opts: FormOptions = options, readOnly = false, revising: { id: string; detail: Record<string, unknown> } | null = null) =>
  render(<RequestForm kind="food" options={opts} revising={revising} readOnly={readOnly} onSubmit={onSubmit} onClose={() => {}} />);
const sent = (onSubmit: ReturnType<typeof ok>, call = 0) =>
  Object.fromEntries([...(onSubmit.mock.calls[call][0] as FormData).entries()].filter(([key]) => key !== "idempotencyKey"));
const weekCard = (title: RegExp) => screen.getByRole("button", { name: title });
const day = (label: RegExp) => screen.getByRole("button", { name: label });
/** A row of the summary card (the field above is labelled "Month" too). */
const sum = (label: string) => within(screen.getByText("Claim amount").closest("div")!.parentElement!).getByText(label).parentElement!;
const months = () => screen.getAllByRole("button", { name: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/ });

describe("Submit food claim — a month at a time", () => {
  it("opens on the newest month that is over: every weekend of it listed, every day ticked, at HR's rate a day", () => {
    foodForm();
    expect(screen.getByRole("dialog", { name: "Submit food claim" })).toBeInTheDocument();
    expect(months().map(b => `${b.textContent}=${b.getAttribute("aria-pressed")}`)).toEqual(["Oct 2026=false", "Sep 2026=true"]);
    // September's weekends, first to last: two worked, one with no booth.
    const cards = screen.getAllByRole("button", { name: /week · / });
    expect(cards.map(b => b.textContent?.replace(/\s+/g, " "))).toEqual([
      expect.stringContaining("Akemi week · 11–13 Sep"), expect.stringContaining("Zanotti week · 18–20 Sep"), expect.stringContaining("No brand week · 25–27 Sep"),
    ]);
    expect(weekCard(/Akemi week · 11–13 Sep/)).toHaveTextContent("3 days");
    expect(weekCard(/No brand week · 25–27 Sep/)).toBeDisabled();
    expect(sum("Month")).toHaveTextContent("Sep 2026");
    expect(sum("Days")).toHaveTextContent("6 days · 11, 12, 13, 18, 19, 20 Sep");
    expect(screen.getByText("RM 120.00")).toBeInTheDocument();
  });

  it("a weekend opens to its days; a day not worked is unticked; the month and its weekends are what is sent", async () => {
    const onSubmit = ok();
    foodForm(onSubmit);
    expect(screen.queryByRole("button", { name: /^Sat 19 Sep/ })).not.toBeInTheDocument();
    fireEvent.click(weekCard(/Zanotti week · 18–20 Sep/));
    expect(weekCard(/Zanotti week · 18–20 Sep/)).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(day(/^Sat 19 Sep/));
    expect(day(/^Sat 19 Sep/)).toHaveAttribute("aria-pressed", "false");
    expect(weekCard(/Zanotti week · 18–20 Sep/)).toHaveTextContent("2 days");
    expect(sum("Days")).toHaveTextContent("5 days · 11, 12, 13, 18, 20 Sep");
    expect(screen.getByText("RM 100.00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
    expect(await screen.findByText("Request submitted")).toBeInTheDocument();
    // A claim to the database; the fairs, the rate and the amount are its own.
    expect(sent(onSubmit)).toEqual({
      kind: "claim", subDepartmentId: "fair", claimType: "food", month: "2026-09", notes: "",
      weeks: JSON.stringify([{ week: "2026-09-11", days: ["2026-09-11", "2026-09-12", "2026-09-13"] }, { week: "2026-09-18", days: ["2026-09-18", "2026-09-20"] }]),
    });
  });

  it("a weekend with every day unticked is left out", async () => {
    const onSubmit = ok();
    foodForm(onSubmit);
    fireEvent.click(weekCard(/Akemi week · 11–13 Sep/));
    for (const label of [/^Fri 11 Sep/, /^Sat 12 Sep/, /^Sun 13 Sep/]) fireEvent.click(day(label));
    expect(weekCard(/Akemi week · 11–13 Sep/)).toHaveTextContent("None");
    fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
    await screen.findByText("Request submitted");
    expect(JSON.parse(String(sent(onSubmit).weeks))).toEqual([{ week: "2026-09-18", days: ["2026-09-18", "2026-09-19", "2026-09-20"] }]);
  });

  it("a month not over yet says from when it can be claimed, and sends nothing", () => {
    const onSubmit = ok();
    foodForm(onSubmit);
    fireEvent.click(screen.getByRole("button", { name: "Oct 2026" }));
    expect(screen.getByText("Claimed once the month is over, from 1 Nov.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /week · / }).map(b => b.textContent?.slice(0, 6))).toEqual(["OCTW1A", "OCTW2Z"]);
    fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Food for Oct 2026 is claimed once the month is over, from 1 Nov.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("a month already claimed is said so, and sends nothing — a month is claimed once", () => {
    const onSubmit = ok();
    const opts: FormOptions = {
      ...options,
      foodClaims: [
        { id: "a", kind: "claim", status: "submitted", requestNo: "RQ-2610-004", detail: { claimType: "food", month: "2026-09", days: ["2026-09-11"] } },
        { id: "b", kind: "claim", status: "withdrawn", requestNo: "RQ-2610-003", detail: { claimType: "food", month: "2026-10", days: [] } },
      ],
    };
    foodForm(onSubmit, opts);
    expect(screen.getByRole("button", { name: "Sep 2026" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Sep 2026 is already claimed · RQ-2610-004.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Food for Sep 2026 is already claimed (RQ-2610-004): a month is claimed once.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("asks for a day, and for HR's rate, before anything is sent", () => {
    const onSubmit = ok();
    foodForm(onSubmit);
    for (const card of [/Akemi week · 11–13 Sep/, /Zanotti week · 18–20 Sep/]) fireEvent.click(weekCard(card));
    for (const label of [/^Fri 11 Sep/, /^Sat 12 Sep/, /^Sun 13 Sep/, /^Fri 18 Sep/, /^Sat 19 Sep/, /^Sun 20 Sep/]) fireEvent.click(day(label));
    fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Tick the days you worked at the fairs.");
    cleanup();
    foodForm(onSubmit, { ...options, rates: { ...options.rates, food: { subDepartmentId: "fair", perDay: null, titles: ["Team Leader"] } } });
    expect(screen.getByText("Not set")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
    expect(screen.getByRole("alert")).toHaveTextContent("HR has not set the food claim's rate a day yet.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("in View as it opens on the viewed person's month and sends nothing", () => {
    const onSubmit = ok();
    foodForm(onSubmit, options, true);
    expect(sum("Days")).toHaveTextContent("6 days");
    const cta = screen.getByRole("button", { name: "Read-only while viewing as" });
    expect(cta).toBeDisabled();
    fireEvent.click(cta);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("a food claim HR sent back opens on its own month and days — a weekend it left out stays out", async () => {
    const onSubmit = ok();
    const detail = { claimType: "food", month: "2026-09", weeks: [{ week: "2026-09-18", days: ["2026-09-18"] }], days: ["2026-09-18"], notes: "W3 only" };
    const opts: FormOptions = { ...options, foodClaims: [{ id: "r1", kind: "claim", status: "needs_info", requestNo: "RQ-2610-009", detail }] };
    foodForm(onSubmit, opts, false, { id: "r1", detail });
    expect(screen.queryByText(/already claimed/)).not.toBeInTheDocument();
    expect(weekCard(/Zanotti week · 18–20 Sep/)).toHaveTextContent("1 day");
    expect(weekCard(/Akemi week · 11–13 Sep/)).toHaveTextContent("None");
    fireEvent.click(weekCard(/Zanotti week · 18–20 Sep/));
    fireEvent.click(day(/^Sat 19 Sep/));
    fireEvent.click(screen.getByRole("button", { name: "Send the update" }));
    await screen.findByText("Request submitted");
    expect(sent(onSubmit)).toMatchObject({ requestId: "r1", claimType: "food", month: "2026-09", notes: "W3 only",
      weeks: JSON.stringify([{ week: "2026-09-18", days: ["2026-09-18", "2026-09-19"] }]) });
  });

  it("holds back a day another food claim holds", () => {
    const opts: FormOptions = {
      ...options,
      foodClaims: [{ id: "x", kind: "claim", status: "submitted", detail: { claimType: "food", month: "2026-08", days: ["2026-09-11"] } }],
    };
    foodForm(ok(), opts);
    fireEvent.click(weekCard(/Akemi week · 11–13 Sep/));
    expect(day(/^Fri 11 Sep, claimed/)).toBeDisabled();
    expect(day(/^Fri 11 Sep, claimed/)).toHaveTextContent("Claimed");
    expect(weekCard(/Akemi week · 11–13 Sep/)).toHaveTextContent("2 days");
  });

  it("sent again after a refusal, it is a new submission (a key used for other days is refused)", async () => {
    const onSubmit = vi.fn(async (form: FormData): Promise<SubmitOutcome> => {
      void form;
      return onSubmit.mock.calls.length === 1 ? { ok: false, error: "Food is already claimed for 12 Sep. Untick those days and send it again." } : { ok: true, code: "RQ-2610-008" };
    });
    foodForm(onSubmit);
    fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Food is already claimed for 12 Sep.");
    fireEvent.click(weekCard(/Akemi week · 11–13 Sep/));
    fireEvent.click(day(/^Sat 12 Sep/));
    fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
    await screen.findByText("Request submitted");
    const keys = onSubmit.mock.calls.map(([form]) => (form as FormData).get("idempotencyKey"));
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).not.toBe(keys[0]);
  });
});

describe("Requests offers a food claim only where HR opened it", () => {
  const rows: RequestRowVM[] = [
    { id: "a", kind: "claim", title: "Outstation claim · PENANG", sub: "RQ-2610-001 · 5 Oct", status: "Pending review", tone: "pending" },
    { id: "b", kind: "food", title: "Food claim · Sep 2026", sub: "RQ-2610-002 · 2 Oct", status: "Pending review", tone: "pending" },
  ];
  const page = (kinds?: Parameters<typeof RequestsPage>[0]["kinds"], list: RequestRowVM[] = [], filter: Parameters<typeof RequestsPage>[0]["filter"] = "all") => {
    const onNew = vi.fn();
    const onFilter = vi.fn();
    render(<RequestsPage rows={list} filter={filter} kinds={kinds} onFilter={onFilter} onBack={() => {}} onNew={onNew} onOpen={() => {}} />);
    return { onNew, onFilter };
  };

  it("a fourth way to start one, its own icon, and its own filter", () => {
    const { onNew, onFilter } = page(["claim", "food", "replacement", "waiting"]);
    const starts = screen.getAllByRole("button", { name: /^Submit/ }).map(b => b.textContent);
    expect(starts).toEqual([
      "Submit transport claimOutstation and Airbnb stays", "Submit food claimMeals on the days you worked a fair",
      "Submit replacementReplacements, transfers and exits", "Submit waiting listJoining requests and allocation",
    ]);
    fireEvent.click(screen.getByRole("button", { name: /Submit food claim/ }));
    expect(onNew).toHaveBeenLastCalledWith("food");
    fireEvent.click(screen.getByRole("button", { name: "Food claim" }));
    expect(onFilter).toHaveBeenLastCalledWith("food");
  });

  it("nobody else sees it — nor its filter, until one of theirs was sent", () => {
    page(undefined);
    expect(screen.queryByRole("button", { name: /Submit food claim/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Food claim" })).not.toBeInTheDocument();
    expect(screen.getByText("Nothing sent yet. Start a claim, a replacement or a waiting-list request above.")).toBeInTheDocument();
    cleanup();
    page(undefined, rows, "food");
    expect(screen.getByRole("button", { name: "Food claim" })).toHaveAttribute("aria-pressed", "true");
    const list = screen.getByRole("heading", { name: "My requests" }).closest("section")!;
    expect(within(list).getByText("Food claim · Sep 2026")).toBeInTheDocument();
    expect(within(list).queryByText("Outstation claim · PENANG")).not.toBeInTheDocument();
  });
});
