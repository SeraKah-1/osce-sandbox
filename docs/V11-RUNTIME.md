# v1.1 — Local-first world, mechanism-linked instruments, and MCP environments

## Runtime split

- **Tablet frame:** Pointer Events → one active gesture → direct character/geometry mutation → render frame. There is no HTTP/DB roundtrip inside the drag loop.
- **Tablet operation:** On release, send an `operationId`, `baseRevision`, and the exact operations. `optimistic.js` projects seat/bed/surface placements and mechanical changes locally. The server validates and returns a `delta` with changed entities, removed IDs, scene/environment properties, assets/behaviors when applicable, and the confirmed revision. Normal confirmation uses the delta; conflicts use a full reconciliation with visible error.
- **ChatGPT operation:** MCP tools can read/build/modify world entities. SSE sends per-entity deltas to the website; the embedded UI uses MCP host calls. Environment loads/resets explicitly force a full load even when the new blueprint revision is less than the old one.
- **Persistence:** Browser/manual operations modify the session only. MCP edits to an opened named environment atomically update its saved baseline and preserve manual changes as transient. Environment revisions prevent silent overwrites.

## Retry safety

`apply_scene_operations` optionally accepts `operationId` (8–100 characters; alphanumeric, `_`, `.`, `:`, `-`). Repeating the same operation with the same ID returns the prior result, marked `deduplicated:true`. Reusing an ID with different operations returns `IDEMPOTENCY_CONFLICT`. An in-memory session retains a limited receipt cache. A saved MCP environment also retains the latest 24 receipts on disk, so a lost MCP response followed by the same request won't write the environment twice. Clients should generate a unique ID **once per intended operation**, not once per retry.

## Geometry and instrument definition

ChatGPT builds assets through `create_asset` with `parts`, `mechanisms`, `anchors`, `affordances`, `behaviorId`, `parameters`, and `learning`.

- Each named rigid part can be independently controlled by a hinge, dial, button, or slider.
- `mechanisms[].drives` may map source mechanism value to downstream mechanism value: `target = clamp(source*ratio+offset,target.min,target.max)`. The engine rejects invalid downstream references and directed cycles; it is a deterministic logical linkage, not a spring-force simulation.
- `anchors[].partId` binds an anchor to a moving part. Spatial lessons use the *actual part transform* to measure contact or distance.
- `learning.steps[].condition` accepts `mechanism_range`, `action`, `status`, `parameter_range`, `attached`, `detached`, `distance`, `contact`, `orientation`, or `hold`. Example hold: `{ "kind": "hold", "durationMs": 500, "predicate": { "kind": "mechanism_range", "mechanismId": "lever", "min": 38, "max": 42 } }`. Duration counts only while the condition remains true and resets if the user leaves the target.
- `distance` requires target entity and `maxDistance` (m), and optionally `anchorId` and `targetAnchor`. `contact` defaults to 0.08 m if not specified. `orientation` checks a specified Euler axis (0/1/2), relative to a target entity, within `maxAngle` radians.
- Human reference markers (chest, pelvis, head, shoulders) are **approximate visual training anchors**, not anatomical tracking or force sensing.

## Error handling and constraints

- The engine rejects unsupported predicates (`UNSUPPORTED_CAPABILITY`), undefined anchors, missing mechanisms, cyclic `drives`, invalid range values, and out-of-bounds geometry.
- Client preview changes are not blueprint writes. Server refusal triggers an authoritative reconciliation and a visible error message.
- Server pushes changes with a monotonically incremented **scene** revision; environment blueprint revisions are separate.
- Multi-touch retains the last hand pose when control moves to the camera. Large objects have silhouette hit-testing; the active rotation handle remains contextual.
- World support relations are handles/anchors, **not physical collision**. Full gravity, pressure, fluids, deformable rubber, tissue and patient physiology are outside this runtime.
- Server runs a *single-owner bearer token* with HTTPS reverse proxy and single-replica file storage. Multi-user OAuth, token scoping, DB locks, live deploy of an existing Site, and actual-device GPU profiling require separate work.

## Upgrade compatibility

v0.9/v1.0 environment JSON remains readable. Core validation allows old assets without new properties; the built-in goniometer is migrated on explicit environment load if it still has the original rigid version. PWA shell cache is bumped to v11 and includes every newly imported module to avoid mixing old and new client scripts.
