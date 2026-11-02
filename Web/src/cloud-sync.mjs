import { parseBoard } from "./document.mjs";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((k) => value[k] !== undefined)
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export function contentKey(scene) {
  const { source, ...board } = parseBoard(scene);
  const { zoom, scrollX, scrollY, ...appState } = board.appState;
  return JSON.stringify(canonical({ ...board, appState }));
}
export function syncPlan(local, base, remote) {
  const a = contentKey(local),
    b = contentKey(remote);
  if (a === b) return "equal";
  if (base == null) return "conflict";
  if (a === base) return "pull";
  if (b === base) return "push";
  return "conflict";
}

// Local persistence is the source of truth for pending edits. Only conditional
// requests can advance a remote revision; no timer can authorize a conflict.
export class CloudSync {
  constructor({ getBook, commit, remote, notify }) {
    Object.assign(this, { getBook, commit, remote, notify });
    this.scope = null;
    this.jobs = new Map();
    this.again = new Set();
    this.resolving = new Set();
  }
  configure(scope) {
    this.scope = scope;
  }
  sync(id) {
    if (this.resolving.has(id)) {
      this.again.add(id);
      return Promise.resolve();
    }
    const scope = this.scope;
    if (this.jobs.has(id)) {
      this.again.add(id);
      return this.jobs.get(id);
    }
    const job = this.run(id)
      .catch((error) => {
        if (this.scope === scope && scope)
          this.notify(id, {
            state: error?.code === "conflict" ? "conflict" : "pending",
            message:
              error?.message ||
              "Waiting for Nextcloud. Changes are saved on this device.",
          });
      })
      .finally(() => {
        this.jobs.delete(id);
        if (this.again.delete(id)) void this.sync(id);
      });
    this.jobs.set(id, job);
    return job;
  }
  valid(scope, id) {
    const b = this.getBook(id);
    return (
      scope === this.scope &&
      b &&
      !b.deletedAt &&
      (!b.cloud || b.cloud.scope === scope)
    );
  }
  async run(id) {
    const scope = this.scope;
    if (!scope || !this.valid(scope, id)) return;
    this.notify(id, { state: "syncing", message: "Syncing with Nextcloud…" });
    for (let attempt = 0; attempt < 4; attempt++) {
      let b = this.getBook(id);
      if (!this.valid(scope, id)) return;
      const target = await this.remote("target", { scope, name: b.title });
      if (!this.valid(scope, id)) return;
      b = this.getBook(id);
      const linked = b.cloud?.url;
      const url = linked || target.url;
      let remote = await this.remote("read", { scope, url });
      if (!this.valid(scope, id)) return;
      b = this.getBook(id);
      if (remote) parseBoard(remote.json);
      if (linked && !remote) {
        this.notify(id, {
          state: "missing",
          message:
            "This file was removed or moved on Nextcloud. Your local note is safe.",
        });
        return;
      }
      const plan = remote
        ? syncPlan(b.scene, b.cloud?.base, remote.json)
        : "push";
      if (plan === "conflict") {
        this.notify(id, {
          state: "conflict",
          message:
            "This name already exists, or this note changed in both places. Choose a version; neither has been overwritten.",
        });
        return;
      }
      if (plan === "pull") {
        const scene = parseBoard(remote.json);
        await this.commit(
          id,
          {
            scene,
            cloud: {
              scope,
              url,
              etag: remote.etag,
              base: contentKey(scene),
              syncedAt: Date.now(),
            },
          },
          true,
        );
        // A rename made locally while content was clean is still intentional.
        continue;
      }
      // Persist a successful move immediately, before attempting any content PUT.
      // A failed PUT can then be retried at the new path without duplicating files.
      if (remote && linked && target.url !== linked) {
        const beforeMove = contentKey(remote.json);
        remote = await this.remote("move", {
          scope,
          url,
          destination: target.url,
          etag: remote.etag,
        });
        if (!this.valid(scope, id)) return;
        await this.commit(id, {
          cloud: {
            ...this.getBook(id).cloud,
            scope,
            url: remote.url,
            etag: remote.etag,
            base: beforeMove,
          },
        });
        continue;
      }
      const sent = structuredClone(b.scene);
      if (plan === "push")
        remote = await this.remote("write", {
          scope,
          url,
          json: JSON.stringify(sent),
          etag: remote?.etag ?? null,
        });
      if (!this.valid(scope, id)) return;
      await this.commit(id, {
        cloud: {
          scope,
          url: remote.url,
          etag: remote.etag,
          base: contentKey(remote.json),
          syncedAt: Date.now(),
        },
      });
      const now = this.getBook(id);
      if (contentKey(now.scene) !== contentKey(sent) || now.title !== b.title)
        continue;
      this.notify(id, { state: "synced", message: "Saved to Nextcloud" });
      return;
    }
    this.notify(id, {
      state: "pending",
      message: "Edits saved locally. Nextcloud will retry shortly.",
    });
  }
  async resolve(id, choice) {
    if (this.resolving.has(id)) return;
    this.resolving.add(id);
    try {
      await this.resolveVersion(id, choice);
    } finally {
      this.resolving.delete(id);
      this.again.delete(id);
    }
    return this.sync(id);
  }
  async resolveVersion(id, choice) {
    const scope = this.scope;
    if (!scope || !this.valid(scope, id)) return;
    // Finish an in-flight operation before applying an explicit resolution.
    if (this.jobs.has(id)) await this.jobs.get(id);
    if (!this.valid(scope, id)) return;
    let b = this.getBook(id);
    const target = await this.remote("target", { scope, name: b.title });
    const url = b.cloud?.url || target.url;
    const remote = await this.remote("read", { scope, url });
    if (!this.valid(scope, id)) return;
    b = this.getBook(id);
    if (!remote) {
      if (choice !== "recreate")
        throw new Error(
          "The remote file is missing. Use Recreate on Nextcloud to restore it.",
        );
      await this.commit(id, { cloud: { scope, url: null, base: null } });
    } else {
      const checkpoint = {
        id: globalThis.crypto.randomUUID(),
        at: Date.now(),
        title: b.title,
        scene: structuredClone(
          choice === "remote" ? b.scene : parseBoard(remote.json),
        ),
      };
      const patch = {
        checkpoints: [checkpoint, ...(b.checkpoints ?? [])].slice(0, 3),
        cloud: { scope, url, etag: remote.etag, base: contentKey(remote.json) },
      };
      if (choice === "remote") {
        patch.scene = parseBoard(remote.json);
        patch.title = decodeURIComponent(
          new URL(url).pathname.split("/").pop(),
        ).replace(/\.(whiteboard|excalidraw)$/i, "");
      }
      await this.commit(id, patch, choice === "remote");
    }
  }
}
