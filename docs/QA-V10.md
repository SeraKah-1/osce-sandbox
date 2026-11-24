# QA v1.0 — Evidence and release limits

## Verified

- `npm run check`: JavaScript parser checks for server, rendering, touch/IK, optimistic projection, and learning modules.
- `npm test`: **93/93 tests pass**, including 84 previous regressions and 9 new tests for articulated lessons, validation, optimistic state and persistent learning assets.
- `npm run smoke` against an actual v1.0 HTTP server: health version 1.0.0, 25 MCP tools, 3D widget resource, same-session operations, bed support follow, articulated model write/read, environment autosave/read/delete, and separation of manual session changes from saved blueprint.
- Browser `set_content` test using a simulated MCP host: Add shows a goniometer immediately while the host response is delayed; Detail opens and shows mechanism control; six 5-degree interactions result in 30° and `1/3` lesson progress; forced rejection of the next prop rolls its UI out on reconciliation and displays the error. No JavaScript page errors in this test. The simulated host is not the installed ChatGPT Site.

## Conditions and edge cases

| Event | Expected behavior |
| --- | --- |
| Request delayed | Keep local interaction responsive, show checking state. |
| Request rejected | Reconcile from server after pending queue; rejected object removed. |
| Server times out after receiving operation | Fetch authoritative state before retry; do not blindly duplicate an item. |
| Multiple rapid controls | Queue server revisions in order, render local changes immediately. |
| MCP changes during drag | Defer reconciliation until gesture and queued commits finish. |
| Change includes behavior trigger | Read server's evaluated state on completion. |
| App opens as MCP widget | Inline bundle includes renderer, IK, placement, optimistic state and learning logic. |
| Environment edited through MCP | Stored persistently, with validated schema and environment revision. |
| Patient moved manually | Session-only, not written into GPT environment. |
| Device loses WebGL context | Renderer has recovery/fallback; physical GPU test still required. |

## Known limits

- No promise of absolute zero latency or 60 FPS on all tablets.
- No physiological pressure, tissue mechanics, fluid physics, or validated clinical technique score.
- Unsupported arbitrary instrument logic is rejected by design. Tool construction is limited to supported geometry/behavior primitives.
- Site-hosted ChatGPT plugin needs a separate publication/update; its current deployed version is not changed by downloading this ZIP.
- Browser production connection and real touch on iPad/Android have not been tested in this runtime.

- Legacy v0.9 saved environments containing the rigid built-in goniometer are migrated on explicit load to the v1.0 articulated teaching asset without replacing other scene entities or AI-authored assets.
