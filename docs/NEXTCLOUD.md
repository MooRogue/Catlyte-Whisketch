# Where Whisketch and Nextcloud Whiteboard store boards

Whiteboard is a Nextcloud server app that opens `.whiteboard` documents from Files. It does not require a special global Whiteboard directory: boards can live wherever you put them within your Files account.

Whisketch defaults to **Files → Whisketch**. In **Nextcloud connection**, enter your HTTPS server, username and an app password, then choose a folder relative to your Files root, such as `Whisketch` or `Notes/Whiteboards`. An empty folder selects your Files root. This is not a server filesystem path.

**Connect and list boards** reads the selected folder. It does not create directories or upload anything. **Publish a copy** creates missing folders and a uniquely named `.whiteboard` file, refuses to overwrite an existing file, and verifies the uploaded bytes by downloading them. Open that file in Nextcloud Files with Whiteboard enabled to edit it in a browser. **Import a copy** reads a board into a separate local notebook.

This release does **not** automatically keep those copies synchronized. Changes made in Nextcloud do not silently replace local work, and local edits are not pushed into an active web collaboration session. Use import/export copies while automatic sync and collaboration compatibility are being developed. No authenticated live round-trip against the owner's installation has been verified yet; installed Whiteboard version compatibility remains a test item.

Passwords stay in the Apple Keychain and are not included in notebook backups. Server/account/folder preferences are stored locally. Only the selected folder is listed; no unrelated server content is changed. Use an app password from Nextcloud's personal security settings rather than sharing your account password.

Notebook covers, tags, favourites, Trash and checkpoints belong to Whisketch's local library. A **library backup** preserves them and your shape libraries. A single `.excalidraw` export preserves the drawing and its images/paper background. A stock web editor may discard app-specific metadata, so visual scene compatibility and Whisketch-only metadata should be tested separately.
