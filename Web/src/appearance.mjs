// Presentation is local to this device. Theme changes must not rewrite a
// notebook, recolour its photos, or create remote revision conflicts.
const darkInk = "#e8edef";
export function inkForPaper(color, dark) {
  if (!/^#[0-9a-f]{6}$/i.test(color ?? "")) return color;
  const c = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  if (dark && Math.max(...c) < 105) return darkInk;
  if (!dark && Math.min(...c) > 220) return "#343d3a";
  return color;
}
export function paperIsDark(theme, tone = "auto", style = "plain") {
  return (
    tone === "dark" ||
    (tone === "auto" && (theme === "dark" || style === "midnight"))
  );
}
export function presentScene(
  scene,
  theme,
  tone = "auto",
  live = [],
  screen = false,
) {
  const dark = paperIsDark(theme, tone, scene.whisketch?.paper),
    originals = new Map(),
    files = { ...scene.files };
  const bg = dark
    ? scene.whisketch?.paper === "yellow"
      ? "#302d24"
      : "#202932"
    : scene.whisketch?.paper === "yellow"
      ? "#fff3c7"
      : "#fffdf6";
  const elements = scene.elements.map((e) => {
    let p = { ...e };
    if (e.type !== "image") p.strokeColor = inkForPaper(e.strokeColor, dark);
    if (e.customData?.whisketchPaper && files[e.fileId]) {
      const source = files[e.fileId];
      try {
        const svg = atob(source.dataURL.split(",")[1]);
        const display = svg
          .replace(/fill="#[0-9a-f]{6}"/gi, (m) =>
            m.includes("a9b9bf")
              ? dark
                ? 'fill="#667681"'
                : m
              : `fill="${bg}"`,
          )
          .replace(/#b3c3cc|#bdccd1/gi, dark ? "#52616c" : "#b3c3cc")
          .replace(/#d5a2a3/gi, dark ? "#9b6677" : "#d5a2a3");
        const fileId =
          "whisketch-display-" + e.fileId + "-" + (dark ? "dark" : "light");
        files[fileId] = {
          ...source,
          id: fileId,
          dataURL: "data:image/svg+xml;base64," + btoa(display),
        };
        p.fileId = fileId;
      } catch {
        /* Preserve an unfamiliar legacy attachment unchanged. */
      }
    }
    if (screen && e.customData?.whisketchPaper) p.opacity = 0;
    const current = live.find((x) => x.id === e.id);
    p.version = Math.max(e.version ?? 1, current?.version ?? 0) + 1;
    originals.set(e.id, {
      original: e,
      presented: p,
      offset: p.version - (e.version ?? 1),
    });
    return p;
  });
  return {
    elements,
    files,
    appState: {
      ...scene.appState,
      viewBackgroundColor: screen ? "transparent" : bg,
    },
    originals,
    dark,
    background: bg,
  };
}
export function canonicalScene(
  elements,
  files,
  appState,
  presentation,
  source,
  ink = "#343d3a",
) {
  const originals = presentation?.originals ?? new Map(),
    dark = presentation?.dark ?? false;
  const canonical = elements.map((e) => {
    const record = originals.get(e.id);
    let p = { ...e };
    if (record) {
      if (e.strokeColor === record.presented.strokeColor)
        p.strokeColor = record.original.strokeColor;
      if (e.opacity === record.presented.opacity)
        p.opacity = record.original.opacity;
      if (e.fileId === record.presented.fileId)
        p.fileId = record.original.fileId;
      p.version = Math.max(
        record.original.version ?? 1,
        (e.version ?? 1) - record.offset,
      );
      if (e.version === record.presented.version)
        p.versionNonce = record.original.versionNonce;
    } else if (e.type !== "image" && e.strokeColor === inkForPaper(ink, dark))
      p.strokeColor = ink;
    return p;
  });
  return {
    elements: canonical,
    files: Object.fromEntries(
      Object.entries(files).filter(
        ([id]) => !id.startsWith("whisketch-display-"),
      ),
    ),
    appState: {
      ...appState,
      viewBackgroundColor: source.appState?.viewBackgroundColor ?? "#fffdf7",
    },
  };
}
