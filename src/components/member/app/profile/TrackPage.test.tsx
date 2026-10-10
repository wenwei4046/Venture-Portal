import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EDIT_FIELDS } from "@/lib/member/request-edit";
import TrackPage, { RequestInfoSheet } from "./TrackPage";
import type { RequestDetailVM, TrackVM } from "./profile-vm";

afterEach(cleanup);

const vm: TrackVM = {
  queue: { title: "Fair waiting list", total: "2 in queue", rows: [{ pos: "#1", name: "Daniel L.", mine: false }, { pos: "#2", name: "Siti Aisyah", mine: true }] },
  waiting: [{ id: "w1", title: "Siti Aisyah · Waiting List", sub: "RQ-2610-004 · Fair · 1 ahead", status: "Accepted · #2", tone: "accepted" }],
  replacements: [{ id: "r1", title: "LOUIS → RYAN TAN", sub: "RQ-2610-005 · effective 31 Oct", status: "Scheduled · 31 Oct", tone: "pending" }],
};

describe("Waiting list & replacements (HR revamp 7b)", () => {
  it("shows the sub-department's list with the member's own marked, then their waiting lists", () => {
    const onOpen = vi.fn();
    render(<TrackPage vm={vm} segment="waiting" onSegment={() => {}} onBack={() => {}} onOpen={onOpen} onNew={() => {}} />);
    expect(screen.getByRole("heading", { name: "Waiting list & replacements" })).toBeInTheDocument();
    expect(screen.getByText("Where your requests stand.")).toBeInTheDocument();
    expect(screen.getByText("2 in queue")).toBeInTheDocument();
    expect(screen.getByText("Yours").previousElementSibling).toHaveTextContent("Siti Aisyah");
    expect(screen.getByText("Daniel L.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Waiting list" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: /Siti Aisyah · Waiting List/ }));
    expect(onOpen).toHaveBeenCalledWith("w1");
    expect(screen.queryByText("LOUIS → RYAN TAN")).not.toBeInTheDocument();
  });

  it("shows the replacements without the queue, and says when there are none", () => {
    const onSegment = vi.fn();
    const { rerender } = render(<TrackPage vm={vm} segment="replacement" onSegment={onSegment} onBack={() => {}} onOpen={() => {}} onNew={() => {}} />);
    expect(screen.queryByText("Fair waiting list")).not.toBeInTheDocument();
    expect(screen.getByText("Scheduled · 31 Oct")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Waiting list" }));
    expect(onSegment).toHaveBeenCalledWith("waiting");
    rerender(<TrackPage vm={{ ...vm, replacements: [] }} segment="replacement" onSegment={onSegment} onBack={() => {}} onOpen={() => {}} onNew={() => {}} />);
    expect(screen.getByText("No replacements submitted.")).toBeInTheDocument();
    rerender(<TrackPage vm={{ queue: { ...vm.queue!, total: "0 in queue", rows: [] }, waiting: [], replacements: [] }} segment="waiting"
      onSegment={onSegment} onBack={() => {}} onOpen={() => {}} onNew={() => {}} />);
    expect(screen.getByText("Nobody is waiting right now.")).toBeInTheDocument();
    expect(screen.getByText("You haven't submitted a waiting list.")).toBeInTheDocument();
  });

  it("sends the member to a new request", () => {
    const onNew = vi.fn();
    render(<TrackPage vm={vm} segment="waiting" onSegment={() => {}} onBack={() => {}} onOpen={() => {}} onNew={onNew} />);
    fireEvent.click(screen.getByRole("button", { name: "Submit a new request →" }));
    expect(onNew).toHaveBeenCalled();
  });
});

describe("the request sheet", () => {
  const detail = (over: Partial<RequestDetailVM> = {}): RequestDetailVM => ({
    id: "w2", title: "Amelia Tan · Waiting List", code: "RQ-2610-006", status: "Pending review", tone: "pending",
    facts: [{ l: "Applicant", v: "Amelia Tan" }, { l: "Phone", v: "012-345 6789" }],
    log: [{ what: "Submitted", who: "You", when: "6 Oct, 09:00", note: "", dot: "good" }],
    canCancel: true, canUpdate: false,
    edit: { fields: EDIT_FIELDS.waiting, values: { newPerson: "Amelia Tan", contact: "012-345 6789", start: "2026-11-03" } },
    lockedNote: null,
    ...over,
  });

  it("edits the three fields and sends the update", async () => {
    const onSave = vi.fn(async () => true);
    render(<RequestInfoSheet open vm={detail()} busy={false} error={null} onSave={onSave} onCancel={() => {}} onClose={() => {}} />);
    expect(screen.getByText("AUDIT HISTORY")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit request" }));
    expect(screen.queryByRole("button", { name: "Cancel request" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "011-222 3333" } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ newPerson: "Amelia Tan", contact: "011-222 3333", start: "2026-11-03" }));
    expect(await screen.findByRole("button", { name: "Edit request" })).toBeInTheDocument();
  });

  it("Cancel leaves the fields as they were; a refused update stays open with its reason", async () => {
    const onSave = vi.fn(async () => false);
    const { rerender } = render(<RequestInfoSheet open vm={detail()} busy={false} error={null} onSave={onSave} onCancel={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit request" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Edit request" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit request" }));
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    rerender(<RequestInfoSheet open vm={detail()} busy={false} error="Enter a phone number." onSave={onSave} onCancel={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a phone number.");
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
  });

  it("a decided one says so, and keeps Cancel request only while HR has it", () => {
    const onCancel = vi.fn();
    const { rerender } = render(<RequestInfoSheet open vm={detail()} busy={false} error={null} onSave={async () => true} onCancel={onCancel} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    expect(onCancel).toHaveBeenCalled();
    rerender(<RequestInfoSheet open vm={detail({ edit: null, canCancel: false, status: "Accepted · #2", tone: "accepted",
      lockedNote: "This request has been accepted, so it can no longer be edited. Ask HR if something needs to change." })}
      busy={false} error={null} onSave={async () => true} onCancel={onCancel} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Edit request" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel request" })).not.toBeInTheDocument();
    expect(screen.getByText(/so it can no longer be edited/)).toBeInTheDocument();
  });
});
