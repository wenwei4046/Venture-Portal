"use client";

import { useState } from "react";
import { setViewAs } from "@/components/layout/view-as-actions";
import type { MemberData, MemberMembership, MemberPage, MemberPerson, MemberRequest } from "@/lib/member/types";
import base from "./member.module.css";
import preview from "./design-preview/RevenueWorkspacePreview.module.css";
import { Icon, initials } from "./MemberUI";
import { hasNoGoodsMargin } from "./LiveBrandMarginList";
import InstallSteps from "@/components/pwa/InstallSteps";
import { useInstallApp } from "@/components/pwa/install-store";
import p from "./PrincipalRevenuePanels.module.css";

// Principal keeps its authorised department data while sharing the approved C UI.
const s = Object.fromEntries(Object.entries(base).map(([name, className]) => [
  name, [className, preview[name], p[name]].filter(Boolean).join(" "),
]));

const status = (value: string) => value.replaceAll("_", " ");

export function RevenueManagementButton({ children = "Member Services", destination = "/member-admin" }: {
  children?: React.ReactNode;
  destination?: "/member-admin" | "/revenue" | "/revenue/products";
}) {
  return <form action={setViewAs}>
    <input type="hidden" name="role" value="principal" />
    <input type="hidden" name="destination" value={destination} />
    <button className={`${s.button} ${s.full} ${p.managementButton}`} type="submit">{children} <span aria-hidden="true">↗</span></button>
  </form>;
}

/** Profile › Install the app — the Principal's copy of the member Profile row. */
function InstallAppCard() {
  const { path, install } = useInstallApp();
  const [open, setOpen] = useState(false);
  if (path !== "prompt" && path !== "ios" && path !== "in-app") return null;
  return <section className={s.card}><SectionHeading icon="install" tone="brown">Install the app</SectionHeading><p className={s.sub}>Open Venture from your home screen, full screen, like any app.</p><button className={`${s.button} ${s.full}`} aria-expanded={path === "prompt" ? undefined : open} onClick={() => path === "prompt" ? void install() : setOpen(v => !v)}>Install the app<Icon name="install" size={22} /></button>{path !== "prompt" && open && <div style={{ marginTop: 14 }}><InstallSteps path={path} className={s.sub} /></div>}</section>;
}

function SectionHeading({ children, icon, tone = "orange" }: { children: React.ReactNode; icon: string; tone?: "orange" | "brown" | "amber" }) {
  return <div className={p.sectionHeading}><span className={p.sectionIcon} data-tone={tone}><Icon name={icon} size={27} /></span><h2>{children}</h2></div>;
}

export default function PrincipalRevenuePanels({ data, member, page, navigate, onRequest, onMemo, privateMode = false, onPrivateMode }: {
  data: MemberData;
  member: MemberMembership;
  page: MemberPage;
  navigate: (page: MemberPage) => void;
  onRequest: (id: string) => void;
  onMemo: (id: string) => void;
  dark: boolean;
  onTheme: () => void;
  privateMode?: boolean;
  onPrivateMode?: () => void;
}) {
  const money = (amount: number) => privateMode ? "••••••" : new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(amount);
  const [period, setPeriod] = useState("");
  const [search, setSearch] = useState("");
  const [listView, setListView] = useState(false);
  const [requestKind, setRequestKind] = useState("All");
  const incomes = data.incomes.filter(row => row.schemeId === member.schemeId).sort((a, b) => b.period.localeCompare(a.period));
  const income = incomes.find(row => row.period === period) ?? incomes[0];
  const memos = data.memos.filter(memo => !memo.departments.length || memo.departments.includes(member.name));
  const requests = data.requests.filter(request => !request.detail.subDepartmentId || request.detail.subDepartmentId === member.id);
  const pending = requests.filter(request => ["submitted", "needs_info", "waiting", "reserved", "accepted"].includes(request.status));
  const orders = data.orders.filter(order => !order.schemeId || order.schemeId === member.schemeId);
  const headings: Record<string, string> = { today: "Revenue overview", income: "Team income", team: "Team hierarchy", requests: "Team requests", memos: "Team memos", account: "Principal account" };
  const pageIcons: Record<string, string> = { today: "chart", income: "wallet", team: "team", requests: "receipt", memos: "bell", account: "user" };

  function RequestRow({ request }: { request: MemberRequest }) {
    return <button className={`${s.listRow} ${s.listButton} ${p.actionRow}`} onClick={() => onRequest(request.id)}>
      <span className={p.rowIcon} data-tone={request.kind === "claim" ? "orange" : request.kind === "replacement" ? "brown" : "amber"}><Icon name={request.kind === "claim" ? "receipt" : request.kind === "replacement" ? "replace" : "team"} size={24} /></span>
      <span className={p.rowCopy}><h3>{request.title}</h3><span className={s.caption}>{request.kind} · {request.id.slice(0, 8)}</span>
        <span className={`${s.pill} ${s.neutral} ${p.status}`}>{status(request.status)}</span></span>
      <Icon name="chevron" size={18} />
    </button>;
  }

  function Person({ person }: { person: MemberPerson }) {
    const parent = member.people.find(row => row.id === person.parentId);
    return <div className={`${s.orgPerson} ${p.person}`}>
      <span className={p.personAvatar} aria-hidden="true">{initials(person.name)}</span>
      <div><h3>{person.name}</h3><p className={s.sub}>{person.title} · {person.rank}</p>
        {parent && <p className={s.caption}>Reports to {parent.name}</p>}</div>
    </div>;
  }
  function branch(person: MemberPerson, seen: Set<string> = new Set(), depth = 0): React.ReactNode {
    if (seen.has(person.id) || depth > 20) return null;
    const visited = new Set([...seen, person.id]);
    const children = member.people.filter(row => row.parentId === person.id && !visited.has(row.id));
    return <div key={person.id}><Person person={person} />{children.length > 0 && <div className={depth < 5 ? p.branch : undefined}>
      {children.map(child => branch(child, visited, depth + 1))}
    </div>}</div>;
  }
  const roots = member.people.filter(person => !person.parentId || !member.people.some(row => row.id === person.parentId));

  return <div className={p.panel} data-principal-page={page}>
    <div className={s.titleRow}>
      <div><p className={s.eyebrow}>PRINCIPAL · {member.name.toUpperCase()}</p><h1>{headings[page]}</h1>
        <p className={`${s.sub} ${s.intro}`}>{page === "account" ? "One account. Every workspace." : "All members in this department."}</p>
      </div>
      <div className={p.pageIdentity}><span className={p.pageIcon}><Icon name={pageIcons[page] ?? "chart"} size={28} /></span><span className={p.memberCount}>{member.occupied} members</span></div>
    </div>

    {page === "today" && <>
      <div className={s.grid}>
        <div className={s.stack}>
          <section className={s.hero}>
            <div className={p.heroHeading}><span className={p.heroIcon}><Icon name="wallet" size={28} /></span><p className={s.sub}>{income?.period ?? "Latest calculation"} · Team commission</p></div>
            <div className={s.heroValue}>{income ? money(income.total) : "Awaiting data"}</div>
            <p className={s.caption}>Combined commission for this department. Fixed salaries are shown in payroll.</p>
            <button className={s.link} onClick={() => navigate("income")}>View team income →</button>
          </section>
          <section className={s.card}>
            <SectionHeading icon="target" tone="brown">{member.name} progress</SectionHeading>
            <dl className={s.dl}>
              <dt>Members</dt><dd>{member.occupied}</dd>
              <dt>Product sales</dt><dd>{income ? money(income.sales) : "Awaiting calculation"}</dd>
              <dt>Requests to follow up</dt><dd>{pending.length}</dd>
              <dt>Department limit</dt><dd>{member.capacity ?? "Not configured"}</dd>
            </dl>
            <button className={s.link} onClick={() => navigate("team")}>Explore team hierarchy →</button>
          </section>
        </div>
        <div className={s.stack}>
          <section className={s.card}><SectionHeading icon={member.calculator ? "calculator" : "chart"}>{member.calculator ? "Products & calculator" : "IR workspace"}</SectionHeading>
            <p className={s.sub}>{member.calculator ? "Build a cart and check the margin using the current product costs." : "See the team, commission and requests for IR."}</p>
            <button className={`${s.button} ${s.primary} ${s.full}`} onClick={() => navigate(member.calculator ? "quote" : "income")}>{member.calculator ? "Build an offer →" : "View team income →"}</button>
          </section>
          <section className={s.card}><SectionHeading icon="team" tone="brown">People operations</SectionHeading><p className={s.sub}>Review claims, team changes and waiting-list positions. Manage published memos and product options.</p><RevenueManagementButton /></section>
          <section className={s.card}><SectionHeading icon="bell" tone="amber">Latest memos</SectionHeading>{memos.length ? memos.slice(0, 3).map(memo => <button key={memo.id} className={`${s.listRow} ${s.listButton}`} onClick={() => onMemo(memo.id)}><div><h3>{memo.title}</h3><p className={s.caption}>{memo.sender}</p></div><Icon name="chevron" size={18} /></button>) : <p className={s.sub}>No memos for this department yet.</p>}</section>
        </div>
      </div>
    </>}

    {page === "income" && <>
      {incomes.length > 0 && <label className={`${s.field} ${p.period}`}><span>Calculation period</span><select value={income?.period ?? ""} onChange={event => setPeriod(event.target.value)}>{incomes.map(row => <option key={row.period} value={row.period}>{row.period}</option>)}</select></label>}
      <div className={s.grid}>
        <div className={s.stack}>
          <section className={s.hero}><div className={p.heroHeading}><span className={p.heroIcon}><Icon name="wallet" size={28} /></span><p className={s.sub}>{income?.period ?? "Latest calculation"} · Team commission</p></div><div className={s.heroValue}>{income ? money(income.total) : "Awaiting data"}</div><p className={s.caption}>{income ? `Calculation status: ${status(income.status)}. ` : ""}Total commission across the department, excluding fixed salaries.</p></section>
          <section className={s.card}><h2>Commission breakdown</h2>{income ? ([['Product commission', income.personal], ['Override commission', income.override], ['KPI commission', income.kpi], ['Margin incentive', income.incentive], ['Group incentive', income.group]] as const).map(([label, amount]) => <div className={s.listRow} key={label}><span>{label}</span><strong className={s.amount}>{money(amount)}</strong></div>) : <p className={s.sub}>Commission appears when a calculation is available.</p>}</section>
        </div>
        <div className={s.stack}>
          <section className={s.card}><SectionHeading icon="target" tone="brown">Team progress</SectionHeading>{income?.kpis.length ? income.kpis.map(kpi => <div className={s.kpi} key={kpi.label}><div className={`${s.row} ${s.rowWrap}`}><strong>{kpi.label}</strong><span>{kpi.unit === "RM" ? money(kpi.current) : `${kpi.current} ${kpi.unit}`}</span></div>{kpi.target != null && kpi.target > 0 ? <><progress className={p.progress} aria-label={kpi.label} value={Math.min(kpi.current, kpi.target)} max={kpi.target} /><p className={s.caption}>Target {kpi.unit === "RM" ? money(kpi.target) : `${kpi.target} ${kpi.unit}`}</p></> : <p className={s.caption}>A complete team target is not configured.</p>}</div>) : <p className={s.sub}>Progress appears after the team calculation.</p>}</section>
          <section className={s.card}><SectionHeading icon="file" tone="amber">Commission rules</SectionHeading><p className={s.sub}>Each member follows their own title, rank and scheme. Review the department rules in Principal view.</p><RevenueManagementButton destination="/revenue">Revenue configuration</RevenueManagementButton></section>
        </div>
      </div>
      {member.calculator && <section className={`${s.card} ${p.section}`}><h2>Team orders · margin</h2><p className={s.caption}>Recent Fair product orders. Additional charges are excluded from margin.</p>{orders.length ? orders.map(order => <div key={order.id} className={s.listRow}><div><h3>{order.number}</h3><p className={s.caption}>{order.brand} · {order.date}</p></div><div className={p.orderAmount}><strong>{money(order.revenue)}</strong><p className={s.caption}>{hasNoGoodsMargin(order) ? "No positive goods margin basis" : order.margin == null ? "Cost data needed" : `${order.margin.toFixed(2)}% margin`}</p></div></div>) : <p className={s.sub}>No recorded orders for this department.</p>}</section>}
    </>}

    {page === "team" && <div className={s.grid}>
      <section className={s.card}>
        <div className={s.tabs}><button aria-pressed={!listView} onClick={() => setListView(false)}>Hierarchy</button><button aria-pressed={listView} onClick={() => setListView(true)}>Member list</button></div>
        <label className={s.field}><span className={s.srOnly}>Search members by name</span><input type="search" aria-label="Search members by name" placeholder="Search members by name" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <div className={p.tree}>{!member.people.length ? <p className={s.sub}>No active members in this department yet.</p> : search || listView ? (() => { const people = member.people.filter(person => person.name.toLowerCase().includes(search.toLowerCase())); return people.length ? people.map(person => <Person key={person.id} person={person} />) : <p className={s.sub}>No matching member.</p>; })() : roots.length ? roots.map(person => branch(person)) : member.people.map(person => <Person key={person.id} person={person} />)}</div>
      </section>
      <div className={s.stack}><section className={s.card}><SectionHeading icon="team" tone="brown">Department capacity</SectionHeading><div className={s.statValue}>{member.occupied} <span className={s.sub}>/ {member.capacity ?? "No limit set"}</span></div><p className={s.sub}>Review reserved positions in Member Services. The department limit is set on Revenue › Rules › Capacity.</p><RevenueManagementButton>Manage capacity & waiting list</RevenueManagementButton></section><section className={s.card}><SectionHeading icon="replace" tone="amber">Team changes</SectionHeading><p className={s.sub}>Review replacement, transfer and exit requests with the original member and audit record.</p><RevenueManagementButton>Manage team requests</RevenueManagementButton></section></div>
    </div>}

    {page === "requests" && <>
      <section className={`${s.card} ${p.section}`}><div className={s.sectionHead}><SectionHeading icon="receipt">Review & manage</SectionHeading><RevenueManagementButton /></div><p className={s.sub}>These are the team’s requests. Review and approve them in Member Services.</p></section>
      <section className={s.card}><div className={s.filters}>{["All", "claim", "replacement", "waiting"].map(kind => <button key={kind} className={`${s.filter} ${p.status}`} aria-pressed={requestKind === kind} onClick={() => setRequestKind(kind)}>{kind === "waiting" ? "Waiting list" : kind}</button>)}</div>{requests.filter(request => requestKind === "All" || request.kind === requestKind).length ? requests.filter(request => requestKind === "All" || request.kind === requestKind).map(request => <RequestRow key={request.id} request={request} />) : <p className={s.sub}>No requests of this type.</p>}</section>
    </>}

    {page === "memos" && <div className={s.grid}><section className={s.card}><h2>Published memos</h2>{memos.length ? memos.map(memo => <button key={memo.id} className={`${s.listRow} ${s.listButton} ${p.actionRow}`} onClick={() => onMemo(memo.id)}><span className={p.rowIcon} data-tone="amber"><Icon name="bell" size={24} /></span><span className={p.rowCopy}><h3>{memo.title}</h3><span className={s.caption}>{memo.sender} · {memo.effectiveAt}</span><span className={`${s.pill} ${s.neutral}`}>{memo.requiresAck ? "Acknowledgement requested" : "Information"}</span></span><Icon name="chevron" size={18} /></button>) : <p className={s.sub}>No memos for this department yet.</p>}</section><section className={s.card}><SectionHeading icon="bell" tone="amber">Keep the team informed</SectionHeading><p className={s.sub}>Publish and manage memos in Member Services. Opening a memo here does not acknowledge it for employees.</p><RevenueManagementButton>Manage memos</RevenueManagementButton></section></div>}

    {page === "account" && <div className={s.grid}>
      <div className={s.stack}>
        <section className={s.card}><SectionHeading icon="user" tone="brown">{data.profile.name}</SectionHeading><p className={s.sub}>{data.profile.email}</p><dl className={s.dl}><dt>Account</dt><dd>Principal</dd><dt>Current view</dt><dd>Revenue View</dd><dt>Department</dt><dd>{member.name}</dd><dt>Access</dt><dd>All Revenue members</dd></dl><p className={s.sub}>Use the view selector above to return to Principal, Finance or HR.</p></section>
        <section className={s.card}><SectionHeading icon="chart">Your workspace</SectionHeading>
          {([
            ["insight", "chart", "Insight", "Member sales, margins and team progress"],
            ["arena", "trophy", "Arena", "Rankings, brand weeks and Fair status"],
            ["income", "wallet", "Team income", "Department commission and calculation periods"],
            ["team", "team", "Team", "Department map and the selected reporting tree"],
            ["requests", "receipt", "Requests", "Review claims, team changes and waiting lists"],
            ["memos", "bell", "Memos & notifications", "Read published team updates"],
            ["crm", "chat", "CRM", "Meta ads leads, replies and appointments"],
          ] as const).map(([destination, icon, label, description]) => <button key={destination} className={`${s.listRow} ${s.listButton} ${p.actionRow}`} onClick={() => navigate(destination)}><span className={p.rowIcon}><Icon name={icon} size={24} /></span><span className={p.rowCopy}><h3>{label}</h3><span className={s.caption}>{description}</span></span><Icon name="chevron" size={18} /></button>)}
        </section>
      </div>
      <div className={s.stack}>
        {onPrivateMode && <section className={s.card}><SectionHeading icon="eye" tone="brown">Privacy</SectionHeading><button className={`${s.button} ${s.full}`} aria-pressed={privateMode} onClick={onPrivateMode}>{privateMode ? "Show income amounts" : "Hide income amounts"}<Icon name={privateMode ? "eyeOff" : "eye"} size={22} /></button></section>}
        <section className={s.card}><SectionHeading icon="team" tone="amber">Manage Revenue</SectionHeading><p className={s.sub}>Review staff requests, department capacity, memos and commission configuration with your Principal access.</p><RevenueManagementButton /><RevenueManagementButton destination="/revenue">Revenue configuration</RevenueManagementButton></section>
        <section className={s.card}><SectionHeading icon="gift">Products & costs</SectionHeading><p className={s.sub}>Maintain current products and costs in Principal view.</p><RevenueManagementButton destination="/revenue/products">Manage products & costs</RevenueManagementButton></section>
        <InstallAppCard />
        <form action="/member/signout" method="post"><button type="submit" className={`${s.button} ${s.full} ${p.signOut}`}><Icon name="logout" size={22} /> Sign out</button></form>
      </div>
    </div>}
  </div>;
}
