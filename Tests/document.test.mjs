import test from "node:test";
import assert from "node:assert/strict";
import { parseBoard, snapshot, safeName } from "../Web/src/document.mjs";
const element = {
  id: "stroke",
  type: "freedraw",
  x: 10,
  y: 20,
  width: 30,
  height: 40,
  points: [
    [0, 0],
    [30, 40],
  ],
  pressures: [0.4, 0.8],
  customData: { recognition: "hello" },
  isDeleted: false,
};
test("scene roundtrip preserves ink pressure, attachments, unknown metadata and deleted objects", () => {
  const scene = parseBoard({
    elements: [element, { ...element, id: "deleted", isDeleted: true }],
    files: { photo: { id: "photo", dataURL: "data:image/png;base64,AA==" } },
    vendor: { pages: ["one"] },
    appState: { gridSize: 20, extra: true },
  });
  const s = snapshot(
    scene,
    scene.elements,
    { viewBackgroundColor: "#fff", gridSize: 20 },
    scene.files,
  );
  assert.deepEqual(parseBoard(JSON.stringify(s)).elements, scene.elements);
  assert.deepEqual(s.files, scene.files);
  assert.deepEqual(s.vendor, scene.vendor);
  assert.equal(s.appState.extra, true);
});
test("malformed scenes do not replace the local library", () => {
  for (const s of ["bad", "{}", '{"elements":[{}]}'])
    assert.throws(() => parseBoard(s));
  assert.throws(() => parseBoard({ elements: [element, element] }));
  assert.throws(() => parseBoard({ elements: [{ ...element, x: Infinity }] }));
});
test("file names cannot create paths", () => {
  assert.equal(safeName("../../photo:one"), "..-..-photo-one");
  assert.equal(safeName(""), "Untitled");
});
test("a malformed backup fails before restoring any notebook", async () => {
  const { parseBackup } = await import("../Web/src/document.mjs");
  assert.throws(() =>
    parseBackup({
      type: "whisketch-backup",
      version: 1,
      notebooks: [
        { title: "safe", scene: { elements: [] } },
        { title: "broken", scene: {} },
      ],
    }),
  );
  const valid = parseBackup({
    type: "whisketch-backup",
    version: 1,
    notebooks: [
      {
        title: "safe",
        favorite: true,
        scene: { elements: [element] },
        checkpoints: [{ scene: { elements: [element] } }],
      },
    ],
  });
  assert.equal(valid.notebooks[0].favorite, true);
  assert.equal(valid.notebooks[0].checkpoints.length, 1);
});
