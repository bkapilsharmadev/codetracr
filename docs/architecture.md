# CodeTracr architecture

## Layers

| Package | Role |
|---------|------|
| `@codetracr/engine` | Core: Tree-sitter facts, resolution, semantic rules, graph construction, lineage/traces/surface-impact |
| `@codetracr/server` | Application + adapters: Fastify HTTP, `GraphService`, `GraphRepository` (JSON today) |
| `@codetracr/web` | Static UI: sidebar traces + Pixi lineage / flow / sequence |

The engine does not import the UI or HTTP stack. The server does not re-parse source.

## Data flow

```text
source tree
        ↓
engine: parser → resolver → semantic rules → graph model
        ↓
codetracr-graph.json
        ↓
server: JSON adapter → GraphRepository → GraphService
        ↓
engine: lineage / traces / surface-impact
        ↓
Fastify HTTP → UI
```

The graph is owned and constructed by CodeTracr. There is no Graphify (or other external graph) backend.

Semantic analyzers currently cover Fastify routes, a narrow SQL/`pg`/Drizzle set, KafkaJS static topics, constructor injection, and conditional factories. Edges are emitted only when a rule can prove them. Unresolved calls stay unresolved.

Blast radius is derived from semantic nodes (`HTTP_ENDPOINT`, `DATABASE_TABLE`, `EVENT_TOPIC`).

Sequence diagrams are computed in the UI from call occurrences and semantic edges. They are not stored as a separate artifact. Numbering is source order, not guaranteed runtime order.

## UI modules

| File | Role |
|------|------|
| `app.js` | Search, API client, sidebar, graph orchestration |
| `src/graph-view.js` | `LineageGraphView` — layout, draw, highlights (esbuild → `dist/graph-view.js`) |
