# OSCE Playground v0.8 — Direct Rotation & Macro/Micro Asset Framework

Tablet-first 3D OSCE dollhouse with direct touch, temporary sessions, a connected MCP server, and metadata-driven interactions. **No placeholder controls or fake AI API.** The web editor uses the same source for standalone and embedded MCP App rendering.

## What's new in v0.8

- **True macro rotation for characters and objects:** Hold and drag the body for yaw/pitch; right-mouse drag for desktop. Existing contextual 30° rotation buttons remain as accessible alternatives. Normal drag still moves or poses.
- **Declarative articulated assets:** MCP can create an instrument from up to 100 named 3D parts, including tube paths, rings, cones and capsules, with optional local rotations.
- **Macro/micro layers:** An asset can expose 24 nested subassemblies (hinge, dial, slider, push button), each with pivot, axis and movement limits. No per-instrument code is needed.
- **Touch detail mode:** Select a movable tool, expand its small context card, tap **Edit Detail**; only then do blue control points appear. Drag these directly. The same parts have optional precision +/- controls.
- **Mechanical behavior:** A part reaching its min/max can trigger validated state machine actions, including parameter changes. Triggered status updates are rehydrated from the server after a gesture.
- **MCP + web parity:** The ChatGPT widget now embeds the shared assembly transform engine used by the standalone tablet site. The scene remains in memory for the current session; no autosave or per-frame sync.

See [Macro/Micro Framework](docs/MACRO-MICRO-FRAMEWORK.md), [QA v0.8](docs/QA-V08.md), and [generic example](examples/articulated-demo.json). These mechanisms model rigid articulated equipment, not full flexible physics or clinical physiological correctness.

## Previous smart placement features (v0.7)


- **Automatic seating:** Drag the patient near a chair, release, and the patient adopts the `sitting` pose at the seat anchor. The support relationship remains attached to that chair.
- **Automatic lying:** Drag the patient near a bed, release, and the whole rig rotates into a real horizontal `lying` pose on the mattress anchor. The body skeleton is rotated in 3D (not just a text label).
- **Movable objects:** Grab and drag the body of a chair, bed, table or another movable prop. Large furniture has a full projected hit area, not merely a small center button. Existing Rotate controls still work; v0.8 additionally supports press-and-drag 3D rotation.
- **Dependents follow supports:** Moving or rotating furniture moves the patient supported on it. Equipment placed on a table follows that table. Detaching/moving an occupant away removes its support relationship; deleting a support clears references.
- **AI-created compatible furniture:** New asset definitions can declare `affordances` (`seat`, `bed`, `surface`), anchors, bounds, contact range, optional pose/yaw/height offsets, and `movable`. The core engine uses these descriptors for **any** custom asset ID. No separate hard-coded chair/bed handling is needed.
- **Safe equipment logic:** Existing finite-state behaviors support declarative `when` guards plus `set_parameter` / `adjust_parameter` effects over typed asset parameters. Invalid combinations are rejected at asset/behavior creation or update time; arbitrary generated JavaScript is never executed.
- **Canvas fallback polish:** A supported patient renders over the mattress in the 2D fallback; the primary WebGL renderer relies on actual 3D depth testing.

The resulting default scene is intentionally **temporary**. It resets when a new session is opened; movements are computed locally at animation-frame cadence and committed once when a drag ends so ChatGPT can read the current room. There is no permanent save, account storage, or constant per-frame networking.

## Start locally

Node.js 22+ required, no `npm install` necessary:

```bash
npm run check
npm test
npm start
```

Open `http://127.0.0.1:4173`. To verify the running HTTP/MCP pipeline in a separate terminal, use `npm run smoke`.

Use HTTPS to access the same app remotely from a tablet or when connecting to ChatGPT. See [deployment instructions](docs/DEPLOY.md) and [ChatGPT integration](docs/CHATGPT_SETUP.md).

## Touch controls

| Gesture | Result |
| --- | --- |
| Drag the patient's torso | Reposition patient freely; optional chair/bed snap on finger release |
| Drag torso near chair | Preview prompt; release to sit |
| Drag torso near bed | Preview prompt; release to lie flat |
| Drag the chair/bed/table surface | Move the entire item; any attached occupant/instrument follows |
| Drag hand/foot | 3D two-bone IK, length-preserving puppet posing |
| Drag a free instrument near a supporting surface | On release, set a validated resting-on relationship |
| Touch empty background | Orbit camera |
| Two fingers | Pinch zoom and pan camera; current pose remains committed |
| Hold on an object, then drag | Rotate whole character/furniture/instrument around yaw and pitch |
| Long hold before moving | Rotation; drag immediately to translate instead |
| Edit Detail on an articulated asset | Touch blue joints to move its named rigid components |
| Undo | Restore previous scene/support relationships |

Touch remains responsive without waiting for MCP while the finger is moving. The scene is an illustrative 3D sandbox; furniture contacts and poses are not clinically calibrated biomechanical or full physics simulations.

## Extending with ChatGPT

Use `create_asset` to make a procedural object with named anchors, movement flags, and optional placement affordances. Use `create_behavior` for safe state transitions, optional guards and parameter effects. Create the behavior first if the asset refers to its ID. Then use `spawn_asset`, `place_character`, `place_asset`, `move_entity`, or `rotate_entity` through `apply_scene_operations` with `baseRevision`.

Example JSON in [`examples/ai-chair.json`](examples/ai-chair.json), [`examples/ai-bed.json`](examples/ai-bed.json), and [`examples/ai-device-behavior.json`](examples/ai-device-behavior.json). The authoritative contract and limits are in [AI Affordances](docs/AFFORDANCES.md) and [Macro/Micro Framework](docs/MACRO-MICRO-FRAMEWORK.md).

`place_character` intentionally requires the target asset to declare a matching `seat` or `bed` affordance; `place_asset` requires a `surface` affordance. Unsupported interactions return an error rather than silently falling back to fake effects.

## Quality checks

- `npm test`: **69 passing tests** covering legacy functions and new placement, moved supports, scripted-free AI equipment properties, invalid metadata, rollback, undo, and MCP schema.
- `npm run smoke`: verifies live session + HTTP MCP, support-following bed placement, MCP creation of a generic articulated tool, and an actual `set_mechanism` update visible in tablet session state.
- Browser testing of the **new v0.8 UI could not be completed**: this execution environment blocks Chromium navigation (including localhost and file URLs) with `ERR_BLOCKED_BY_ADMINISTRATOR`. Old v0.7 browser screenshots do not prove v0.8 tactile UX. Inline widget JS is syntax-checked and engine touch gestures are tested programmatically.
- No screenshot from a real tablet is claimed for v0.8.

**Not yet verified:** actual iPad/Android GPU rendering, native multitouch latency, 60 FPS or device battery use. This source ZIP has not been published into the previously connected ChatGPT Site. The older installed MCP app is not automatically updated by distributing this ZIP.

## Deployment files

`Dockerfile`, `render.yaml`, `compose.yaml`, `compose.production.yaml`, `Caddyfile`, examples, server sources, web sources and automated tests are included. In public deployment set `API_TOKEN` and HTTPS. RAM-only sessions are process-local; a multi-worker host must provide session affinity or be limited to a single worker.

See [QA v0.8](docs/QA-V08.md), [Macro/Micro Framework](docs/MACRO-MICRO-FRAMEWORK.md), [QA v0.7](docs/QA-V07.md), [affordance API](docs/AFFORDANCES.md) and [architecture](docs/ARCHITECTURE.md).

### ChatGPT Sites

Bangun dengan `npm run build:sites`. Site memakai penyimpanan sementara bersama selama sesi aktif, dengan batas dua jam. Lihat [panduan deployment](docs/DEPLOY.md).
