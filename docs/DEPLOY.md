# Deploy OSCE Sandbox Studio v0.2

This repository contains one complete Node.js 22 server that serves (1) tablet-first PWA, (2) MCP Streamable HTTP endpoint, (3) MCP Apps interactive 3D HTML resource, and (4) JSON persistence. It does **not** include a public URL or authorization to deploy to your hosting account.

## Option A: Render Blueprint — HTTPS & persistent volume

1. Push repository files to a GitHub repository, retaining `render.yaml`, `Dockerfile`, `server/`, `web/`, `tests/` and `scripts/`.
2. In Render select **New → Blueprint**, connect the repository and apply `render.yaml`.
3. The blueprint uses a **Starter paid web service** with a 1 GB persistent disk. The platform generates `API_TOKEN` automatically. Note it securely from the service's environment settings. Do not put it in the Git repository.
4. Open the allocated `https://<your-render-domain>/health`, then the website's root `/`.
5. From your computer, verify via `STUDIO_URL=https://<your-render-domain> API_TOKEN=... npm run smoke`.
6. The MCP address is `https://<your-render-domain>/mcp` and the separate web-app URL is `https://<your-render-domain>/`.

The Render Blueprint is a **configuration**, not proof of deployment. Actual hosting requires the user's Render account and authorization. Disk-capable hosting is important: a container with ephemeral filesystem loses saved scenes after restarts. Do not add multiple service replicas without replacing the single-process in-memory engine with a transactional shared database.

## Option B: VPS with Docker Compose + Caddy HTTPS

1. Point a public DNS `A` record at your VPS and open ports 80/443.
2. Copy `.env.production.example` to `.env` and set the real `DOMAIN` and a random 64-character `API_TOKEN` (`openssl rand -hex 32`).
3. Run `docker compose -f compose.production.yaml up --build -d`.
4. Caddy obtains HTTPS certificates and proxies traffic to the private Node service.
5. Verify `https://YOUR_DOMAIN/health` and run the smoke test above.
6. Back up the named `osce-data` Docker volume frequently, not just the application source.

## Local test

```bash
npm test
npm run check
npm start
# Separate terminal:
npm run smoke
```

For local network access from an iPad/Android device use `HOST=0.0.0.0` and a strong token. Do not use open unencrypted Wi-Fi for sensitive data.

## Security scope

- Single-owner deployment: bearer token protects `/api/*` and `/mcp` and no other user isolation exists. Treat the token as an administrator secret.
- TLS is provided by Render or Caddy. Never expose the bare Node port on public internet without HTTPS.
- Bearer credentials entered on the tablet are kept only in tab session storage. The website itself is public, but changes and scene data require the token.
- This build is **not** a multi-tenant service or production OAuth authorization server. For public multi-user deployment, add per-user storage, OAuth, RBAC, rate limiting, audit logs, and database transactions.
- Use synthetic patients. Do not put protected health information in ChatGPT Sites; their policy prohibits it.
- No script code from ChatGPT is run. New tools are composed of validated geometry, finite state machines, and whitelisted effects.
