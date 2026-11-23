# OSCE Sandbox Studio v0.2 — deploy-ready code + MCP Apps 3D

**Tablet-first OSCE practice sandbox, with a browser website and a functional MCP Apps 3D widget intended for ChatGPT.** Doctors and patients are draggable articulated 3D characters; instruments can be positioned, attached and operated with validated state machines. ChatGPT can configure the same scene through MCP, create procedural instrument blueprints and give them safe, executable interaction rules.

> **What this ZIP means:** deployable and tested source code, NOT a live website, not a connected ChatGPT plugin, not a physiologically validated OSCE simulator. See [STATUS.md](docs/STATUS.md).

## Start immediately

Requires Node.js **22+**. No `npm install` required.

```bash
npm test
npm run check
npm start
```

Open the **tablet website** at http://127.0.0.1:4173. Preview the **in-ChatGPT widget** locally at http://127.0.0.1:4173/widget. Run `npm run smoke` to test MCP resources, tools, UI, state sharing and health. For a real public deployment use [DEPLOY.md](docs/DEPLOY.md).

## Features that work

- 3D WebGL scene with Canvas fallback, tablet gestures, 2 jointed human characters, editable pose and object transforms.
- Catalog of 10 built-in tools/furniture objects, scenario templates, manually marked OSCE checklist and persisted state.
- Builder: create reusable custom instruments from box/sphere/cylinder 3D parts and anchors; add interaction logic with explicit state machine actions and visual/effect changes.
- Attach to doctor/patient hand and body anchor, detach, move/rotate, save/export/import, undo/redo.
- **17 MCP tools**, including `open_studio` that displays a real MCP Apps UI widget inside ChatGPT when a compatible host connects. Tools can create assets/behaviors, apply scene operations and test their logic.
- Atomic revisions prevent competing ChatGPT/tablet edits from silently overwriting changes. An instrument's status, position and visibility properties are saved server-side.
- Token-protected API/MCP for one trusted owner, container packaging, persistent volume, Caddy/Render HTTPS blueprints, self-check scripts and engine tests.

## ChatGPT and hosting

- **MCP endpoint:** `POST https://YOUR_DOMAIN/mcp` (after hosting)
- **ChatGPT widget resource:** `ui://osce-sandbox-studio/interactive.html`, `text/html;profile=mcp-app`
- **Open tool:** `open_studio`
- **Tablet website:** `https://YOUR_DOMAIN/`

Read [CHATGPT_SETUP.md](docs/CHATGPT_SETUP.md) for exact plugin setup and ChatGPT Sites path. A URL on your own domain is **not** automatically a ChatGPT Site; Sites must be created/deployed in the account's Work/Sites interface. A ChatGPT plugin cannot connect to `localhost` from OpenAI's servers.

## Security and realism boundaries

No arbitrary AI-generated JavaScript execution; tool creation uses validated geometry and behavior primitives only. Only one owner/token supported. Not for protected patient records. OSCE cases and instrument effects are visual/procedural examples, not validated physiology or technical skill grading. See [BEHAVIOR_FACTORY.md](docs/BEHAVIOR_FACTORY.md) and [STATUS.md](docs/STATUS.md).

## Code layout

```text
server/core.js            Data model, persistence, safe asset/behavior engine
server/index.js           HTTPS-ready HTTP endpoint behind proxy
server/mcp.js             MCP tools, JSON-RPC tools/resources
server/widget.js          Packages 3D widget as a self-contained MCP UI resource
web/                      Tablet site + WebGL/Canvas renderer + widget assets
scripts/smoke-test.mjs    Deployment/MCP health smoke test
tests/                     Unit and HTTP/protocol tests
render.yaml                Render Blueprint (paid disk-backed)
compose.production.yaml   VPS Caddy HTTPS reverse proxy + persistent volume
docs/                     Deployment, ChatGPT, schema, status
```
