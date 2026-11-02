# Architecture proposal

This is a proposal with explicit research gates, not a claim that Nextcloud exposes a ready-made native-client sync SDK.

## Layers

1. **Document core:** stable document/object IDs, coordinates independent of screen size, text, freehand paths, shapes, connector endpoints, images/attachments and revisions.
2. **Optional metadata:** notebook/page membership, paper styles, tags, recognised text anchored to source objects, original capture references and provenance.
3. **Local persistence:** atomic local saves, durable pending operations, attachment hashes and recoverable revisions. Recognition indexes are rebuildable derived data; original ink is authoritative.
4. **Provider adapters:** Nextcloud initially, iCloud later, local-only always. Each advertises capabilities rather than pretending storage and live collaboration are identical.
5. **Editor adapters:** shared browser-compatible scene plus Apple-specific input/recognition support, exact approach determined by the spike.
6. **Recognition providers:** OCR, stroke recognition and visual diagram interpretation have separate interfaces and availability checks.

## Nextcloud integration

Read official Whiteboard source, installed version and save/collaboration contracts. WebDAV can transport files but must not blindly overwrite a board while a Whiteboard collaboration session owns newer edits. Prefer supported integration routes; test live and offline paths explicitly.

Prove whether custom object data survives stock editor saves. If it does not, use compatible companion metadata or a narrow extension, with defined reconciliation and recovery. Native ink must have a browser-visible/editable representation; an Apple-only drawing blob is not sufficient. Store source ink precision separately if a conversion loses information, with clear behaviour after web edits.

## iCloud integration

One notebook has one primary provider. iCloud does not imply Nextcloud access or a ready-made PC web editor. Compare iCloud Drive documents and CloudKit based on conflict handling, attachment sizes and intended sharing. CloudKit browser integration is possible additional work, not supplied by adding cloud storage.

## Sync invariants

- Persist before reporting a successful local save.
- Use revision/ETag preconditions where supported; never silently replace unseen remote changes.
- Distinguish live scene merging from whole-document file conflicts.
- Preserve competing revisions when object-level merging cannot be proven safe.
- Deletions have identity/revision semantics so stale offline copies do not resurrect or erase work silently.
- Upload assets safely before publishing references; interrupted operations are retryable.
- Backend migration is an explicit copy/verification/switch operation, not ongoing dual writes.
- Unknown fields and unsupported elements require preservation or a non-destructive fallback.

## Initial compatibility fixtures

Ink with several widths/colours, multilingual labels, attached arrows, grouped shapes, embedded images, page frames and recognition anchors. Edit one object in each client, change an image, delete/restore an element, rotate/unfold, restart offline and reconcile concurrent edits. Compare semantic scene content and visual output; do not rely on byte equality when editors legitimately reorder JSON.

## Security and dependencies

Reuse Nextcloud authentication mechanisms; keep tokens in platform credential storage. Never commit tokens, signing materials or production configuration. External AI sends only the selected content and requires explicit disclosure; local-only operations remain available. Pin dependencies and preserve licenses/notices. Keep Nextcloud AGPL code separate from an MIT Excalidraw integration until distribution obligations are understood.
