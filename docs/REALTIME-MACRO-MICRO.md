# v1.0 — Realtime tablet interaction and Macro–Micro framework

## Two independent paths

- **Tablet transient scene:** pointer events update locally. Posing runs at rendering cadence; no API request for each pointermove. Prop creation and simple scene actions first project a validated intent into a local scene; an ordered background queue sends operations to the session. The UI indicates *memeriksa* until validated.
- **Server-authoritative transient session:** the operation endpoint uses `baseRevision`. On a write conflict/rejection/time-out, the client fetches the authoritative snapshot after its queued operations are finished; a rejected optimistic object is removed. If reconciliation cannot complete, the UI reports the error and exposes manual reconnect/refresh instead of falsely reporting success.
- **Persistent GPT environment:** the saved blueprint is written only for environment changes performed through MCP against an explicitly attached environment. Tablet gestures and the ordinary browser scene endpoint remain transient.

No storage layer can make physically zero input latency. Smoothness still depends on the device's refresh rate, GPU, touch hardware and scene complexity. The architecture removes network latency from immediate visible feedback, not from server confirmation.

## Macro–Micro contract

- **Macro:** drag and rotate an object's root transform, attach to hands, place on tables and use seat/bed anchors.
- **Micro:** enter *Gunakan alat* for an articulated asset. Other scene entities are hidden in this mode. A visible mechanism marker responds to direct touch; accessible ± controls remain available as a precision fallback. The same `set_mechanism` operation updates 3D geometry and the server state after the gesture.
- **Learning:** assets can provide an optional `learning` object with an ordered list of checkable goals, each tied to an actual mechanism value, action, status, parameter, or attachment. This is a mechanism tutorial; it is **not** a validated physiological or clinical technique grading system.

Example custom learning data (to be included in a valid asset with an existing `arm` mechanism):

```json
{
  "learning": {
    "title": "Latihan engsel",
    "note": "Memeriksa perubahan mekanisme 3D, bukan kualitas klinis.",
    "steps": [
      {
        "id": "open-arm",
        "instruction": "Buka lengan hingga sekitar 30 derajat.",
        "condition": {
          "kind": "mechanism_range",
          "mechanismId": "arm",
          "min": 28,
          "max": 32
        }
      }
    ]
  }
}
```

Supported `condition.kind`: `mechanism_range`, `action`, `status`, `parameter_range`, `attached`, `detached`. Learning steps do not execute arbitrary JavaScript. The engine validates referenced mechanisms, ranges, identifiers, and available behavior actions. Unsupported definitions are rejected rather than displayed as fictitious capabilities.

## Built-in working example

The *Goniometer mekanis* contains separate fixed and moving arms, a rotating 3D hinge, and three learning checkpoints: approximately 30°, 90°, and back to 0°. Angle comes from `controls['arm-angle']`. Users can drag the mechanism marker or use ± steps. The reference lesson checks the ordered state changes, not the alignment of the instrument with a real patient's anatomy.

## Feedback

- Immediate local visual change for Add, pose, macro and micro operations.
- `Langsung di tablet · memeriksa` while confirmation is outstanding.
- Confirmation changes the session revision without forcing a full render reload on every action.
- Reconciliation is triggered by validation failure, behavior effects that need the authoritative server result, or changes received from ChatGPT.
- Failure shows a recoverable message. It is never silently converted into success.

## Tested and not tested

Tests verify transient/persistent storage separation, validated learning schema, goniometer mechanism progression, local optimistic projection, embedded UI generation, and HTTP/MCP integration. A browser UI check used a **simulated MCP host** to introduce 1.4-second response latency and forced a server rejection. It verified that the new object appeared before the response and disappeared after the authoritative state was fetched. This is not a network performance benchmark.

**Unverified:** physical tablet GPU performance, touch latency, multi-touch ergonomics, true WebGL draw quality on iPad/Android, and final ChatGPT Site publication. Deploy on one instance with durable environment storage and run device-specific QA before production use.
