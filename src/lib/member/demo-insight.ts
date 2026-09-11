/**
 * Insight's and the mapping map's demo data.
 *
 * Fictional, and deliberately shaped to exercise the cases the screens have
 * to get right rather than a tidy best case: a tie on the board, somebody
 * with no orders at all, a leg that is carrying and a leg that has gone
 * quiet, revenue the deposit gate is holding, an order with no cost behind
 * it, an order carried in from last month, and one person who stands in both
 * sub-departments under a different title in each.
 *
 * Never used for a live screen: loadMemberInsight reads the database.
 */

import type {
  MemberBoardRow,
  MemberDownlineRow,
  MemberInsight,
  MemberOrgMap,
  MemberOrgPerson,
  MemberScore,
} from "./types";

const version = "2026-09-11T06:32:00Z";

const scoreOf = (staffId: string, sales: number, over: Partial<MemberScore> = {}): MemberScore => ({
  staffId,
  sales,
  held: 0,
  orders: sales ? Math.max(1, Math.round(sales / 9000)) : 0,
  kpiQty: Math.round(sales / 5200),
  marginRevenue: sales,
  marginCost: Math.round(sales * 0.63),
  blindOrders: 0,
  lastOrder: sales ? "2026-09-11" : null,
  ...over,
});
const row = (
  staffId: string,
  name: string,
  title: string,
  sales: number,
  over: Partial<MemberBoardRow> = {},
): MemberBoardRow => ({
  ...scoreOf(staffId, sales),
  name,
  title,
  self: staffId === "jia",
  ...over,
});
const reports = (
  staffId: string,
  name: string,
  title: string,
  uplineId: string,
  depth: number,
  sales: number,
  over: Partial<MemberDownlineRow> = {},
): MemberDownlineRow => ({
  ...scoreOf(staffId, sales),
  name,
  title,
  uplineId,
  depth,
  ...over,
});

export function memberInsightDemo(): MemberInsight {
  const fair: MemberBoardRow[] = [
    row("daniel", "Daniel Tan", "Senior Team Leader", 128000),
    row("sarah", "Sarah Lim", "Team Leader", 96500),
    row("jia", "Jia En", "Team Leader", 72000, {
      held: 12000,
      blindOrders: 1,
      marginRevenue: 69801,
      marginCost: 43800,
    }),
    row("marcus", "Marcus Lee", "Revenue Specialist", 58400),
    row("aisyah", "Aisyah Ahmad", "Revenue Specialist", 58400),
    row("wei", "Wei Jun", "Revenue Specialist", 21600, { lastOrder: "2026-08-30" }),
    row("kumar", "Kumar Raj", "Revenue Specialist", 14900),
    row("nadia", "Nadia Rahman", "Revenue Specialist", 0),
  ];
  const ir: MemberBoardRow[] = [
    row("sarah", "Sarah Lim", "Team Leader", 88000, { self: false }),
    row("jia", "Jia En", "Revenue Specialist", 41000),
    row("hakim", "Hakim Yusof", "Revenue Specialist", 33200),
    row("lily", "Lily Goh", "Revenue Specialist", 12400),
  ];
  return {
    period: "2026-09",
    asOf: version,
    live: true,
    blocks: [
      {
        membershipId: "fair",
        schemeId: "fair-scheme",
        department: "Fair",
        title: "Team Leader",
        rank: "Rank A",
        rankSort: 40,
        me: { ...fair[2], name: "Jia En" },
        target: {
          rank: "Senior Team Leader",
          personal: 100000,
          months: 2,
          group: null,
          streak: [
            { period: "2026-08", sales: 104500, live: false, met: true },
            { period: "2026-09", sales: 72000, live: true, met: false },
          ],
        },
        boards: [
          { departmentId: "fair", department: "Fair", own: true, rows: fair },
          { departmentId: "ir", department: "IR", own: false, rows: ir },
        ],
        downline: [
          reports("marcus", "Marcus Lee", "Revenue Specialist", "jia", 1, 58400),
          reports("aisyah", "Aisyah Ahmad", "Revenue Specialist", "jia", 1, 58400),
          reports("wei", "Wei Jun", "Revenue Specialist", "jia", 1, 21600, {
            lastOrder: "2026-08-30",
          }),
          reports("kumar", "Kumar Raj", "Revenue Specialist", "marcus", 2, 14900),
          reports("nadia", "Nadia Rahman", "Revenue Specialist", "wei", 2, 0),
        ],
        orders: [
          { id: "o1", number: "AK-0911-08", brand: "Akemi", revenue: 4999, margin: 44.1,
            date: "2026-09-11", manual: false, cleared: true, kpiQty: 2, carried: false },
          { id: "o2", number: "AK-0911-06", brand: "Akemi", revenue: 3999, margin: 39.984996,
            date: "2026-09-11", manual: false, cleared: true, kpiQty: 1, carried: false },
          { id: "o3", number: "AK-0910-04", brand: "Akemi", revenue: 3299, margin: 31.5,
            date: "2026-09-10", manual: true, cleared: true, kpiQty: 0, carried: false },
          { id: "o4", number: "AK-0909-02", brand: "Akemi", revenue: 2999, margin: 26,
            date: "2026-09-09", manual: false, cleared: true, kpiQty: 1, carried: false },
          { id: "o5", number: "AK-0909-01", brand: "Akemi", revenue: 2199, margin: null,
            date: "2026-09-09", manual: false, cleared: true, kpiQty: 0, carried: false },
          { id: "o6", number: "ZN-0908-11", brand: "Zanotti", revenue: 12000, margin: 34.2,
            date: "2026-09-08", manual: false, cleared: false, kpiQty: 0, carried: false },
          { id: "o7", number: "AK-0828-03", brand: "Akemi", revenue: 5400, margin: 37.6,
            date: "2026-08-28", manual: false, cleared: true, kpiQty: 2, carried: true },
        ],
      },
      {
        membershipId: "ir",
        schemeId: "ir-scheme",
        department: "IR",
        title: "Revenue Specialist",
        rank: "3% base tier",
        rankSort: 10,
        me: { ...ir[1], name: "Jia En" },
        target: { rank: "Team Leader", personal: null, months: null, group: 200000, streak: null },
        boards: [
          { departmentId: "ir", department: "IR", own: true, rows: ir },
          { departmentId: "fair", department: "Fair", own: false, rows: fair },
        ],
        downline: [],
        orders: [],
      },
    ],
  };
}

/** The whole department as the mapping map draws it: both sub-departments, everybody. */
export function memberOrgMapDemo(): MemberOrgMap {
  const person = (
    scheme: string,
    department: string,
    staffId: string,
    name: string,
    title: string,
    parent: string | null,
  ): MemberOrgPerson => ({
    id: `${scheme}:${staffId}`,
    staffId,
    departmentId: department,
    schemeId: scheme,
    name,
    code: null,
    title,
    parentId: parent ? `${scheme}:${parent}` : null,
    self: staffId === "jia",
    mine: true,
  });
  return {
    asOf: version,
    departments: [
      {
        id: "fair",
        schemeId: "fair-scheme",
        name: "Fair",
        code: "FAIR",
        capacity: 28,
        mine: true,
        directors: [
          { id: "peter", name: "Peter Chong" },
          { id: "kris", name: "Kris Wong" },
        ],
      },
      {
        id: "ir",
        schemeId: "ir-scheme",
        name: "IR",
        code: "IR",
        capacity: 28,
        mine: true,
        directors: [{ id: "peter", name: "Peter Chong" }],
      },
    ],
    people: [
      person("fair-scheme", "fair", "daniel", "Daniel Tan", "Senior Team Leader", null),
      person("fair-scheme", "fair", "jia", "Jia En", "Team Leader", "daniel"),
      person("fair-scheme", "fair", "sarah", "Sarah Lim", "Team Leader", "daniel"),
      person("fair-scheme", "fair", "marcus", "Marcus Lee", "Revenue Specialist", "jia"),
      person("fair-scheme", "fair", "aisyah", "Aisyah Ahmad", "Revenue Specialist", "jia"),
      person("fair-scheme", "fair", "wei", "Wei Jun", "Revenue Specialist", "jia"),
      person("fair-scheme", "fair", "kumar", "Kumar Raj", "Revenue Specialist", "marcus"),
      person("fair-scheme", "fair", "nadia", "Nadia Rahman", "Revenue Specialist", "wei"),
      person("ir-scheme", "ir", "sarah", "Sarah Lim", "Team Leader", null),
      person("ir-scheme", "ir", "jia", "Jia En", "Revenue Specialist", "sarah"),
      person("ir-scheme", "ir", "hakim", "Hakim Yusof", "Revenue Specialist", "sarah"),
      person("ir-scheme", "ir", "lily", "Lily Goh", "Revenue Specialist", "sarah"),
    ],
  };
}
