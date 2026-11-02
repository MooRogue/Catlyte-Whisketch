# Prototype 0.1.0 build 3 — November 1, 2026

## Engineering decision

Use the embedded Excalidraw editor for the first Apple client, with shared scenes across the browser and WKWebView. Keep native services (file sharing, credentials, Nextcloud transport and Vision recognition) behind a small message bridge. This gets actual editable scenes working before investing in a native-ink conversion layer. Pencil feel and physical Duo reserved regions still need device testing.

A stable `whisketch://localhost` resource handler serves bundled assets. Direct file-origin module loading failed in the initial simulator run; diagnostic captures/results were retained. All editor fonts are bundled. Opening external HTTP(S) links hands them to the system browser rather than navigating the privileged editor view.

## Validation

- Three JavaScript scene tests: metadata, pressure/path and image retention; deleted elements; malformed scene rejection and safe filenames.
- Six Swift tests: server validation, create-only copy publication, refusal of conflicts, verification mismatch, rejecting foreign DAV paths, and real Apple Vision recognition of a rendered text image.
- Four Chromium UI tests: notebook reopen/export with metadata preserved; source image and recognized text survive reload/export; switching notebooks preserves their separate scenes; pointer drawing creates editable ink.
- One native iPhone and one native iPad UI test: sample document survives termination/relaunch; portrait/landscape/portrait window geometry and editor presence. Screenshot evidence retained.
- Release device and Mac Catalyst compilation passed. Mac app ad-hoc signed and launched locally; window capture was unavailable, so no Mac visual validation is claimed.
- Nextcloud unauthenticated status endpoint responded with server 35.0.2. No authenticated account or installed Whiteboard capability inspection was possible yet. Transport tests use controlled responses, not production writes.

## Signing status

After the account holder accepted Apple's updated Program License Agreement, provisioning succeeded. Whisketch is signed with the existing distribution certificate and the same four already registered devices, including Duo. Build 1 exposed a packaging defect: ditto added AppleDouble metadata files after signing, which broke the extracted signature. Build 2 removed those entries but exposed a second extraction defect: Python extraction did not restore the executable mode. Build 3 restores executable permissions, checks ZIP mode attributes and verifies the real HTTPS archive using a permission-preserving extractor, in addition to entitlements and ZIP integrity. The original pre-packaging check was insufficient. No device slots were added.

The single install card is published at https://ipas.genkizone.com/index.html#whisketch and appears in Recent builds. Physical Duo installation/testing remains pending. This does not change the prototype's Nextcloud copy-exchange limitations.

## Remaining compatibility gate

Open a published copy with the installed Nextcloud Whiteboard editor, edit it and reimport it; verify ink/image/text/connector and unknown metadata behaviour. Resolve automatic sync/collaboration integration based on its actual version and interfaces, including offline and concurrent edits. Current copy exchange is deliberately separate from those guarantees.

## Artifacts

Source screenshots, test bundles and logs: ignored `Artifacts/` plus `/Users/jenson/src-audit-20261101/whisketch-*.log` on Sphene. Distributables and signing diagnostics: `/Users/jenson/src/whisketch-release-20261101`. Keep unsuccessful initial UI results until the corresponding failures have been fully diagnosed.
