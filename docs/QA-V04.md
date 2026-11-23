# QA — OSCE Playground v0.4 Direct Claymotion

Build scope: touch-controlled stop-motion-style posing, direct character/prop repositioning, shared gesture engine for WebGL and Canvas2D, and minimal selection HUD.

## Verified in this session

- `npm run check` passes syntax checks for server, MCP, app, renderer and new touch controller.
- `npm test` passes **32/32** automated tests, including seven direct-touch tests (wrist/ankle inverse posing, hit testing, patient translation, atomic pose transaction, second-finger rollback, and pointer cancellation rollback).
- `STUDIO_URL=http://127.0.0.1:43177 npm run smoke` passes on a locally running server: **18 MCP tools**, **one registered MCP App resource** and matching API/MCP scene revision.
- Browser execution using Chromium's `set_content` (direct navigation was blocked by administrator policy) and a test-only HTTP relay to the *real* local server produced no JavaScript exceptions. Canvas2D fallback loaded correctly. Dragging the patient's chest changed stored position and increased scene revision; dragging its wrist modified shoulder pose and increased revision again. These are not fake feature responses; the relay only bridges the test browser to the running application API.
- Generated embedded MCP HTML was parsed by Node `vm.Script` and includes the same touch controller as the standalone site.

## Edge cases and handling

| Situation | Handling |
|---|---|
| Thumb rests on puppet and another finger touches camera | Provisional pose is rolled back, then two-finger camera controls take over. No incomplete pose is saved. |
| Browser cancels a pointer | Provisional pose/position is reverted; no save operation occurs. |
| User drags hand beyond limb reach | IK approximates the requested point within configured joint limits; it does not stretch segments. |
| User drags body while model is near camera edge | Translation is projected to the floor plane and clamped to bounded world coordinates. |
| User drags asset attached to a puppet | Attached asset cannot be moved independently; it follows its anchor and can be detached in contextual actions. |
| In-flight MCP/API change updates the scene | Revision check prevents stale overwrites; conflicts show user feedback and reload. |
| Network unavailable during a multi-joint pose | Changed joints are queued/coalesced as one recoverable offline draft until network returns. |
| Local draft was saved in v0.3 | v0.4 checks the legacy draft key to avoid silently dropping pending work. |
| WebGL unavailable | Projected Canvas2D rendering and direct-touch controls continue, with reduced visual quality. |
| Old widget served by an existing ChatGPT Site | New ZIP does not hot-update an existing Site; needs hosted deployment and plugin verification. |

## Remaining verification limitations

- No physical iPad or Android multitouch/GPU profiling was performed.
- WebGL actual GPU rendering was not available in the browser-test environment; Canvas2D fallback was inspected instead.
- The screen-space IK is a pose-authoring aid, not anatomically validated inverse kinematics. Motion can pass through props and furniture: collision/bed snapping remains unimplemented.
- Dragging pose is currently direct, without recorded animation timeline, onion skinning, or physics. 'Freeze' means it stays in place after release.
- There is no claim that the installed ChatGPT Site uses v0.4 until the owner publishes the revised source.

## Human tablet acceptance checklist

1. Drag torso; patient should move and remain in place on release.
2. Drag wrist, elbow, ankle, and knee with one finger; joint chain should follow without requiring a slider.
3. Start a drag, place a second finger, pinch and pan; the provisional pose must revert without an unreported save.
4. Turn tablet from portrait to landscape during use; camera should reframe and selection should remain accessible.
5. Disconnect network while dragging, then reconnect; draft must not override a newer revision silently.
6. Reload app, undo one gesture, restart host, and confirm pose and revision persist.
7. Open through real ChatGPT MCP App and verify exact same operations before labeling a Site production-ready.
