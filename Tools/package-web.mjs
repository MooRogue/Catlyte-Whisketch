import { cp, mkdir, rm } from "node:fs/promises";
await mkdir("build/web/excalidraw", { recursive: true });
await cp(
  "node_modules/@excalidraw/excalidraw/dist/prod/fonts",
  "build/web/excalidraw/fonts",
  { recursive: true },
);
await cp("THIRD_PARTY_NOTICES.md", "build/web/THIRD_PARTY_NOTICES.md");
await mkdir("Native/Resources", { recursive: true });
await rm("Native/Resources/Web", { recursive: true, force: true });
await cp("build/web", "Native/Resources/Web", { recursive: true });
console.log("Bundled offline editor into Native/Resources/Web");
