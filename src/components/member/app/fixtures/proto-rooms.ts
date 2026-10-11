/**
 * Book a room on the round-2 handoff's own sample (`Revenue App.dc.html`
 * lines 1758–1914: ROOMS, BOOKINGS, PEOPLE and OTHER_STAFF, the day
 * 2026-10-10), seen by Kar Jun — the member the handoff's Revenue app is
 * drawn as. Server-side only, like the rest of the preview's fixtures.
 */
import type { Booking, RoomsSource } from "@/lib/rooms/model";
import type { MemberRoomsData } from "../profile/rooms-model";

const REVENUE = { id: "dept-revenue", name: "Revenue" };
const HR = { id: "dept-hr", name: "HR" };
const FINANCE = { id: "dept-finance", name: "Finance" };

const STAFF: Array<[id: string, name: string, title: string, dept: typeof REVENUE]> = [
  ["anthony", "Anthony", "Team Leader", REVENUE], ["chea", "Chea Huan", "Team Leader", REVENUE], ["lawrence", "Lawrence", "Team Leader", REVENUE],
  ["stanley", "Stanley", "Team Leader", REVENUE], ["limyw", "Lim Yau Wei", "Team Assistant", REVENUE], ["zack", "Zack", "Senior Revenue Specialist", REVENUE],
  ["adrian", "Adrian", "Revenue Specialist", REVENUE], ["esther", "Esther", "Revenue Specialist", REVENUE], ["karjun", "Kar Jun", "Team Assistant", REVENUE],
  ["louis", "Louis", "Revenue Specialist", REVENUE], ["melvin", "Melvin Chong", "Senior Revenue Specialist", REVENUE], ["marcus", "Marcus", "Revenue Specialist", REVENUE],
  ["grace", "Grace Lim", "HR Manager", HR], ["nurul", "Nurul Huda", "HR Executive", HR],
  ["jason", "Jason Ong", "Finance Manager", FINANCE], ["meiling", "Mei Ling", "Accountant", FINANCE], ["farah", "Farah Aziz", "Account Executive", FINANCE],
  ["kelvin", "Kelvin Tan", "Account Executive", FINANCE], ["priya", "Priya Nair", "Account Assistant", FINANCE],
];
const NAME = Object.fromEntries(STAFF.map(([id, name]) => [id, name]));
const ROOM_NAME: Record<string, string> = { r1: "Meeting Room 1", r2: "Meeting Room 2", r3: "Meeting Room 3", r4: "Meeting Room 4" };
const ME = "karjun";

const hm = (h: number, m = 0) => h * 60 + m;

function booking(id: string, room: string, day: string, from: number, to: number, title: string, dept: typeof REVENUE, by: string, internal: string[], guests: number): Booking {
  return {
    id, ref: id, room, roomName: ROOM_NAME[room], day, from, to, title, source: "portal" as RoomsSource,
    departmentId: dept.id, department: dept.name, subDepartment: null, bookedBy: NAME[by], bookedByStaff: by, onBehalfBy: null,
    mine: by === ME, canChange: by === ME,
    internal: internal.map(p => ({ id: p, name: NAME[p] ?? p, department: null })),
    guests: Array.from({ length: guests }, (_, i) => ({ name: `Guest ${i + 1}`, company: "" })),
    pax: internal.length + guests, guestCompany: null, guestDepartment: null, guestCode: null, cancelled: false, events: [],
  };
}

export function protoRooms(): MemberRoomsData {
  const day = "2026-10-10";
  return {
    range: {
      from: day,
      to: "2026-10-16",
      today: day,
      rooms: [
        { id: "r1", name: "Meeting Room 1", seats: 8, location: "Level 3", facilities: "TV, whiteboard", bookable: true, guestBookable: true },
        { id: "r2", name: "Meeting Room 2", seats: 6, location: "Level 3", facilities: "TV", bookable: true, guestBookable: true },
        { id: "r3", name: "Meeting Room 3", seats: 12, location: "Level 5", facilities: "TV, video call", bookable: true, guestBookable: true },
        { id: "r4", name: "Meeting Room 4", seats: 4, location: "Level 5", facilities: "Whiteboard", bookable: true, guestBookable: false },
      ],
      bookings: [
        booking("BK-301", "r1", day, hm(9), hm(10), "Fair weekly sync", REVENUE, "chea", ["chea", "limyw", "zack", "stanley", "adrian", "esther"], 0),
        booking("BK-302", "r1", day, hm(14), hm(15, 30), "Akemi supplier review", REVENUE, "stanley", ["stanley", "karjun", "melvin"], 2),
        booking("BK-303", "r2", day, hm(10, 30), hm(11, 30), "Interview · Revenue Specialist", HR, "grace", ["grace", "chea"], 1),
        booking("BK-304", "r3", day, hm(11), hm(12, 30), "Month-end close", FINANCE, "jason", ["jason", "meiling", "farah", "kelvin"], 0),
        booking("BK-305", "r2", day, hm(16), hm(17), "Payroll check", HR, "nurul", ["nurul", "grace", "priya"], 0),
        booking("BK-306", "r4", day, hm(15), hm(16), "Client · Mid Valley booth", REVENUE, "karjun", ["karjun"], 2),
        booking("BK-307", "r3", "2026-10-12", hm(9, 30), hm(11), "Q4 brand plan", REVENUE, "anthony", ["anthony", "chea", "lawrence", "stanley"], 0),
        {
          id: "BK-G214", ref: "BK-G214", room: "r3", roomName: "Meeting Room 3", day, from: hm(17), to: hm(18), title: "Showroom project kickoff", source: "guest",
          departmentId: null, department: null, subDepartment: null, bookedBy: "Wong Mei Yee", bookedByStaff: null, onBehalfBy: null, mine: false, canChange: false,
          internal: [], guests: [], pax: 5, guestCompany: "HOUZS Interior Sdn Bhd", guestDepartment: "Project", guestCode: "HIN", cancelled: false, events: [],
        },
      ],
    },
    people: {
      me: { staffId: ME, name: "Kar Jun", departmentId: REVENUE.id, department: REVENUE.name, subDepartmentId: "fair" },
      account: "Kar Jun",
      canBook: false,
      canManage: false,
      people: STAFF.map(([id, name, title, dept]) => ({ id, name, departmentId: dept.id, department: dept.name, title })),
      departments: [REVENUE, HR, FINANCE],
      subDepartments: [{ id: "fair", name: "Fair", departmentId: REVENUE.id }, { id: "ir", name: "IR", departmentId: REVENUE.id }],
    },
  };
}
