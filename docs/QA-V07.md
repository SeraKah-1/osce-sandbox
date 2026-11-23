# QA report — v0.7 Smart Placement & AI Affordances

## Verification performed

- `npm run check`: JavaScript source syntax checks.
- `npm test`: 56 automated tests, including pre-existing pose/session/MCP coverage plus new smart-placement tests.
- `npm run smoke`: live Node HTTP server, temporary session, MCP tool enumeration and resource, placement of the patient on a bed, movement of the bed, and readback of the moved patient. No mock MCP backend in the smoke test.
- Browser: real app source in an inline MCP-compatible browser harness with its HTTP calls bridged to a local test server because direct localhost navigation is blocked in the test environment. Add a chair, drag it, check the changed revision and position in server state. A patient laid on the bed remains visible using Canvas2D fallback. No unhandled JavaScript page errors observed in this flow.

## Specific new tests

| Area | Expected behavior |
| --- | --- |
| Seat placement | Patient approaches eligible chair, releases to sitting preset at seat anchor |
| Bed placement | Patient approaches eligible bed, releases into actual horizontal character rotation |
| Support following | Moving and rotating a chair/bed carries occupant; moving a table carries placed equipment |
| Custom asset | Newly created chair/bed/shelf uses metadata-based placement, no asset-name checks |
| Furniture drag | Touch picking uses full projected bounds rather than just object's center |
| Invalid metadata | Missing anchors, invalid placements and unsupported operations produce errors |
| Compatibility | Updating an asset cannot delete a support affordance still in use |
| Undo | Undo restores positions and support relationships coherently |
| Safe AI behavior | Guards and typed parameter effects work; incomplete parameter definitions reject on asset creation |
| MCP | Tool list describes updated affordances/placement, widget includes relevant client logic |

## Edge cases and safeguards

1. **Two possible supports nearby:** choose the nearest eligible anchor; snap only after finger release, with contextual preview.
2. **Support moved after placement:** dependent pose or equipment transform is recalculated from the moved support, avoiding floating occupants.
3. **Support deleted:** delete operation clears dependent references; neither patient nor equipment remains bound to a missing ID.
4. **Patient dragged away:** leaving the support clears `supportedBy` and returns to a standing preset when appropriate.
5. **Furnishing definition changed while occupied:** incompatible updates are rejected if a used affordance disappears.
6. **Incorrect AI tool parameter:** invalid action guards/effects referring to undeclared fields reject on creation/update.
7. **Concurrent MCP and tablet actions:** optimistic scene revision checks reject stale transactions; UI can recover from authoritative state.
8. **Session closed or server restarted:** scene resets; no persistent state should survive.
9. **WebGL blocked:** Canvas2D fallback remains available, with corrected painter order for a lying character on a bed.
10. **Contact and collision:** this release supports snap and attached transforms but **does not** prevent arbitrary body/mesh intersections.

## Not verified or intentionally not supported

No claim is made about real iPad or Android GPU quality, latency, 60/120 FPS, battery usage or native multitouch ergonomics. There is no clinical accuracy certification, physics-based lying/sitting or AI-generated arbitrary code execution. The previously installed ChatGPT Site is not automatically updated by this ZIP; publish and test the new Site separately. In tests, `Studio` can use optional storage for backwards-compatibility; production always constructs it with null file backing.
