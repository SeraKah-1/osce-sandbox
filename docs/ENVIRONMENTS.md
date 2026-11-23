# MCP Environment Library — Durable Blueprints, Temporary Touch Sessions

## The storage boundary

A **saved environment** contains scene entities, character pose defaults, asset definitions and behavior definitions at the time of each **MCP edit**. It is not an automatic recording of a player's current gestures. Drag updates, camera navigation, local undo/redo and transient HTTP edits are RAM-only. If ChatGPT later edits the same environment via MCP, only that MCP operation is applied to the independently maintained saved blueprint; manual gestures do not leak into it.

This separation avoids blocking each tablet input frame on disk and keeps the user's original preference that the puppet resets on reopening unless the AI explicitly opens a named environment.

## ChatGPT tool workflow

1. `create_environment({name:"Ruang pemeriksaan bahu", operations:[], sessionId: "optional tablet session"})` returns a new `env-...` ID. If a tablet session ID was provided, the new environment is opened in that session.
2. `list_environments({})` lists IDs, names, timestamps and saved revisions. `get_environment({environmentId})` returns a validated saved snapshot.
3. `load_environment({environmentId,sessionId:"optional"})` loads into an existing tablet session, or starts a separate temporary session. `open_studio({environmentId})` does the same and attaches the interactive ChatGPT MCP App view.
4. `get_world_state({sessionId})` returns scene revision. Before a large edit call `preview_scene_operations({sessionId,baseRevision,operations})`; this never saves.
5. `apply_scene_operations({sessionId,baseRevision,operations})` edits the opened environment and **autosaves** on successful completion. MCP asset/behavior create and update operations, as well as explicit reset, also save.
6. `undo_environment({environmentId})` and `redo_environment({environmentId})` modify the saved blueprint's history (last 12 snapshots). `undo_scene` / `redo_scene` affect only the currently running temporary session.
7. `rename_environment({environmentId,name})` persists the new title. `delete_environment({environmentId,confirmed:true})` permanently removes the blueprint. Without `confirmed:true`, deletion fails safely. Deletion does **not** destroy an already-open temporary room, but removes its association with the saved blueprint so future changes cannot resurrect it accidentally.

To use a standalone tablet, open the More panel → saved environments; tap an environment to open its blueprint. ChatGPT needs that tab's `sessionId` to modify **that same running room**. Session IDs should be treated as transient access identifiers, not permanent environment IDs.

## Isolation and revisions

Every normal scene MCP read/write requires an **explicit sessionId**; a missing ID is rejected. Saved-environment operations use explicit `environmentId`. This prevents ChatGPT from silently editing whichever room happened to be last opened. `baseRevision` protects the current live scene from stale batch writes; `environmentRevision` protects the saved world from simultaneous edits in another session. On conflict, reload and preview again.

The service is **single tenant** under one `API_TOKEN`; unrelated owners must not share a token or this library. Multi-user account permissions are not implemented. Session state is process-local, expires after inactivity and is cleared on server restart; disk blueprints do not.

## Reliability and failure behavior

- New or changed saved records are validated, limited in size/number and written to a temporary file before atomic rename. The code calls fsync on the file and attempts fsync on the directory. A storage failure leaves the operation uncommitted in the live world and reports an error.
- Only IDs matching the generated `env-` syntax are accepted. Arbitrary file paths are rejected.
- Deletion requires confirmation; it renames the JSON file out of the visible library before unlinking. A process crash after renaming leaves an unlisted tombstone rather than a resurrected environment.
- A corrupt saved snapshot fails validation and is not silently loaded. Keep external backups if environments are valuable; this package has no managed backup service.
- Saved-state undo/redo is limited to 12 snapshots. A server crash during or after an MCP call may make the client uncertain of success: check `get_environment` or list/revision before retrying the operation.
- **Data directory must be persistent**, e.g. Render `/app/data/environments` with disk at `/app/data`, or Docker named volume at `/app/data`. If a hosting provider redeploys without retaining the mount, saved blueprints are lost. The application cannot make an ephemeral filesystem durable by itself.

## Not a save button for touch

`/api/save` intentionally returns HTTP 410. UI status reports that a GPT blueprint is saved, not that the current user's touch pose is saved. Opening a saved environment in a new session restores **the saved blueprint**, not the last manually dragged pose.
