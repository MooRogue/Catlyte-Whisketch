# Whisketch 0.5.2 build 10 — complete appearance

The app's Light/Dark toggle is now on the page bar. Both modes style the compact toolbar, page controls, paper picker, settings, expanded drawing controls and native SwiftUI sheets. Neutral ink adapts for legibility. Photo pixels remain unchanged, with no canvas inversion.

Every paper pattern has light/dark presentation. Paper → Paper appearance offers Follow app, Light and Dark. The explicit paper tone is stored per page and syncs; Follow app follows the local device. The former Midnight preset remains supported.

A local presentation adapter maps neutral ink and paper SVGs for display. Its virtual attachments, rendering version offsets and derived colors are removed before saving. App theme changes do not modify canonical document content or create cloud conflicts. The original photo assets are never transformed. Existing notebook files remain supported. Update other devices to this version to retain explicit paper-tone preferences when editing.

Tests include canonical-document invariance under theme changes, edits in dark mode, virtual-asset removal, two-device mock sync, real pixel colors, expanded-control colors and per-page appearance. Actual handwriting, Pencil/camera ergonomics and production Nextcloud still require owner verification. Website hosting remains separate.
