# Whisketch 0.2.0 build 4

## Notebook experience

- Original Catlyte-family navy/white/cyan cat with stylus and notebook, matching light/dark icons, and an illustrated library banner. Full-resolution art and prompts retained in Design/ART-DIRECTION.md.
- A tactile notebook shelf with covers, cover colours, favourites and tags.
- Search titles, tags and typed/recognized text. Unrecognized ink is not yet searchable.
- Editable journal, meeting, homelab, project-board and mind-map templates.
- Plain, lined, dotted, grid and midnight paper rendered as locked scene images, so the paper travels with exported drawings.
- Duplicate notebooks, recover notebooks from Trash, and keep up to three manual checkpoints per notebook. Restoring a checkpoint opens a separate notebook.
- Full library backups include metadata, checkpoints and shape libraries. Restoring creates separate notebooks and preserves existing local work.
- Excalidraw shape-library imports persist across notebook changes and app restarts. An original Catlyte homelab stencil kit is included.
- PNG image export and native single-page PDF export.
- Photo OCR plus selected-canvas/whole-board OCR with a native review sheet before inserting extracted text. Original ink is retained. Raster OCR accuracy varies for handwriting; this is not stroke-aware recognition or automatic diagram reconstruction.
- Appearance preference is remembered.

## Nextcloud

Configurable folder under Files, safe nested directory creation only during publication, clearer copy-exchange wording, and credential reset when the server/account changes. See NEXTCLOUD.md. Automatic two-way sync, iCloud and live collaboration remain unfinished. No production account or unrelated Nextcloud files were accessed during this work.

## Licensing

The Excalidraw editor is MIT-licensed. The official Excalidraw Libraries catalogue states its listed libraries are MIT-licensed. Preserve required notices, including font/dependency notices. Arbitrary libraries/assets from other sites need their own terms checked; do not assume trademark or proprietary font rights from the editor's license. We use our own generated art and templates, not TypeDraw's fonts/artwork.

Sources: https://github.com/excalidraw/excalidraw/blob/master/LICENSE and https://libraries.excalidraw.com/ . Third-party notices are bundled with the app and web package, including available upstream/embedded font notices.

## Validation scope

JavaScript scene/backup tests; Swift transport/path/real OCR tests; browser persistence, actual drawing, paper export, favourites/search/trash, library persistence, templates/checkpoints, appearance and backup tests. Phone/tablet native persistence/rotation, canvas OCR review and Nextcloud-folder UI tests. Release iOS and Mac Catalyst builds. Final IPA verification includes executable modes, extracted signatures and the independently downloaded portal artifact. Physical Duo and authenticated Nextcloud testing remain pending.
