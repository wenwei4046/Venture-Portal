import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { MemberData, MemberPage } from "@/lib/member/types";
import PrincipalRevenuePanels from "./PrincipalRevenuePanels";

vi.mock("@/components/layout/view-as-actions", () => ({ setViewAs: vi.fn() }));
afterEach(cleanup);

function principalData(): MemberData {
  const data = memberDemo();
  return { ...data, demo: false, principalView: true,
    profile: { id: "principal", userId: "principal", name: "Account owner", email: "owner@example.invalid", salary: null },
    incomes: data.incomes.map(income => ({ ...income, total: income.period === "2026-09" ? 12345.67 : 7654.32 })),
  };
}

function panel(page: MemberPage) {
  const data = principalData();
  const callbacks = { navigate: vi.fn(), onRequest: vi.fn(), onMemo: vi.fn(), onTheme: vi.fn() };
  const result = render(<div data-revenue-design="c"><PrincipalRevenuePanels data={data} member={data.memberships[0]}
    page={page} dark={true} {...callbacks} /></div>);
  return { ...result, ...callbacks };
}

describe("Principal C Revenue panels", () => {
  it("distinguishes KPI-only and negative goods orders from missing costs", () => {
    const data = principalData();
    data.orders = [
      { id: "kpi", number: "KPI-only", brand: "Akemi", revenue: 900, marginRevenue: 0, margin: null, date: "2026-09-16" },
      { id: "return", number: "Return", brand: "Akemi", revenue: -100, marginRevenue: -100, margin: 90, date: "2026-09-16", manual: true },
      { id: "blind", number: "Blind goods", brand: "Akemi", revenue: 100, marginRevenue: 100, margin: null, date: "2026-09-16" },
    ];
    render(<PrincipalRevenuePanels data={data} member={data.memberships[0]} page="income" dark={false} navigate={vi.fn()} onRequest={vi.fn()} onMemo={vi.fn()} onTheme={vi.fn()} />);
    expect(screen.getAllByText("No positive goods margin basis")).toHaveLength(2);
    expect(screen.getAllByText("Cost data needed")).toHaveLength(1);
    expect(screen.queryByText("90.00% margin")).not.toBeInTheDocument();
  });
  it("retains department income and period selection while using the shared design classes", () => {
    const { container } = panel("income");
    expect(container.querySelector('[data-principal-page="income"]')).toBeInTheDocument();
    const hero = screen.getByText("Total commission across the department, excluding fixed salaries.", { exact: false }).closest("section")!;
    expect(hero).toHaveTextContent("12,345.67");
    fireEvent.change(screen.getByLabelText("Calculation period"), { target: { value: "2026-08" } });
    expect(hero).toHaveTextContent("7,654.32");
    expect(hero).not.toHaveTextContent("12,345.67");
    const manage = screen.getByRole("button", { name: /Revenue configuration/ }).closest("form")!;
    expect(new FormData(manage).get("role")).toBe("principal");
    expect(new FormData(manage).get("destination")).toBe("/revenue");
  });

  it("preserves the Principal account and management destination without offering dark mode", () => {
    const { onTheme } = panel("account");
    expect(screen.getByRole("heading", { name: "Account owner" })).toBeInTheDocument();
    expect(screen.getByText("All Revenue members")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Switch to .* mode/ })).not.toBeInTheDocument();
    expect(onTheme).not.toHaveBeenCalled();
    const manage = screen.getByRole("button", { name: /Manage products & costs/ }).closest("form")!;
    expect(new FormData(manage).get("role")).toBe("principal");
    expect(new FormData(manage).get("destination")).toBe("/revenue/products");
    const signOut = screen.getByRole("button", { name: "Sign out" }).closest("form")!;
    expect(signOut).toHaveAttribute("action", "/member/signout");
    expect(signOut).toHaveAttribute("method", "post");
  });

  it("keeps the existing calculator and memo actions on the redesigned overview", () => {
    const { navigate, onMemo } = panel("today");
    fireEvent.click(screen.getByRole("button", { name: "Build an offer →" }));
    expect(navigate).toHaveBeenCalledWith("quote");
    fireEvent.click(screen.getByRole("button", { name: "View team income →" }));
    expect(navigate).toHaveBeenCalledWith("income");
    const memo = principalData().memos.find(item => !item.departments.length || item.departments.includes("Fair"))!;
    fireEvent.click(screen.getByRole("button", { name: new RegExp(memo.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }));
    expect(onMemo).toHaveBeenCalledWith(memo.id);
    expect(screen.queryByText("Fixed salary", { exact: true })).not.toBeInTheDocument();
  });
});
