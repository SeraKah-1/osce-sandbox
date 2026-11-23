# OSCE Playground v0.5 — QA evidence and edge cases

## Automated results

Run `npm run check` and `npm test`. The test suite verifies:

- Scene/asset/behavior validation, rollback, and undo semantics.
- MCP tools, widget resource, custom instrument creation and status changes.
- Separate RAM sessions for unrelated clients, close/expiry, no files on disk.
- HTTP API bearer enforcement, stale revision errors, and MCP operations selecting a session ID.
- Direct torso movement, wrist/ankle IK, touch conflict cancellation, pointercancel recovery.
- `requestAnimationFrame` throttling of 30 pointermove events to one IK solve per frame, and final pose calculation at release.
- Rounded WebGL capsule mesh topology, valid normals, finite vertices and indices.

## Browser run (headless Chromium, Canvas2D fallback)

An inline-hosted browser test was used because browser direct navigation to localhost is blocked in the evaluation environment. Actual requests were relayed to the running Node server, not mocked scene changes. The test recorded:

- Loading overlay hidden; no uncaught JS errors.
- Tablet layout visible and active session created.
- Torso drag changed patient X/Z and advanced scene revision.
- Wrist drag changed shoulder pose and advanced scene revision.
- Add panel listed 10 assets; adding a stethoscope produced a real entity.
- Starting a new browser view created a different session with default five entities.

**Not verified:** real GPU-backed WebGL output, measured FPS/touch latency, iPad or Android physical multitouch, native ChatGPT Site publication, and end-to-end UI event notifications from an external ChatGPT host. These require the target devices/host.

## Failure and recovery policy

| Condition | Handling |
|---|---|
| WebGL unavailable | Fall back to Canvas2D; do not show a black screen |
| Context lost | Retry and then use the fallback |
| Second pointer arrives during posing | Restore provisional pose and start camera gesture |
| Pointercancel / window loses focus | Discard incomplete move and restore prior pose |
| Many pointer events in one frame | Coalesce updates; final release solves precise target |
| Server is slow | Preview pose moves locally; only completed gesture waits for acknowledgement |
| ChatGPT edits while dragging | Defer remote scene replacement until gesture ends |
| Stale revision | Reject, show failure, reload authoritative temporary world |
| Browser closes/crashes | Attempt session DELETE; timed RAM cleanup if it fails |
| Reload/new tab | Always start a new world; no restore from prior browser state |
| Renderer degrades | Display fallback status and keep scene interactive |

## Scope

This is a pose editor, not a clinical examination grader, biomechanics solver or medical procedure safety simulator. Model geometry remains stylized and low-poly by design; only surface smoothness and touch responsiveness were improved.
