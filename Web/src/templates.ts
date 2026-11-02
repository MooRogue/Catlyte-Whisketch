import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
export const templates = [
  {
    id: "journal",
    name: "Daily journal",
    hint: "A page to collect your day",
    mark: "☼",
  },
  {
    id: "meeting",
    name: "Meeting notes",
    hint: "Ideas, decisions and next steps",
    mark: "☷",
  },
  {
    id: "network",
    name: "Homelab map",
    hint: "Connect your little universe",
    mark: "⌘",
  },
  {
    id: "kanban",
    name: "Project board",
    hint: "Room for work in progress",
    mark: "▤",
  },
  {
    id: "mindmap",
    name: "Mind map",
    hint: "Follow the branches of an idea",
    mark: "✧",
  },
];
const text = (x: number, y: number, value: string, size = 22) => ({
  type: "text",
  x,
  y,
  text: value,
  fontSize: size,
  fontFamily: 2,
  strokeColor: "#3f514a",
});
const box = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  color: string,
) => ({
  id,
  type: "rectangle",
  x,
  y,
  width: w,
  height: h,
  backgroundColor: color,
  fillStyle: "solid",
  roughness: 1,
  roundness: { type: 3 },
  label: { text: label, fontFamily: 2, fontSize: 20 },
});
const arrow = (
  from: string,
  to: string,
  x: number,
  y: number,
  w: number,
  h: number,
) => ({
  type: "arrow",
  x,
  y,
  width: w,
  height: h,
  points: [
    [0, 0],
    [w, h],
  ],
  start: { id: from },
  end: { id: to },
  strokeColor: "#667d71",
});
export function makeTemplate(id: string) {
  let items: any[] = [];
  if (id === "journal")
    items = [
      text(60, 40, "A little record of today", 34),
      text(
        60,
        100,
        new Date().toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        }),
        18,
      ),
      text(60, 180, "Three things that matter"),
      text(
        60,
        225,
        "□ One small step\n□ Something to learn\n□ Something to enjoy",
      ),
      box("notes", 60, 360, 540, 360, "Notes & little discoveries", "#edf2e7"),
      box(
        "gratitude",
        640,
        180,
        350,
        240,
        "A good thing to remember",
        "#f4e4d8",
      ),
      box("tomorrow", 640, 460, 350, 260, "For tomorrow", "#e7e2f3"),
    ];
  if (id === "meeting")
    items = [
      text(60, 40, "Meeting notes", 36),
      text(60, 110, "Date:                         People:", 18),
      box(
        "agenda",
        60,
        190,
        430,
        330,
        "What are we here to discuss?",
        "#e4edf1",
      ),
      box(
        "decisions",
        530,
        190,
        430,
        330,
        "Decisions & discoveries",
        "#e3eddf",
      ),
      box("actions", 60, 560, 900, 230, "Next steps · Owner · When", "#f3e6d7"),
    ];
  if (id === "network")
    items = [
      text(60, 30, "My homelab", 34),
      box("wan", 400, 120, 200, 95, "Internet / VPN", "#e5e0f4"),
      box("router", 400, 310, 200, 100, "Router", "#dcebe6"),
      box("switch", 400, 510, 200, 100, "Switch", "#dcebe6"),
      box("server", 80, 740, 230, 110, "Compute host", "#e5edf3"),
      box("nas", 400, 740, 230, 110, "NAS / Storage", "#eee4d7"),
      box("clients", 760, 740, 230, 110, "Clients", "#f1dfe1"),
      arrow("wan", "router", 500, 215, 0, 95),
      arrow("router", "switch", 500, 410, 0, 100),
      arrow("switch", "server", 440, 610, -240, 130),
      arrow("switch", "nas", 510, 610, 0, 130),
      arrow("switch", "clients", 570, 610, 290, 130),
    ];
  if (id === "kanban")
    items = [
      text(60, 40, "Make a little progress", 34),
      box("backlog", 60, 140, 300, 650, "To explore", "#eee5d8"),
      box("doing", 400, 140, 300, 650, "In progress", "#e6e0f3"),
      box("done", 740, 140, 300, 650, "Done", "#e1ecdf"),
      box("task1", 90, 270, 240, 130, "An idea worth trying", "#fff9e9"),
      box("task2", 430, 270, 240, 130, "One useful next step", "#fff9e9"),
      box("task3", 770, 270, 240, 130, "Something to celebrate", "#fff9e9"),
    ];
  if (id === "mindmap")
    items = [
      box("idea", 420, 360, 250, 160, "A new idea", "#e3ddef"),
      box("people", 60, 130, 240, 120, "People", "#dfebe6"),
      box("questions", 790, 130, 240, 120, "Questions", "#e1eaf0"),
      box("possibilities", 60, 660, 240, 120, "Possibilities", "#f1e3d5"),
      box("next", 790, 660, 240, 120, "Next steps", "#eedde3"),
      arrow("idea", "people", 420, 380, -180, -180),
      arrow("idea", "questions", 670, 380, 180, -180),
      arrow("idea", "possibilities", 420, 500, -180, 210),
      arrow("idea", "next", 670, 500, 180, 210),
    ];
  if (!items.length) throw new Error("Unknown template");
  return {
    type: "excalidraw",
    version: 2,
    elements: convertToExcalidrawElements(items as any),
    appState: { viewBackgroundColor: "#fffdf6" },
    files: {},
    whisketch: { template: id },
  };
}
export function starterLibrary() {
  return ["Router", "Compute host", "NAS / Storage", "Client", "Service"].map(
    (name, i) => ({
      id: "catlyte-" + i,
      status: "unpublished" as const,
      created: Date.now(),
      elements: convertToExcalidrawElements([
        box(
          "kit-" + i,
          0,
          0,
          210,
          95,
          name,
          ["#dcebe6", "#e5edf3", "#eee4d7", "#f1dfe1", "#e5e0f4"][i],
        ),
      ] as any),
    }),
  );
}
