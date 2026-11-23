# OSCE Playground v0.6 — QA & known limits

## Source tested

The v0.6 ZIP is derived from the existing v0.5 codebase, not a new disconnected mockup. The production UI and MCP embedded view share source files.

## Checks completed

- `npm run check`: JavaScript syntax for UI, server, rendering, IK, and MCP.
- `npm test`: 43 automated tests passing, including direct-touch transaction rules, fixed bone lengths, rotating root independence, unreachable IK targets, elbow aiming, screen ray/plane math, surface/chair snap, token/session isolation, MCP CRUD/behavior, and bundled MCP App script compilation.
- Browser Chromium `page.set_content` regression: tested the real inline widget UI (with `__OSCE_EMBEDDED__=false` and browser fetch bridged to real local API due navigation restrictions in this test environment). No JS page errors; Canvas2D fallback rendered; Add displayed 10 assets; adding a stethoscope succeeded. Dragging the actual patient's projected right wrist changed its shoulder axes and raised server revision 0→1. Screenshots from this browser run are provided alongside the ZIP.
- Node smoke: check with `npm run smoke` once server is running.

## Failure-handling / edge cases

| Case | Response |
| --- | --- |
| 30 pointer moves in one frame | Coalesced; the solver runs once per animation frame, with final position solved on release |
| Second finger while dragging | Final local pose is committed first, then camera pinch/pan takes over; no silent rollback |
| Touch canceled / app loses focus | Only the ongoing uncommitted local edit is reverted |
| Target beyond bone lengths | Clamp reachable target without stretching geometry; show reach-limit feedback |
| Arm raised near Euler-angle boundary | Select branch near existing joint angle; clip at configured visual joint limits |
| Equipment dropped on furniture | Only explicit bed/table surfaces accept magnetic placement; no automatic free-body physics |
| Chair snap | Position root relative to seat height and apply seated pose when released; can undo |
| GPU unavailable or context lost | Canvas2D fallback or recovery path; tested fallback only in this environment |
| Remote MCP operations while locally dragging | Queue remote refresh until the user finishes; server revisions guard against stale writes |
| Tab closed/reloaded | Create a new temporary session; best-effort deletion plus TTL cleanup |
| New widget code compiled | Source from IK/placement is included in single inline MCP App bundle |
| Browser stale cached scripts | PWA cache renamed `v06` and new modules included |

## Unverified / limitations

**Not verified:** hardware WebGL output and real multitouch on physical iPad/Android; the browser test used a software Canvas2D fallback. Real-world 60 FPS / input-to-display timing cannot be claimed. Full anatomical collision, skinning, patient support for lying poses, and calibrated clinical range of motion are out of scope. Body / instrument snapping is simplified placement, not collision-accurate contact.

A public deployment of v0.6 is **not** performed by preparing the ZIP; the existing ChatGPT plugin/host has to be updated by its owner. Check `/health` before claiming success.
