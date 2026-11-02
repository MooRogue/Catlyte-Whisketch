import React, { useState, useRef, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Excalidraw,
  convertToExcalidrawElements,
  restoreElements,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { get, set } from "idb-keyval";
import { parseBoard, snapshot, safeName } from "./document.mjs";
import "./style.css";

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
type Notebook = { id: string; title: string; updated: number; scene: any };
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
    [notice, setNotice] = useState("Opening library…"),
    [theme, setTheme] = useState<"light" | "dark">(
      matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    );
  const api = useRef<any>(null),
    all = useRef<Notebook[]>([]),
    current = useRef(""),
    queue = useRef<Promise<any>>(Promise.resolve()),
    latest = useRef<any>(null),
    nativeSeen = useRef(false);
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
    get<Notebook[]>("whisketch-library-v1")
      .then((data) => {
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
        current.current = docs[0].id;
        setActive(docs[0].id);
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
  function add(title = "Untitled notebook", scene = blank()) {
    const b = { id: newID(), title, scene, updated: Date.now() };
    void persist([b, ...all.current]);
    current.current = b.id;
    setActive(b.id);
    setMenu(false);
  }
  function select(id: string) {
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
  function importBoard(json: string, title = "Imported board") {
    try {
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
  return (
    <div className={"shell " + theme}>
      <header>
        <button
          className="brand"
          onClick={() => setMenu(!menu)}
          aria-label="Open notebooks"
        >
          <img src="./cat.svg" />{" "}
          <span>
            Whisketch<small>by Catlyte</small>
          </span>
        </button>
        <input
          aria-label="Notebook title"
          className="title"
          value={book?.title ?? ""}
          onChange={(e) => {
            void persist(
              all.current.map((x) =>
                x.id === active ? { ...x, title: e.target.value } : x,
              ),
            );
          }}
        />
        <button
          aria-label="Toggle appearance"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
        <button
          className="more"
          onClick={() => setMenu(!menu)}
          aria-label="Notebook actions"
        >
          •••
        </button>
      </header>
      {menu && (
        <aside>
          <h2>Your notebooks</h2>
          <input
            placeholder="Find a notebook…"
            aria-label="Find a notebook"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="actions">
            <button onClick={() => add()}>＋ New notebook</button>
            <button onClick={sample}>Try a sample</button>
            <label className="fileButton">
              Import board
              <input
                type="file"
                accept=".excalidraw,.whiteboard,.json"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) importBoard(await f.text(), f.name);
                  e.target.value = "";
                }}
              />
            </label>
            <button onClick={() => exportBoard()}>Export editable board</button>
            {window.webkit?.messageHandlers?.whisketch && (
              <>
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
          <div className="notebooks">
            {books
              .filter((b) =>
                b.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
              )
              .map((b) => (
                <button
                  key={b.id}
                  className={b.id === active ? "selected" : ""}
                  onClick={() => select(b.id)}
                >
                  {b.title || "Untitled"}
                  <small>
                    {new Date(b.updated).toLocaleDateString()} ·{" "}
                    {b.scene.elements.filter((e: any) => !e.isDeleted).length}{" "}
                    objects
                  </small>
                </button>
              ))}
          </div>
          <p>
            Local prototype · exports keep your editable objects.
            <br />
            Nextcloud publishing creates a new copy. Live sync and iCloud are
            still in development.
          </p>
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
              scrollToContent: true,
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
