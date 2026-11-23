# Verified status — v0.2

## Implemented, real

- Tablet-friendly HTML 3D editor with viewport, orbit, pinch, pointer-controlled joints, scene tree, inspector, object move, assets, scenarios and autosave.
- Reusable AI-defined assets from 3D geometry primitives, validation and persistent catalog.
- Stateful behavior actions with geometry visual state, attach/detach/move effects.
- Single-owner backend, JSON persistence, undo/redo, conflict-safe revisions, export/import.
- MCP HTTP tools + actual MCP Apps HTML resource and in-chat interactive editor using the ChatGPT tool bridge.
- Dockerfile, persistent-volume Compose, Caddy HTTPS Compose, Render Blueprint, CLI smoke test.
- Automated tests for engine, storage, HTTP, MCP resource and object state transitions.

## Not yet verified / not implemented

- A real public deployed URL, ChatGPT Sites publication, or account-level MCP installation: requires authenticated hosting/ChatGPT Site access and user approval; unavailable in this session.
- Native iPad/Android gesture tests and production GPU performance benchmarking.
- Real user authentication/OAuth and multi-tenant data isolation; single-owner bearer secret only.
- Physiologically validated measurements, realistic soft tissue, detailed finger manipulation, clinical scoring, GLB generation, or physics/IK. These are excluded functionality, not mock controls.
- Official MCP SDK integration: this self-contained build implements the required JSON-RPC MCP tool/resource surface without npm dependencies. It has HTTP and simulated-ChatGPT bridge tests; verify with an actual ChatGPT host before relying on external compatibility.

Synthetic educational scenarios only; this product should not be used to judge clinical competency or substitute hands-on supervised OSCE training.
