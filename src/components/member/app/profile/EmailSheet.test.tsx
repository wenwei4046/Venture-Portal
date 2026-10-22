import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ProfileMain from "./ProfileMain";
import EmailSheet from "./EmailSheet";
import type { ProfileMainVM } from "./profile-vm";
import type { EmailChange, MyEmail } from "@/lib/account/email-change";

// Profile › Request to change email (2026-10-16 — the user: their email is the one they sign in with, changed only by
// their own request, an option beside Change password; HR approves it): the row is there only when RevenueApp hands it
// the actions, and the sheet reads their sign-in email and latest request, then sends the new one.

const vm: ProfileMainVM = { name: "ONG MEI SHUANG", ini: "OM", sub: "HOUZS Venture · Finance", title: "Accounts Executive", rank: "—", badges: {} };
const waiting: EmailChange = { id: "r1", ref: "PF-2610-004", status: "pending", to: "mei.new@mail.com", from: "mei@x.my", at: "2026-10-16T02:00:00Z", decidedAt: null, note: null };
const actionsOf = (mine: MyEmail | null) => ({
  load: vi.fn(async () => mine),
  send: vi.fn(async (email: string) => ({ ok: true as const, mine: { email: "mei@x.my", latest: { ...waiting, to: email.trim().toLowerCase() } } })),
  withdraw: vi.fn(async () => ({ ok: true as const, mine: { email: "mei@x.my", latest: { ...waiting, status: "cancelled" as const } } })),
});

// Account's buttons live in Settings since 2026-10-16 (the user: Privacy, Account and Sign out "combine to one, name (settings)").
describe("Profile’s Settings: the account", () => {
  it("offers Request to change email beside Change password, when it may", () => {
    const changeEmail = vi.fn();
    render(<ProfileMain vm={vm} hidden={false} actions={{ open: vi.fn(), signOut: vi.fn(), changePassword: vi.fn(), changeEmail }} />);
    const settings = screen.getByRole("region", { name: "Settings" });
    expect(within(settings).getAllByRole("button").map(b => b.textContent)).toEqual(["Change password", "Request to change email", "Sign out"]);
    fireEvent.click(within(settings).getByRole("button", { name: "Request to change email" }));
    expect(changeEmail).toHaveBeenCalled();
  });

  it("is not there for a shared login", () => {
    render(<ProfileMain vm={vm} hidden={false} actions={{ open: vi.fn(), signOut: vi.fn() }} />);
    expect(screen.queryByRole("button", { name: "Request to change email" })).toBeNull();
  });
});

describe("the Request to change email sheet", () => {
  it("reads the email they sign in with, says what is wrong before sending, then sends the new one", async () => {
    const a = actionsOf({ email: "mei@x.my", latest: null });
    render(<EmailSheet open onClose={vi.fn()} actions={a} />);
    await waitFor(() => expect(screen.getByText("mei@x.my")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("New email"), { target: { value: "MEI@x.my" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to HR" }));
    expect(screen.getByRole("alert")).toHaveTextContent("That is already the email you sign in with.");
    expect(a.send).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("New email"), { target: { value: " Mei.New@Mail.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Send to HR" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Sent to HR. Until they approve it, you sign in with mei@x.my."));
    // An email box trims what is typed (the browser's own sanitising); the server lowers it.
    expect(a.send).toHaveBeenCalledWith("Mei.New@Mail.com");
    expect(screen.getByText("Waiting for HR")).toBeInTheDocument();
    expect(screen.queryByLabelText("New email")).toBeNull();
  });

  it("opens on a request waiting, which may be withdrawn — and then asks again", async () => {
    const a = actionsOf({ email: "mei@x.my", latest: waiting });
    render(<EmailSheet open onClose={vi.fn()} actions={a} />);
    await waitFor(() => expect(screen.getByText("Waiting for HR")).toBeInTheDocument());
    expect(screen.getByText("PF-2610-004")).toBeInTheDocument();
    expect(screen.getByText("New email · mei.new@mail.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(screen.getByLabelText("New email")).toBeInTheDocument());
    expect(a.withdraw).toHaveBeenCalledWith("r1");
    expect(screen.queryByText("Waiting for HR")).toBeNull();
  });

  it("says HR’s words when it was declined, with the form to ask again", async () => {
    const declined = { ...waiting, status: "rejected" as const, decidedAt: new Date().toISOString(), note: "Use your work email" };
    render(<EmailSheet open onClose={vi.fn()} actions={actionsOf({ email: "mei@x.my", latest: declined })} />);
    await waitFor(() => expect(screen.getByText("Declined")).toBeInTheDocument());
    expect(screen.getByText("“Use your work email”")).toBeInTheDocument();
    expect(screen.getByLabelText("New email")).toBeInTheDocument();
  });

  it("says so when it could not be read, and sends nothing", async () => {
    const a = actionsOf(null);
    render(<EmailSheet open onClose={vi.fn()} actions={a} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Your email could not be read. Please try again."));
    expect(screen.getByRole("button", { name: "Send to HR" })).toBeDisabled();
  });
});
