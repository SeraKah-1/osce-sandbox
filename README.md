# OSCE Playground v0.6 — Direct 3D Puppet Posing

Tablet-first, pastel 3D sandbox for moving and posing doctor/patient puppets with one finger. The **same renderer, pose solver, touch controller, props, and UI** are packaged into a standalone web application and MCP App resource.

**No account or scene persistence.** Each visit opens a fresh in-RAM scene. Hand motion is computed locally, at most once per frame, without a server round trip. On releasing the finger, one final group of operations is sent to the temporary MCP scene so ChatGPT can inspect or edit it; a fresh visit resets everything.

## Improvements since v0.5

- **Real 3D two-bone IK** (`web/ik3d.js`): analytic shoulder–elbow–wrist and hip–knee–ankle solver. Bone lengths are fixed, bend direction is stabilized using a persistent pole, and joint angles are converted into the actual rig's local axes. Unsupported or unreachable poses are limited rather than stretching bones. The same solver powers WebGL and Canvas2D fallback.
- **Perspective-aware dragging:** screen touches intersect a camera-facing plane through the originally grabbed joint. No slider, joint-axis switch, or periodic networking is necessary. Elbow/knee drags position the middle joint directly.
- **Gesture handoff:** first finger directly drags; a second finger commits the current pose and starts pinch/pan **without rolling the character back**. Once one finger remains, it may orbit, but it will not unexpectedly resume manipulating the puppet. Pointer cancellation reverts only the unfinished single-finger edit.
- **Magnetic surfaces** (`web/placement.js`): instruments can snap onto the top of a bed/table; characters dragged onto a chair can be placed into the existing sitting pose. The candidate is shown while dragging but applied only on release to avoid sudden jumps mid-drag. This is **not** continuous collision detection or validated clinical body positioning.
- **Visual polish:** capsule segments now use 40 radial divisions and 14 cap rings, heads use 28×44 spheres, and major joints have size-aware rounded connections. A translucent **ghost pose** shows the original position only while dragging.
- **MCP App compatibility:** `server/widget.js` bundles the IK solver and placement engine along with touch and rendering code, not an old separate UI. Added a script-compilation regression test for the resulting HTML.
- **PWA cache:** updated to `v06`, including the new modules. Removing a temporary session does not depend on clearing browser storage.

## Run

Node.js 22+; no external npm runtime packages.

```bash
npm run check
npm test
npm start
```

Open `http://127.0.0.1:4173`. The server also provides `/health`, MCP at `POST /mcp`, and a minimal embedded preview at `/widget` (outside a supported host it is only a preview).

For HTTPS deployment: `Dockerfile`, `render.yaml`, and `compose.production.yaml`. See [deployment guide](docs/DEPLOY.md). After the server starts, run `npm run smoke` to check the MCP + session lifecycle.

## Direct touch controls

| Gesture | Behavior |
| --- | --- |
| Drag torso/hip | Move the whole puppet |
| Drag hand or ankle | IK poses two connected limb segments |
| Drag elbow or knee | Move middle joint with fixed upper-bone length |
| Drag free prop | Move the item; drop it on bed/table to snap when eligible |
| Drag person near chair | Drop to seat; pose becomes sitting |
| Drag empty space | Orbit camera |
| Two fingers | Pinch zoom and pan; existing pose remains committed |
| Release | Freeze final pose, one undoable change |
| Cancel single touch | Revert unfinished local drag |

## ChatGPT MCP

Connect the **deployed** HTTPS MCP endpoint to an authorized ChatGPT app, and use `open_studio` for a new session; pass a session ID from the tablet's **Ask GPT** instructions when addressing that same tablet world. Read `get_world_state` and use `baseRevision` for changes. Custom assets and behavior state machines can be created with schema validation; not arbitrary JavaScript execution. `save_scene` is intentionally unavailable.

A previously connected v0.5 ChatGPT Site will **not** automatically run these files. Verify `/health` shows `version: 0.6.0` and `persistence:false` before assuming your installation was updated. See [ChatGPT setup](docs/CHATGPT_SETUP.md).

## What this is not

- Not a clinical biomechanics simulator: no collision solver for whole bodies, tissue deformation, forces, or automatic assessment of exam correctness.
- Not a physics-based clay material simulation: **claymotion** means freeze-and-pose interaction.
- Not fully tested on a physical iPad/Android device. CI/node tests and a headless Chromium browser using **Canvas2D fallback** verified the touch and core UI path. Real GPU WebGL quality, battery use, latency, high-refresh screens and accessibility must be checked on target hardware.
- Not a public multi-user service out of the box: bearer-token access is single-owner, and RAM sessions are process-local. Protect your domain and do not upload identifiable patient data.

See [architecture](docs/ARCHITECTURE.md), [v0.6 QA](docs/QA-V06.md), and [prior v0.5 QA](docs/QA-V05.md).
