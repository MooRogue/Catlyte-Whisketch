import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const scope = "https://cloud.example/remote.php/dav/files/alice/Whisketch";
    const files = () => JSON.parse(localStorage.getItem("mock-dav") ?? "{}");
    const store = (data: any) =>
      localStorage.setItem("mock-dav", JSON.stringify(data));
    let revision = Date.now();
    (window as any).webkit = {
      messageHandlers: {
        whisketch: {
          postMessage: (m: any) => {
            if (m.type === "ready") {
              window.Whisketch.configureCloud(
                JSON.stringify({ scope, folder: "Whisketch" }),
              );
              return;
            }
            if (m.type === "exportBackup")
              localStorage.setItem("mock-export", m.json);
            if (m.type !== "cloudRequest") return;
            setTimeout(() => {
              const response: any = { id: m.requestID };
              try {
                if (localStorage.getItem("mock-offline"))
                  throw new Error("Offline. Changes are saved locally.");
                const data = files();
                const doc = data[m.url];
                if (m.operation === "target")
                  response.result = {
                    url:
                      scope +
                      "/" +
                      encodeURIComponent(m.name.trim() || "Untitled") +
                      ".whiteboard",
                  };
                if (m.operation === "read") response.result = doc ?? null;
                if (m.operation === "write") {
                  if (
                    (m.etag == null && doc) ||
                    (m.etag != null && doc?.etag !== m.etag)
                  )
                    throw Object.assign(new Error("Conflict"), {
                      code: "conflict",
                    });
                  response.result = {
                    url: m.url,
                    json: m.json,
                    etag: '"' + ++revision + '"',
                  };
                  data[m.url] = response.result;
                  store(data);
                }
                if (m.operation === "move") {
                  if (data[m.destination] || doc?.etag !== m.etag)
                    throw Object.assign(new Error("Rename conflict"), {
                      code: "conflict",
                    });
                  delete data[m.url];
                  response.result = { ...doc, url: m.destination };
                  data[m.destination] = response.result;
                  store(data);
                }
              } catch (e: any) {
                response.error = e.message;
                response.code = e.code;
              }
              window.Whisketch.cloudResponse(JSON.stringify(response));
            }, 15);
          },
        },
      },
    };
  });
});

test("automatic opening/editing sync, plain name, rename, offline retry and refresh on foreground", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Saved to Nextcloud");
  await page
    .getByRole("textbox", { name: "Notebook title", exact: true })
    .fill("Meeting notes");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(JSON.parse(localStorage.getItem("mock-dav") ?? "{}")),
      ),
    )
    .toEqual([
      "https://cloud.example/remote.php/dav/files/alice/Whisketch/Meeting%20notes.whiteboard",
    ]);
  await page.evaluate(() => localStorage.setItem("mock-offline", "1"));
  await page.evaluate(() => window.Whisketch.insertText("Offline idea"));
  await expect(page.getByRole("status")).toContainText("Offline");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Notebook title", exact: true }),
  ).toHaveValue("Meeting notes");
  await page.evaluate(() => {
    localStorage.removeItem("mock-offline");
    window.Whisketch.cloudForeground();
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.values(
          JSON.parse(localStorage.getItem("mock-dav") ?? "{}"),
        ).some((d: any) => d.json.includes("Offline idea")),
      ),
    )
    .toBe(true);
  // Browser-side changes must replace a clean local scene on reopening.
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("mock-dav")!);
    const doc: any = Object.values(data)[0];
    const scene = JSON.parse(doc.json);
    scene.elements[0].text = "Changed in Nextcloud";
    scene.elements[0].originalText = "Changed in Nextcloud";
    scene.elements[0].version += 1;
    doc.json = JSON.stringify(scene);
    doc.etag = '"remote-update"';
    localStorage.setItem("mock-dav", JSON.stringify(data));
  });
  await page.reload();
  await expect(page.getByRole("status")).toContainText("Saved to Nextcloud");
  await page.getByRole("button", { name: "Open notebooks" }).click();
  await page
    .getByRole("textbox", { name: "Find a notebook" })
    .fill("Changed in Nextcloud");
  await expect(
    page.getByRole("button", { name: /^Meeting notes.*objects/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => Object.keys(JSON.parse(localStorage.getItem("mock-dav")!)).length,
    ),
  ).toBe(1);
});

test("same-name conflict is visible and choosing remote keeps a recovery checkpoint", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Saved to Nextcloud");
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("mock-dav")!);
    const url =
      "https://cloud.example/remote.php/dav/files/alice/Whisketch/Existing.whiteboard";
    data[url] = {
      url,
      json: JSON.stringify({
        elements: [],
        files: {},
        appState: { viewBackgroundColor: "#112233" },
      }),
      etag: '"existing"',
    };
    localStorage.setItem("mock-dav", JSON.stringify(data));
  });
  await page
    .getByRole("textbox", { name: "Notebook title", exact: true })
    .fill("Existing");
  await expect(
    page.getByRole("button", { name: "Use Nextcloud version" }),
  ).toBeVisible();
  // Rename collision leaves the original and destination intact.
  expect(
    await page.evaluate(
      () => Object.keys(JSON.parse(localStorage.getItem("mock-dav")!)).length,
    ),
  ).toBe(2);
  // Choosing remote cancels this attempted rename; no file is overwritten.
  await page.getByRole("button", { name: "Use Nextcloud version" }).click();
  await expect(
    page.getByRole("textbox", { name: "Notebook title", exact: true }),
  ).toHaveValue("My first notebook");
  await page.getByRole("button", { name: "Open notebooks" }).click();
  await page
    .getByRole("button", { name: "Notebook actions", exact: true })
    .click();
  await expect(page.getByText("Saved checkpoints (1/3)")).toBeVisible();
});

test("backup restoration creates separate notes without reusing remote links", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Saved to Nextcloud");
  await page.getByRole("button", { name: "Open notebooks" }).click();
  await page
    .getByRole("button", { name: "Notebook actions", exact: true })
    .click();
  await page.getByRole("button", { name: "Export library backup" }).click();
  const backup = await page.evaluate(
    () => localStorage.getItem("mock-export")!,
  );
  expect(JSON.parse(backup).notebooks[0].cloud).toBeTruthy();
  await page.evaluate(
    (json) => window.Whisketch.importDocument(json, "backup.json"),
    backup,
  );
  await expect(
    page.getByRole("textbox", { name: "Notebook title", exact: true }),
  ).toHaveValue("My first notebook restored");
  await expect
    .poll(() =>
      page.evaluate(
        () => Object.keys(JSON.parse(localStorage.getItem("mock-dav")!)).length,
      ),
    )
    .toBe(2);
});
