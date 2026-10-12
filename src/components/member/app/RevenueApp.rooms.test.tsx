import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { AppClosed } from "@/lib/member/app-pages";
import type { MemberDocument } from "@/lib/documentation/member";
import type { Booking } from "@/lib/rooms/model";
import type { MemberData } from "@/lib/member/types";
import type { MemberRoomsData } from "./profile/rooms-model";
import type { RevenueSource } from "./source";
import RevenueApp from "./RevenueApp";

// Book a room and Documentation in the Revenue app (2026-10-11, the HR revamp's second package — README 18.4).
const nav = vi.hoisted(() => ({ router: { push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} } }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/member",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => nav.router,
}));
vi.mock("@/app/(member)/member/actions", () => ({}));
vi.mock("@/app/(member)/member/rooms-actions", () => ({}));
vi.mock("@/app/(member)/member/docs-actions", () => ({}));
vi.mock("@/app/(member)/member/arena-actions", () => ({}));
vi.mock("@/app/(member)/member/kpi-summary-actions", () => ({}));

class NoResize { observe() {} unobserve() {} disconnect() {} }

const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";

function booking(over: Partial<Booking>): Booking {
  return {
    id: "b-sync", ref: "BK-1", room: R1, roomName: "Meeting Room 1", day: "2026-10-05", from: 540, to: 600, title: "Fair weekly sync", source: "portal",
    departmentId: "rev", department: "Revenue", subDepartment: null, bookedBy: "Chea Huan", bookedByStaff: "ch", onBehalfBy: null, mine: false, canChange: false,
    internal: [], guests: [], pax: 6, guestCompany: null, guestDepartment: null, guestCode: null, cancelled: false, events: [], ...over,
  };
}

function rooms(): MemberRoomsData {
  return {
    range: {
      from: "2026-10-05", to: "2026-10-11", today: "2026-10-05",
      rooms: [
        { id: R1, name: "Meeting Room 1", seats: 8, location: "", facilities: "", bookable: true, guestBookable: true },
        { id: R2, name: "Meeting Room 2", seats: 6, location: "", facilities: "", bookable: true, guestBookable: true },
      ],
      bookings: [
        booking({}),
        booking({ id: "b-mine", room: R2, from: 900, to: 960, title: "Client · Mid Valley booth", bookedBy: "Jia En", mine: true, canChange: true, pax: 3 }),
      ],
    },
    people: {
      me: { staffId: "jia", name: "Jia En", departmentId: "rev", department: "Revenue", subDepartmentId: "fair" },
      account: "Jia En", canBook: false, canManage: false,
      people: [{ id: "jia", name: "Jia En", departmentId: "rev", department: "Revenue", title: "Team Leader" }, { id: "yuny", name: "YUNY", departmentId: "rev", department: "Revenue", title: null }],
      departments: [{ id: "rev", name: "Revenue" }, { id: "hr", name: "HR" }],
      subDepartments: [{ id: "fair", name: "Fair", departmentId: "rev" }],
    },
  };
}

const DOCS: MemberDocument[] = [
  { id: "d-new", name: "Price list · October 2026", fileName: "Price_List_Oct2026.xlsx", ext: "XLSX", contentType: null, size: null, uploadedAt: "2026-10-01T02:00:00Z", seen: false },
  { id: "d-old", name: "Employee handbook", fileName: "Handbook.pdf", ext: "PDF", contentType: null, size: null, uploadedAt: "2026-09-01T02:00:00Z", seen: true },
];

function memberData(): MemberData {
  return { ...memberDemo(), demo: false, memos: [], requests: [], incomes: [] };
}

function principalData(): MemberData {
  const demo = memberDemo();
  return {
    ...demo, demo: false, principalView: true,
    profile: { id: "principal", userId: "principal", name: "Principal", email: "principal@example.invalid", salary: null },
    memberships: demo.memberships.map(m => ({ ...m, title: "Principal", rank: "All access",
      people: [{ id: "anthony", name: "ANTHONY", title: "Team Leader", rank: "Rank A", parentId: null, self: false }] })),
    memos: [], requests: [], incomes: [],
  };
}

function source() {
  const none = vi.fn(async () => ({ ok: false as const, error: "not in this test" }));
  return {
    refresh: vi.fn(async () => ({ ok: true as const, data: memberData() })),
    insight: none, kpi: none, orgMap: none, insightRange: none, quote: none, memo: none, requestHistory: none, orderBook: none, arena: none,
    cancelRequest: none, income: none, departmentIncome: none, honours: none, claimRates: none, submitRequest: none,
    memoReceipts: vi.fn(async () => ({ ok: true as const, data: [] })),
    rooms: vi.fn(async () => ({ ok: true as const, data: rooms() })),
    bookRoom: vi.fn(async () => ({ ok: true as const, data: { id: "new", ref: "BK-9" } })),
    cancelBooking: vi.fn(async () => ({ ok: true as const, data: true as const })),
    documents: vi.fn(async () => ({ ok: true as const, data: DOCS })),
    openDocument: vi.fn(async () => ({ ok: true as const, data: { url: "https://files.example/handbook.pdf", fileName: "Handbook.pdf" } })),
  } satisfies RevenueSource;
}

beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function open(search: string, options: { closed?: AppClosed; data?: () => MemberData } = {}) {
  window.history.replaceState({}, "", `/member${search}`);
  const live = source();
  const make = options.data ?? memberData;
  render(<RevenueApp initialData={make()} initialSearch={search} today="2026-10-05" source={live} closed={options.closed} />);
  await act(async () => {});
  return live;
}

const sheet = (name: string) => screen.getByRole("dialog", { name });

describe("Book a room", () => {
  it("is on Profile beside Documentation, whose row counts the files not opened yet", async () => {
    const live = await open("?page=account");
    expect(screen.getByRole("button", { name: /Book a room/ })).toHaveTextContent("See free meeting rooms and book a slot");
    await waitFor(() => expect(screen.getByRole("button", { name: /^Documentation/ })).toHaveTextContent("Documentation1Handbook, price list and files from HR"));
    expect(live.documents).toHaveBeenCalledWith(undefined);
  });

  it("reads the seven days from today and draws each room's meetings", async () => {
    const live = await open("?page=account&view=rooms");
    expect(await screen.findByRole("heading", { name: "Meeting rooms" })).toBeInTheDocument();
    expect(live.rooms).toHaveBeenCalledWith("2026-10-05", "2026-10-11");
    const room1 = await screen.findByRole("region", { name: "Meeting Room 1" });
    expect(within(room1).getByText("8 seats")).toBeInTheDocument();
    expect(within(room1).getByRole("button", { name: /09:00–10:00\s*Fair weekly sync\s*Chea Huan · 6 pax/ })).toBeInTheDocument();
    // Another day: both rooms are free.
    fireEvent.click(screen.getByRole("button", { name: "Tue 6" }));
    expect(screen.getAllByRole("button", { name: "Free all day · tap to book" })).toHaveLength(2);
    // The timeline: a column a room.
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(screen.getByText("Room 1")).toBeInTheDocument();
    expect(screen.getByText("Tap an empty slot to book it.")).toBeInTheDocument();
  });

  it("greys out + Book while there is no room to book (as the portal's + Book a room)", async () => {
    window.history.replaceState({}, "", "/member?page=account&view=rooms");
    const live = source();
    const none = rooms();
    live.rooms.mockResolvedValue({ ok: true, data: { ...none, range: { ...none.range, rooms: [], bookings: [] } } });
    render(<RevenueApp initialData={memberData()} initialSearch="?page=account&view=rooms" today="2026-10-05" source={live} />);
    await act(async () => {});
    expect(await screen.findByText("No meeting rooms yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Book" })).toBeDisabled();
  });

  it("books for the member from the app, then reads the schedule again", async () => {
    const live = await open("?page=account&view=rooms");
    await screen.findByRole("region", { name: "Meeting Room 1" });
    fireEvent.click(screen.getByRole("button", { name: "+ Book" }));
    const form = sheet("Book a room");
    expect(within(form).getByText("Book a room · Mon 5 Oct")).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Book" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("Add a title, department, room and time.");
    fireEvent.change(within(form).getByPlaceholderText("e.g. Customer follow-up"), { target: { value: "Customer follow-up" } });
    const [, roomSelect, from, to] = within(form).getAllByRole("combobox");
    fireEvent.change(roomSelect, { target: { value: R1 } });
    fireEvent.change(from, { target: { value: "540" } });
    // 09:00 is taken in Meeting Room 1.
    fireEvent.click(within(form).getByRole("button", { name: "Book" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("Taken 09:00–10:00 · Fair weekly sync");
    fireEvent.change(from, { target: { value: "600" } });
    expect(to).toHaveValue("660");
    fireEvent.click(within(form).getByRole("button", { name: "More people" }));
    await act(async () => fireEvent.click(within(form).getByRole("button", { name: "Book" })));
    expect(live.bookRoom).toHaveBeenCalledWith({
      room: R1, day: "2026-10-05", from: 600, to: 660, title: "Customer follow-up", department: null, subDepartment: "fair", internal: ["jia"], pax: 2,
    });
    await waitFor(() => expect(live.rooms).toHaveBeenCalledTimes(2));
  });

  it("cancels the member's own meeting in two taps; somebody else's only its booker can", async () => {
    const live = await open("?page=account&view=rooms");
    fireEvent.click(await screen.findByRole("button", { name: /Fair weekly sync/ }));
    expect(within(sheet("Fair weekly sync")).getByText("Only Chea Huan can cancel this meeting.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Client · Mid Valley booth/ }));
    const mine = sheet("Client · Mid Valley booth");
    expect(within(mine).getByText("Mon 5 Oct · 15:00–16:00")).toBeInTheDocument();
    fireEvent.click(within(mine).getByRole("button", { name: "Cancel meeting" }));
    expect(live.cancelBooking).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(within(mine).getByRole("button", { name: "Tap again to cancel" })));
    expect(live.cancelBooking).toHaveBeenCalledWith("b-mine");
  });

  it("closed by their ticks: neither listed nor reachable; its Create closed, the schedule shows but books nothing", async () => {
    await open("?page=account", { closed: { pages: ["rooms"], sends: ["rooms"] } });
    expect(screen.queryByRole("button", { name: /Book a room/ })).toBeNull();
    cleanup();
    const live = await open("?page=account&view=rooms", { closed: { pages: [], sends: ["rooms"] } });
    await screen.findByRole("region", { name: "Meeting Room 1" });
    expect(screen.queryByRole("button", { name: "+ Book" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tue 6" }));
    expect(screen.getAllByText("Free all day")).toHaveLength(2);
    expect(live.bookRoom).not.toHaveBeenCalled();
  });

  it("the Principal sees the schedule without picking anybody, and books nothing", async () => {
    const live = await open("?page=account&view=rooms", { data: principalData });
    await screen.findByRole("region", { name: "Meeting Room 1" });
    fireEvent.click(screen.getByRole("button", { name: "+ Book" }));
    expect(within(sheet("Book a room")).getByRole("button", { name: "Read-only while viewing as" })).toBeDisabled();
    expect(live.bookRoom).not.toHaveBeenCalled();
  });
});

describe("Documentation", () => {
  it("lists what HR shared, the new one marked, and opens a file — seen at once", async () => {
    const tab = { location: { href: "" }, close: vi.fn() };
    vi.stubGlobal("open", vi.fn(() => tab));
    const live = await open("?page=account&view=docs");
    expect(await screen.findByRole("heading", { name: "Documentation" })).toBeInTheDocument();
    expect(screen.getByText("Shared with Revenue by HR.")).toBeInTheDocument();
    const row = await screen.findByRole("button", { name: /Price list · October 2026/ });
    expect(row).toHaveTextContent("XLSXPrice list · October 2026NewAdded 1 Oct 2026");
    expect(screen.getByRole("button", { name: /Employee handbook/ })).not.toHaveTextContent("New");
    await act(async () => fireEvent.click(row));
    expect(live.openDocument).toHaveBeenCalledWith("d-new", undefined);
    expect(screen.getByText("Opening Price_List_Oct2026.xlsx")).toHaveAttribute("role", "status");
    expect(row).not.toHaveTextContent("New");
    await waitFor(() => expect(tab.location.href).toBe("https://files.example/handbook.pdf"));
  });

  it("says when nothing is shared yet", async () => {
    const live = await open("?page=account&view=docs");
    live.documents.mockResolvedValue({ ok: true, data: [] });
    cleanup();
    window.history.replaceState({}, "", "/member?page=account&view=docs");
    render(<RevenueApp initialData={memberData()} initialSearch="?page=account&view=docs" today="2026-10-05" source={live} />);
    expect(await screen.findByText("Nothing shared with you yet.")).toBeInTheDocument();
  });

  it("the Principal reads the viewed member's list, and opening it marks nothing seen", async () => {
    vi.stubGlobal("open", vi.fn(() => ({ location: { href: "" }, close: vi.fn() })));
    const live = await open("?page=account&view=docs&staff=anthony", { data: principalData });
    const row = await screen.findByRole("button", { name: /Price list · October 2026/ });
    expect(live.documents).toHaveBeenCalledWith({ staffId: "anthony" });
    await act(async () => fireEvent.click(row));
    expect(live.openDocument).toHaveBeenCalledWith("d-new", { staffId: "anthony" });
    expect(row).toHaveTextContent("New");
  });
});
