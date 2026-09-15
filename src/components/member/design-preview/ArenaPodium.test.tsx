import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArenaPodium } from "./ArenaPodium";
import { awardRanking } from "./arena-model";

afterEach(cleanup);

const format = (value: number) => `${value} pts`;

describe("Arena podium", () => {
  it("preserves tied winners and a skipped place without awarding a fourth-place medal", () => {
    const rows = awardRanking([
      { id: "a", name: "Alex Tan", value: 100, eligible: true },
      { id: "b", name: "Bella Lim", value: 100, eligible: true },
      { id: "c", name: "Chris Lee", value: 80, eligible: true },
      { id: "d", name: "Dina Ng", value: 70, eligible: true },
    ]);
    render(<ArenaPodium rows={rows} format={format} />);
    expect(screen.getByText("Alex Tan")).toBeInTheDocument();
    expect(screen.getByText("Bella Lim")).toBeInTheDocument();
    expect(screen.getByText("Rank 1, tied")).toBeInTheDocument();
    expect(screen.queryByText("Rank 2")).not.toBeInTheDocument();
    expect(screen.getByText("Rank 3")).toBeInTheDocument();
    expect(screen.getByText("Chris Lee")).toBeInTheDocument();
    expect(screen.queryByText("Dina Ng")).not.toBeInTheDocument();
  });

  it("does not give podium places to zero, pending or unassigned results", () => {
    const rows = awardRanking([
      { id: "z", name: "Zero Seller", value: 0, eligible: true },
      { id: "p", name: "Pending Seller", value: Number.NaN, eligible: true },
      { id: "u", name: "Unassigned Seller", value: 100, eligible: false },
    ]);
    const { container } = render(<ArenaPodium rows={rows} format={format} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("updates winners with the selected board and opens the complete ranking", () => {
    const onOpen = vi.fn();
    const first = awardRanking([{ id: "jia", name: "Jia En", value: 80, eligible: true }]);
    const { rerender } = render(<ArenaPodium rows={first} format={format} onOpen={onOpen} />);
    expect(screen.getByText("You")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View full ranking/ }));
    expect(onOpen).toHaveBeenCalledOnce();
    const next = awardRanking([{ id: "sarah", name: "Sarah Lim", value: 95, eligible: true }]);
    rerender(<ArenaPodium rows={next} format={format} />);
    expect(screen.getByText("Sarah Lim")).toBeInTheDocument();
    expect(screen.getByText("95 pts")).toBeInTheDocument();
    expect(screen.queryByText("Jia En")).not.toBeInTheDocument();
  });
});
