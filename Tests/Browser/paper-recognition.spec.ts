import { test, expect } from "@playwright/test";
test("dark chrome preserves photo pixels and avoids canvas inversion", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.Whisketch?.isReady());
  await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = 120;
    c.getContext("2d")!.fillStyle = "#ef2020";
    c.getContext("2d")!.fillRect(0, 0, 160, 120);
    window.Whisketch.insertCapture(c.toDataURL(), "");
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => window.Whisketch.notebook().pages[0].content.objects.length,
      ),
    )
    .toBe(1);
  await page.getByRole("button", { name: "Notebook actions" }).click();
  await page.getByRole("button", { name: "Toggle appearance" }).click();
  await page.getByRole("button", { name: "Close notebooks" }).click();
  await expect
    .poll(() =>
      page
        .locator("canvas")
        .first()
        .evaluate((e) => getComputedStyle(e).filter),
    )
    .toBe("none");
  await expect.poll(()=>page.locator("canvas").first().evaluate((c:HTMLCanvasElement)=>{const d=c.getContext("2d")!.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>200&&d[i+1]<60&&d[i+2]<60)n++;return n;})).toBeGreaterThan(100);
  await page.screenshot({
    path: "../whisketch-paper-release-20261104/dark-photo.png",
  });
});
test("paper picker offers ruled, graph and Cornell backgrounds and persists per page", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.Whisketch?.isReady());
  await page.getByRole("button", { name: "Choose paper background" }).click();
  await expect(
    page.getByRole("button", { name: "Choose Ruled background", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose Graph background", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Choose Cornell background", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.Whisketch.notebook().pages[0].paper))
    .toBe("cornell");
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await page.reload();
  await page.waitForFunction(() => window.Whisketch?.isReady());
  expect(
    await page.evaluate(() => window.Whisketch.notebook().pages[0].paper),
  ).toBe("cornell");
});
test("recognized text insertion acknowledges success, creates selected text and never silently accepts empty text", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.Whisketch?.isReady());
  const result = await page.evaluate(() =>
    window.Whisketch.insertText("Handwritten meeting notes"),
  );
  expect(result.inserted).toBe(true);
  await expect(
    page.getByRole("button", { name: "Select", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          window.Whisketch.notebook().pages[0].content.objects.find(
            (x: any) => x.id === id,
          )?.text,
        result.id,
      ),
    )
    .toBe("Handwritten meeting notes");
  expect(await page.evaluate(() => window.Whisketch.insertText("   "))).toEqual(
    { inserted: false },
  );
});
