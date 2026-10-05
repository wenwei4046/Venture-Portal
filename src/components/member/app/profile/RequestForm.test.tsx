import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RequestForm, { type FormOptions } from "./RequestForm";
import RequestsPage from "./RequestsPage";

afterEach(cleanup);

// Fair as HR set it on 2026-10-05: Penang is 4 spots at RM 50; Airbnb RM 65 a person a night.
const options: FormOptions = {
  subName: "Fair",
  weeks: [{ key: "2026-10-02", n: "W1", brandWeek: "Akemi week", brand: "AKEMI", dates: "2–4 Oct", venue: "MITC Melaka", org: "Homedec", color: "red", tint: "pink" }],
  rates: {
    base: "Klang Valley", perSpot: 50, perPaxNight: 65,
    regions: [{ id: "kl", name: "KL", spots: 0 }, { id: "penang", name: "Penang", spots: 4 }],
  },
  members: [{ id: "yuny", name: "YUNY" }],
  departments: [{ id: "fair", name: "Fair", capacity: 27, occupied: 26 }, { id: "ir", name: "IR", capacity: null, occupied: 4 }],
  departmentId: "fair",
  waitingList: [],
};

const claimForm = (readOnly: boolean, onSubmit = vi.fn()) =>
  render(<RequestForm kind="claim" options={options} revising={null} readOnly={readOnly} onSubmit={onSubmit} onClose={() => {}} />);

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

  it("fills in with the viewed person's choices and HR's amount, and sends nothing", () => {
    const onSubmit = vi.fn();
    claimForm(true, onSubmit);
    fireEvent.click(screen.getByRole("button", { name: "Penang" }));
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

describe("a member's own claim", () => {
  it("sends the outstation claim the form shows — the brand week, its booth and the region", async () => {
    const onSubmit = vi.fn(async (form: FormData) => { void form; return { ok: true as const, code: "RQ-2610-001" }; });
    claimForm(false, onSubmit);
    fireEvent.click(screen.getByRole("button", { name: "Penang" }));
    fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
    expect(await screen.findByText("Request submitted")).toBeInTheDocument();
    expect(screen.getByText("RQ-2610-001")).toBeInTheDocument();
    const sent = onSubmit.mock.calls[0][0];
    expect(Object.fromEntries([...sent.entries()].filter(([key]) => key !== "idempotencyKey"))).toEqual({
      kind: "claim", subDepartmentId: "fair", claimType: "outstation", week: "2026-10-02", brand: "AKEMI",
      location: "MITC Melaka", notes: "", region: "penang",
    });
  });

  it("cannot send a claim before HR's rates have arrived (no region to pick)", () => {
    const onSubmit = vi.fn();
    render(<RequestForm kind="claim" options={{ ...options, rates: { base: "Klang Valley", perSpot: null, perPaxNight: null, regions: [] } }}
      revising={null} readOnly={false} onSubmit={onSubmit} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose the fair's region.");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
