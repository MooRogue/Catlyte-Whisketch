# Whisketch

A Catlyte notebook and whiteboard for handwritten notes, sketches and editable diagrams.

**Status: expanded prototype, 0.2.0 build 4.** The shared editor runs on the web and is bundled offline in a SwiftUI iPhone/iPad/Mac Catalyst app. The roadmap is larger than this release.

See [0.2 release details](docs/RELEASE-0.2.md) and [Nextcloud folder/copy exchange guide](docs/NEXTCLOUD.md).

## Available now

- Excalidraw drawing, text, shapes, attached arrows, images and selection tools.
- A notebook shelf with covers, tags, favourites, content search, templates, Trash recovery, checkpoints and whole-library backups.
- Portable paper styles, persistent shape libraries, editable import/export, PNG and native PDF export.
- Remembered light/dark appearance and new Catlyte-family cat-and-stylus icons and notebook artwork.
- Native photo text recognition using Apple Vision, plus a review step for text extracted from selected ink or the whole board.
- Native Nextcloud app-password connection (Keychain storage), listing/importing boards in your selected folder (default `Whisketch`), and publishing a uniquely named `.whiteboard` copy with create-only preconditions and readback verification.
- Local fonts/editor resources bundled with the Apple app; ordinary drawing requires no network or AI account.

## Boundaries of this prototype

**Nextcloud exchange currently imports or publishes independent copies. It is not automatic two-way sync or live collaboration.** No existing remote board is overwritten. Authenticated testing against the owner's Nextcloud/Whiteboard installation remains pending; use of the same scene format does not establish full compatibility with its installed version.

iCloud, stroke handwriting recognition/search, photo-to-editable-diagram reconstruction, Siri actions, AI provider integration, multi-page paper presentation and Joplin publishing remain planned. Photo OCR is not diagram reconstruction. Browser data can be cleared by the browser/OS: export important boards while recovery/versioning is being developed. Recognition results require review.

## Development

Prerequisites: Node 22+, npm, Xcode and XcodeGen for Apple builds.

```sh
npm ci
npm run build
xcodegen generate
npm test
swift test
```

`npm run build` creates `build/web` and copies it into the ignored native resource bundle. Build the `Whisketch` scheme for iOS Simulator, iOS or Mac Catalyst. Never skip the web build on a fresh checkout.

For the browser prototype:

```sh
npm run dev -- --port 18862
npx playwright install chromium
npx playwright test
```

Browser tests expect the development server at `127.0.0.1:18862`. To serve the compiled bundle, use an HTTP server rather than opening `index.html` as a file. Apple builds use a stable local URL-scheme origin so storage survives app upgrades without depending on the bundle's installation path.

`WhisketchSmoke` runs the native persistence and portrait/landscape tests. Use only the simulator devices approved in `/Users/jenson/AGENTS.md` on Sphene.

## Next steps and design

- [Product and delivery plan](docs/PLAN.md)
- [Architecture and compatibility gates](docs/ARCHITECTURE.md)
- [Prototype status and validation](docs/PROTOTYPE.md)
- [Research sources](docs/RESEARCH.md)
- [Third-party licenses](THIRD_PARTY_NOTICES.md)

Display name: **Whisketch**. Publisher: **Catlyte**. Repository: **Catlyte-Whisketch**. GitHub `origin` and Genkizone `genkizone` remotes carry the same main branch.

Application licensing is not yet selected. The embedded Excalidraw component and dependencies retain their own notices; no Nextcloud server source was copied into this application. Credentials, signing assets, generated web bundles and release products are excluded from Git.
