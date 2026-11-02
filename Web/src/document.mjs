export function parseBoard(value) {
  const doc = typeof value === "string" ? JSON.parse(value) : value;
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.elements))
    throw new Error("This file does not contain an editable board.");
  if (doc.elements.length > 100000)
    throw new Error("This board exceeds the prototype limit.");
  const ids = new Set();
  for (const e of doc.elements) {
    if (
      !e ||
      typeof e.id !== "string" ||
      typeof e.type !== "string" ||
      ids.has(e.id)
    )
      throw new Error("Invalid or duplicate drawing object.");
    ids.add(e.id);
    for (const k of ["x", "y", "width", "height"])
      if (!Number.isFinite(e[k]))
        throw new Error("Invalid drawing coordinates.");
  }
  if (
    doc.files != null &&
    (typeof doc.files !== "object" || Array.isArray(doc.files))
  )
    throw new Error("Invalid image attachments.");
  return { ...doc, files: doc.files ?? {}, appState: doc.appState ?? {} };
}
export function snapshot(previous, elements, appState, files) {
  // Preserve unknown top-level and per-element properties; do not flatten ink/images.
  const {
    viewBackgroundColor,
    gridSize,
    gridModeEnabled,
    zoom,
    scrollX,
    scrollY,
  } = appState;
  return {
    ...previous,
    type: previous.type ?? "excalidraw",
    version: previous.version ?? 2,
    source: "https://github.com/MooRogue/Catlyte-Whisketch",
    elements,
    appState: {
      ...previous.appState,
      viewBackgroundColor,
      gridSize,
      gridModeEnabled,
      zoom,
      scrollX,
      scrollY,
    },
    files,
  };
}
export function safeName(name) {
  return (
    name
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
      .trim()
      .slice(0, 100) || "Untitled"
  );
}
