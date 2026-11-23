# v0.9 QA — status and limits

## Verified tests

- `npm run check`: syntax checks for HTTP server, MCP, stdio adapter, scene core, environment library and all browser engine modules.
- `npm test`: Node built-in automated suite covering v0.5–0.8 regressions plus v0.9 durable environment scenarios.
- `npm run smoke`: live HTTP/MCP integration: session creation, scene modifications, 3D mechanism change, environment create/autosave/delete, tool/resource listing.
- `v09-http-persistence.test.js`: restart the server and verify saved GPT blueprint survives while manual pose from a session is not persisted; delete via MCP.
- `v09-environments.test.js`: environment persistence, asset/behavior preservation, confirmed deletion, ID/path safety, corrupt snapshot, limits, disk-failure rollback, explicit session ID, revision conflicts, atomic creation, persistent undo/redo.
- `v09-stdio.test.js`: local stdio adapter uses the same durable environment store and correctly reloads/deletes after process restart.
- `v09-widget-source.test.js`: embedded MCP App references common control and rotation-handle modules.
- Browser/embedded UI inspected in headless Chromium with `setContent` plus a bridge dispatching **real HTTP MCP tool calls**. Confirmed load, saved-environment list, opening a saved world, visible contextual ⟳ rotation handle, absence of JavaScript exceptions.

## Known unverified areas

- **Tablet physical devices** (iPadOS and Android) were not available, so true multitouch accuracy, WebGL GPU recovery, 60 FPS, frame latency and battery cost remain unverified.
- Browser automated navigation to the local HTTP URL is restricted in this runtime; the embedded UI was tested through injected HTML with real MCP HTTP calls, using Canvas2D fallback. This is not equivalent to full browser/network integration on a user's tablet.
- No proof of publishing v0.9 into the user's already-connected ChatGPT Site. Package release and Site installation are separate steps.
- No full medical physiology, realistic collision, tissue deformation, clinical force measurements or validated OSCE grading.
- Durable file store is single-owner and single-instance. Production multi-user access controls and multi-region consistency are not implemented.

## Release gates for the host owner

Run all three npm commands on the deployed build, confirm `/health` version 0.9.0 and all 25 tools through the actual ChatGPT connection, verify environment create/edit/load/delete after service restart, then use a physical tablet to measure gesture usability and GPU performance. The on-disk volume must persist through redeploy. Never claim complete device or hosted Site validation solely from the local test suite.
