import { defineConfig } from "vite";
export default defineConfig({
  root: "Web",
  base: "./",
  build: { outDir: "../build/web", emptyOutDir: true },
  server: { host: "127.0.0.1" },
});
