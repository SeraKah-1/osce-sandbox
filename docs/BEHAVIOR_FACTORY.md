# Instrument Factory: Verified Capabilities

Instrument geometry is a list of mesh parts (`box`, `sphere`, `cylinder`), each with a positive XYZ size, position and hexadecimal color. This is a procedural approximation, not automatic photo-to-3D or validated medical product CAD.

`create_behavior` creates a finite state machine, not executable JavaScript. It supports:

- `states`: up to 24 named states.
- `initial`: initial state.
- `transitions`: action `from → to` and a human-readable label, at most 100 transitions. The same action cannot occur twice from the same state.
- `effects`: at most 6 effects per transition; supported types are `attach` to an existing entity and anchor, `detach`, and `move` to an absolute XYZ position.
- `visuals`: per-state optional `{color: '#rrggbb', scale: 0.3..3}`. These values update the actual rendered instrument geometry.

Example:

```json
{
  "id":"example-light",
  "name":"Interactive training lamp",
  "states":["off","on"],
  "initial":"off",
  "transitions":[
    {"from":"off","action":"activate","to":"on","label":"Turn on"},
    {"from":"on","action":"deactivate","to":"off","label":"Turn off"}
  ],
  "visuals":{"on":{"color":"#f9da63","scale":1.1}}
}
```

Invalid geometry, unknown transitions, and non-whitelisted effects are rejected by the backend. `test_behavior` returns the effective state path and effects preview without modifying the scene. `validate_asset` and `validate_behavior` provide honest, non-writing validations. Failing operation batches roll back atomically.

**Limits:** no unrestricted scripting, no custom shaders, no import of generated GLB, no cloth/hose physics, no automatic heart sounds, no physiology or measured vital signs. Adding a new geometry/behavior primitive requires changing the engine source and deploying a new version. This limitation is explicit, rather than showing a fake enabled feature.
