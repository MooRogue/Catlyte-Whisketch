# Whisketch

A Catlyte notebook that can also be a whiteboard, for iPhone, iPad, Mac and the web.

**Version 0.5.3 build 11.** See [ruling and stroke recognition](docs/RELEASE-0.5.3.md), [complete appearance](docs/RELEASE-0.5.2.md), [paper and OCR fixes](docs/RELEASE-0.5.1.md) and [notebook migration details](docs/RELEASE-0.5.md).

Each notebook has ordered, named pages. A page mixes typed text, Pencil/finger ink, photos, images, shapes and connected arrows. Objects can be selected, moved, resized and rotated. Notebook and whiteboard presentations share the same content. The compact tool shelf includes image import, camera capture, ink colour and undo/redo; the library retains Catlyte's illustrated header, templates, search, tags and favourites. Apple apps provide selected ink/image OCR with reviewed text insertion, PNG export and notebook-wide PDF export.

## Documents and sync

Whisketch uses its own versioned `.whisketch` notebook files. Nextcloud is ordinary WebDAV storage, not Nextcloud Whiteboard. The existing Excalidraw renderer is an internal implementation detail, with no interchange compatibility promise. Old local notes have a pre-migration backup and retain editable content. Old remote board files remain untouched; converted notebooks use new `.whisketch` files.

Local saving works offline. Native Nextcloud app passwords stay in Keychain. Browser passwords stay in memory for the current session; browser deployment requires HTTPS and server browser-access configuration. Both adapters use conditional writes, strong revision tags, read-back verification, foreground refresh and conflict recovery. Trash stays local. Real authenticated testing against the owner's Nextcloud server remains pending. This is file sync, not live collaboration.

The shared web editor can run on Windows and Mac browsers. A bundled offline editor powers the SwiftUI iPhone/iPad/Mac Catalyst apps. A deployable web build is produced, but this release does not configure a production web host.

## Build and verify

```sh
npm ci
npm test
npm run build
swift test
xcodegen generate
npm run dev -- --port 18862
npx playwright test
```

`npm run build` creates `build/web` and the ignored `Native/Resources/Web` bundle. Always run it before building the Apple app. Use the existing approved simulator devices; do not create defaults or delete booted simulators.

## Limits

Physical Duo, actual Pencil/palm-rejection ergonomics, camera capture and production Nextcloud need device/account verification. OCR is not searchable handwriting indexing or editable diagram reconstruction. Photo deskew/cropping, iCloud and live collaboration are not implemented. PDF exports are raster pages. The current sync limit is 40 MB per notebook; browser storage can be cleared by the browser or OS, so keep exported backups.

## Licensing

Application licensing is not yet selected. Embedded Excalidraw and other dependencies retain their own notices; no Nextcloud server source was copied into this application. Credentials, signing assets, generated web bundles and release products are excluded from Git.
