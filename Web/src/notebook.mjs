// Whisketch's versioned notebook envelope. Drawing payloads are implementation
// details, not an Excalidraw or Nextcloud Whiteboard interchange contract.
export function notebookScene(scene, id = "page-1") {
  if (scene.pages?.length) return scene;
  return {
    ...scene,
    pages: [
      {
        id,
        title: "Page 1",
        elements: scene.elements ?? [],
        files: scene.files ?? {},
        appState: scene.appState ?? {},
        paper: scene.whisketch?.paper ?? "plain",
        paperTone: scene.whisketch?.paperTone ?? "auto",
      },
    ],
    activePage: id,
  };
}
export function capturePage(scene) {
  const s = notebookScene(scene);
  return {
    ...s,
    pages: s.pages.map((p) =>
      p.id === s.activePage
        ? {
            ...p,
            elements: s.elements,
            files: s.files,
            appState: s.appState,
            paper: s.whisketch?.paper ?? p.paper,
            paperTone: s.whisketch?.paperTone ?? p.paperTone ?? "auto",
          }
        : p,
    ),
  };
}
export function pageScene(scene, id) {
  const s = capturePage(scene),
    p = s.pages.find((p) => p.id === id);
  if (!p) throw new Error("This page no longer exists.");
  return {
    ...s,
    activePage: id,
    elements: p.elements,
    files: p.files,
    appState: p.appState,
    whisketch: {
      ...s.whisketch,
      paper: p.paper,
      paperTone: p.paperTone ?? "auto",
    },
  };
}
export function notebookFile(scene) {
  const s = capturePage(scene);
  return {
    type: "whisketch-notebook",
    version: 1,
    metadata: s.notebookMetadata ?? {},
    extensions: Object.fromEntries(
      Object.entries(s).filter(
        ([k]) =>
          ![
            "type",
            "version",
            "source",
            "pages",
            "activePage",
            "elements",
            "files",
            "appState",
            "whisketch",
            "notebookMetadata",
          ].includes(k),
      ),
    ),
    pages: s.pages.map((p) => ({
      id: p.id,
      title: p.title,
      paper: p.paper,
      content: { objects: p.elements, assets: p.files },
      appearance: {
        viewBackgroundColor: p.appState?.viewBackgroundColor ?? "#fffdf7",
        paperTone: p.paperTone ?? "auto",
      },
    })),
  };
}
export function readNotebook(doc) {
  if (
    doc.type !== "whisketch-notebook" ||
    doc.version !== 1 ||
    !Array.isArray(doc.pages) ||
    !doc.pages.length ||
    doc.pages.length > 500
  )
    throw new Error("Unsupported Whisketch notebook.");
  const ids = new Set();
  const pages = doc.pages.map((p) => {
    if (
      typeof p.id !== "string" ||
      ids.has(p.id) ||
      typeof p.title !== "string" ||
      !Array.isArray(p.content?.objects)
    )
      throw new Error("Invalid notebook page.");
    ids.add(p.id);
    return {
      id: p.id,
      title: p.title,
      paper: p.paper ?? "plain",
      paperTone: p.appearance?.paperTone ?? "auto",
      elements: p.content.objects,
      files: p.content.assets ?? {},
      appState: p.appearance ?? {},
    };
  });
  const p = pages[0];
  return {
    ...(doc.extensions ?? {}),
    type: "excalidraw",
    version: 2,
    pages,
    activePage: p.id,
    elements: p.elements,
    files: p.files,
    appState: p.appState,
    whisketch: { paper: p.paper, paperTone: p.paperTone ?? "auto" },
    notebookMetadata: doc.metadata ?? {},
  };
}
