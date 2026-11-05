import { parseBoard } from "../../Web/src/document.mjs";
import { test, expect } from "@playwright/test";

async function exported(page: any) {
  await page
    .getByRole("button", { name: "Notebook actions", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export notebook file", exact: true })
    .click();
  const fs = await import("node:fs/promises");
  return parseBoard(await fs.readFile((await (await pending).path())!, "utf8"));
}
test("notebook palette draws, undoes and redoes without the diagram toolbar", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.Whisketch?.isReady());
  await expect(
    page.getByRole("navigation", { name: "Writing tools" }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Rectangle", exact: true }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  await page.mouse.move(350, 320);
  await page.mouse.down();
  await page.mouse.move(550, 400, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const undone = await exported(page);
  expect(undone.elements.filter((e: any) => !e.isDeleted).length).toBe(0);
  await page
    .getByRole("button", { name: "Close notebooks", exact: true })
    .click();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  const redone = await exported(page);
  expect(
    redone.elements.some((e: any) => !e.isDeleted && e.type === "freedraw"),
  ).toBe(true);
});
test("Write creates editable text and focus mode has an accessible way back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 440, height: 956 });
  await page.goto("/");
  await page.waitForFunction(() => window.Whisketch?.isReady());
  await expect(
    page.getByRole("radio", { name: "Rectangle", exact: true }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Write", exact: true }).click();
  await page.mouse.click(130, 230);
  await page.keyboard.type("A quieter notebook");
  await page.keyboard.press("Escape");
  const scene = await exported(page);
  expect(
    scene.elements.some(
      (e: any) => e.type === "text" && e.text === "A quieter notebook",
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Close notebooks", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Focus on page", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Writing tools" }),
  ).toBeHidden();
  await expect(
    page.getByRole("textbox", { name: "Notebook title", exact: true }),
  ).toBeHidden();
  await page
    .getByRole("button", { name: "Show controls", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Writing tools" }),
  ).toBeVisible();
  const frame = await page
    .getByRole("navigation", { name: "Writing tools" })
    .boundingBox();
  expect(frame!.x).toBeGreaterThanOrEqual(0);
  expect(frame!.x + frame!.width).toBeLessThanOrEqual(440);
});
test("library stays quiet while settings and diagram tools remain reachable", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.Whisketch?.isReady());
  await page
    .getByRole("button", { name: "Open notebooks", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Export library backup" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Use Daily journal template" }),
  ).toBeHidden();
  await page.getByText("Start from a template", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Use Daily journal template" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Notebook actions", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Export library backup" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Advanced diagram tools", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Rectangle", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Writing tools" }),
  ).toBeHidden();
  await page
    .getByRole("button", { name: "Use notebook tools", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Writing tools" }),
  ).toBeVisible();
});
