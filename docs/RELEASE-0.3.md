# Whisketch 0.3.0 build 5

Automatic Nextcloud file sync replaces manual copy publication in the native Apple apps. Existing saved credentials are reused unless sync was paused. Opening notes refreshes linked files, edits save locally then upload after a short debounce, and foreground/reconnection checks retry pending changes. Files use the note name plus `.whiteboard`, without unique suffixes. Renames move a linked file rather than leaving successive copies.

Revision-conditional creation/update/rename and three-way local/base/remote comparisons prevent silent overwrites. Conflicts require choosing a version, retaining the other as a checkpoint. Offline edits persist locally; missing remote files require explicit recreation. Trash remains local. Account/folder boundaries and detached backup restores protect unrelated documents. See NEXTCLOUD.md for details and limitations.

No new app identity, devices or signing assets are required. Preserve the existing local library and credentials. This is file sync rather than live collaboration; standalone web editor sync and iCloud remain unfinished. Mock transport/bridge tests do not establish authenticated compatibility with the owner's server; physical Duo and authenticated live Nextcloud checks remain pending.
