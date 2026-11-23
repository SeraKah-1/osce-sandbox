# AI Affordance / Behavior Contract (v0.7)

An **affordance** says what interaction an object supports. A support role belongs to the **asset definition**, not its name or category. `seat`, `bed`, and `surface` support different uses. An asset may expose more than one role.

The term "realtime" refers to local UI mutation during a drag. Server/MCP commits happen on finger release and use optimistic revision checks. No permanent scene persistence.

## Data contracts

`create_asset`: `id`, `name`, `parts[]` (`box`, `sphere`, `cylinder`), `anchors[]`, `movable` (boolean, defaults true), `affordances[]` (maximum 12), `parameters` (up to 20 typed properties) and optional `behaviorId`.

Each affordance is:

- `{ "id": "sit", "kind": "seat", "anchor": "seat", "radius": 0.7, "pose": "sitting", "yawOffset": 0 }`
- `{ "id": "lie", "kind": "bed", "anchor": "mattress", "radius": 1.2, "pose": "lying", "yawOffset": 1.57079632679, "heightOffset": 0.18 }`
- `{ "id": "top", "kind": "surface", "anchor": "tray", "halfExtents": [0.5, 0.3] }`

`radius` is a proximity acceptance range in the XZ ground plane. `halfExtents` is a pair of rectangular half-width/half-depth values around the surface anchor, in local asset coordinates. `yawOffset` is in radians. `heightOffset` adjusts the visual character anchor vertically. Height defaults to ~0.18m above the mattress for the bed role, otherwise zero. These are sandbox visual coordinates, not biomedical measurements.

When moving the character, the app finds the closest eligible affordance in its snap radius and **only places it on release**, not during every drag event. The scene records `supportedBy` on characters and `restingOn` on instruments. Changing the support position or yaw recomputes dependent world transforms. An undoable server operation is `place_character` with `{entityId,supportId,affordanceId}` or `place_asset` with `{entityId,supportId,affordanceId,localOffset:[x,y,z]}`.

If the support is removed, placement references are removed. The current pose can remain, but the instrument/character is no longer tied to non-existent furniture. If the patient is dragged away from a chair/bed, the UI returns it to the default standing pose on release; direct limb posing remains possible without support.

## Safe behavior logic

The existing behavior engine supports `states`, `initial`, `transitions`, and optional `visuals`. A transition may add `when` guards and `effects`:

```json
{
  "from": "ready",
  "action": "press",
  "to": "ready",
  "label": "Press",
  "when": [{ "key": "power", "operator": "gte", "value": 1 }],
  "effects": [{ "type": "adjust_parameter", "key": "power", "delta": -1, "min": 0, "max": 10 }]
}
```

Supported guard operators: `eq`, `gte`, `lte`; supported effect types: `attach`, `detach`, `move`, `set_parameter`, `adjust_parameter`. Parameter values must be finite numbers, booleans or short strings; no code execution, external URLs, network effects or arbitrary expressions. A behavior cannot refer to undeclared or type-incompatible asset parameters. Existing instances are protected against incompatible updates. State visuals support color/scale changes.

**This is a declarative basic logic system, not a full simulator.** Modeling an unfamiliar medical instrument with new physical processes still requires additional vetted engine primitives or a validated simulation layer.

## AI instructions

1. Read `get_world_state` / `get_asset_catalog` to obtain valid IDs and current `revision`.
2. Create/validate a behavior first if necessary.
3. Create/validate an asset, including anchors and relevant affordances.
4. `preview_scene_operations` for multi-object edits; if accepted, apply the same batch against the same `baseRevision`.
5. Verify the returned scene and behavior states. If unsupported, report the missing primitive instead of inventing a working effect.

See `examples/ai-chair.json`, `ai-bed.json`, and `ai-device-behavior.json`.
