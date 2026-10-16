import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  PUSH_WORDS: { on: "On — this phone shows new notifications", off: "Off — tap to get them on this phone", install: "Add the app to your Home Screen first", denied: "Blocked in this phone’s settings", unsupported: "" },
  pushState: vi.fn(),
  turnPushOn: vi.fn(),
  turnPushOff: vi.fn(),
  popUpNeedsTurningOn: vi.fn(),
  sendTestNotice: vi.fn(async () => true),
}));
vi.mock("@/components/pwa/push-client", () => client);
vi.mock("@/lib/push/actions", () => ({ removePushSubscription: vi.fn(), reportPushTrouble: vi.fn(), savePushSubscription: vi.fn() }));

import PushRow from "./PushRow";

// Profile › Phone notifications (2026-10-11) and, on an Android phone once they are on, *Make them pop up*
// (2026-10-14 — the user: "make sure jump up"): Android shows an installed web app's notices in the shade only,
// until the person turns on Pop on screen for it; the row opens the steps and a test.

beforeEach(() => {
  client.pushState.mockResolvedValue("on");
  client.popUpNeedsTurningOn.mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Settings › Notifications in the Revenue app's Profile", () => {
  it("on an Android phone with them on: Make them pop up opens the steps and a test", async () => {
    render(<PushRow />);
    fireEvent.click(await screen.findByRole("button", { name: /Make them pop up/ }));
    expect(screen.getByRole("dialog", { name: "Make them pop up" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send a test" }));
    expect(client.sendTestNotice).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("not while they are off, and never on an iPhone or a computer", async () => {
    client.pushState.mockResolvedValue("off");
    render(<PushRow />);
    expect(await screen.findByText("Notifications")).toBeInTheDocument();
    expect(screen.queryByText("Make them pop up")).toBeNull();
    cleanup();
    client.pushState.mockResolvedValue("on");
    client.popUpNeedsTurningOn.mockReturnValue(false);
    render(<PushRow />);
    expect(await screen.findByText("Notifications")).toBeInTheDocument();
    expect(screen.queryByText("Make them pop up")).toBeNull();
  });

  // 2026-10-16 — the user: "if on this, it will allow the permission setting for notification".
  it("switched on, the phone is asked inside the press itself", async () => {
    client.pushState.mockResolvedValue("off");
    client.popUpNeedsTurningOn.mockReturnValue(false);
    client.turnPushOn.mockResolvedValue({ state: "on" });
    render(<PushRow />);
    const row = await screen.findByRole("button", { name: /Notifications/ });
    expect(row).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(row);
    expect(client.turnPushOn).toHaveBeenCalledTimes(1);
    expect(client.turnPushOn.mock.calls[0][0]).toBe("revenue");
    await waitFor(() => expect(screen.getByRole("button", { name: /Notifications/ })).toHaveAttribute("aria-pressed", "true"));
  });

  it("says under it what the switch cannot: an iPhone outside the Home Screen app, a block, a failure", async () => {
    client.pushState.mockResolvedValue("install");
    render(<PushRow />);
    expect(await screen.findByText("Add the app to your Home Screen first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Notifications/ })).toBeDisabled();
    cleanup();
    client.pushState.mockResolvedValue("off");
    client.popUpNeedsTurningOn.mockReturnValue(false);
    client.turnPushOn.mockResolvedValue({ state: "off", reason: "This phone did not ask. Tap once more." });
    render(<PushRow />);
    fireEvent.click(await screen.findByRole("button", { name: /Notifications/ }));
    expect(await screen.findByText("This phone did not ask. Tap once more.")).toBeInTheDocument();
  });
});
