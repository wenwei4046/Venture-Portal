import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/storage/stage", () => import("@/test/stage-in-place"));
import RequestForm, { REQUEST_FORM_STEP, type FormOptions, type SubmitOutcome } from "./RequestForm";
import { INVOICE_VIEW_STEP } from "./InvoiceViewer";
import type { RequestKindVM } from "./profile-vm";

// 2026-11-08 — the side note the user forwarded: with only the claim form open, the phone's Back left Requests and the
// Subject, Remarks, Amount and invoice went with it ("要不要请主 agent 也让返回键先关表格，或者先问一句「要放弃这张 claim
// 吗？」"); the user: "do this". Back shuts the form; something filled in and not sent, it asks first.

const options: FormOptions = {
  subName: "Fair",
  weeks: [],
  rates: { base: "Klang Valley", perSpot: 50, perPaxNight: 65, groupMaxPax: 3, groupCapPerNight: null, regions: [], fairs: {} },
  members: [{ id: "yuny", name: "YUNY" }],
  departments: [{ id: "fair", name: "Fair", capacity: 27, occupied: 26 }, { id: "ir", name: "IR", capacity: null, occupied: 4 }],
  departmentId: "fair",
  waitingList: [],
};

/** Requests, with its button to start one and the form over it — as RevenueApp holds them. */
function Requests({ kind = "other", readOnly = false, revising = null, onSubmit }: {
  kind?: RequestKindVM;
  readOnly?: boolean;
  revising?: { id: string; detail: Record<string, unknown> } | null;
  onSubmit?: (form: FormData) => Promise<SubmitOutcome>;
}) {
  const [open, setOpen] = useState<RequestKindVM | null>(null);
  return (
    <>
      <button onClick={() => setOpen(kind)}>New request</button>
      <RequestForm kind={open} options={options} revising={revising} readOnly={readOnly} onClose={() => setOpen(null)}
        onSubmit={onSubmit ?? (async () => ({ ok: true, code: "RQ-2611-009" }))} />
    </>
  );
}

const browserBack = Object.getPrototypeOf(window.history).back as () => void;
/** The phone's Back: the browser steps back through its own history, and says so (popstate). */
const phoneBack = () => act(async () => { browserBack.call(window.history); await new Promise(r => setTimeout(r, 40)); });
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 40)); });
const step = (key = REQUEST_FORM_STEP) => (window.history.state as Record<string, unknown> | null)?.[key];
const startNew = () => fireEvent.click(screen.getByRole("button", { name: "New request" }));
const form = (name = "Submit other claim") => screen.queryByRole("dialog", { name });
const asked = () => screen.queryByRole("alertdialog");
const typeSubject = (value = "Parking at MITEC") => fireEvent.change(screen.getByRole("textbox", { name: "Subject" }), { target: { value } });

let back: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  window.history.replaceState(null, "", "/member?page=account&view=requests");
  // The app's own steps back, counted — the phone's Back (above) goes round it.
  back = vi.spyOn(window.history, "back");
});
afterEach(async () => {
  cleanup();
  await settle();
  vi.restoreAllMocks();
});

describe("the phone's Back with a request form open", () => {
  it("shuts a form nothing was filled in on, and stays on Requests", async () => {
    render(<Requests />);
    startNew();
    await settle();
    expect(form()).toBeInTheDocument();
    expect(step()).toBe(1);
    await phoneBack();
    expect(form()).not.toBeInTheDocument();
    expect(asked()).not.toBeInTheDocument();
    expect(window.location.search).toBe("?page=account&view=requests");
    await settle();
    expect(back).not.toHaveBeenCalled();
  });

  it("with something typed asks first; Back again keeps the claim as it was, and the next Back asks again", async () => {
    render(<Requests />);
    startNew();
    typeSubject();
    await phoneBack();
    const ask = screen.getByRole("alertdialog", { name: "Discard this claim?" });
    expect(within(ask).getByRole("button", { name: "Keep editing" })).toHaveFocus();
    expect(within(ask).getByRole("button", { name: "Discard" })).toBeInTheDocument();
    expect(form()).toBeInTheDocument();
    // Asked, the step stands again: the next Back is the form's, not Requests'.
    expect(step()).toBe(1);
    await phoneBack();
    expect(asked()).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Subject" })).toHaveValue("Parking at MITEC");
    expect(step()).toBe(1);
    await phoneBack();
    expect(screen.getByRole("alertdialog", { name: "Discard this claim?" })).toBeInTheDocument();
    expect(window.location.search).toBe("?page=account&view=requests");
    expect(back).not.toHaveBeenCalled();
  });

  it("Keep editing keeps the form and its step; Discard shuts it and gives the step back", async () => {
    render(<Requests />);
    startNew();
    typeSubject();
    await phoneBack();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(asked()).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Subject" })).toHaveValue("Parking at MITEC");
    await settle();
    expect(step()).toBe(1);
    expect(back).not.toHaveBeenCalled();
    await phoneBack();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(form()).not.toBeInTheDocument();
    await settle();
    expect(back).toHaveBeenCalledTimes(1);
    expect(step()).toBeUndefined();
    expect(window.location.search).toBe("?page=account&view=requests");
    // Opened again, it is a fresh form: nothing typed, nothing to ask.
    startNew();
    expect(screen.getByRole("textbox", { name: "Subject" })).toHaveValue("");
    await phoneBack();
    expect(form()).not.toBeInTheDocument();
  });

  it("Escape answers as Keep editing; a tap on the dim too — neither shuts the form", async () => {
    render(<Requests />);
    startNew();
    typeSubject();
    await phoneBack();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(asked()).not.toBeInTheDocument();
    expect(form()).toBeInTheDocument();
    await phoneBack();
    expect(asked()).toBeInTheDocument();
    fireEvent.click(form()!.previousElementSibling!);
    expect(asked()).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Subject" })).toHaveValue("Parking at MITEC");
  });

  it("× shuts it as before, without asking, and gives the step back", async () => {
    render(<Requests />);
    startNew();
    typeSubject();
    fireEvent.click(within(form()!).getByRole("button", { name: "Close" }));
    expect(form()).not.toBeInTheDocument();
    expect(asked()).not.toBeInTheDocument();
    await settle();
    expect(back).toHaveBeenCalledTimes(1);
    expect(step()).toBeUndefined();
  });

  it("sent, Back shuts it: nothing is left to lose", async () => {
    const onSubmit = vi.fn(async (sent: FormData) => { void sent; return { ok: true as const, code: "RQ-2611-009" }; });
    const { container } = render(<Requests onSubmit={onSubmit} />);
    startNew();
    typeSubject();
    fireEvent.change(screen.getByRole("textbox", { name: "Remarks" }), { target: { value: "Three days of the fair" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Amount (RM)" }), { target: { value: "45.50" } });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["%PDF-1.7"], "parking.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Review & submit claim" }));
    expect(await screen.findByText("Request submitted")).toBeInTheDocument();
    await phoneBack();
    expect(form()).not.toBeInTheDocument();
    expect(asked()).not.toBeInTheDocument();
  });

  it("a choice tapped is something to lose too — a request asks as a request", async () => {
    render(<Requests kind="replacement" />);
    startNew();
    fireEvent.click(screen.getByRole("button", { name: /^Transfer/ }));
    await phoneBack();
    expect(screen.getByRole("alertdialog", { name: "Discard this request?" })).toBeInTheDocument();
    expect(form("Submit replacement")).toBeInTheDocument();
  });

  it("one HR sent back, opened and left as it was: Back shuts it without asking", async () => {
    render(<Requests revising={{ id: "req-1", detail: { claimType: "other", subject: "Parking at MITEC", remarks: "Three days", amount: 45.5 } }} />);
    startNew();
    expect(screen.getByRole("textbox", { name: "Subject" })).toHaveValue("Parking at MITEC");
    await phoneBack();
    expect(form()).not.toBeInTheDocument();
    expect(asked()).not.toBeInTheDocument();
  });

  it("in View as, where nothing can be sent, Back shuts it without asking", async () => {
    render(<Requests readOnly />);
    startNew();
    typeSubject();
    await phoneBack();
    expect(form()).not.toBeInTheDocument();
    expect(asked()).not.toBeInTheDocument();
  });

  it("the invoice's viewer over it: Back shuts the viewer alone, then asks for the form", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:invoice-photo");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const { container } = render(<Requests />);
    startNew();
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File([new Uint8Array(2048)], "parking-receipt.jpg", { type: "image/jpeg" })] } });
    fireEvent.click(screen.getByRole("button", { name: "View parking-receipt.jpg" }));
    await settle();
    expect(screen.getByRole("dialog", { name: "Invoice · parking-receipt.jpg" })).toBeInTheDocument();
    expect(step(INVOICE_VIEW_STEP)).toBe(1);
    expect(step()).toBe(1);
    await phoneBack();
    expect(screen.queryByRole("dialog", { name: /^Invoice · / })).not.toBeInTheDocument();
    expect(form()).toBeInTheDocument();
    expect(asked()).not.toBeInTheDocument();
    await phoneBack();
    expect(screen.getByRole("alertdialog", { name: "Discard this claim?" })).toBeInTheDocument();
    expect(screen.getByText("parking-receipt.jpg")).toBeInTheDocument();
    expect(back).not.toHaveBeenCalled();
  });

  it("opens and stays open under React's Strict Mode, whose effects run twice", async () => {
    render(<StrictMode><Requests /></StrictMode>);
    startNew();
    await settle();
    expect(form()).toBeInTheDocument();
    expect(step()).toBe(1);
    expect(back).not.toHaveBeenCalled();
    typeSubject();
    await phoneBack();
    expect(screen.getByRole("alertdialog", { name: "Discard this claim?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await settle();
    expect(form()).not.toBeInTheDocument();
    expect(back).toHaveBeenCalledTimes(1);
  });
});
