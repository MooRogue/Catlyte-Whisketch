import { safeName, parseBoard } from "./document.mjs";
export class BrowserCloud {
  constructor(server, user, password, folder = "Whisketch") {
    const u = new URL(server);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash
    )
      throw new Error("Use your HTTPS Nextcloud address.");
    const safe = (v) =>
      v && !/[\\/%:\u0000-\u001f]/.test(v) && v !== "." && v !== "..";
    if (!safe(user)) throw new Error("Check the Nextcloud username.");
    const parts = folder.split("/").filter(Boolean);
    if (!parts.every(safe))
      throw new Error("Use a folder inside Nextcloud Files.");
    this.root =
      u.href.replace(/\/$/, "") +
      "/remote.php/dav/files/" +
      encodeURIComponent(user) +
      "/";
    this.parts = parts;
    this.scope =
      this.root +
      parts.map(encodeURIComponent).join("/") +
      (parts.length ? "/" : "");
    this.authorization =
      "Basic " +
      btoa(
        String.fromCharCode(...new TextEncoder().encode(user + ":" + password)),
      );
  }
  file(url) {
    const u = new URL(url),
      f = new URL(this.scope);
    if (
      u.origin !== f.origin ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      !u.pathname.startsWith(f.pathname) ||
      u.pathname.slice(f.pathname.length).includes("/") ||
      !u.pathname.endsWith(".whisketch")
    )
      throw new Error("The notebook is outside the connected folder.");
    const name = decodeURIComponent(u.pathname.slice(f.pathname.length));
    if (/[\\/%]/.test(name) || name === "..")
      throw new Error("Unsafe notebook path.");
    return u.href;
  }
  async request(url, method, headers = {}, body) {
    const r = await fetch(url, {
      method,
      headers: { Authorization: this.authorization, ...headers },
      body,
      redirect: "error",
      credentials: "omit",
    });
    if (r.status === 409 || r.status === 412)
      throw Object.assign(
        new Error(
          "The remote notebook changed. Refresh before choosing a version.",
        ),
        { code: "conflict" },
      );
    return r;
  }
  async connect() {
    let path = this.root;
    for (const part of this.parts) {
      path += encodeURIComponent(part) + "/";
      const r = await this.request(path, "MKCOL");
      if (![201, 405].includes(r.status))
        throw new Error(
          "Could not open the Nextcloud folder (" + r.status + ").",
        );
    }
    return this.list();
  }
  async list() {
    const r = await this.request(
      this.scope,
      "PROPFIND",
      { Depth: "1", "Content-Type": "application/xml" },
      '<d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>',
    );
    if (r.status !== 207)
      throw new Error("Could not list notebooks (" + r.status + ").");
    const xml = new DOMParser().parseFromString(
      await r.text(),
      "application/xml",
    );
    return [...xml.getElementsByTagNameNS("DAV:", "response")].flatMap((x) => {
      const href = x.getElementsByTagNameNS("DAV:", "href")[0]?.textContent;
      if (!href) return [];
      const url = new URL(href, this.scope).href;
      if (!url.endsWith(".whisketch")) return [];
      this.file(url);
      return [
        {
          url,
          name: decodeURIComponent(new URL(url).pathname.split("/").pop()),
        },
      ];
    });
  }
  async read(url) {
    this.file(url);
    const r = await this.request(url, "GET");
    if (r.status === 404) return null;
    if (r.status !== 200)
      throw new Error("Could not read notebook (" + r.status + ").");
    const etag = r.headers.get("ETag");
    if (!/^"[^\r\n]*"$/.test(etag ?? ""))
      throw new Error("Nextcloud must expose a strong ETag to this browser.");
    const json = await r.text();
    if (json.length > 40_000_000)
      throw new Error("Notebook exceeds the sync limit.");
    parseBoard(json);
    return { url, json, etag };
  }
  async operation(op, args) {
    if (args.scope !== this.scope)
      throw new Error("The Nextcloud connection changed.");
    if (op === "target")
      return {
        url:
          this.scope + encodeURIComponent(safeName(args.name) + ".whisketch"),
      };
    this.file(args.url);
    if (op === "read") return this.read(args.url);
    if (op === "write") {
      parseBoard(args.json);
      const headers = {
        "Content-Type": "application/json",
        ...(args.etag ? { "If-Match": args.etag } : { "If-None-Match": "*" }),
      };
      const r = await this.request(args.url, "PUT", headers, args.json);
      if (![201, 204].includes(r.status))
        throw new Error("Could not save notebook (" + r.status + ").");
      const doc = await this.read(args.url);
      if (!doc || doc.json !== args.json)
        throw new Error("The saved notebook could not be verified.");
      return doc;
    }
    if (op === "move") {
      this.file(args.destination);
      const r = await this.request(args.url, "MOVE", {
        Destination: args.destination,
        Overwrite: "F",
        "If-Match": args.etag,
      });
      if (![201, 204].includes(r.status))
        throw new Error("Could not rename notebook (" + r.status + ").");
      return this.read(args.destination);
    }
    throw new Error("Unknown sync operation.");
  }
}
