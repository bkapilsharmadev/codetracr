# Getting started

Requires **Node.js >= 22.12**.

## Fixture UI

From the repository root:

```powershell
npm install
npm run poc
npm run build
npm start
```

Open http://127.0.0.1:8787/ui/ and search for `OrderService.create` (Fastify/SQL fixture) or `orders.created` / `OrderEventPublisher.publish` (Kafka fixture).

`npm start` loads the first generated graph it finds, preferring the Kafka fixture. Build graphs first with `npm run poc` or `npm run generate`.

If port 8787 is already in use:

```powershell
$env:CODETRACR_PORT = "8788"
npm start
```

## Analyze another tree

```powershell
npm run analyze -- --source <dir> --out <dir>
```

That writes `codetracr-graph.json`, a facts summary, and a provenance report. Pass `--write-facts` for a full Tree-sitter fact dump.

Then point the UI at that graph:

```powershell
$env:CODETRACR_GRAPH = "<dir>\codetracr-graph.json"
$env:CODETRACR_SOURCE_ROOT = "<source-root>"
npm start
```

`CODETRACR_SOURCE_ROOT` should be the tree you analyzed so “Open in editor” links resolve.

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `CODETRACR_PORT` / `PORT` | `8787` | HTTP port |
| `CODETRACR_GRAPH` | first generated engine graph, Kafka first | Path to `codetracr-graph.json` |
| `CODETRACR_SOURCE_ROOT` | inferred from the graph path for fixtures | Source root for editor links |
| `CODETRACR_EDITOR_SCHEME` | `vscode` | `vscode` or `cursor` editor URL scheme |

## What the UI shows

- **Lineage** — blast-radius graph around a symbol
- **Flow** — a linear path through that subgraph
- **Sequence** — source-ordered calls in the selected subgraph; Kafka publish/consume is drawn as an async boundary, not a synchronous call

Sequence numbers are source order, not guaranteed runtime order.
