import { test, expect } from "@playwright/test";
test("dark graph ruling is drawn as a screen-space backdrop and follows zoom without saving display layers", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.Whisketch?.isReady());
  await page.getByRole("button", { name: "Toggle app appearance" }).click();
  await page.getByRole("button", { name: "Choose paper background" }).click();
  await page
    .getByRole("button", { name: "Choose Graph background", exact: true })
    .click();
  const bg = page.locator(".paper-backdrop");
  await expect
    .poll(() => bg.evaluate((e) => getComputedStyle(e).backgroundImage))
    .toContain("linear-gradient");
  const before = await bg.evaluate((e) => getComputedStyle(e).backgroundSize);
  await page.mouse.move(600, 350);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -300);
  await page.keyboard.up("Control");
  await expect
    .poll(() => bg.evaluate((e) => getComputedStyle(e).backgroundSize))
    .not.toBe(before);
  const doc = await page.evaluate(() => window.Whisketch.notebook());
  expect(doc.pages[0].paper).toBe("grid");
  expect(
    doc.pages[0].content.objects.find((e: any) => e.customData?.whisketchPaper)
      .opacity,
  ).toBe(100);
  expect(
    Object.keys(doc.pages[0].content.assets).some((x) =>
      x.startsWith("whisketch-display-"),
    ),
  ).toBe(false);
  await page.screenshot({
    path: "../whisketch-ruling-release-20261105/dark-graph.png",
  });
});
