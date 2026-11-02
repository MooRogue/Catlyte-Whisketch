import { test, expect } from "@playwright/test";
test("draw, persist across reload, export and reimport without losing images or metadata", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("textbox", { name: "Notebook title", exact: true }),
  ).toHaveValue("My first notebook");
  await page.getByRole("button", { name: "Open notebooks" }).click();
  await page.getByRole("button", { name: "Try a sample" }).click();
  await expect(
    page.getByRole("textbox", { name: "Notebook title", exact: true }),
  ).toHaveValue("Welcome to Whisketch");
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Notebook title", exact: true }),
  ).toHaveValue("Welcome to Whisketch");
  const fixture = {
    type: "excalidraw",
    version: 2,
    elements: [
      {
        id: "ink1",
        type: "freedraw",
        x: 60,
        y: 80,
        width: 180,
        height: 60,
        points: [
          [0, 0],
          [70, 60],
          [180, 0],
        ],
        pressures: [0.3, 0.9, 0.5],
        simulatePressure: false,
        strokeColor: "#7040c0",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 3,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        angle: 0,
        seed: 1,
        version: 1,
        versionNonce: 1,
        isDeleted: false,
        groupIds: [],
        frameId: null,
        boundElements: [],
        updated: 1,
        link: null,
        locked: false,
        customData: { recognizedText: "Whisketch" },
      },
    ],
    files: {},
    vendor: { preserve: "yes" },
  };
  await page.evaluate(
    (doc) => window.Whisketch.importDocument(JSON.stringify(doc), "Round trip"),
    fixture,
  );
  await expect(
    page.getByRole("textbox", { name: "Notebook title", exact: true }),
  ).toHaveValue("Round trip");
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await page.getByRole("button", { name: "Open notebooks" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export editable board" }).click();
  const download = await downloadPromise;
  const fs = await import("node:fs/promises");
  const output = JSON.parse(
    await fs.readFile((await download.path())!, "utf8"),
  );
  expect(output.vendor).toEqual({ preserve: "yes" });
  expect(output.elements[0].points).toEqual(fixture.elements[0].points);
  expect(output.elements[0].customData.recognizedText).toBe("Whisketch");
  await page.getByRole("button", { name: "Open notebooks" }).click();
  await page.screenshot({ path: "Artifacts/browser-desktop.png" });
  expect(errors).toEqual([]);
});
test("image attachment remains editable and survives reopening", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("textbox", { name: "Notebook title", exact: true }),
  ).toBeVisible();
  await page.waitForFunction(() => window.Whisketch?.isReady());
  await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 80;
    c.height = 40;
    c.getContext("2d")!.fillRect(0, 0, 80, 40);
    window.Whisketch.insertCapture(c.toDataURL(), "Captured words");
  });
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await page.waitForTimeout(700);
  await page.reload();
  await page.getByRole("button", { name: "Open notebooks" }).click();
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export editable board" }).click();
  const d = await promise;
  const fs = await import("node:fs/promises");
  const o = JSON.parse(await fs.readFile((await d.path())!, "utf8"));
  expect(o.elements.some((e: any) => e.type === "image")).toBeTruthy();
  expect(Object.keys(o.files)).toHaveLength(1);
  expect(o.elements.some((e: any) => e.text === "Captured words")).toBeTruthy();
});
test("switching notebooks keeps their scenes separate", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.Whisketch?.isReady());
  await page.getByRole("button", { name: "Open notebooks" }).click();
  await page.getByRole("button", { name: "Try a sample" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await page.getByRole("button", { name: "Open notebooks" }).click();
  await page.getByRole("button", { name: "＋ New notebook" }).click();
  await page
    .getByRole("textbox", { name: "Notebook title", exact: true })
    .fill("Blank second notebook");
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await page.getByRole("button", { name: "Open notebooks" }).click();
  await expect(
    page.getByRole("button", { name: /Welcome to Whisketch.*6 objects/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Blank second notebook.*0 objects/ }),
  ).toBeVisible();
});
test("pointer drawing creates editable ink objects", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.Whisketch?.isReady());
  await page
    .getByRole("radio", { name: "Draw", exact: true })
    .locator("..")
    .click();
  await page.mouse.move(350, 350);
  await page.mouse.down();
  await page.mouse.move(430, 400, { steps: 8 });
  await page.mouse.move(520, 330, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await page.getByRole("button", { name: "Open notebooks" }).click();
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export editable board" }).click();
  const d = await promise;
  const fs = await import("node:fs/promises");
  const scene = JSON.parse(await fs.readFile((await d.path())!, "utf8"));
  const stroke = scene.elements.find((e: any) => e.type === "freedraw");
  expect(stroke).toBeTruthy();
  expect(stroke.points.length).toBeGreaterThan(3);
  expect(stroke.width).toBeGreaterThan(100);
});
