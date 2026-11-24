# OSCE Playground v1.1 — QA evidence and release limits

## Executed checks

- `npm run check`: all updated JS source parses.
- `npm test`: 110/110 automated tests passed (93 existing regressions + 17 v1.1 cases). Includes immutable scene projection tests, seat/bed/surface matching, scene delta correctness and revision gap rejection, real mechanism coupling, anchor tracking, spatial learning validation, timed hold progress/reset, idempotency in memory and persisted blueprint, widget bundle parsing, and live HTTP MCP tests.
- `npm run smoke` on a live server bound to localhost: 25 MCP tools, widget resource, scene change, furniture support movement, articulated tool write/read, durable GPT environment create/edit/delete, and exclusion of manual pose movement from persisted blueprint passed.
- Live HTTP test generated an MCP equipment asset with linked mechanisms, moving-part anchor, distance and hold lessons, spawned it and changed its controls, confirmed saved definition, and checked that a repeated operation with the same ID was deduplicated.
- Test package must be re-extracted and both check and test repeated before release handoff.

## Functional completeness

- Macro: move, rotate, surface placement, attach, release, and corresponding state checks operate on scene entities.
- Micro: articulated part transforms, linked mechanism controls, and step-by-step training predicates operate on 3D state, not only labels. This **does not** validate medical accuracy of a procedure.
- AI-created environment: persisted baseline created through MCP, 25 tools, deletion with confirmation, revision conflict checking, rollback on disk failure.
- Runtime: tablet changes remain transient; no per-frame synchronization or DB writes. MCP environmental edits are saved separately.

## Unverified / not delivered

- Headless Chromium timed out in this environment. 3D WebGL output quality, input-to-photon latency, browser FPS, and physical tablet multi-touch were **not** measured. Browser-only instrumentation and source tests cannot substitute for real device testing.
- Older installed ChatGPT Site/Plugin was **not republished** to v1.1; package readiness and plugin deployment are separate steps.
- Environment JSON writes are atomic and durable but **synchronous**; under extreme disk stalls, MCP/API response throughput may still be delayed. They do not block the tablet GPU loop because gestures are local. No SQLite WAL/async worker implementation is claimed.
- User-specific OAuth, role-based authorization, multi-tenant isolation, multiple horizontally scaled replicas, external backups, anatomical force sensing and physiological validation were not implemented.

## Device acceptance (must be measured after deployment)

Test on an actual iPad and Android tablet: drag wrist/ankle/body, two-finger interruption, rotate couch/patient, seat/lie, spawn 20 objects, manipulate two coupled mechanisms in Detail, hold a target for 500ms, lose network during a drag, reject a mutation, reopen a GPT environment, lose WebGL context. Record screenshots, actual FPS and input delay. Release should not claim 60 FPS until these results are measured.
