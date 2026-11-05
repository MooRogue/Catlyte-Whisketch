import { BrowserCloud } from "./webdav.mjs";
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
import {
  notebookScene,
  capturePage,
  pageScene,
  notebookFile,
} from "./notebook.mjs";
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
type PageTool =
  | "text"
  | "freedraw"
  | "selection"
  | "eraser"
  | "arrow"
  | "line"
  | "rectangle"
  | "ellipse";
type Notebook = {
  id: string;
  title: string;
  updated: number;
  scene: any;
  pageId?: string;
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
    arrow: "M4 20 20 4M9 4h11v11",
    rectangle: "M4 4h16v16H4z",
    line: "M4 20 20 4",
    ellipse: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
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
    [view, setView] = useState<"notebook" | "whiteboard">("notebook"),
    [pageList, setPageList] = useState(false),
    [penOnly, setPenOnly] = useState(false),
    [cloudDialog, setCloudDialog] = useState(false),
    [webFiles, setWebFiles] = useState<any[]>([]),
    [connectionStatus, setConnectionStatus] = useState(""),
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
  const webCloud = useRef<any>(null);
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
    if (!window.webkit?.messageHandlers?.whisketch) {
      if (!localSaveHealthy.current)
        throw new Error("Local saving failed. Export a copy before syncing.");
      if (!webCloud.current) throw new Error("Connect to Nextcloud first.");
      if (operation === "write")
        args = {
          ...args,
          json: JSON.stringify(notebookFile(parseBoard(args.json))),
        };
      return webCloud.current.operation(operation, args);
    }
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
      if (operation === "write")
        args = {
          ...args,
          json: JSON.stringify(notebookFile(parseBoard(args.json))),
        };
      native({ type: "cloudRequest", requestID, operation, ...args });
    });
  }
  const persist = useCallback((next: Notebook[], sync = true) => {
    next = next.map((b) => {
      const metadata = {
        title: b.title,
        tags: b.tags ?? [],
        cover: b.cover,
        favorite: !!b.favorite,
      };
      return JSON.stringify(b.scene.notebookMetadata) ===
        JSON.stringify(metadata)
        ? b
        : { ...b, scene: { ...b.scene, notebookMetadata: metadata } };
    });
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
    const payload = structuredClone(next).map((b) => ({
      ...b,
      scene: notebookFile(b.scene),
      pageId: b.scene.activePage,
    }));
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
          all.current.map((b) =>
            b.id === id
              ? { ...b, ...(patch.scene?.notebookMetadata ?? {}), ...patch }
              : b,
          ),
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
  function openConnection() {
    if (window.webkit?.messageHandlers?.whisketch) native({ type: "connect" });
    else setCloudDialog(true);
  }
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
    if (!url.endsWith(".whisketch")) {
      add(name.replace(/\.(whiteboard|excalidraw)$/i, ""), scene);
      setNotice(
        "Imported into Whisketch. The original cloud file is unchanged.",
      );
      return;
    }
    add(name.replace(/\.(whisketch|whiteboard|excalidraw)$/i, ""), scene, {
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
      .then(async ([data, shapes, selected, appearance]) => {
        if (data?.length && !(await get("whisketch-before-notebooks-v2")))
          await set("whisketch-before-notebooks-v2", structuredClone(data));
        data = data?.map((b) => ({
          ...b,
          scene: (() => {
            const n = notebookScene(parseBoard(b.scene), "page-" + b.id);
            return b.pageId && n.pages.some((p: any) => p.id === b.pageId)
              ? pageScene(n, b.pageId)
              : n;
          })(),
          ...(b.cloud?.url && !b.cloud.url.endsWith(".whisketch")
            ? { legacyCloud: b.cloud, cloud: undefined }
            : {}),
        }));
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
                scene: notebookScene(blank(), newID()),
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
    const b = {
      ...(scene.notebookMetadata ?? {}),
      ...extra,
      id: newID(),
      title,
      scene: notebookScene(scene, newID()),
      updated: Date.now(),
    };
    api.current=null;applyingRemote.current=b.id;
    void persist([b, ...all.current]);
    current.current = b.id;
    void set("whisketch-active-v1", b.id);
    setActive(b.id);
    setMenu(false);
  }
  function select(id: string) {
    if (id !== current.current) { api.current=null;applyingRemote.current=id; }
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
      else openConnection();
      return;
    }
    const data = JSON.stringify(notebookFile(b.scene), null, 2);
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
    a.download = safeName(b.title) + ".whisketch";
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  function exportBackup() {
    const json = JSON.stringify(
      {
        type: "whisketch-backup",
        version: 1,
        notebooks: all.current.map((b) => ({
          ...b,
          scene: notebookFile(b.scene),
          pageId: b.scene.activePage,
        })),
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
        safeName(
          title.replace(/\.(whisketch|excalidraw|whiteboard|json)$/i, ""),
        ),
        parseBoard(json),
      );
      setNotice("Imported as a separate local notebook");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  useEffect(() => {
    window.Whisketch = {
      isReady: () => !!api.current && !applyingRemote.current,
      libraryCount: () => libraries.current.length,
      notebook: () =>
        notebookFile(
          all.current.find((b) => b.id === current.current)?.scene ?? blank(),
        ),
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
            ...(text
              ? [
                  {
                    type: "text" as const,
                    x: 80,
                    y: 110 + height,
                    text,
                    fontSize: 22,
                    fontFamily: 2,
                  },
                ]
              : []),
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
  const pages = book ? capturePage(book.scene).pages : [];
  function showPage(id: string) {
    const b = all.current.find((b) => b.id === current.current);
    if (!b) return;
    const fresh = api.current
      ? snapshot(
          b.scene,
          api.current.getSceneElementsIncludingDeleted(),
          api.current.getAppState(),
          api.current.getFiles(),
        )
      : b.scene;
    const scene = pageScene(fresh, id);
    applyingRemote.current = b.id;
    api.current = null;
    void persist(
      all.current.map((x) => (x.id === b.id ? { ...x, scene } : x)),
      false,
    );
    setRenderVersion((v) => v + 1);
    setPageList(false);
  }
  function addPage() {
    if (!book) return;
    const fresh = api.current
      ? snapshot(
          book.scene,
          api.current.getSceneElementsIncludingDeleted(),
          api.current.getAppState(),
          api.current.getFiles(),
        )
      : book.scene;
    const scene = capturePage(fresh),
      id = newID();
    scene.pages = [
      ...scene.pages,
      {
        id,
        title: "Page " + (scene.pages.length + 1),
        elements: [],
        files: {},
        appState: { viewBackgroundColor: "#fffdf7" },
        paper: "plain",
      },
    ];
    const next = pageScene(scene, id);
    applyingRemote.current = book.id;
    api.current = null;
    void persist(
      all.current.map((x) =>
        x.id === book.id ? { ...x, scene: next, updated: Date.now() } : x,
      ),
    );
    setRenderVersion((v) => v + 1);
    setPageList(false);
  }
  function renamePage(title: string) {
    if (!book) return;
    const scene = capturePage(book.scene);
    scene.pages = scene.pages.map((p: any) =>
      p.id === scene.activePage ? { ...p, title } : p,
    );
    changeBook({ scene });
  }
  function reorderPage(offset: number) {
    if (!book) return;
    const scene = capturePage(book.scene),
      i = scene.pages.findIndex((p: any) => p.id === scene.activePage),
      j = i + offset;
    if (j < 0 || j >= scene.pages.length) return;
    [scene.pages[i], scene.pages[j]] = [scene.pages[j], scene.pages[i]];
    changeBook({ scene });
  }
  async function insertImage(file: File) {
    if (!file.type.startsWith("image/")) {
      setNotice("Choose a photo or image file.");
      return;
    }
    if (file.size > 15_000_000) {
      setNotice("Choose an image smaller than 15 MB.");
      return;
    }
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    window.Whisketch.insertCapture(data, "");
  }

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
  function blankPagePreview() {
    const c = window.document.createElement("canvas");
    c.width = 595;
    c.height = 842;
    const x = c.getContext("2d")!;
    x.fillStyle = "#fffdf7";
    x.fillRect(0, 0, 595, 842);
    return c;
  }
  async function exportImage(pdf = false, recognize = false) {
    try {
      if (pdf && window.webkit?.messageHandlers?.whisketch && book) {
        const document = capturePage(book.scene),
          images: string[] = [];
        for (const page of document.pages) {
          const elements = restoreElements(page.elements, null);
          let data: string;
          if (!elements.some((e: any) => !e.isDeleted)) {
            const canvas = blankPagePreview();
            data = canvas.toDataURL("image/png");
          } else {
            const blob = await exportToBlob({
              elements,
              appState: { ...page.appState, exportBackground: true },
              files: page.files,
              mimeType: "image/png",
              getDimensions: (w: number, h: number) => ({
                width: w,
                height: h,
                scale: Math.min(1, 2048 / Math.max(w, h)),
              }),
            });
            data = await new Promise<string>((resolve) => {
              const r = new FileReader();
              r.onload = () => resolve(String(r.result));
              r.readAsDataURL(blob);
            });
          }
          images.push(data);
        }
        native({
          type: "exportNotebookPDF",
          name: safeName(book.title),
          pages: images,
        });
        return;
      }

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
          ...(
            b.scene.pages?.flatMap((p: any) => p.elements) ?? b.scene.elements
          )
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
      {cloudDialog && (
        <div className="connection-overlay">
          <section
            role="dialog"
            aria-label="Nextcloud connection"
            aria-modal="true"
          >
            <button
              className="close-connection"
              aria-label="Close connection"
              onClick={() => setCloudDialog(false)}
            >
              ×
            </button>
            <h2>Your notebooks, everywhere</h2>
            <p>
              Connect to a folder in your Nextcloud Files. Your app password
              stays in memory for this browser session.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  setConnectionStatus("Connecting…");
                  const c = new BrowserCloud(
                    String(f.get("server")),
                    String(f.get("user")),
                    String(f.get("password")),
                    String(f.get("folder")),
                  );
                  const files = await c.connect();
                  webCloud.current = c;
                  setWebFiles(files);
                  configureCloud(JSON.stringify({ scope: c.scope }));
                  setConnectionStatus(
                    "Connected. Opened notebooks sync automatically.",
                  );
                } catch (error) {
                  setConnectionStatus(
                    (error as Error).message +
                      " Browser access must be enabled by your Nextcloud administrator.",
                  );
                }
              }}
            >
              <label>
                Nextcloud address
                <input
                  name="server"
                  type="url"
                  placeholder="https://cloud.example.com"
                  required
                />
              </label>
              <label>
                Username
                <input name="user" autoComplete="username" required />
              </label>
              <label>
                App password
                <input
                  name="password"
                  type="password"
                  autoComplete="off"
                  required
                />
              </label>
              <label>
                Folder
                <input name="folder" defaultValue="Whisketch" />
              </label>
              <button className="primary" type="submit">
                Connect and sync
              </button>
            </form>
            <p role="status">{connectionStatus}</p>
            {webFiles.map((f) => (
              <button
                key={f.url}
                onClick={async () => {
                  try {
                    const d = await webCloud.current.read(f.url);
                    if (d) {
                      openCloudDocument(
                        d.json,
                        f.name,
                        f.url,
                        d.etag,
                        webCloud.current.scope,
                      );
                      setCloudDialog(false);
                    }
                  } catch (e) {
                    setConnectionStatus((e as Error).message);
                  }
                }}
              >
                {f.name}
              </button>
            ))}
            {webCloud.current && (
              <button
                onClick={() => {
                  webCloud.current = null;
                  configureCloud("null");
                  setWebFiles([]);
                  setConnectionStatus("Disconnected. Local notes are safe.");
                }}
              >
                Disconnect
              </button>
            )}
          </section>
        </div>
      )}
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
                    <span>Import notebook or backup</span>
                    <input
                      type="file"
                      accept=".whisketch,.json,.excalidraw,.whiteboard"
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
                    <span>Export notebook file</span>
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
                      <button onClick={openConnection}>
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
                {!window.webkit?.messageHandlers?.whisketch && (
                  <button onClick={openConnection}>
                    <Icon name="cloud" /> Connect Nextcloud
                  </button>
                )}
                <p className="connection-note">
                  Saved locally first. Once connected, notes refresh on opening
                  and sync automatically after edits. Files use the notebook
                  name with a .whisketch extension. Offline edits retry on
                  reopening or reconnecting. Conflicting edits require choosing
                  a version; the other version is kept as a checkpoint. Trash
                  stays local.
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
      {!menu && !focus && (
        <div className="page-bar">
          <button
            aria-label="Show notebook pages"
            onClick={() => setPageList(!pageList)}
          >
            <Icon name="book" />{" "}
            <span>
              Page{" "}
              {Math.max(
                0,
                pages.findIndex((p: any) => p.id === book?.scene.activePage),
              ) + 1}{" "}
              / {pages.length}
            </span>
          </button>
          <input
            aria-label="Page title"
            value={
              pages.find((p: any) => p.id === book?.scene.activePage)?.title ??
              "Page 1"
            }
            onChange={(e) => renamePage(e.target.value)}
          />
          <button aria-label="Add page" title="Add page" onClick={addPage}>
            <Icon name="plus" />
          </button>
          <button
            aria-label="Toggle notebook and whiteboard"
            aria-pressed={view === "whiteboard"}
            onClick={() =>
              setView(view === "notebook" ? "whiteboard" : "notebook")
            }
          >
            {view === "notebook" ? "Notebook" : "Whiteboard"}
          </button>
          <button
            aria-label="Pencil only drawing"
            aria-pressed={penOnly}
            title="Pencil only: fingers pan; Pencil draws"
            onClick={() => setPenOnly(!penOnly)}
          >
            {penOnly ? "Pencil only" : "Finger + Pencil"}
          </button>
        </div>
      )}
      {pageList && !menu && (
        <nav className="page-list" aria-label="Notebook pages">
          {pages.map((p: any, i: number) => (
            <button
              key={p.id}
              aria-current={
                p.id === book?.scene.activePage ? "page" : undefined
              }
              onClick={() => showPage(p.id)}
            >
              <span className="mini-page">{i + 1}</span>
              <span>{p.title}</span>
              <small>
                {
                  p.elements.filter(
                    (e: any) => !e.isDeleted && !e.customData?.whisketchPaper,
                  ).length
                }{" "}
                items
              </small>
            </button>
          ))}
          <div>
            <button onClick={() => reorderPage(-1)}>Move page earlier</button>
            <button onClick={() => reorderPage(1)}>Move page later</button>
          </div>
        </nav>
      )}
      <main
        className={"mixed-canvas view-" + view}
        onPointerDownCapture={(e) => {
          if (penOnly && e.pointerType === "touch" && tool !== "selection")
            api.current?.setActiveTool({ type: "hand" });
          else if (penOnly && e.pointerType === "pen")
            api.current?.setActiveTool({ type: tool, locked: true });
        }}
      >
        <div
          className="page-surface"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) e.preventDefault();
          }}
          onDrop={(e) => {
            if (e.dataTransfer.files[0]?.type.startsWith("image/")) {
              e.preventDefault();
              e.stopPropagation();
              void insertImage(e.dataTransfer.files[0]);
            }
          }}
        >
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
                if (
                  book.scene.activePage !==
                  all.current.find((b) => b.id === active)?.scene.activePage
                )
                  return;
                updateScene(elements, state, files);
                if (
                  [
                    "freedraw",
                    "text",
                    "selection",
                    "eraser",
                    "arrow",
                    "line",
                    "rectangle",
                    "ellipse",
                  ].includes(state.activeTool.type)
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
              ["arrow", "", "Arrow"],
              ["rectangle", "", "Shape"],
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
            {window.webkit?.messageHandlers?.whisketch && (
              <button
                aria-label="Recognize selected text or handwriting"
                title="Recognize selected text or handwriting"
                onClick={() => void exportImage(false, true)}
              >
                <Icon name="scan" />
                <small>Read ink</small>
              </button>
            )}
            <label className="image-tool" title="Insert a photo or image">
              <Icon name="image" />
              <small>Photo</small>
              <input
                aria-label="Insert photo or image"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void insertImage(f);
                  e.target.value = "";
                }}
              />
            </label>
            <label className="image-tool" title="Take a photo">
              <Icon name="scan" />
              <small>Camera</small>
              <input
                aria-label="Take a photo"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void insertImage(f);
                  e.target.value = "";
                }}
              />
            </label>
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
