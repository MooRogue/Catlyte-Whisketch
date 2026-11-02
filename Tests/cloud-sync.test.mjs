import test from "node:test";
import assert from "node:assert/strict";
import { CloudSync, contentKey, syncPlan } from "../Web/src/cloud-sync.mjs";
const scene = (text) => ({
  elements: [
    { id: "text", type: "text", x: 0, y: 0, width: 10, height: 10, text },
  ],
  files: {},
  appState: {},
});
function fixture(initial = scene("local")) {
  let book = { id: "b", title: "Note", scene: initial };
  const files = new Map(),
    calls = [],
    notices = [];
  let revision = 0;
  const scope = "https://cloud.example/Whisketch";
  const url = (name) => scope + "/" + encodeURIComponent(name) + ".whiteboard";
  function put(name, data) {
    const doc = {
      url: url(name),
      json: JSON.stringify(data),
      etag: '"' + ++revision + '"',
    };
    files.set(doc.url, doc);
    return doc;
  }
  const engine = new CloudSync({
    getBook: () => book,
    commit: async (_id, patch) => {
      book = { ...book, ...patch };
    },
    notify: (_id, value) => notices.push(value),
    remote: async (op, args) => {
      calls.push([op, args]);
      if (op === "target") return { url: url(args.name) };
      if (op === "read") return structuredClone(files.get(args.url) ?? null);
      const current = files.get(args.url);
      if (
        (args.etag == null && current) ||
        (args.etag != null && current?.etag !== args.etag)
      )
        throw Object.assign(new Error("Conflict"), { code: "conflict" });
      if (op === "move") {
        if (files.has(args.destination))
          throw Object.assign(new Error("Name exists"), { code: "conflict" });
        files.delete(args.url);
        const moved = { ...current, url: args.destination };
        files.set(args.destination, moved);
        return structuredClone(moved);
      }
      const saved = {
        url: args.url,
        json: args.json,
        etag: '"' + ++revision + '"',
      };
      files.set(args.url, saved);
      return structuredClone(saved);
    },
  });
  engine.configure(scope);
  return {
    engine,
    files,
    calls,
    notices,
    put,
    url,
    scope,
    get book() {
      return book;
    },
    edit: (data) => {
      book = { ...book, scene: data };
    },
    rename: (title) => {
      book = { ...book, title };
    },
    link: (remote) => {
      book = {
        ...book,
        cloud: {
          scope,
          url: remote.url,
          etag: remote.etag,
          base: contentKey(JSON.parse(remote.json)),
        },
      };
    },
    trash: () => {
      book = { ...book, deletedAt: Date.now() };
    },
  };
}
test("sync planner ignores viewport positions and handles three-way revisions", () => {
  const base = scene("base"),
    local = scene("local"),
    remote = scene("remote");
  assert.equal(syncPlan(base, contentKey(base), remote), "pull");
  assert.equal(syncPlan(local, contentKey(base), base), "push");
  assert.equal(syncPlan(local, contentKey(base), remote), "conflict");
  assert.equal(
    contentKey(base),
    contentKey({
      ...base,
      source: "another editor",
      appState: { zoom: { value: 2 }, scrollX: 99 },
    }),
  );
});
test("create uses title without suffix and repeated edits update the same file", async () => {
  const f = fixture();
  await f.engine.sync("b");
  assert.equal(f.files.size, 1);
  assert.ok(f.files.has(f.url("Note")));
  f.edit(scene("updated"));
  await f.engine.sync("b");
  assert.equal(f.files.size, 1);
  assert.equal(
    JSON.parse(f.files.get(f.url("Note")).json).elements[0].text,
    "updated",
  );
  assert.equal(f.book.cloud.base, contentKey(f.book.scene));
});
test("opening pulls changed remote content when local is clean", async () => {
  const f = fixture();
  const old = f.put("Note", scene("local"));
  f.link(old);
  f.put("Note", scene("changed in browser"));
  await f.engine.sync("b");
  assert.equal(f.book.scene.elements[0].text, "changed in browser");
  assert.equal(f.calls.filter((c) => c[0] === "write").length, 0);
});
test("offline edits stay local and retry safely after reconnect", async () => {
  const f = fixture();
  const old = f.put("Note", scene("local"));
  f.link(old);
  f.edit(scene("offline edit"));
  const transport = f.engine.remote;
  f.engine.remote = async () => {
    throw new Error("offline");
  };
  await f.engine.sync("b");
  assert.equal(f.book.scene.elements[0].text, "offline edit");
  assert.equal(
    JSON.parse(f.files.get(f.url("Note")).json).elements[0].text,
    "local",
  );
  f.engine.remote = transport;
  await f.engine.sync("b");
  assert.equal(
    JSON.parse(f.files.get(f.url("Note")).json).elements[0].text,
    "offline edit",
  );
});
test("two-sided edits stop without overwriting, explicit local resolution preserves remote checkpoint", async () => {
  const f = fixture();
  const old = f.put("Note", scene("local"));
  f.link(old);
  f.edit(scene("local edit"));
  f.put("Note", scene("remote edit"));
  await f.engine.sync("b");
  assert.equal(f.notices.at(-1).state, "conflict");
  assert.equal(f.calls.filter((c) => c[0] === "write").length, 0);
  await f.engine.resolve("b", "local");
  assert.equal(f.book.checkpoints[0].scene.elements[0].text, "remote edit");
  assert.equal(
    JSON.parse(f.files.get(f.url("Note")).json).elements[0].text,
    "local edit",
  );
});
test("existing name is never silently adopted; remote resolution keeps local checkpoint", async () => {
  const f = fixture();
  f.put("Note", scene("existing remote"));
  await f.engine.sync("b");
  assert.equal(f.notices.at(-1).state, "conflict");
  await f.engine.resolve("b", "remote");
  assert.equal(f.book.scene.elements[0].text, "existing remote");
  assert.equal(f.book.checkpoints[0].scene.elements[0].text, "local");
});
test("rename moves one linked file and later edits use the new path", async () => {
  const f = fixture();
  await f.engine.sync("b");
  f.rename("New title");
  f.edit(scene("edited"));
  await f.engine.sync("b");
  assert.equal(f.files.size, 1);
  assert.ok(f.files.has(f.url("New title")));
  assert.equal(f.book.cloud.url, f.url("New title"));
  assert.equal(
    JSON.parse(f.files.get(f.url("New title")).json).elements[0].text,
    "edited",
  );
});
test("rename collision preserves both existing files", async () => {
  const f = fixture();
  await f.engine.sync("b");
  f.put("Existing", scene("other note"));
  f.rename("Existing");
  await f.engine.sync("b");
  assert.equal(f.files.size, 2);
  assert.equal(
    JSON.parse(f.files.get(f.url("Existing")).json).elements[0].text,
    "other note",
  );
});
test("remote deletion is not automatically undone; explicit recreate restores local", async () => {
  const f = fixture();
  await f.engine.sync("b");
  f.files.clear();
  await f.engine.sync("b");
  assert.equal(f.notices.at(-1).state, "missing");
  assert.equal(f.files.size, 0);
  await f.engine.resolve("b", "recreate");
  assert.equal(f.files.size, 1);
});
test("edits arriving during an upload are not marked synced with the older bytes", async () => {
  const f = fixture();
  const transport = f.engine.remote;
  let first = true;
  f.engine.remote = async (op, args) => {
    if (op === "write" && first) {
      first = false;
      f.edit(scene("newer edit"));
    }
    return transport(op, args);
  };
  await f.engine.sync("b");
  assert.equal(
    JSON.parse(f.files.get(f.url("Note")).json).elements[0].text,
    "newer edit",
  );
  assert.equal(f.book.cloud.base, contentKey(f.book.scene));
});
test("edits arriving during read become conflicts instead of being replaced", async () => {
  const f = fixture();
  const old = f.put("Note", scene("local"));
  f.link(old);
  f.put("Note", scene("remote edit"));
  const transport = f.engine.remote;
  f.engine.remote = async (op, args) => {
    const value = await transport(op, args);
    if (op === "read") f.edit(scene("new local edit"));
    return value;
  };
  await f.engine.sync("b");
  assert.equal(f.book.scene.elements[0].text, "new local edit");
  assert.equal(f.notices.at(-1).state, "conflict");
});
test("paused sync, trashed notes and another account never upload", async () => {
  const f = fixture();
  f.engine.configure(null);
  await f.engine.sync("b");
  assert.equal(f.calls.length, 0);
  f.engine.configure(f.scope);
  const old = f.put("Note", scene("local"));
  f.link(old);
  f.engine.configure("another account");
  await f.engine.sync("b");
  assert.equal(f.calls.length, 0);
  f.engine.configure(f.scope);
  f.trash();
  await f.engine.sync("b");
  assert.equal(f.calls.length, 0);
});
test("configuration changed while fetching prevents applying or uploading old-account content", async () => {
  const f = fixture();
  const transport = f.engine.remote;
  f.engine.remote = async (op, args) => {
    const v = await transport(op, args);
    if (op === "read") f.engine.configure(null);
    return v;
  };
  await f.engine.sync("b");
  assert.equal(f.files.size, 0);
  assert.equal(f.book.cloud, undefined);
});

test("a concurrent edit during rename is not overwritten after moving the file", async () => {
  const f = fixture();
  await f.engine.sync("b");
  f.rename("Renamed");
  f.edit(scene("local edit"));
  const transport = f.engine.remote;
  f.engine.remote = async (op, args) => {
    const result = await transport(op, args);
    if (op === "move")
      return f.put("Renamed", scene("remote edit during move"));
    return result;
  };
  await f.engine.sync("b");
  assert.equal(f.book.cloud.url, f.url("Renamed"));
  assert.equal(f.notices.at(-1).state, "conflict");
  assert.equal(
    JSON.parse(f.files.get(f.url("Renamed")).json).elements[0].text,
    "remote edit during move",
  );
  assert.equal(f.book.scene.elements[0].text, "local edit");
});

test("a write race fails the revision check and does not advance the local base", async () => {
  const f = fixture();
  const old = f.put("Note", scene("local"));
  f.link(old);
  f.edit(scene("local edit"));
  const base = f.book.cloud.base,
    transport = f.engine.remote;
  f.engine.remote = async (op, args) => {
    if (op === "write") f.put("Note", scene("remote won race"));
    return transport(op, args);
  };
  await f.engine.sync("b");
  assert.equal(f.book.cloud.base, base);
  assert.equal(f.notices.at(-1).state, "conflict");
  assert.equal(
    JSON.parse(f.files.get(f.url("Note")).json).elements[0].text,
    "remote won race",
  );
});
