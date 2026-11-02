import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "Tests/Browser",
  use: {
    baseURL: "http://127.0.0.1:18862",
    viewport: { width: 1440, height: 1000 },
  },
  reporter: "list",
  workers: 1,
});
