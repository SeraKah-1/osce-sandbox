# ChatGPT Integration: MCP Tools + Interactive 3D App

The v0.3 server is **implemented and tested locally**. A previously connected OSCE plugin may already be present in the account, but downloading this archive **does not update that plugin or its Site**. ChatGPT must connect to a publicly available HTTPS endpoint or a supported secure tunnel. No hosting/ChatGPT credentials are embedded.

## Available server capabilities

- `POST /mcp`: stateless JSON-RPC MCP Streamable HTTP responses.
- MCP `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `ping`.
- Interactive UI resource `ui://osce-playground/studio.html` with MIME `text/html;profile=mcp-app`.
- `open_studio` tool has `_meta.ui.resourceUri` pointing to that UI resource, and returns the current scene.
- Widget uses `window.openai.callTool` when available to change the actual server scene; **no demo-only mutation pathway**. When opened via `/widget` as a browser preview, it uses the authenticated same-origin REST API instead.
- Model can create new geometry from box/sphere/cylinder parts, define behavior state machines with `effects` (attach/detach/move) and state-based `visuals`, then spawn and control them.

## Connect or update in ChatGPT (owner action required)

1. Deploy the server publicly on HTTPS (see `DEPLOY.md`), verify with `npm run smoke`.
2. Open **ChatGPT Plugins** on a supported web account/workspace and select **Add custom MCP server**.
3. Give it the URL `https://YOUR_DOMAIN/mcp` and name it **OSCE Sandbox Studio**.
4. Choose a supported authorization method and supply the configured bearer token as a secret where the UI supports this. The Node server requires `Authorization: Bearer <API_TOKEN>` for both MCP and API endpoints. If your host connection flow cannot store/use this credential type, use a supported OAuth-protected gateway or secure tunnel; do not remove the token to bypass authentication.
5. Review the discovered tools (including `open_studio`) and grant applicable permissions. Install/enable the plugin.
6. In a new ChatGPT conversation, invoke the plugin and ask **“Open OSCE Sandbox Studio and set up a shoulder examination scene.”** The `open_studio` tool opens the in-chat 3D UI; other tools control the same scene.

The current private Site-backed OSCE plugin already exists in the account, but it must be updated by publishing the corresponding Site with v0.3 source; creating a new plugin would duplicate it. The connector accessible in this session can read existing OSCE tools, not overwrite the Site source. Current official guidance places account/workspace restrictions on custom MCP servers, especially write actions. ChatGPT Sites is available to eligible personal Plus/Pro accounts, but cannot be created/published from this source archive without using ChatGPT **Work / Sites**. ChatGPT mobile apps currently do not provide the custom-server *connection setup* UI; use the web. Do not claim the plugin is installed until it is visible and tool calls work in the account.

## ChatGPT Sites: publish/update the **existing** Site

Use ChatGPT **Work** on web or Codex desktop, mention `@Sites`, supply the ZIP, and request a Site that preserves the project and MCP tool behavior. A Site owner must deploy/publish it. Sites-hosted plugins are created when that Site is published and have a separate install/connection step.

This project already contains both a working website and the MCP Apps UI resource, but the Site platform must accept and deploy the source/runtime. This conversation does not have an active Sites publishing tool, so no canonical ChatGPT Site URL has been created.

## Example model prompt

> Open OSCE Sandbox Studio. Get the world state and asset catalog. Make a patient with shoulder pain, arrange patient and doctor, and prepare a shoulder ROM exam. If a needed instrument is missing, define its geometry and reusable behavior with `create_behavior` and `create_asset`, then spawn it into the scene. Validate the results. Keep all clinical claims explicitly demonstrative, not physiologically verified.

## Local compatibility test

`STUDIO_URL=http://127.0.0.1:4173 API_TOKEN=... npm run smoke` exercises MCP initialization, tools, resource read, UI linkage, and shared world state without changing the scene.

References:
- https://developers.openai.com/plugins/build/app-quickstart
- https://developers.openai.com/plugins/build/chatgpt-ui
- https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
- https://help.openai.com/en/articles/20001547-hosting-a-plugin-with-chatgpt-sites
- https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites
