import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { fixtureTrainingApi } from "@/lib/rev-training/fixture";
import { NO_RIGHTS } from "@/lib/rev-training/api";
import TestsPage from "./TestsPage";
import LibraryPage from "./LibraryPage";

// 2026-11-16 — the Revenue app's Free test and Library, on the preview's sample.

const WRITER = { view: true, create: true, edit: true };

describe("Free test", () => {
  it("takes a test, hands it in and shows what was right", async () => {
    const api = fixtureTrainingApi();
    const submit = vi.spyOn(api, "submit");
    render(<TestsPage api={api} rights={NO_RIGHTS} readOnly={false} onBack={() => {}} />);
    expect(screen.queryByRole("tab", { name: "Manage" })).toBeNull();
    const card = (await screen.findByRole("heading", { name: "Sofa fabrics" })).closest("article")!;
    expect(within(card as HTMLElement).getByText("Not taken yet")).toBeTruthy();
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "Start" }));
    await screen.findByText("0 of 2 answered");
    fireEvent.click(screen.getByRole("radio", { name: /True/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /PU/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Nappa-touch/ }));
    expect(screen.getByText("2 of 2 answered")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hand in" }));
    expect((await screen.findByRole("status")).textContent).toContain("2 / 2");
    expect(submit).toHaveBeenCalledWith("t-sofa", { "t-sofa-q0": [0], "t-sofa-q1": [1, 3] });
    // Back on the list, the score is theirs.
    fireEvent.click(screen.getByRole("button", { name: "All tests" }));
    const again = (await screen.findByRole("heading", { name: "Sofa fabrics" })).closest("article") as HTMLElement;
    expect(within(again).getByRole("button", { name: "Take it again" })).toBeTruthy();
  });

  it("marks a wrong answer and the right one", async () => {
    render(<TestsPage api={fixtureTrainingApi()} rights={NO_RIGHTS} readOnly={false} onBack={() => {}} />);
    const card = (await screen.findByRole("heading", { name: "Sofa fabrics" })).closest("article") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Start" }));
    await screen.findByText("0 of 2 answered");
    fireEvent.click(screen.getByRole("radio", { name: /False/ }));
    fireEvent.click(screen.getByRole("button", { name: "Hand in · 1 not answered" }));
    expect((await screen.findByRole("status")).textContent).toContain("0 / 2");
    expect(screen.getAllByText("Wrong")).toHaveLength(2);
    expect(screen.getAllByText("The right answer").length).toBeGreaterThan(0);
    expect(screen.getByText("Your answer")).toBeTruthy();
  });

  it("nothing is handed in while viewing as somebody", async () => {
    render(<TestsPage api={fixtureTrainingApi()} rights={NO_RIGHTS} readOnly onBack={() => {}} />);
    fireEvent.click((await screen.findAllByRole("button", { name: /Start|Take it again/ }))[0]);
    fireEvent.click((await screen.findAllByRole("radio"))[0]);
    expect((screen.getByRole("button", { name: "Read-only while viewing as" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a writer writes a test of every type, and reads everybody's scores", async () => {
    const api = fixtureTrainingApi();
    render(<TestsPage api={api} rights={WRITER} readOnly={false} onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Manage" }));
    fireEvent.click(await screen.findByRole("button", { name: "+ New test" }));
    fireEvent.click(screen.getByRole("button", { name: "Save test" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Give the test a title.");
    fireEvent.change(screen.getByPlaceholderText("e.g. Mattress basics"), { target: { value: "Deposits" } });
    fireEvent.change(screen.getByLabelText("Question 1"), { target: { value: "Is a deposit refundable?" } });
    fireEvent.click(screen.getByRole("radio", { name: "True or false" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Right?" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "+ Add a question" }));
    fireEvent.click(screen.getAllByRole("radio", { name: "Several answers" })[1]);
    fireEvent.change(screen.getByLabelText("Question 2"), { target: { value: "Which are ours?" } });
    const answers = screen.getAllByPlaceholderText(/^Answer [A-C]$/);
    ["Akemi", "Ikea", "Zanotti"].forEach((v, i) => fireEvent.change(answers[i], { target: { value: v } }));
    const rights = screen.getAllByRole("button", { name: "Right?" });
    fireEvent.click(rights[rights.length - 3]);
    fireEvent.click(rights[rights.length - 1]);
    fireEvent.click(screen.getByRole("checkbox", { name: /Published/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save test" }));
    await screen.findByRole("heading", { name: "Deposits" });
    const saved = await api.adminTest((await api.adminTests() as { ok: true; data: { id: string; title: string }[] }).data.find(t => t.title === "Deposits")!.id);
    expect(saved.ok && saved.data.questions.map(q => [q.kind, q.correct])).toEqual([["truefalse", [1]], ["multiple", [0, 2]]]);

    const mattress = screen.getByRole("heading", { name: "Mattress basics" }).closest("article") as HTMLElement;
    fireEvent.click(within(mattress).getByRole("button", { name: "Scores" }));
    const table = await screen.findByRole("table");
    expect(within(table).getByText("SHAWN WONG").closest("tr")!.textContent).toContain("Not taken");
  });
});

describe("Library", () => {
  it("lists every category, New until opened, and counts it for Profile", async () => {
    const seen = vi.fn();
    vi.spyOn(window, "open").mockReturnValue(null);
    render(<LibraryPage api={fixtureTrainingApi()} rights={NO_RIGHTS} readOnly={false} onBack={() => {}} onSeen={seen} />);
    await screen.findByText("November price list");
    expect(screen.getByRole("tab", { name: "All · 2 new" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "+ Add file or link" })).toBeNull();
    await waitFor(() => expect(seen).toHaveBeenLastCalledWith(2));
    fireEvent.click(screen.getByRole("button", { name: /November price list/ }));
    await waitFor(() => expect(seen).toHaveBeenLastCalledWith(1));
    expect(screen.getByRole("tab", { name: "All · 1 new" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Sales skills" }));
    expect(screen.queryByText("Showroom tour")).toBeNull();
    expect(screen.getByText(/too expensive/)).toBeTruthy();
  });

  it("a writer adds a link and a category, and deletes", async () => {
    render(<LibraryPage api={fixtureTrainingApi()} rights={WRITER} readOnly={false} onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "+ Add file or link" }));
    fireEvent.click(screen.getByRole("radio", { name: "A link" }));
    fireEvent.change(screen.getByPlaceholderText("https://"), { target: { value: "https://youtu.be/abc" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "How to close" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to the Library" }));
    expect(await screen.findByText("How to close")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "+ Category" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Objection handling"), { target: { value: "product knowledge" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/already/);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const row = screen.getByText("How to close").closest("[data-lib-item]") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(row).getByRole("button", { name: "Tap again to delete" }));
    await waitFor(() => expect(screen.queryByText("How to close")).toBeNull());
  });
});
