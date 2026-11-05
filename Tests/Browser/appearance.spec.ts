import { test, expect } from "@playwright/test";
test("app theme changes darken paper and controls without changing notebook contents", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.Whisketch?.isReady());
  await page.evaluate(() =>
    window.Whisketch.insertText("Keep my ink and photos unchanged"),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => window.Whisketch.notebook().pages[0].content.objects.length,
      ),
    )
    .toBe(1);
  const before = await page.evaluate(() => window.Whisketch.notebook());
  await page.getByRole("button", { name: "Toggle app appearance" }).click();
  await expect
    .poll(() =>
      page
        .locator(".paper-backdrop")
        .evaluate((e) =>
          Number(getComputedStyle(e).backgroundColor.match(/\d+/)![0]),
        ),
    )
    .toBeLessThan(80);
  await expect
    .poll(() => page.evaluate(() => window.Whisketch.notebook()))
    .toEqual(before);
  await page.screenshot({
    path: "../whisketch-appearance-release-20261105/dark-notebook.png",
  });
  await page.getByRole("button", { name: "Choose paper background" }).click();
  await expect(
    page.getByRole("button", { name: "Paper appearance Follow app" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: "../whisketch-appearance-release-20261105/dark-paper-picker.png",
  });
  await page
    .getByRole("button", { name: "Paper appearance Light", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator(".paper-backdrop")
        .evaluate((e) =>
          Number(getComputedStyle(e).backgroundColor.match(/\d+/)![0]),
        ),
    )
    .toBeGreaterThan(200);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.Whisketch.notebook().pages[0].appearance.paperTone,
      ),
    )
    .toBe("light");
});
test("expanded drawing controls get the dark UI palette without image inversion", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.Whisketch?.isReady());
  await page.getByRole("button", { name: "Toggle app appearance" }).click();
  await page.getByRole("button", { name: "Notebook actions" }).click();
  await page
    .getByRole("button", { name: "Advanced diagram tools", exact: true })
    .click();
  const island = page.locator(".excalidraw .Island").first();
  await expect(island).toBeVisible();
  expect(
    await island.evaluate((e) => getComputedStyle(e).backgroundColor),
  ).not.toBe("rgb(255, 255, 255)");
  expect(
    await page
      .locator("canvas")
      .first()
      .evaluate((e) => getComputedStyle(e).filter),
  ).toBe("none");
  await page.screenshot({
    path: "../whisketch-appearance-release-20261105/dark-expanded-tools.png",
  });
});
