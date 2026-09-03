# CodeTracr architecture

## Layers

| Package | Role |
|---------|------|
| `@codetracr/engine` | Semantic analyzer: Tree-sitter AST → fail-closed CodeTracr graph JSON |
| `@codetracr/server` | HTTP API, lineage/traces, semantic blast-radius |
| `@codetracr/web` | Static UI: sidebar traces + Pixi lineage / flow / sequence |

The engine does not import the UI. The server loads a graph file; it does not re-parse source.

## Data flow

```text
source tree
        ↓
Tree-sitter facts
        ↓
symbol resolver + semantic rules
        ↓
codetracr-graph.json
        ↓
server graph model → search / lineage / UI
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
