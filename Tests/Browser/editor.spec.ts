import { parseBoard } from "../../Web/src/document.mjs";
import { test, expect, type Page } from "@playwright/test";
async function noteActions(page: Page) {
  if (!(await page.locator(".notebook-settings").isVisible()))
    await page
      .getByRole("button", { name: "Notebook actions", exact: true })
      .click();
}

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
  await noteActions(page);
  await page.getByRole("button", { name: "Export notebook file" }).click();
  const download = await downloadPromise;
  const fs = await import("node:fs/promises");
  const output = parseBoard(
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
  await noteActions(page);
  await page.getByRole("button", { name: "Export notebook file" }).click();
  const d = await promise;
  const fs = await import("node:fs/promises");
  const o = parseBoard(await fs.readFile((await d.path())!, "utf8"));
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
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  await page.mouse.move(350, 350);
  await page.mouse.down();
  await page.mouse.move(430, 400, { steps: 8 });
  await page.mouse.move(520, 330, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await page.getByRole("button", { name: "Open notebooks" }).click();
  const promise = page.waitForEvent("download");
  await noteActions(page);
  await page.getByRole("button", { name: "Export notebook file" }).click();
  const d = await promise;
  const fs = await import("node:fs/promises");
  const scene = parseBoard(await fs.readFile((await d.path())!, "utf8"));
  const stroke = scene.elements.find((e: any) => e.type === "freedraw");
  expect(stroke).toBeTruthy();
  expect(stroke.points.length).toBeGreaterThan(3);
  expect(stroke.width).toBeGreaterThan(100);
});
test("notebook favorites, content search, duplication and trash recovery", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.Whisketch?.isReady());
  await page.getByRole("button", { name: "Open notebooks" }).click();
  await page.getByRole("button", { name: "Try a sample" }).click();
  await noteActions(page);
  await page
    .getByRole("button", { name: "Favorite notebook", exact: true })
    .click();
  await noteActions(page);
  await expect(
    page.getByRole("button", { name: "Favorite notebook", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Open notebooks" }).click();
  await page.getByRole("textbox", { name: "Find a notebook" }).fill("wander");
  await expect(
    page.getByRole("button", { name: /Welcome to Whisketch.*6 objects/ }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Find a notebook" }).fill("");
  await noteActions(page);
  await page
    .getByRole("button", { name: "Duplicate notebook", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Notebook title", exact: true }),
  ).toHaveValue("Welcome to Whisketch copy");
  await page.getByRole("button", { name: "Open notebooks" }).click();
  await noteActions(page);
  await page.getByRole("button", { name: "Move notebook to Trash" }).click();
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page
    .getByRole("button", { name: "Restore notebook", exact: true })
    .click();
  await page
    .getByRole("button", { name: "All notebooks", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Welcome to Whisketch copy.*6 objects/ }),
  ).toBeVisible();
  await page.screenshot({ path: "Artifacts/library-light.png" });
});
test("paper backgrounds survive editable export and PNG rendering", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.Whisketch?.isReady());
  await page.getByRole("button", { name: "Open notebooks" }).click();
  await noteActions(page);
  await page.getByRole("button", { name: "Use grid paper" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await page.getByRole("button", { name: "Open notebooks" }).click();
  const d = page.waitForEvent("download");
  await noteActions(page);
  await page
    .getByRole("button", { name: "Export notebook file", exact: true })
    .click();
  const fs = await import("node:fs/promises");
  const scene = parseBoard(
    await fs.readFile((await (await d).path())!, "utf8"),
  );
  expect(scene.whisketch.paper).toBe("grid");
  expect(
    scene.elements.find((e: any) => e.customData?.whisketchPaper).locked,
  ).toBe(true);
  expect(Object.keys(scene.files).length).toBeGreaterThan(0);
  const image = page.waitForEvent("download");
  await noteActions(page);
  await page
    .getByRole("button", { name: "Export PNG image", exact: true })
    .click();
  const png = await fs.readFile((await (await image).path())!);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  await page.reload();
  await page.getByRole("button", { name: "Open notebooks" }).click();
  await noteActions(page);
  await expect(
    page.getByRole("button", { name: "Use grid paper" }),
  ).toHaveClass(/selected/);
});
test("shape library survives reload and notebook changes", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.Whisketch?.isReady());
  const shape = {
    id: "shape",
    type: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    angle: 0,
    strokeColor: "#000000",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  };
  await page.evaluate(
    (json) => window.Whisketch.importDocument(json, "shapes.excalidrawlib"),
    JSON.stringify({
      type: "excalidrawlib",
      version: 2,
      libraryItems: [
        { id: "cat-kit", status: "unpublished", created: 1, elements: [shape] },
      ],
    }),
  );
  await page.waitForFunction(() => window.Whisketch.libraryCount() === 1);
  await page.reload();
  await page.waitForFunction(() => window.Whisketch?.libraryCount() === 1);
  await page.getByRole("button", { name: "Open notebooks" }).click();
  await page.getByRole("button", { name: "＋ New notebook" }).click();
  await page.waitForFunction(() => window.Whisketch.libraryCount() === 1);
});
test("templates and checkpoints keep earlier work recoverable", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.Whisketch?.isReady());
  await page.getByRole("button", { name: "Open notebooks" }).click();
  await page.getByText("Start from a template", { exact: true }).click();
  await page.getByRole("button", { name: "Use Homelab map template" }).click();
  await expect(
    page.getByRole("textbox", { name: "Notebook title", exact: true }),
  ).toHaveValue("Homelab map");
  await page.getByRole("button", { name: "Open notebooks" }).click();
  await noteActions(page);
  await page
    .getByRole("button", { name: "Save checkpoint", exact: true })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: "Saved checkpoints" })
    .click();
  await page.getByRole("button", { name: /Restore checkpoint/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Notebook title", exact: true }),
  ).toHaveValue("Homelab map recovered");
  await page.getByRole("button", { name: "Open notebooks" }).click();
  await noteActions(page);
  await page
    .getByRole("button", { name: "Add Catlyte homelab shapes", exact: true })
    .click();
  await page.waitForFunction(() => window.Whisketch.libraryCount() === 5);
});
test("appearance choice survives reopening", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.Whisketch?.isReady());
  const previous = await page.locator(".shell").getAttribute("class");
  await noteActions(page);
  await page
    .getByRole("button", { name: "Toggle appearance", exact: true })
    .click();
  const changed = await page.locator(".shell").getAttribute("class");
  expect(changed).not.toEqual(previous);
  await page.waitForTimeout(100);
  await page.reload();
  await page.waitForFunction(() => window.Whisketch?.isReady());
  await expect(page.locator(".shell")).toHaveAttribute("class", changed!);
});
test("library backups restore separate notebooks and preserve favorites", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.Whisketch?.isReady());
  await noteActions(page);
  await page
    .getByRole("button", { name: "Favorite notebook", exact: true })
    .click();
  await page.getByRole("button", { name: "Open notebooks" }).click();
  const promise = page.waitForEvent("download");
  await noteActions(page);
  await page
    .getByRole("button", { name: "Export library backup", exact: true })
    .click();
  const fs = await import("node:fs/promises");
  const text = await fs.readFile((await (await promise).path())!, "utf8");
  const data = JSON.parse(text);
  expect(data.type).toBe("whisketch-backup");
  expect(data.notebooks[0].favorite).toBe(true);
  await page.evaluate(
    (text) => window.Whisketch.importDocument(text, "backup.json"),
    text,
  );
  await expect(
    page.getByRole("textbox", { name: "Notebook title", exact: true }),
  ).toHaveValue("My first notebook restored");
  await noteActions(page);
  await expect(
    page.getByRole("button", { name: "Favorite notebook", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Open notebooks" }).click();
  await expect(
    page.getByRole("button", { name: /My first notebook.*0 objects/ }),
  ).toHaveCount(2);
});
