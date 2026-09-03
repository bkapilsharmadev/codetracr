# HTTP API

The server in `packages/server` is a local explorer for one CodeTracr graph. It is not a multi-tenant hosted API.

Start it with `npm start`. Default origin: `http://127.0.0.1:8787`.

All graph routes are `GET`. CORS is open (`*`) because the UI is served from the same process or opened locally.

Unknown `?analyzer=` values are rejected. The only analyzer id is `codetracr`.

## UI

| Path | Response |
|------|----------|
| `/` or `/ui/` | Static UI from `packages/web` |

Build the UI first (`npm run build`) so `packages/web/dist/graph-view.js` exists.

## Meta

| Path | Response |
|------|----------|
| `/health` | `{ ok: true, analyzers: ["codetracr"] }` |
| `/config` | `repoRoot`, `sourceRoot`, `graphPath`, `editorScheme` |

`/config` includes absolute paths for the machine that is running the server. Do not expose this process on an untrusted network.

## Graph

Node ids in path segments must be URL-encoded.

| Path | Query | Response |
|------|-------|----------|
| `/nodes/search` | `q`, `limit` (default 20) | Symbol search hits |
| `/nodes/symbols` | `limit` (default 500) | Symbol list for the UI datalist |
| `/nodes/:id` | | One node, or 404 |
| `/nodes/:id/callers` | | Direct callers |
| `/nodes/:id/callees` | | Direct callees |
| `/nodes/:id/lineage` | `depth` (`0` or `unlimited` = no cap) | Lineage subgraph |
| `/nodes/:id/traces` | `depth` | Upstream and downstream traces |
| `/nodes/:id/impact` | `depth` (default 3) | Impact payload |
| `/nodes/:id/surface-impact` | `depth` | HTTP / table / Kafka / external buckets |

## Errors

| Status | When |
|--------|------|
| 404 | Unknown path or unknown node id |
| 405 | Non-GET (except `OPTIONS`) |
| 500 | Analyzer errors, including unknown `analyzer` query values |
