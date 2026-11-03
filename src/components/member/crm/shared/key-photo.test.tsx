/**
 * The unit's key handed over with a photo (the owner, 2026-10-28): a question opens Take photo / Choose from Photos, and the
 * photo picked goes to the question that asked — once.
 */
import { describe, expect, it, vi } from "vitest";
import { actionsOnScreen, closeActions } from "./action-sheet";
import { askKeyPhoto, keyPhotoPicked } from "./key-photo";

const photo = () => new File(["x"], "key.jpg", { type: "image/jpeg" });

describe("askKeyPhoto", () => {
  it("offers the camera and the photos, and hands the photo picked to the question", async () => {
    const run = vi.fn(async () => true);
    askKeyPhoto({ title: "Photo of the key returned", sub: "Take or choose a photo", run }, vi.fn());
    expect(actionsOnScreen()?.title).toBe("Photo of the key returned");
    expect(actionsOnScreen()?.actions.map(a => a.label)).toEqual(["Take photo", "Choose from Photos"]);
    closeActions();
    const f = photo();
    expect(await keyPhotoPicked(f)).toBe(true);
    expect(run).toHaveBeenCalledWith(f);
    // Answered once: a second photo goes nowhere.
    expect(await keyPhotoPicked(photo())).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("nothing picked (the picker cancelled) answers nothing", async () => {
    const run = vi.fn(async () => true);
    askKeyPhoto({ title: "Photo of the key collected", run }, vi.fn());
    closeActions();
    expect(await keyPhotoPicked(undefined)).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});
