# OSCE Playground v0.9 — Refined Tablet Sandbox & MCP Autosaved Environments

A lightweight, tablet-first 3D puppet sandbox for OSCE learning. **Touch posing is immediate and session-only. Environments explicitly created and edited by ChatGPT through MCP are automatically saved, can be reopened after restarting the server, and can be permanently deleted through MCP.** Those are deliberately different storage paths.

## What is implemented

- Direct drag of patient/doctor body and limb endpoints, 3D two-bone IK, camera orbit/pan/zoom and visible contextual **⟳ rotation handle** (no hidden long-press rotation). Tablet and embedded MCP view share the same renderer and touch code.
- Move/rotate furniture and props; seat/bed/support anchors allow a patient to sit or lie on compatible objects, and occupants follow the objects that support them. Surface placement uses release-time snapping with hysteresis to reduce jitter.
- Declarative 3D asset building through MCP: box/sphere/cylinder/capsule/cone/torus/tube, named parts, articulated rigid subassemblies, hinges, dials, sliders, buttons, anchors, seat/bed/surface affordances, state machines and safe parameter effects. Unsupported actions fail validation; AI-generated arbitrary JavaScript is not executed.
- Contextual pastel tablet UI with Add, Ask GPT and Practice. Basic user-visible catalog excludes legacy medical-demo assets whose visual toggles could misleadingly imply physiological function.
- **Persistent AI environment library:** create, list, read, open, rename, auto-save MCP edits, undo/redo saved edits and delete environments. Each saved environment is a validated, revisioned JSON blueprint in `ENVIRONMENT_DATA_DIR` on a persistent volume.
- **Temporary manipulation:** hand/foot/torso drag, camera, ordinary browser API edits and temporary scene undo/redo never auto-save the named blueprint. A new visit or server restart begins a fresh temporary session; a saved AI environment is reopened explicitly.
- No dependence on cloud AI calls for every touch frame. The standalone Ask GPT button prepares a prompt for the separately connected ChatGPT MCP app; it is not a fake embedded model.

## Run locally

Requires **Node.js 22+**, with **no third-party runtime npm dependencies**.

```bash
npm run check
npm test
npm start
```

Open `http://127.0.0.1:4173`. Run `npm run smoke` in another terminal for an HTTP/MCP integration check. To use a tablet on another device, deploy behind HTTPS as described in [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Persistent environments, transient gestures

| Action | Saved after server restart? |
| --- | --- |
| `create_environment` via MCP | **Yes**, as soon as the tool succeeds |
| `create_asset`, `create_behavior`, `apply_scene_operations`, `update_asset`, `update_behavior`, `reset_world` via MCP **with a saved environment loaded** | **Yes**, after validation and durable write |
| `rename_environment`, `undo_environment`, `redo_environment` | **Yes** |
| Tablet drag, camera, local scene API, temporary `undo_scene`/`redo_scene` | **No** — stays in RAM only |
| New session with no environment loaded | **No**, resets to starter room |
| `delete_environment` with `confirmed: true` | **Deletes** the saved blueprint; active temporary scene is not forcibly destroyed |

**Important:** make a world durable by calling `create_environment` (optionally passing a tablet `sessionId`), or `load_environment` before editing it. Merely using `open_studio` without an environment is a temporary scene. Every scene editing MCP tool needs an explicit `sessionId`; there is **no shared global fallback**. Read `get_world_state` before edits and use its `scene.revision` as `baseRevision` for atomic scene operations. Multi-tab stale writes fail with an environment revision conflict instead of overwriting another session.

Full usage: [`docs/ENVIRONMENTS.md`](docs/ENVIRONMENTS.md). ChatGPT connection: [`docs/CHATGPT_SETUP.md`](docs/CHATGPT_SETUP.md).

## Touch and visual UX

| Gesture | Result |
| --- | --- |
| Drag torso/body | Move character, optionally preview and snap onto compatible chair/bed on release |
| Drag wrists/ankles | Continuous 3D two-bone IK posing |
| Drag furniture/instrument | Move it; dependents keep their relative placement |
| Select character/object, then drag ⟳ | Rotate the **entire** entity without unintended translation |
| Drag empty viewport | Orbit the camera |
| Two fingers | Pan/zoom; current pose retained |
| Select articulated tool, choose Detail | Manipulate its declared internal mechanisms |
| Undo | Revert an in-session edit; saved environments have separate MCP `undo_environment` |

MCP modifications to an opened saved world are written in a **saved baseline**; they do not persist ad hoc tablet drags made in the same room. The app also keeps those touch changes visible during the live session when possible. Returning to the saved environment resets those local changes.

## Deploy, security and scope

- **Render**: [`render.yaml`](render.yaml) provisions one Docker service with a **persistent disk at `/app/data`**. `API_TOKEN` is generated. Verify the service accepts the MCP connection and that the persistent volume is mounted.
- **VPS**: `compose.production.yaml` + Caddy HTTPS + **named Docker volume** for `/app/data`. `compose.yaml` also has a local named data volume. Do not delete the Docker volume if environments must survive rebuilds.
- **Local MCP adapter**: `node server/stdio.js` supports the same 25 tools with newline-delimited JSON-RPC for simple local clients. ChatGPT's hosted integration uses the HTTPS `/mcp` endpoint.
- The built-in authorization model is **single-owner token-based**, not full multi-user identity management. Restrict the deployment to trusted users. Use one process and one writable environment directory; multiple replicas require a shared store, locking and affinity not included here.
- A working **old** ChatGPT Site/plugin is **not automatically updated** by deploying this ZIP. Publish/reconnect the owning Site's source and verify MCP version `0.9.0` and the environment tools in ChatGPT.
- The app is **not** a medically validated physiology, collision, force or soft-tissue simulation. Real tablet WebGL/multitouch latency and 60 FPS have not been established by automated browser tests.

QA including restart tests, disk-error rollback, actor isolation, and embedded UI checks: [`docs/QA-V09.md`](docs/QA-V09.md). Mechanical framework: [`docs/MACRO-MICRO-FRAMEWORK.md`](docs/MACRO-MICRO-FRAMEWORK.md). Asset specifications: [`docs/AFFORDANCES.md`](docs/AFFORDANCES.md).

### ChatGPT Sites

Jalankan `npm run build:sites`. Site memakai R2 untuk blueprint environment per akun dan sesi sementara. Lihat [panduan deployment](docs/DEPLOY.md).
