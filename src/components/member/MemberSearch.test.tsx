import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MemberSearch, { type MemberSearchItem } from "./MemberSearch";

afterEach(cleanup);

const items: MemberSearchItem[] = [
  {
    id: "quote",
    label: "Quote calculator",
    description: "Build a customer offer",
    keywords: "Fair margin mattress",
    group: "Tools",
  },
  {
    id: "sarah",
    label: "Sarah Tan",
    description: "Fair team member",
    keywords: "Sales",
    group: "People",
  },
  {
    id: "memo",
    label: "Travel policy",
    description: "HR memo about accommodation claims",
    group: "Memos",
  },
  ...Array.from({ length: 9 }, (_, index) => ({
    id: `tool-${index}`,
    label: `Tool ${index}`,
    group: "Tools",
    keywords: "customer",
  })),
];

const search = () =>
  screen.getByRole("searchbox", { name: "Search workspace" });

describe("MemberSearch", () => {
  it("shows only the first six provided quick links and marks the search field for focus", () => {
    render(<MemberSearch items={items} onSelect={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("Quick links");
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByText("Quote calculator")).toBeInTheDocument();
    expect(screen.queryByText("Tool 3")).not.toBeInTheDocument();
    expect(search()).toHaveAttribute("data-autofocus");
    expect(search()).toHaveAttribute(
      "placeholder",
      "Products, people, memos…",
    );
  });

  it("matches every case-insensitive word across label, description and keywords", () => {
    render(<MemberSearch items={items} onSelect={() => {}} />);
    fireEvent.change(search(), {
      target: { value: "  MATTRESS  Offer QUOTE " },
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Quote calculator")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 result");
    fireEvent.change(search(), { target: { value: "fair policy" } });
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("caps queried results at ten without creating unprovided destinations", () => {
    render(
      <MemberSearch
        items={[
          ...items,
          { id: "extra", label: "Customer tool", group: "Tools" },
        ]}
        onSelect={() => {}}
      />,
    );
    fireEvent.change(search(), { target: { value: "customer" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.queryByText("Customer tool")).not.toBeInTheDocument();
  });

  it("selects the clicked result or the first result on Enter", () => {
    const onSelect = vi.fn();
    render(<MemberSearch items={items} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Sarah Tan/ }));
    expect(onSelect).toHaveBeenLastCalledWith("sarah");
    fireEvent.change(search(), { target: { value: "customer" } });
    fireEvent.keyDown(search(), { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith("quote");
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("shows helpful empty results and Enter does not navigate", () => {
    const onSelect = vi.fn();
    render(<MemberSearch items={items} onSelect={onSelect} />);
    fireEvent.change(search(), { target: { value: "missing person" } });
    expect(
      screen.getByText("No matches found. Try a product, tool, person or memo name."),
    ).toBeInTheDocument();
    fireEvent.keyDown(search(), { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clears the query, restores quick links and returns focus to search", () => {
    render(<MemberSearch items={items} onSelect={() => {}} />);
    fireEvent.change(search(), { target: { value: "claims" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search()).toHaveValue("");
    expect(search()).toHaveFocus();
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(
      screen.queryByRole("button", { name: "Clear search" }),
    ).not.toBeInTheDocument();
  });
});
