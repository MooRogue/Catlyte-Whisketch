# Whisketch product and delivery plan

## Purpose

Draw, handwrite, type and edit the same documents on iPhone (including Duo), iPad, Mac and a PC browser. Reuse existing tools where they fit. Search and transform handwriting without sacrificing the original ink. Capture physical whiteboards and progressively turn them into usable digital content.

## Agreed direction

- Display name Whisketch; Catlyte branding and cat iconography.
- Source directory ~/src/Catlyte-Whisketch; remote https://github.com/MooRogue/Catlyte-Whisketch.
- Nextcloud is the initial storage/sync provider; Nextcloud Whiteboard is the initial web/PC editor.
- iCloud is an alternative provider for people without Nextcloud, not a simultaneous mirror.
- Apple native clients are planned; standalone self-hosted web and Windows clients are later options.
- Local save and offline editing are essential. No AI account required for core writing, drawing or sync.

## Experience

Notebook and whiteboard are two views over shared content. Notebook pages may use bounded frames within a canvas, subject to the compatibility prototype. Do not create separate copies for the two views.

On Duo: preserve document coordinates, selection and scroll position across fold, rotation and display changes; respect reserved system regions; offer single-page, spread and canvas layouts based on available space. On iPad: Pencil writing and finger navigation. On Mac: windows, shortcuts, drag/drop and precise object editing. Browser users must be able to edit core content without installing Whisketch.

## Feature roadmap

| Area | First useful release | Subsequent work |
|---|---|---|
| Ink | Pen, highlighter, eraser, thickness/colour, lasso, move/resize, undo; input-mode controls | Brush variety, stroke cleanup, gestures |
| Handwriting | Searchable recognition, selected ink-to-text, corrections, retained original ink | Additional languages/engines, equations |
| Text | Free-position text, headings, lists, checkboxes, links | Reflow around images, text-anchored smart marks |
| Diagrams | Shapes, attached/labeled arrows, grouping, alignment, libraries | Flowchart/mind-map helpers, Mermaid conversion |
| Notebook | Pages, contents, covers, lined/grid/dotted paper, reorder/duplicate | Page animations, custom handwriting fonts, optional nearby-note shortcuts |
| Media | Paste/import photos and PDFs, annotate backgrounds, portable exports | Larger multi-page PDF workflows |
| Organisation | Folders, tags, favourites, recents, title/text/ink search | Backlinks, templates, saved searches |
| Capture | Photograph, crop/perspective/contrast correction, searchable text | Reviewed reconstruction into editable diagram objects |
| Collaboration | Safe saving/device switching | Live editing, cursors, comments, presentation |
| Convenience | Light/dark modes, share sheet, keyboard shortcuts | Widgets, Siri actions, optional audio tied to writing |

TypeDraw inspiration includes paper/ink choices, spreads, a personalised cover, text anywhere, movable images, page copying and quick-entry widgets. Handwriting-style fonts and actual recognition are separate features. Use original design/assets or licensed equivalents.

## AI and capture pipeline

1. Capture/import and keep the original photograph.
2. Correct crop, perspective and contrast; preserve the unmodified source.
3. Extract text with locations; allow corrections and search.
4. Optionally interpret boxes, labels, arrows and relationships into a proposed scene.
5. Validate object schema, references and geometry; show a source overlay and uncertain regions.
6. Apply accepted changes as an undoable edit. Permit partial conversion.

Prefer local Vision/Pencil recognition on Apple devices. Evaluate Foundation Models image understanding on supported systems. Optional external vision providers (including OpenAI) can propose structured diagrams or summaries; our application validates and renders the objects. Provider support must be checked per platform/device, with an explicit local-only option. External requests require a clear user action and disclosure. Never embed a publisher API secret in a client. Choose user-supplied credentials or an authenticated metered backend before implementation.

Siri/App Intents exposes actions such as opening a board, creating a note or starting capture. It is separate from the OCR/diagram conversion engine. No model-generated replacement of source material without review.

## Delivery phases and exit criteria

### 1. Compatibility spike — first implementation work

- Inspect the currently installed Nextcloud/Whiteboard version and supported integration interfaces without changing the service.
- Build an isolated sample board with ink, text, attached connectors and images.
- Round-trip edits through the Apple prototype, Nextcloud web editor and second device.
- Verify image/asset handling, stroke fidelity, connector attachment, Unicode, coordinate stability and metadata preservation.
- Exercise an offline edit, concurrent edits, deletion, restore and an interrupted upload.
- Decide whether stock Whiteboard is sufficient or a narrow companion extension is necessary.
- Deliver a written decision plus representative fixtures. Do not commit to a native canvas architecture until this passes.

### 2. Writing and recognition spike

- Compare native ink plus a shared scene bridge against embedded Excalidraw.
- Test Pencil/palm interaction, finger navigation, selection, zoom and undo on real devices.
- Test recognisable writing samples, search location accuracy and conversion/correction with original ink retained.
- Choose one coherent interaction model; avoid two overlapping engines with incompatible selection/undo.

### 3. First usable Nextcloud release

- Notebook library, core canvas, offline local save, Nextcloud login/sync, recovery/version access.
- iPhone/Duo, iPad and Mac clients plus existing Nextcloud browser access.
- Basic camera capture/OCR and PDF/PNG/SVG/text exports.
- Pass restart, device-switch, disconnected editing and two-device conflict tests.

### 4. Alternative storage

- Add iCloud provider and local-only mode using the same logical document model.
- Explicit migration between providers, including attachments and history policy.
- No browser access promised to iCloud-only users without our own web client.

### 5. Advanced recognition and integrations

- Reviewed photo-to-editable-diagram reconstruction.
- Optional Joplin text/preview publishing; Excalidraw/Obsidian format adapters with round-trip tests.
- Richer notebook features and collaboration polish.

### 6. Broader hosting and clients

- Evaluate a standalone self-hosted web package and a Windows app against actual browser limitations.
- Preserve the same data model and documented provider interfaces.

## Release standards

No data loss during source/editor/provider transitions. Accessible controls, readable light/dark presentation and non-colour-only sync indicators. Visible local save, pending changes, last successful sync and recovery paths. AI/provider failure must never block ordinary editing. Test core content in the unmodified Nextcloud editor, not only our client.

## Open decisions

- Native canvas versus embedded Excalidraw, based on the compatibility/writing spikes.
- Representation of notebooks, pages, tags and recognition metadata that stock Nextcloud preserves.
- iCloud Drive documents versus CloudKit records; choose after modelling conflicts and asset size.
- Supported OS/language baseline and recognition fallback for web/PC.
- Collaboration protocol integration and minimum compatible Whiteboard versions.
- Application license and boundary with Nextcloud AGPL code; Excalidraw MIT notices.
- Public AI authentication, cost controls and optional local/self-hosted provider support.
- Icon direction: cat drawing a line that becomes whiskers; no final artwork commissioned yet.
