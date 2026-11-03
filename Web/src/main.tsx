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
import { CloudSync, contentKey } from "./cloud-sync.mjs";
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
type PageTool = "text" | "freedraw" | "selection" | "eraser";
type Notebook = {
  id: string;
  title: string;
  updated: number;
  scene: any;
  favorite?: boolean;
  deletedAt?: number;
  tags?: string[];
  cover?: string;
  cloud?: any;
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
// Original, shared line icons keep the tool shelf consistent at every size.
function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    text: "M5 5h14M12 5v14M8 19h8",
    freedraw: "m5 17-1 4 4-1L20 8l-4-4L5 17Zm9-11 4 4M5 17l3 3",
    selection: "m5 3 14 10-7 1-3 7-4-18Z",
    eraser:
      "m4 14 9-10a2 2 0 0 1 3 0l5 5-10 11H8l-4-4a2 2 0 0 1 0-2Zm5-5 8 8M11 20h10",
    book: "M5 3h14v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 0v18M10 7h6M10 11h4",
    plus: "M12 5v14M5 12h14",
    star: "m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z",
    trash: "M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
    settings: "M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M9 15v6",
    copy: "M9 8h12v13H9zM5 16H3V3h12v2",
    save: "M4 3h13l4 4v14H3V3h1Zm3 0v7h10V3M7 21v-7h10v7",
    export: "M12 15V3m-5 5 5-5 5 5M4 13v8h16v-8",
    image: "M3 4h18v16H3zM3 16l5-5 4 4 3-3 6 6M16 8h.01",
    shapes:
      "M3 3h8v8H3zM17 3l5 8H12l5-8ZM8 15a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8 2h6M19 14v8",
    cloud:
      "M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5 5 0 0 1 0 11M9 15l3-3 3 3M12 12v9",
    scan: "M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 8h10M7 12h10M7 16h6",
    undo: "M8 4 3 9l5 5M3 9h10a7 7 0 0 1 7 7v4",
    redo: "m16 4 5 5-5 5M21 9H11a7 7 0 0 0-7 7v4",
  };
  return (
    <svg
      className="ui-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.book} />
    </svg>
  );
}
function App() {
  const [books, setBooks] = useState<Notebook[]>([]),
    [active, setActive] = useState(""),
    [loaded, setLoaded] = useState(false),
    [cloudStates, setCloudStates] = useState<Record<string, any>>({}),
    [cloudEnabled, setCloudEnabled] = useState(false),
    [renderVersion, setRenderVersion] = useState(0),
    [menu, setMenu] = useState(false),
    [panel, setPanel] = useState<"library" | "note">("library"),
    [focus, setFocus] = useState(false),
    [diagram, setDiagram] = useState(false),
    [tool, setTool] = useState<PageTool>("freedraw"),
    [ink, setInk] = useState("#343d3a"),
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
    libraries = useRef<any[]>([]),
    cloudEngine = useRef<any>(null),
    cloudConfiguration = useRef<any>(null),
    syncTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map()),
    cloudRequests = useRef<Map<string, any>>(new Map()),
    applyingRemote = useRef<string | null>(null),
    localSaveHealthy = useRef(true);
  function scheduleSync(id: string, delay = 1200) {
    if (!cloudConfiguration.current) return;
    clearTimeout(syncTimers.current.get(id));
    syncTimers.current.set(
      id,
      setTimeout(() => {
        syncTimers.current.delete(id);
        void cloudEngine.current?.sync(id);
      }, delay),
    );
  }
  function syncOpenedAndLinked() {
    for (const b of all.current)
      if (!b.deletedAt && (b.id === current.current || b.cloud))
        scheduleSync(b.id, 0);
  }
  async function cloudRequest(operation: string, args: any): Promise<any> {
    await queue.current;
    return new Promise((resolve, reject) => {
      if (!localSaveHealthy.current) {
        reject(
          new Error(
            "Save on this device failed. Export your note before syncing.",
          ),
        );
        return;
      }
      const requestID = newID();
      const timer = setTimeout(() => {
        cloudRequests.current.delete(requestID);
        reject(
          new Error(
            "Nextcloud is unavailable. Changes are saved locally and will retry.",
          ),
        );
      }, 90000);
      cloudRequests.current.set(requestID, { resolve, reject, timer });
      native({ type: "cloudRequest", requestID, operation, ...args });
    });
  }
  const persist = useCallback((next: Notebook[], sync = true) => {
    const changed = sync
      ? next
          .filter((b) => {
            const old = all.current.find((x) => x.id === b.id);
            return (
              !b.deletedAt &&
              (!old || old.title !== b.title || old.scene !== b.scene)
            );
          })
          .map((b) => b.id)
      : [];
    if (cloudConfiguration.current && changed.length)
      setCloudStates((states) => {
        const updated = { ...states };
        for (const id of changed)
          updated[id] = { state: "queued", message: "Waiting to sync…" };
        return updated;
      });
    all.current = next;
    setBooks(next);
    setNotice("Saving on this device…");
    const payload = structuredClone(next);
    queue.current = queue.current
      .catch(() => {})
      .then(() => set("whisketch-library-v1", payload))
      .then(() => {
        localSaveHealthy.current = true;
        setNotice("Saved on this device");
        changed.forEach((id) => scheduleSync(id));
      })
      .catch(() => {
        localSaveHealthy.current = false;
        setNotice("Save failed. Export your board to keep a copy.");
      });
    return queue.current;
  }, []);
  if (!cloudEngine.current)
    cloudEngine.current = new CloudSync({
      getBook: (id: string) => all.current.find((b) => b.id === id),
      commit: (id: string, patch: Partial<Notebook>, refresh = false) => {
        if (refresh && current.current === id) {
          applyingRemote.current = id;
          latest.current = null;
          setRenderVersion((v) => v + 1);
        }
        return persist(
          all.current.map((b) => (b.id === id ? { ...b, ...patch } : b)),
          false,
        ).then(() => {
          if (!localSaveHealthy.current)
            throw new Error(
              "Local save failed. Export your note to keep a copy.",
            );
        });
      },
      remote: cloudRequest,
      notify: (id: string, state: any) =>
        setCloudStates((states) => ({ ...states, [id]: state })),
    });
  function configureCloud(json: string) {
    const configuration = JSON.parse(json);
    const scope = configuration?.scope ?? null;
    cloudConfiguration.current = configuration;
    cloudEngine.current.configure(scope);
    setCloudEnabled(!!scope);
    if (!scope) setCloudStates({});
    else syncOpenedAndLinked();
  }
  function openCloudDocument(
    json: string,
    name: string,
    url: string,
    etag: string,
    scope: string,
  ) {
    const existing = all.current.find(
      (b) => b.cloud?.url === url && b.cloud?.scope === scope && !b.deletedAt,
    );
    if (existing) {
      select(existing.id);
      scheduleSync(existing.id, 0);
      return;
    }
    const scene = parseBoard(json);
    add(name.replace(/\.(whiteboard|excalidraw)$/i, ""), scene, {
      cloud: {
        scope,
        url,
        etag,
        base: contentKey(scene),
        syncedAt: Date.now(),
      },
    });
  }
  useEffect(() => {
    if (loaded) scheduleSync(active, 0);
  }, [loaded, active]);
  useEffect(() => {
    const foreground = () => {
      if (!document.hidden) syncOpenedAndLinked();
    };
    window.addEventListener("online", foreground);
    document.addEventListener("visibilitychange", foreground);
    const timer = setInterval(foreground, 15000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", foreground);
      document.removeEventListener("visibilitychange", foreground);
    };
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
    if (!b || applyingRemote.current === b.id) return;
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
    if (publish) {
      if (cloudConfiguration.current) scheduleSync(b.id, 0);
      else native({ type: "connect" });
      return;
    }
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
          cloud: undefined,
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
      configureCloud,
      cloudForeground: syncOpenedAndLinked,
      openCloudDocument,
      cloudResponse: (json: string) => {
        const response = JSON.parse(json);
        const pending = cloudRequests.current.get(response.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        cloudRequests.current.delete(response.id);
        if (response.error)
          pending.reject(
            Object.assign(new Error(response.error), { code: response.code }),
          );
        else pending.resolve(response.result);
      },
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
          { type: "text", x: 80, y: 80, text, fontSize: 22, fontFamily: 2 },
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
  function chooseTool(type: PageTool) {
    setTool(type);
    api.current?.setActiveTool({ type, locked: type !== "selection" });
  }
  function historyStep(redo = false) {
    const apple = /Mac|iPhone|iPad/.test(navigator.platform);
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        code: "KeyZ",
        metaKey: apple,
        ctrlKey: !apple,
        shiftKey: redo,
        bubbles: true,
        cancelable: true,
      }),
    );
  }
  function noteSettings() {
    setPanel("note");
    setMenu(true);
  }
  useEffect(() => {
    const surface = document.querySelector(".page-surface");
    if (!surface) return;
    let previousWidth = 0;
    let timer: ReturnType<typeof setTimeout>;
    const resize = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      if (previousWidth && Math.abs(width - previousWidth) > 60) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const editor = api.current;
          if (
            editor &&
            !editor.getAppState().editingTextElement &&
            editor.getSceneElements().length
          )
            editor.scrollToContent(editor.getSceneElements(), {
              fitToViewport: true,
              maxZoom: 1,
            });
        }, 180);
      }
      previousWidth = width;
    });
    resize.observe(surface);
    return () => {
      resize.disconnect();
      clearTimeout(timer);
    };
  }, []);
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
  const cloudState = cloudStates[active];
  async function resolveCloud(choice: string) {
    try {
      await cloudEngine.current.resolve(current.current, choice);
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
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
    setPanel("library");
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
    <div
      className={
        "shell streamlined " +
        theme +
        (focus ? " focus" : "") +
        (diagram ? " diagram-mode" : " notebook-mode")
      }
    >
      <header>
        <button
          className="brand"
          onClick={() => {
            setPanel("library");
            setMenu(!(menu && panel === "library"));
          }}
          aria-label="Open notebooks"
        >
          <img
            src={
              theme === "dark" ? "./art/mark-dark.png" : "./art/mark-light.png"
            }
          />
          <span>Notebooks</span>
        </button>
        <input
          aria-label="Notebook title"
          className="title"
          value={book?.title ?? ""}
          onChange={(e) => changeBook({ title: e.target.value })}
        />
        <button
          className="focus-toggle"
          aria-label="Focus on page"
          title="Focus on page"
          onClick={() => {
            setMenu(false);
            setFocus(true);
          }}
        >
          ⛶
        </button>
        <button
          className="more"
          onClick={() => {
            setPanel("note");
            setMenu(!(menu && panel === "note"));
          }}
          aria-label="Notebook actions"
        >
          ···
        </button>
      </header>
      {focus && (
        <button
          className="restore-controls"
          aria-label="Show controls"
          onClick={() => setFocus(false)}
        >
          Show controls
        </button>
      )}
      {cloudEnabled &&
        ["conflict", "missing", "pending"].includes(cloudState?.state) && (
          <section className="cloud-banner" aria-label="Nextcloud sync">
            <span>{cloudState.message}</span>
            {cloudState.state === "conflict" && (
              <>
                <button onClick={() => void resolveCloud("remote")}>
                  Use Nextcloud version
                </button>
                <button onClick={() => void resolveCloud("local")}>
                  Keep this version
                </button>
              </>
            )}
            {cloudState.state === "missing" && (
              <button onClick={() => void resolveCloud("recreate")}>
                Recreate on Nextcloud
              </button>
            )}
            <button onClick={() => scheduleSync(active, 0)}>Retry sync</button>
          </section>
        )}
      {menu && (
        <aside className="shelf">
          <div
            className={
              "shelf-heading " +
              (panel === "library" ? "illustrated-heading" : "")
            }
          >
            {panel === "library" && (
              <img className="library-art" src="./art/library.jpg" alt="" />
            )}
            <div>
              <h2>{panel === "library" ? "Notebooks" : "Note settings"}</h2>
              <p>
                {panel === "library" ? "A place for each idea." : book?.title}
              </p>
            </div>
            <button onClick={() => setMenu(false)} aria-label="Close notebooks">
              ×
            </button>
          </div>
          {panel === "library" && (
            <>
              <div className="shelf-tools">
                <input
                  placeholder="Search titles, tags and words…"
                  aria-label="Find a notebook"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  className="primary"
                  aria-label="＋ New notebook"
                  onClick={() => add()}
                >
                  <Icon name="plus" />
                  <span>New notebook</span>
                </button>
                <button onClick={sample}>
                  <Icon name="freedraw" />
                  <span>Try a sample</span>
                </button>
              </div>
              <details className="template-picker">
                <summary>
                  <Icon name="shapes" /> Start from a template
                </summary>
                <section className="templates" aria-label="Notebook templates">
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
              </details>
              <div className="shelf-tabs">
                <button
                  className={!trash && !favorites ? "selected" : ""}
                  onClick={() => {
                    setTrash(false);
                    setFavorites(false);
                  }}
                >
                  <Icon name="book" />
                  <span>All notebooks</span>
                </button>
                <button
                  className={favorites ? "selected" : ""}
                  onClick={() => {
                    setFavorites(!favorites);
                    setTrash(false);
                  }}
                >
                  <Icon name="star" />
                  <span>Favorites</span>
                </button>
                <button
                  className={trash ? "selected" : ""}
                  onClick={() => {
                    setTrash(!trash);
                    setFavorites(false);
                  }}
                >
                  <Icon name="trash" />
                  <span>Trash</span>
                </button>
                <span>
                  {visible.length}{" "}
                  {visible.length === 1 ? "notebook" : "notebooks"}
                </span>
              </div>
              <div className="notebooks">
                {visible.map((b) => (
                  <div key={b.id} className="book-card">
                    <button
                      className={
                        "book-cover " + (b.id === active ? "active" : "")
                      }
                      style={
                        {
                          "--cover": b.cover ?? "#dce9e3",
                        } as React.CSSProperties
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
                          (e: any) =>
                            !e.isDeleted && !e.customData?.whisketchPaper,
                        ).length +
                        " objects"
                      }
                    >
                      <span className="book-spine" />
                      <span className="book-emboss">
                        {b.favorite ? "★" : "✧"}
                      </span>
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
                                x.id === b.id
                                  ? { ...x, deletedAt: undefined }
                                  : x,
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
              <button className="library-settings-link" onClick={noteSettings}>
                <Icon name="settings" />
                <span>Selected notebook settings</span>
              </button>
            </>
          )}
          {panel === "note" && (
            <section className="notebook-settings">
              <div>
                <h3>Page & appearance</h3>
                <div className="note-preferences">
                  {" "}
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
                </div>
                <button
                  onClick={() => {
                    setDiagram(!diagram);
                    setMenu(false);
                  }}
                >
                  <Icon name="shapes" />
                  <span>
                    {diagram ? "Use notebook tools" : "Advanced diagram tools"}
                  </span>
                </button>
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
                        <span
                          aria-hidden="true"
                          className={"paper-preview paper-" + x}
                        />
                        <small>{x}</small>
                      </button>
                    ))}
                  </div>
                </label>
                <label>
                  Cover
                  <div className="swatches">
                    {[
                      "#dce9e3",
                      "#e7dff1",
                      "#ecdac8",
                      "#d6e4ef",
                      "#efcfca",
                    ].map((x, i) => (
                      <button
                        key={x}
                        style={{ background: x }}
                        aria-label={"Cover color " + (i + 1)}
                        onClick={() => changeBook({ cover: x })}
                      />
                    ))}
                  </div>
                </label>
                <label>
                  Tags
                  <input
                    aria-label="Notebook tags"
                    placeholder="Ideas, homelab, journal…"
                    key={active + ":" + renderVersion}
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
                  <button onClick={duplicate}>
                    <Icon name="copy" />
                    <span>Duplicate notebook</span>
                  </button>
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
                    <Icon name="save" />
                    <span>Save checkpoint</span>
                  </button>
                  <button onClick={removeBook}>
                    <Icon name="trash" />
                    <span>Move notebook to Trash</span>
                  </button>
                </div>
              </div>
              <div>
                <h3>Share & connect</h3>
                <div className="actions">
                  <label className="fileButton">
                    <Icon name="book" />
                    <span>Import board, library or backup</span>
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
                  <button onClick={exportBackup}>
                    <Icon name="save" />
                    <span>Export library backup</span>
                  </button>
                  <button onClick={() => exportBoard()}>
                    <Icon name="export" />
                    <span>Export editable board</span>
                  </button>
                  <button onClick={() => void exportImage()}>
                    <Icon name="image" />
                    <span>Export PNG image</span>
                  </button>
                  <button
                    onClick={() => {
                      setDiagram(true);
                      setMenu(false);
                      void api.current.updateLibrary({
                        libraryItems: starterLibrary(),
                        merge: true,
                        openLibraryMenu: true,
                      });
                    }}
                  >
                    <Icon name="shapes" />
                    <span>Add Catlyte homelab shapes</span>
                  </button>
                  {window.webkit?.messageHandlers?.whisketch && (
                    <button onClick={() => void exportImage(true)}>
                      <Icon name="export" />
                      <span>Export PDF</span>
                    </button>
                  )}
                  {window.webkit?.messageHandlers?.whisketch && (
                    <>
                      <button onClick={() => void exportImage(false, true)}>
                        <Icon name="scan" />
                        <span>Extract text from selected ink or board</span>
                      </button>
                      <button onClick={() => native({ type: "ocr" })}>
                        <Icon name="image" />
                        <span>Recognize text in a photo</span>
                      </button>
                      <button onClick={() => native({ type: "connect" })}>
                        <Icon name="cloud" />
                        <span>Nextcloud connection</span>
                      </button>
                      <button onClick={() => exportBoard(true)}>
                        <Icon name="cloud" />
                        <span>Sync with Nextcloud now</span>
                      </button>
                    </>
                  )}
                </div>
                <p className="connection-note">
                  Saved locally first. Once connected, notes refresh on opening
                  and sync automatically after edits. Files use the note name
                  with a .whiteboard extension. Offline edits retry on reopening
                  or reconnecting. Conflicting edits require choosing a version;
                  the other version is kept as a checkpoint. Trash stays local.
                </p>
                <p className="connection-note">
                  Shape libraries stay on this device across notebooks. Import
                  .excalidrawlib files, or use the editor’s Library button.
                  Retain license notices when sharing third-party assets.
                </p>
              </div>
            </section>
          )}
        </aside>
      )}
      <main>
        <div className="page-surface">
          {loaded && book && (
            <Excalidraw
              key={active + ":" + renderVersion}
              excalidrawAPI={(a) => {
                api.current = a;
                applyingRemote.current = null;
                setTimeout(() => {
                  if (api.current === a && !diagram) {
                    a.updateScene({
                      appState: {
                        currentItemStrokeColor: ink,
                        currentItemFontFamily: 2,
                      },
                    });
                    if (a.getSceneElements().length)
                      a.scrollToContent(a.getSceneElements(), {
                        fitToViewport: true,
                        maxZoom: 1,
                      });
                    a.setActiveTool({
                      type: tool,
                      locked: tool !== "selection",
                    });
                  }
                }, 0);
              }}
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
              onChange={(elements, state, files) => {
                updateScene(elements, state, files);
                if (
                  ["freedraw", "text", "selection", "eraser"].includes(
                    state.activeTool.type,
                  )
                )
                  setTool((previous) =>
                    previous === state.activeTool.type
                      ? previous
                      : (state.activeTool.type as PageTool),
                  );
              }}
              zenModeEnabled={!diagram || focus}
              handleKeyboardGlobally={true}
              theme={theme}
              name={book.title}
              UIOptions={{
                canvasActions: { loadScene: false, saveToActiveFile: false },
              }}
            />
          )}
        </div>
        {!menu && !focus && !diagram && (
          <nav className="writing-tools" aria-label="Writing tools">
            {[
              ["text", "T", "Write"],
              ["freedraw", "✎", "Draw"],
              ["selection", "↖", "Select"],
              ["eraser", "⌫", "Erase"],
            ].map(([type, , label]) => (
              <button
                key={type}
                aria-label={label}
                aria-pressed={tool === type}
                className={tool === type ? "selected" : ""}
                onClick={() => chooseTool(type as PageTool)}
              >
                <Icon name={type} />
                <small>{label}</small>
              </button>
            ))}
            <label className="ink-picker" title="Ink color">
              <input
                aria-label="Ink color"
                type="color"
                value={ink}
                onChange={(event) => {
                  setInk(event.target.value);
                  api.current?.updateScene({
                    appState: { currentItemStrokeColor: event.target.value },
                  });
                }}
              />
            </label>
            <button
              aria-label="Undo"
              title="Undo"
              onClick={() => historyStep()}
            >
              <Icon name="undo" />
            </button>
            <button
              aria-label="Redo"
              title="Redo"
              onClick={() => historyStep(true)}
            >
              <Icon name="redo" />
            </button>
          </nav>
        )}
        {!menu && !focus && diagram && (
          <button
            className="notebook-tools-return"
            onClick={() => setDiagram(false)}
          >
            Use notebook tools
          </button>
        )}
      </main>
      <footer role="status">
        {notice}
        {cloudEnabled && cloudState ? " · " + cloudState.message : ""}
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
