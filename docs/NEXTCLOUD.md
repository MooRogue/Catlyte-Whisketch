# Nextcloud storage in Whisketch 0.5

Whisketch now saves `.whisketch` notebooks, not Nextcloud Whiteboard documents. The selected Files folder still applies. Old remote board files are preserved during migration. See [0.5 migration, browser setup requirements and limitations](RELEASE-0.5.md). The earlier implementation notes below describe the original board-sync prototype; `.whiteboard` references are historical.

# Nextcloud files and automatic sync

Whiteboard opens `.whiteboard` documents in Nextcloud Files. There is no mandatory global Whiteboard directory. Whisketch defaults to **Files → Whisketch**, configurable under **Nextcloud connection**. `Notes/Whiteboards` selects a nested folder; an empty path selects your Files root, not a server filesystem path.

## Connecting

Enter your HTTPS Nextcloud address, username and an app password. **Connect and enable automatic sync** saves credentials in Apple Keychain, lists the selected folder and enables syncing. Existing saved connections from 0.2 are reused automatically unless you explicitly paused sync. **Pause automatic sync** keeps local notes and remote files intact. Changing server, account or folder requires connecting to that scope; notes linked elsewhere are never silently uploaded into another account/folder.

## Opening and editing

Opening a local notebook refreshes its linked Nextcloud file. New/opened or edited notebooks are saved as `Note name.whiteboard` in the selected folder. There are no UUID or date suffixes. Filenames replace filesystem-invalid characters with hyphens, trim surrounding whitespace and use `Untitled` for an empty name. Same-name collisions require a choice or a different note title, rather than automatic numbered copies.

Edits save locally first and upload about 1.2 seconds after editing pauses. Already linked notes retry on app foreground/reconnection and every 15 seconds while the editor is visible. Offline changes survive restarting and are retried later; iOS can suspend the app, so continuous background sync is not promised. The footer reports waiting, syncing or saved status. Local covers/tags/favourites/checkpoints remain local metadata; the editable scene, images and paper background are synced.

**Open a synced board** links a board from the selected Nextcloud folder to a local notebook. Opening an already linked board reuses it and reconciles pending changes rather than replacing them with another copy. Renaming a linked note performs a conditional move with destination overwrite disabled, then subsequent edits use that path. A remote move/rename currently appears as a missing file; open the moved file from its selected folder to reconnect it. Historical suffixed copy exports are left untouched.

## Conflicts and recovery

Each linked notebook persists a server/account/folder scope, URL and last synchronized content/revision. A clean local note pulls remote edits; a changed local note uploads only if the remote revision still matches. Both-side edits, name collisions and revision races never authorize a blind overwrite. Choose **Use Nextcloud version** or **Keep this version**; the other scene is preserved as a manual checkpoint (up to three). Rename-destination collisions can be resolved by choosing another title; choosing the remote version cancels the attempted local rename. A failed or missing strong revision tag stops unsafe writes.

Moving a notebook to local Trash does not delete its server file. A remote deletion/move does not remove local work or automatically recreate the server file; **Recreate on Nextcloud** explicitly restores it with create-only protection. Backup restores are detached from old remote links and become separate notes, preserving existing cloud documents.

## Scope and validation

This is file synchronization, not live co-editing in a Whiteboard collaboration session. Avoid simultaneous browser editing; conflicts are reconciled on the next check. WebDAV transport and revision races are covered with mock-server tests, plus browser tests of native-bridge behavior. A live authenticated round trip against the owner's Nextcloud/Whiteboard version and physical Duo use remain unverified. No production Nextcloud documents were modified during implementation.

The standalone web editor remains local-only. Passwords are not included in library backups or sent to the embedded JavaScript editor. The Apple app owns authenticated WebDAV requests, enforces HTTPS/same-origin redirects and selected-folder boundaries, and verifies uploaded bytes by reading them back.

Reference: https://docs.nextcloud.com/server/latest/developer_manual/client_apis/WebDAV/basic.html
