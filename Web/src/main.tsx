import React, { useState, useRef, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Excalidraw,
  convertToExcalidrawElements,
  restoreElements,
  exportToBlob,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { get, set } from "idb-keyval";
import { parseBoard, parseBackup, snapshot, safeName } from "./document.mjs";
import "./style.css";
import { templates, makeTemplate, starterLibrary } from "./templates";

declare global {
  interface Window {
    webkit?: {
      messageHandlers: { whisketch: { postMessage: (m: unknown) => void } };
    };
    Whisketch: any;
  }
}
const newID = () =>
  crypto.randomUUID?.() ??
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
type Notebook = {
  id: string;
  title: string;
  updated: number;
  scene: any;
  favorite?: boolean;
  deletedAt?: number;
  tags?: string[];
  cover?: string;
  checkpoints?: { id: string; at: number; title: string; scene: any }[];
};
const native = (m: unknown) =>
  window.webkit?.messageHandlers?.whisketch?.postMessage(m);
const blank = (): any => ({
  type: "excalidraw",
  version: 2,
  elements: [],
  appState: { viewBackgroundColor: "#fffdf7" },
  files: {},
});
function App() {
  const [books, setBooks] = useState<Notebook[]>([]),
    [active, setActive] = useState(""),
    [loaded, setLoaded] = useState(false),
    [menu, setMenu] = useState(false),
    [query, setQuery] = useState(""),
    [trash, setTrash] = useState(false),
    [favorites, setFavorites] = useState(false),
    [notice, setNotice] = useState("Opening library…"),
    [theme, setTheme] = useState<"light" | "dark">(
      matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    );
  const api = useRef<any>(null),
    all = useRef<Notebook[]>([]),
    current = useRef(""),
    queue = useRef<Promise<any>>(Promise.resolve()),
    latest = useRef<any>(null),
    nativeSeen = useRef(false),
    libraries = useRef<any[]>([]);
  const persist = useCallback((next: Notebook[]) => {
    all.current = next;
    setBooks(next);
    setNotice("Saving on this device…");
    const payload = structuredClone(next);
    queue.current = queue.current
      .catch(() => {})
      .then(() => set("whisketch-library-v1", payload))
      .then(() => setNotice("Saved on this device"))
      .catch(() => setNotice("Save failed. Export your board to keep a copy."));
    return queue.current;
  }, []);
  useEffect(() => {
    Promise.all([
      get<Notebook[]>("whisketch-library-v1"),
      get<any[]>("whisketch-shapes-v1"),
      get<string>("whisketch-active-v1"),
      get<string>("whisketch-theme-v1"),
    ])
      .then(([data, shapes, selected, appearance]) => {
        if (appearance === "light" || appearance === "dark")
          setTheme(appearance);
        libraries.current = shapes ?? [];
        const docs = data?.length
          ? data
          : [
              {
                id: newID(),
                title: "My first notebook",
                updated: Date.now(),
                scene: blank(),
              },
            ];
        all.current = docs;
        setBooks(docs);
        const initial =
          docs.find((b) => b.id === selected && !b.deletedAt) ??
          docs.find((b) => !b.deletedAt) ??
          docs[0];
        current.current = initial.id;
        setActive(initial.id);
        setLoaded(true);
        setNotice("Saved on this device");
      })
      .catch(() =>
        setNotice(
          "Could not open local library. Reload or import a saved board.",
        ),
      );
  }, []);
  function updateScene(elements: any, appState: any, files: any) {
    const b = all.current.find((b) => b.id === active);
    if (!b) return;
    const scene = snapshot(b.scene, elements, appState, files);
    if (JSON.stringify(scene) === JSON.stringify(b.scene)) return;
    latest.current = scene;
    const next = all.current.map((x) =>
      x.id === b.id ? { ...x, scene, updated: Date.now() } : x,
    );
    void persist(next);
  }
  function add(
    title = "Untitled notebook",
    scene = blank(),
    extra: Partial<Notebook> = {},
  ) {
    const b = { ...extra, id: newID(), title, scene, updated: Date.now() };
    void persist([b, ...all.current]);
    current.current = b.id;
    void set("whisketch-active-v1", b.id);
    setActive(b.id);
    setMenu(false);
  }
  function select(id: string) {
    void set("whisketch-active-v1", id);
    current.current = id;
    setActive(id);
    latest.current = null;
    setMenu(false);
  }
  function exportBoard(publish = false) {
    const b = all.current.find((x) => x.id === current.current);
    if (!b) return;
    const data = JSON.stringify(b.scene, null, 2);
    if (window.webkit?.messageHandlers?.whisketch) {
      native({
        type: publish ? "publish" : "export",
        name: safeName(b.title),
        json: data,
      });
      return;
    }
    const u = URL.createObjectURL(
      new Blob([data], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = u;
    a.download = safeName(b.title) + ".excalidraw";
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  function exportBackup() {
    const json = JSON.stringify(
      {
        type: "whisketch-backup",
        version: 1,
        notebooks: all.current,
        shapeLibrary: libraries.current,
      },
      null,
      2,
    );
    if (window.webkit?.messageHandlers?.whisketch) {
      native({ type: "exportBackup", name: "Whisketch library backup", json });
      return;
    }
    const url = URL.createObjectURL(
      new Blob([json], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "Whisketch-library-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function importBoard(json: string, title = "Imported board") {
    try {
      const parsed = JSON.parse(json);
      if (parsed.type === "whisketch-backup") {
        const backup = parseBackup(parsed);
        const restored = backup.notebooks.map((b: any) => ({
          ...b,
          id: newID(),
          title: b.title + " restored",
        }));
        void persist([...restored, ...all.current]);
        if (restored[0]) select(restored[0].id);
        if (backup.shapeLibrary.length)
          void api.current.updateLibrary({
            libraryItems: backup.shapeLibrary,
            merge: true,
          });
        setNotice(
          "Backup imported as separate notebooks. Existing work preserved.",
        );
        return;
      }
      if (Array.isArray(parsed.libraryItems)) {
        void api.current.updateLibrary({
          libraryItems: parsed.libraryItems,
          merge: true,
          openLibraryMenu: true,
        });
        setNotice("Shape library imported");
        return;
      }
      add(
        safeName(title.replace(/\.(excalidraw|whiteboard|json)$/i, "")),
        parseBoard(json),
      );
      setNotice("Imported as a separate local notebook");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  useEffect(() => {
    window.Whisketch = {
      isReady: () => !!api.current,
      libraryCount: () => libraries.current.length,
      importDocument: importBoard,
      insertCapture: (dataURL: string, text: string) => {
        const image = new Image();
        image.onload = () => {
          const id = newID(),
            width = Math.min(620, image.width),
            height = (width * image.height) / image.width;
          api.current.addFiles([
            {
              id,
              dataURL,
              mimeType: dataURL.split(";")[0].slice(5),
              created: Date.now(),
            },
          ]);
          const elements = convertToExcalidrawElements([
            {
              type: "image",
              x: 80,
              y: 80,
              width,
              height,
              fileId: id,
              status: "saved",
            } as any,
            {
              type: "text",
              x: 80,
              y: 110 + height,
              text: text || "No text recognized",
              fontSize: 22,
              fontFamily: 2,
            },
          ]);
          api.current.updateScene({
            elements: [
              ...api.current.getSceneElementsIncludingDeleted(),
              ...elements,
            ],
          });
        };
        image.src = dataURL;
      },
      exportDocument: () => exportBoard(),
      insertText: (text: string) => {
        if (!api.current) return;
        const elements = convertToExcalidrawElements([
          { type: "text", x: 80, y: 80, text, fontSize: 22 },
        ]);
        api.current.updateScene({
          elements: [
            ...api.current.getSceneElementsIncludingDeleted(),
            ...elements,
          ],
        });
      },
      setNotice: (text: string) => setNotice(text),
    };
    if (loaded && !nativeSeen.current) {
      nativeSeen.current = true;
      native({ type: "ready" });
    }
  }, [loaded, active]);
  function sample() {
    const els = convertToExcalidrawElements([
      {
        type: "rectangle",
        id: "capture",
        x: 60,
        y: 80,
        width: 210,
        height: 110,
        backgroundColor: "#d3f9d8",
        label: { text: "Capture an idea", fontFamily: 2 },
      },
      {
        type: "rectangle",
        id: "create",
        x: 390,
        y: 80,
        width: 210,
        height: 110,
        backgroundColor: "#d0bfff",
        label: { text: "Make it yours", fontFamily: 2 },
      },
      {
        type: "arrow",
        x: 270,
        y: 135,
        width: 120,
        height: 0,
        points: [
          [0, 0],
          [120, 0],
        ],
        start: { id: "capture" },
        end: { id: "create" },
      },
      {
        type: "text",
        x: 60,
        y: 230,
        text: "Write, sketch, connect.\nYour ideas have room to wander.",
        fontSize: 24,
        fontFamily: 2,
      },
    ]);
    add("Welcome to Whisketch", { ...blank(), elements: els });
  }
  const book = books.find((x) => x.id === active);
  function changeBook(update: Partial<Notebook>) {
    void persist(
      all.current.map((b) =>
        b.id === active ? { ...b, ...update, updated: Date.now() } : b,
      ),
    );
  }
  function duplicate() {
    if (book)
      add((book.title || "Untitled") + " copy", structuredClone(book.scene));
  }
  function removeBook() {
    const next = all.current.map((b) =>
      b.id === active ? { ...b, deletedAt: Date.now() } : b,
    );
    void persist(next);
    const other = next.find((b) => !b.deletedAt);
    if (other) select(other.id);
    else add();
    setMenu(true);
  }
  async function exportImage(pdf = false, recognize = false) {
    try {
      const blob = await exportToBlob({
        elements:
          recognize &&
          Object.keys(api.current.getAppState().selectedElementIds).length
            ? api.current
                .getSceneElements()
                .filter(
                  (e: any) =>
                    api.current.getAppState().selectedElementIds[e.id],
                )
            : api.current.getSceneElements(),
        appState: { ...api.current.getAppState(), exportBackground: true },
        files: api.current.getFiles(),
        mimeType: "image/png",
        getDimensions: (w: number, h: number) => ({
          width: w,
          height: h,
          scale: Math.min(1, 2048 / Math.max(w, h)),
        }),
      });
      if (window.webkit?.messageHandlers?.whisketch) {
        const reader = new FileReader();
        reader.onload = () =>
          native({
            type: recognize
              ? "recognizeBoard"
              : pdf
                ? "exportPDF"
                : "exportImage",
            name: safeName(book?.title ?? "Whisketch"),
            data: reader.result,
          });
        reader.readAsDataURL(blob);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = safeName(book?.title ?? "Whisketch") + ".png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      setNotice("Could not export this drawing as an image");
    }
  }
  function paper(style: string) {
    if (!api.current || !book) return;
    const color = style === "midnight" ? "#252c3d" : "#fffdf6";
    const pattern =
      style === "lined"
        ? '<path d="M0 31.5H32" stroke="#b3c3cc" stroke-width="0.6"/>'
        : style === "grid"
          ? '<path d="M32 0H0V32" fill="none" stroke="#bdccd1" stroke-width="0.6"/>'
          : style === "dots"
            ? '<circle cx="2" cy="2" r="1" fill="#a9b9bf"/>'
            : "";
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><defs><pattern id="paper" width="32" height="32" patternUnits="userSpaceOnUse">' +
      pattern +
      '</pattern></defs><rect width="1200" height="1600" fill="' +
      color +
      '"/><rect width="1200" height="1600" fill="url(#paper)"/></svg>';
    const fileId = newID();
    api.current.addFiles([
      {
        id: fileId,
        mimeType: "image/svg+xml",
        dataURL: "data:image/svg+xml;base64," + btoa(svg),
        created: Date.now(),
      },
    ]);
    const bg = convertToExcalidrawElements([
      {
        type: "image",
        x: 0,
        y: 0,
        width: 1200,
        height: 1600,
        fileId,
        status: "saved",
        locked: true,
        customData: { whisketchPaper: true },
      } as any,
    ]);
    const prior = api.current
      .getSceneElementsIncludingDeleted()
      .filter((e: any) => !e.customData?.whisketchPaper);
    const updated = {
      ...book,
      scene: {
        ...book.scene,
        whisketch: { ...book.scene.whisketch, paper: style },
      },
    };
    all.current = all.current.map((b) => (b.id === active ? updated : b));
    api.current.updateScene({
      elements: [...bg, ...prior],
      appState: { viewBackgroundColor: color, gridModeEnabled: false },
    });
    api.current.scrollToContent(prior.length ? prior : bg, {
      fitToViewport: true,
    });
  }
  const visible = books
    .filter(
      (b) =>
        Boolean(b.deletedAt) === trash &&
        (!favorites || b.favorite) &&
        [
          b.title,
          ...(b.tags ?? []),
          ...b.scene.elements
            .filter((e: any) => !e.isDeleted)
            .map((e: any) => e.text ?? e.customData?.recognizedText ?? ""),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(!!b.favorite) - Number(!!a.favorite) || b.updated - a.updated,
    );
  return (
    <div className={"shell " + theme}>
      <header>
        <button
          className="brand"
          onClick={() => setMenu(!menu)}
          aria-label="Open notebooks"
        >
          <img
            src={
              theme === "dark" ? "./art/mark-dark.png" : "./art/mark-light.png"
            }
          />
          <span>
            Whisketch<small>A little room for big ideas</small>
          </span>
        </button>
        <input
          aria-label="Notebook title"
          className="title"
          value={book?.title ?? ""}
          onChange={(e) => changeBook({ title: e.target.value })}
        />
        <button
          className={"star " + (book?.favorite ? "chosen" : "")}
          aria-label="Favorite notebook"
          aria-pressed={!!book?.favorite}
          onClick={() => changeBook({ favorite: !book?.favorite })}
        >
          {book?.favorite ? "★" : "☆"}
        </button>
        <button
          aria-label="Toggle appearance"
          onClick={() => {
            const next = theme === "dark" ? "light" : "dark";
            setTheme(next);
            void set("whisketch-theme-v1", next);
          }}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
        <button
          className="more"
          onClick={() => setMenu(!menu)}
          aria-label="Notebook actions"
        >
          ☰
        </button>
      </header>
      {menu && (
        <aside className="shelf">
          <div className="shelf-heading">
            <img className="library-art" src="./art/library.jpg" alt="" />
            <div>
              <small className="eyebrow">CATLYTE · YOUR CREATIVE CORNER</small>
              <h2>Your notebooks</h2>
              <p>Sketch a thought. Follow a connection. Keep it yours.</p>
            </div>
            <button onClick={() => setMenu(false)} aria-label="Close notebooks">
              ×
            </button>
          </div>
          <div className="shelf-tools">
            <input
              placeholder="Search titles, tags and words…"
              aria-label="Find a notebook"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="primary" onClick={() => add()}>
              ＋ New notebook
            </button>
            <button onClick={sample}>Try a sample</button>
          </div>
          <section className="templates" aria-label="Notebook templates">
            <h3>A starting point, if you like</h3>
            <div>
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => add(t.name, makeTemplate(t.id))}
                  aria-label={"Use " + t.name + " template"}
                >
                  <span>{t.mark}</span>
                  <strong>{t.name}</strong>
                  <small>{t.hint}</small>
                </button>
              ))}
            </div>
          </section>
          <div className="shelf-tabs">
            <button
              className={!trash && !favorites ? "selected" : ""}
              onClick={() => {
                setTrash(false);
                setFavorites(false);
              }}
            >
              All notebooks
            </button>
            <button
              className={favorites ? "selected" : ""}
              onClick={() => {
                setFavorites(!favorites);
                setTrash(false);
              }}
            >
              Favorites
            </button>
            <button
              className={trash ? "selected" : ""}
              onClick={() => {
                setTrash(!trash);
                setFavorites(false);
              }}
            >
              Trash
            </button>
            <span>
              {visible.length} {visible.length === 1 ? "notebook" : "notebooks"}
            </span>
          </div>
          <div className="notebooks">
            {visible.map((b) => (
              <div key={b.id} className="book-card">
                <button
                  className={"book-cover " + (b.id === active ? "active" : "")}
                  style={
                    { "--cover": b.cover ?? "#dce9e3" } as React.CSSProperties
                  }
                  onClick={() => {
                    if (!b.deletedAt) select(b.id);
                  }}
                  aria-label={
                    b.title +
                    " " +
                    new Date(b.updated).toLocaleDateString() +
                    " · " +
                    b.scene.elements.filter(
                      (e: any) => !e.isDeleted && !e.customData?.whisketchPaper,
                    ).length +
                    " objects"
                  }
                >
                  <span className="book-spine" />
                  <span className="book-emboss">{b.favorite ? "★" : "✧"}</span>
                  <strong>{b.title || "Untitled"}</strong>
                  <span className="cover-caption">
                    {b.scene.whisketch?.paper ?? "Free canvas"} · Whisketch
                  </span>
                  <span className="elastic" />
                </button>
                <div className="book-details">
                  <span>
                    {new Date(b.updated).toLocaleDateString()} ·{" "}
                    {
                      b.scene.elements.filter(
                        (e: any) =>
                          !e.isDeleted && !e.customData?.whisketchPaper,
                      ).length
                    }{" "}
                    objects
                  </span>
                  {b.deletedAt && (
                    <button
                      onClick={() =>
                        void persist(
                          all.current.map((x) =>
                            x.id === b.id ? { ...x, deletedAt: undefined } : x,
                          ),
                        )
                      }
                    >
                      Restore notebook
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {visible.length === 0 && (
            <div className="empty-state">
              {trash
                ? "Your deleted notebooks will wait here until you restore them."
                : "A fresh page is a good place to begin."}
            </div>
          )}
          <section className="notebook-settings">
            <div>
              <h3>Make this notebook yours</h3>
              <p>{book?.title}</p>
              <label>
                Paper
                <div className="paper-options">
                  {["plain", "lined", "dots", "grid", "midnight"].map((x) => (
                    <button
                      key={x}
                      aria-label={"Use " + x + " paper"}
                      className={
                        book?.scene.whisketch?.paper === x ? "selected" : ""
                      }
                      onClick={() => {
                        paper(x);
                        setMenu(false);
                      }}
                    >
                      {x}
                    </button>
                  ))}
                </div>
              </label>
              <label>
                Cover
                <div className="swatches">
                  {["#dce9e3", "#e7dff1", "#ecdac8", "#d6e4ef", "#efcfca"].map(
                    (x, i) => (
                      <button
                        key={x}
                        style={{ background: x }}
                        aria-label={"Cover color " + (i + 1)}
                        onClick={() => changeBook({ cover: x })}
                      />
                    ),
                  )}
                </div>
              </label>
              <label>
                Tags
                <input
                  aria-label="Notebook tags"
                  placeholder="Ideas, homelab, journal…"
                  key={active}
                  defaultValue={(book?.tags ?? []).join(", ")}
                  onBlur={(e) =>
                    changeBook({
                      tags: e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              {!!book?.checkpoints?.length && (
                <details className="checkpoints">
                  <summary>
                    Saved checkpoints ({book.checkpoints.length}/3)
                  </summary>
                  <p>
                    Restore opens a separate notebook so current work stays
                    safe.
                  </p>
                  {book.checkpoints.map((v) => (
                    <button
                      key={v.id}
                      onClick={() =>
                        add(v.title + " recovered", structuredClone(v.scene))
                      }
                    >
                      Restore checkpoint {new Date(v.at).toLocaleString()}
                    </button>
                  ))}
                </details>
              )}
              <div className="actions">
                <button onClick={duplicate}>Duplicate notebook</button>
                <button
                  onClick={() =>
                    changeBook({
                      checkpoints: [
                        {
                          id: newID(),
                          at: Date.now(),
                          title: book?.title ?? "Untitled",
                          scene: structuredClone(book?.scene),
                        },
                        ...(book?.checkpoints ?? []),
                      ].slice(0, 3),
                    })
                  }
                >
                  Save checkpoint
                </button>
                <button onClick={removeBook}>Move notebook to Trash</button>
              </div>
            </div>
            <div>
              <h3>Take your ideas with you</h3>
              <div className="actions">
                <label className="fileButton">
                  Import board, library or backup
                  <input
                    type="file"
                    accept=".excalidraw,.whiteboard,.json,.excalidrawlib"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) importBoard(await f.text(), f.name);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button onClick={exportBackup}>Export library backup</button>
                <button onClick={() => exportBoard()}>
                  Export editable board
                </button>
                <button onClick={() => void exportImage()}>
                  Export PNG image
                </button>
                <button
                  onClick={() =>
                    void api.current.updateLibrary({
                      libraryItems: starterLibrary(),
                      merge: true,
                      openLibraryMenu: true,
                    })
                  }
                >
                  Add Catlyte homelab shapes
                </button>
                {window.webkit?.messageHandlers?.whisketch && (
                  <button onClick={() => void exportImage(true)}>
                    Export PDF
                  </button>
                )}
                {window.webkit?.messageHandlers?.whisketch && (
                  <>
                    <button onClick={() => void exportImage(false, true)}>
                      Extract text from selected ink or board
                    </button>
                    <button onClick={() => native({ type: "ocr" })}>
                      Recognize text in a photo
                    </button>
                    <button onClick={() => native({ type: "connect" })}>
                      Nextcloud connection
                    </button>
                    <button onClick={() => exportBoard(true)}>
                      Publish a copy to Nextcloud
                    </button>
                  </>
                )}
              </div>
              <p className="connection-note">
                Saved locally on this device. Nextcloud currently imports or
                publishes separate copies. The folder can be changed in
                Nextcloud connection. Automatic two-way sync and iCloud are
                still in development.
              </p>
              <p className="connection-note">
                Shape libraries stay on this device across notebooks. Import
                .excalidrawlib files, or use the editor’s Library button. Retain
                license notices when sharing third-party assets.
              </p>
            </div>
          </section>
        </aside>
      )}
      <main>
        {loaded && book && (
          <Excalidraw
            key={active}
            excalidrawAPI={(a) => (api.current = a)}
            initialData={{
              ...book.scene,
              elements: restoreElements(book.scene.elements, null),
              libraryItems: libraries.current,
              scrollToContent: true,
            }}
            onLibraryChange={(items) => {
              const saved = structuredClone([...items]);
              queue.current = queue.current
                .catch(() => {})
                .then(() => set("whisketch-shapes-v1", saved))
                .then(() => {
                  libraries.current = saved;
                })
                .catch(() => setNotice("Could not save shape library"));
            }}
            onChange={updateScene}
            theme={theme}
            name={book.title}
            UIOptions={{
              canvasActions: { loadScene: false, saveToActiveFile: false },
            }}
          />
        )}
      </main>
      <footer role="status">{notice}</footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
