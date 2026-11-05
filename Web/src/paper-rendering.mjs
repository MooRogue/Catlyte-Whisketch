export function paperBackdrop(style, dark, zoom = 1, scrollX = 0, scrollY = 0) {
  const z = Math.max(0.05, Math.min(30, zoom)),
    base = style === "narrow-lined" ? 22 : style === "large-grid" ? 64 : 32;
  let space = base * z;
  while (space < 10) space *= 2;
  const line = dark ? "#657987" : "#aabdc9",
    dot = dark ? "#78909c" : "#a2b5bf";
  let image = "none",
    size = "auto";
  if (["lined", "narrow-lined", "yellow", "cornell"].includes(style)) {
    image = `linear-gradient(to bottom,transparent calc(100% - 1px),${line} calc(100% - 1px))`;
    size = `100% ${space}px`;
  }
  if (["grid", "large-grid"].includes(style)) {
    image = `linear-gradient(to right,${line} 1px,transparent 1px),linear-gradient(to bottom,${line} 1px,transparent 1px)`;
    size = `${space}px ${space}px`;
  }
  if (style === "dots") {
    image = `radial-gradient(circle,${dot} 1px,transparent 1.4px)`;
    size = `${space}px ${space}px`;
  }
  if (style === "cornell") {
    image += `,linear-gradient(to right,transparent ${220 * z - 1}px,${dark ? "#bf8292" : "#cc8a9a"} ${220 * z - 1}px,${dark ? "#bf8292" : "#cc8a9a"} ${220 * z + 1}px,transparent ${220 * z + 1}px)`;
    size += ",100% 100%";
  }
  return {
    backgroundImage: image,
    backgroundSize: size,
    backgroundPosition: `${scrollX * z}px ${scrollY * z}px`,
  };
}
export function inkPayload(elements) {
  return elements
    .filter((e) => e.type === "freedraw" && !e.isDeleted)
    .map((e) => {
      const a = e.angle ?? 0,
        cx = e.x + e.width / 2,
        cy = e.y + e.height / 2;
      return {
        width: e.strokeWidth ?? 2,
        points: e.points.map((p, i) => {
          const x = e.x + p[0] - cx,
            y = e.y + p[1] - cy;
          return [
            cx + x * Math.cos(a) - y * Math.sin(a),
            cy + x * Math.sin(a) + y * Math.cos(a),
            e.pressures?.[i] ?? 0.5,
          ];
        }),
      };
    });
}
