# CodeTracr learning guide

A walkthrough of everything CodeTracr implements today — for reviewing the system after vibe-coding, and for learning the graph ideas behind it.

You do **not** need prior graph-theory experience. Each concept is introduced with a tiny example, then tied to real CodeTracr code and fixtures.

---

## Table of contents

1. [What problem CodeTracr solves](#1-what-problem-codetracr-solves)
2. [Big picture architecture](#2-big-picture-architecture)
3. [Graph basics (crash course)](#3-graph-basics-crash-course)
4. [CodeTracr’s three “models”](#4-codetracrs-three-models)
5. [Phase A — Building the graph (engine)](#5-phase-a--building-the-graph-engine)
6. [Phase B — Storing the graph (JSON)](#6-phase-b--storing-the-graph-json)
7. [Phase C — Serving the graph (server)](#7-phase-c--serving-the-graph-server)
8. [Phase D — Exploring in the UI](#8-phase-d--exploring-in-the-ui)
9. [Worked example: golden-poc (HTTP → SQL)](#9-worked-example-golden-poc-http--sql)
10. [Worked example: kafka-poc (async)](#10-worked-example-kafka-poc-async)
11. [Analysis algorithms (lineage, traces, surface impact)](#11-analysis-algorithms-lineage-traces-surface-impact)
12. [Certainty: DEFINITE vs POSSIBLE](#12-certainty-definite-vs-possible)
13. [Fail-closed philosophy](#13-fail-closed-philosophy)
14. [Package map and “who owns what”](#14-package-map-and-who-owns-what)
15. [Commands cheat sheet](#15-commands-cheat-sheet)
16. [Glossary](#16-glossary)
17. [Suggested learning path](#17-suggested-learning-path)

---

## 1. What problem CodeTracr solves

When you change a function, you want to know:

- **Who calls me?** (upstream / blast radius toward the outside world)
- **What do I call?** (downstream / what I touch)
- **Do I affect an HTTP API, a DB table, or a Kafka topic?**

CodeTracr answers that by building a **semantic graph** from source (not by guessing at runtime), then querying that graph in a browser.

```text
  “If I change OrderService.create, what breaks?”

        POST /api/v1/orders
                │ HANDLES
                ▼
        OrderController.create
                │ CALLS
                ▼
        OrderService.create   ← you are here
                │ CALLS
                ▼
        OrderRepository.save
                │ WRITES
                ▼
             orders (table)
```

**Status:** public beta 0.1.0. Incomplete on purpose: if a relationship cannot be *proved* from source, it stays **unresolved** rather than invented.

---

## 2. Big picture architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                         CodeTracr                                │
│                                                                  │
│   packages/engine          packages/server         packages/web  │
│   ───────────────          ───────────────         ────────────  │
│   CORE                     APPLICATION +           LEGACY UI     │
│   parse · resolve ·        ADAPTERS                              │
│   semantic · graph         Fastify HTTP                          │
│   algorithms               GraphService                          │
│                            JSON repository                       │
└─────────────────────────────────────────────────────────────────┘

Dependency rule (important):

    server  ──►  engine     ✅
    engine  ──►  server     ❌  never

    web     ──►  HTTP API only (no engine imports)
```

End-to-end data flow:

```text
  Source files (.ts)
        │
        ▼
  ┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
  │  Tree-sitter│────►│   Symbol     │────►│ Semantic rules  │
  │  facts      │     │   resolver   │     │ Fastify/SQL/... │
  └─────────────┘     └──────────────┘     └────────┬────────┘
                                                     │
                                                     ▼
                                           codetracr-graph.json
                                                     │
                                                     ▼
                                           JsonGraphRepository
                                                     │
                                                     ▼
                                              GraphService
                                           (+ engine lineage)
                                                     │
                                                     ▼
                                              Fastify routes
                                                     │
                                                     ▼
                                                 Browser UI
```

---

## 3. Graph basics (crash course)

A **graph** is a set of **nodes** (things) connected by **edges** (relationships).

| Everyday word | Graph word | CodeTracr example |
|---------------|------------|-------------------|
| Thing | Node / vertex | `OrderService.create` |
| Arrow / link | Edge | `CALLS` from service → repository |
| Follow arrows | Walk / traverse | Lineage walk upstream + downstream |

CodeTracr’s graph is **directed**: edges have a direction.

```text
  A ──────► B          means: A relates to B (e.g. A CALLS B)
```

### Incoming vs outgoing

From the point of view of node **B**:

```text
  A ──CALLS──► B ──CALLS──► C

  Incoming to B:  A → B   (callers of B)
  Outgoing from B: B → C  (callees of B)
```

In the repository API:

- `getIncomingEdges(B)` → edges that point **to** B  
- `getOutgoingEdges(B)` → edges that leave **from** B  

### Upstream vs downstream

Relative to a **selected** symbol (the target):

```text
  upstream  = toward callers / entry points (who depends on me?)
  downstream = toward callees / effects (what do I touch?)

  [HTTP] → [controller] → [TARGET] → [repo] → [table]
   ◄──────── upstream ────┘└──── downstream ────────►
```

### Hop

A **hop** is one edge step from the target:

| Hop | Meaning |
|-----|---------|
| `0` | The selected node |
| `-1` | One step upstream |
| `+1` | One step downstream |
| `-2`, `+2`, … | Farther away |

Lineage nodes in CodeTracr carry a `hop` field for layout and filtering (`max depth`).

### Depth

`depth` on API/UI caps how far walks go.

- `depth=3` → at most 3 hops each direction  
- `depth=0` or `unlimited` → no hop cap (see server `parseDepth`)

### Path

A **path** is an ordered list of node ids, e.g.:

```text
  http:POST:/api/v1/orders
    → method:...#OrderController.create
    → method:...#OrderService.create
```

Traces and lineage both talk about paths; they differ in how they present them (see [§11](#11-analysis-algorithms-lineage-traces-surface-impact)).

---

## 4. CodeTracr’s three “models”

Keeping these separate is intentional:

```text
  ┌──────────────────┐
  │  Graph model     │  What the analyzer writes to JSON
  │  CodeTracrNode   │  type: METHOD, HTTP_ENDPOINT, …
  │  CodeTracrEdge   │  type: CALLS, HANDLES, …
  │  + provenance    │
  └────────┬─────────┘
           │  loaded & normalized by JsonGraphRepository
           ▼
  ┌──────────────────┐
  │  Query model     │  What algorithms / GraphService use
  │  GraphNode       │  label, kind, file, line, raw
  │  GraphEdge       │  relation, certainty, occurrences
  │  (engine/graph/  │
  │   query-model.ts)│
  └────────┬─────────┘
           │  wrapped in HTTP JSON responses
           ▼
  ┌──────────────────┐
  │  HTTP model      │  Query strings, response envelopes
  │  ?q=&limit=&depth│  { analyzer, results, … }
  │  (server adapters│  FastifyRequest stays HERE only
  │   /http/…)       │
  └──────────────────┘
```

**Rule of thumb:** Fastify request types must never appear in `packages/engine`.

---

## 5. Phase A — Building the graph (engine)

### Pipeline inside `buildCodeTracrGraph`

Located in `packages/engine/src/graph/codetracr-model.ts`.

```text
  ParsedFile[]  (from Tree-sitter)
        │
        ├─► SymbolResolver          — map expressions → symbol ids
        ├─► analyzeFastify          — HTTP_ENDPOINT + HANDLES
        ├─► analyzeSql              — DATABASE_TABLE + READS/WRITES
        ├─► analyzeDependencyInjection — IMPLEMENTS / INJECTED_WITH / RESOLVES_TO
        ├─► analyzeConditionalFactories — DEFINITE vs POSSIBLE_RESOLUTION
        └─► analyzeKafka            — EVENT_TOPIC + PUBLISHES / CONSUMED_BY
        │
        ▼
  CodeTracrGraph { nodes, edges, unresolved }
```

### What Tree-sitter contributes

Tree-sitter turns source into **facts** (AST-level observations): imports, classes, methods, calls, strings, etc. It does **not** decide “this call hits OrderRepository.save” by itself — the **symbol resolver** and **semantic rules** do.

Think of it as:

| Layer | Job |
|-------|-----|
| Parser | “There is a call expression on line 12” |
| Resolver | “That call’s receiver is `this.repository` of type `OrderRepository`, method `save`” |
| Semantic rule | “This Fastify `app.post` registers `POST /orders` handled by `controller.create`” |

### Node types you will see

| `NodeType` | Meaning | Example id / name |
|------------|---------|-------------------|
| `METHOD` / `FUNCTION` | Code symbol | `method:src/service.ts#OrderService.create` |
| `CLASS` / `INTERFACE` / `MODULE` | Structure | module / class nodes |
| `HTTP_ENDPOINT` | HTTP surface | `http:POST:/api/v1/orders` |
| `DATABASE_TABLE` | Table surface | `table:orders` |
| `EVENT_TOPIC` | Messaging surface | topic `orders.created` |

### Edge types you will see

| `EdgeType` | Meaning |
|------------|---------|
| `CALLS` | Method/function calls another |
| `HANDLES` | HTTP endpoint → handler method |
| `READS` / `WRITES` | Code ↔ table |
| `PUBLISHES` / `CONSUMED_BY` | Code ↔ Kafka topic |
| `IMPORTS` | Module imports |
| `IMPLEMENTS` / `INJECTED_WITH` / `RESOLVES_TO` | DI |
| `POSSIBLE_RESOLUTION` | Uncertain factory resolution |
| `DEPENDS_ON` | Soft dependency edge |

### Provenance (why an edge exists)

Every edge carries **provenance**:

```text
  provenance: {
    evidence: [{ provider: "treesitter", file, line, column }],
    derivation: { kind: "semantic-rule", rule: "fastify-route" },
    confidence: 1,
    certainty: "DEFINITE" | "POSSIBLE",
    occurrences?: [{ line, column, order, sourceRange }]  // for sequence view
  }
```

**Occurrences + `order`** = source order of call sites inside one owner method. The UI Sequence view uses this; numbering is **source order**, not guaranteed runtime order.

### How generation is triggered

```powershell
npm run generate   # builds golden, factory, DI, kafka, and combined graphs
npm run poc        # generate + engine tests
```

Golden alone is driven by `packages/engine/src/run.ts`:

```text
  fixtures/golden-poc/src
        → parseFixture
        → buildCodeTracrGraph
        → generated/golden/codetracr-graph.json
```

Combined default for the UI:

```text
  all four POC fixtures (namespaced paths like golden-poc/src/...)
        → generated/all/codetracr-graph.json
```

---

## 6. Phase B — Storing the graph (JSON)

Today the **only** durable store is a file:

```text
  generated/
    golden/codetracr-graph.json
    kafka/codetracr-graph.json
    factory/...
    interface-di/...
    all/codetracr-graph.json      ← preferred by npm start
```

`generated/` is gitignored. Regenerate before `npm start` if missing.

Shape (simplified):

```json
{
  "nodes": [
    {
      "id": "method:src/service.ts#OrderService.create",
      "type": "METHOD",
      "name": "OrderService.create",
      "file": "src/service.ts",
      "line": 6,
      "evidence": [{ "provider": "treesitter", "file": "src/service.ts", "line": 6 }]
    }
  ],
  "edges": [
    {
      "from": "method:src/service.ts#OrderService.create",
      "to": "method:src/repository.ts#OrderRepository.save",
      "type": "CALLS",
      "provenance": { "certainty": "DEFINITE", "confidence": 1, "evidence": [], "derivation": {} }
    }
  ],
  "unresolved": []
}
```

There is **no SQLite / Postgres / Neo4j yet**. The server’s `GraphRepository` port exists so those can be plugged in later without rewriting routes.

---

## 7. Phase C — Serving the graph (server)

### Layout (lightweight hexagonal)

```text
packages/server/src/
  application/
    graph-service.ts          ← use-cases: search, lineage, …
  ports/
    GraphRepository.ts        ← storage contract
  adapters/
    http/fastify/
      app.ts, routes/…        ← HTTP only
    persistence/
      json/JsonGraphRepository.ts
      create-graph-repository.ts
  config.ts, paths.ts, server.ts
```

### Request flow

```text
  Browser
    │  GET /nodes/search?q=OrderService.create
    ▼
  Fastify route
    │  does NOT open JSON files
    ▼
  GraphService.search()
    │
    ▼
  GraphRepository.findNode()
    │
    ▼
  JsonGraphRepository  (in-memory maps loaded at startup)
```

For lineage:

```text
  GraphService.lineage(id)
    │  loadTraversalMaps via getIncoming/OutgoingEdges
    ▼
  engine buildLineageGraph + rankLineagePaths
    │
    ▼
  JSON response { analyzer, nodes, edges, paths, stats, … }
```

### Repository contract

```typescript
interface GraphRepository {
  getNode(id: string): Promise<GraphNode | null>;
  getNodes(ids: string[]): Promise<GraphNode[]>;
  getOutgoingEdges(nodeId: string, limit?: number): Promise<GraphEdge[]>;
  getIncomingEdges(nodeId: string, limit?: number): Promise<GraphEdge[]>;
  findNode(query: string, limit?: number): Promise<GraphNode[]>;
}
```

Limits matter for a future SQL backend:

| Call site | Typical limit |
|-----------|----------------|
| `/callers`, `/callees` | 50 (`DEFAULT_NEIGHBOR_LIMIT`) |
| Lineage/traces walk | 500 edges per node (`DEFAULT_TRAVERSAL_EDGE_LIMIT`) |
| `findNode` without limit | Uncapped (OK for small JSON graphs) |

### Startup

`packages/server/src/server.ts`:

1. Resolve `CODETRACR_GRAPH` (or pick `generated/all/...`)  
2. `createGraphRepository({ graphPath })` → JSON adapter  
3. `buildApp({ repository, config })` → Fastify  
4. Listen on `8787` (or `CODETRACR_PORT`)  
5. Serve static UI from `packages/web`

---

## 8. Phase D — Exploring in the UI

```text
  http://127.0.0.1:8787/ui/
```

Typical interaction:

```text
  1. Page load
        GET /config          → sourceRoot, editor scheme
        GET /nodes/symbols   → datalist suggestions

  2. Type “OrderService.create”
        GET /nodes/search?q=...&limit=30

  3. Select a hit
        GET /nodes/{id}/lineage?depth=…
        GET /nodes/{id}/traces?depth=…
        GET /nodes/{id}/surface-impact?depth=…

  4. Views
        Lineage  — full subgraph around the symbol
        Flow     — one ranked path through that subgraph
        Sequence — source-ordered calls (+ Kafka async divider)
```

The UI never reads `codetracr-graph.json` directly.

---

## 9. Worked example: golden-poc (HTTP → SQL)

### Source (simplified)

```text
  fixtures/golden-poc/src/
    routes.ts       app.post("/orders", controller.create)
    controller.ts   OrderController.create → service.create
    service.ts      OrderService.create → repository.save
    repository.ts   OrderRepository.save → SQL / table orders
```

### Graph CodeTracr proves

```text
  ┌──────────────────────────┐
  │ HTTP_ENDPOINT            │
  │ POST /api/v1/orders      │
  └────────────┬─────────────┘
               │ HANDLES
               ▼
  ┌──────────────────────────┐
  │ METHOD                   │
  │ OrderController.create   │
  └────────────┬─────────────┘
               │ CALLS
               ▼
  ┌──────────────────────────┐
  │ METHOD                   │
  │ OrderService.create      │  ← search this in the UI
  └────────────┬─────────────┘
               │ CALLS
               ▼
  ┌──────────────────────────┐
  │ METHOD                   │
  │ OrderRepository.save     │
  └────────────┬─────────────┘
               │ WRITES
               ▼
  ┌──────────────────────────┐
  │ DATABASE_TABLE           │
  │ orders                   │
  └──────────────────────────┘
```

Expected edges are also asserted in `fixtures/golden-poc/expected-graph.json`.

### What “fail-closed” looks like here

`LocalUtility.create` exists in the fixture but must **not** get fake CALLS into the order chain. Forbidden edges are listed in the same expected file — if the analyzer invented them, tests fail.

### Surface impact for `OrderService.create`

Buckets harvested from lineage semantic nodes:

- **endpoints:** `POST /api/v1/orders`  
- **tables:** `orders`  
- **kafka:** empty  
- **external:** empty (placeholder today)

---

## 10. Worked example: kafka-poc (async)

### Source (simplified)

```text
  OrderEventPublisher.publish
      → producer.send({ topic: ORDER_CREATED_TOPIC, ... })

  OrderCreatedConsumer.handle
      ← consumes orders.created
```

### Graph

```text
  OrderEventPublisher.publish
            │ PUBLISHES
            ▼
       orders.created          ← EVENT_TOPIC
            │ CONSUMED_BY
            ▼
  OrderCreatedConsumer.handle
```

### Why Sequence view shows an `async` divider

Publish and consume are **not** a synchronous CALLS chain inside one process. The UI draws:

```text
  publish  ····· PUBLISHES ·····►  topic
                                   │
                              ─ async ─
                                   │
  handle  ◄···· CONSUMED_BY ·······┘
```

`CONSUMED_BY` **is** in the graph; it sits below the async boundary and may not get a yellow “source-order” step number from the publisher’s call list.

---

## 11. Analysis algorithms (lineage, traces, surface impact)

These live in **`packages/engine/src/graph/`**, not in the server. The server only loads neighbors from storage and calls the engine.

```text
  graph-utils.ts      noise helpers, UNLIMITED_DEPTH
  lineage.ts          buildLineageGraph
  traces.ts           buildGraphTraces
  path-ranking.ts     rank / score paths (prefer routes/controllers)
  surface-impact.ts   harvest HTTP / table / Kafka buckets
  query-model.ts      GraphNode / GraphEdge used by algorithms
  analysis.ts         public export barrel (@codetracr/engine/graph)
```

### Lineage (`buildLineageGraph`)

**Goal:** subgraph of everything within N hops of the target, both directions.

Algorithm sketch (BFS/DFS style walk):

```text
  start at target (hop 0)
  walk UP using incoming edges   → negative hops
  walk DOWN using outgoing edges → positive hops
  collect unique edges + paths to leaves
```

Returns: `{ target, nodes (with hop), edges, paths, stats }`.

Paths are then **ranked** (`rankLineagePaths`) so “route → controller → service” beats bootstrap noise when possible.

### Traces (`buildGraphTraces`)

**Goal:** human-readable chains of labels for the sidebar (“who reaches me / what I reach”).

- Collect maximal paths upstream and downstream  
- Format labels like `OrderService.create (service.ts)`  
- Rank / cap when depth is limited  

Slightly different presentation from lineage (label paths vs id paths + hops).

### Surface impact (`computeSurfaceImpact`)

**Goal:** blast-radius **buckets**, not a raw graph dump.

1. Build lineage around the target  
2. Scan lineage nodes for `http_endpoint`, `database_table`, `event_topic`  
3. Fill endpoints / tables / kafka publishes & consumes  

This is how the UI answers “what APIs and tables does this change touch?” without you reading every edge.

### Flow vs Sequence (UI)

| View | Idea |
|------|------|
| **Lineage** | Full neighborhood graph |
| **Flow** | One preferred linear path through that neighborhood |
| **Sequence** | Order of calls *inside* methods (occurrences), plus async Kafka hops |

Sequence is **computed in the UI** from edges + occurrences; it is not a separate stored artifact.

---

## 12. Certainty: DEFINITE vs POSSIBLE

Some resolutions are proven; some are only candidates.

```text
  DEFINITE   — analyzer can prove the edge from source
  POSSIBLE   — candidate (e.g. conditional factory); confidence still recorded
```

Factory POC exercises `POSSIBLE_RESOLUTION` edges. In the query model they often show as:

- `certainty: "POSSIBLE"`  
- `confidence: "INFERRED"` (mapped when loading JSON)  
- `confidenceScore` from provenance  

UI can treat POSSIBLE as softer than CALLS/HANDLES.

---

## 13. Fail-closed philosophy

```text
  Can we prove it from AST + rules?
        │
   yes ─┼─► emit node/edge with provenance
        │
    no ─┴─► leave unresolved (or omit)
            DO NOT invent “probably calls X”
```

Consequences:

- Many real-world calls stay **unresolved** (dynamic receivers, `any`, builtins).  
- Graphs look “smaller” than a heuristic code browser.  
- Tests assert **forbidden** edges as well as required ones.  

This is a product choice, not a bug.

---

## 14. Package map and “who owns what”

```text
packages/
├── engine/                 CORE
│   ├── parser/             Tree-sitter → ParsedFile facts
│   ├── resolution/         SymbolResolver
│   ├── semantic/           Fastify, SQL, Kafka, DI, factories
│   └── graph/
│       ├── codetracr-model.ts   build graph JSON
│       ├── query-model.ts       analysis node/edge types
│       ├── lineage.ts / traces.ts / surface-impact.ts / …
│       └── analysis.ts          export @codetracr/engine/graph
│
├── server/                 APPLICATION + ADAPTERS
│   ├── application/        GraphService
│   ├── ports/              GraphRepository
│   └── adapters/
│       ├── http/fastify/   routes, CORS, static UI
│       └── persistence/json/
│
└── web/                    LEGACY UI (Pixi lineage / flow / sequence)
    (web-ts/ reserved for rewrite — not required to understand the pipeline)
```

| Concern | Owner |
|---------|-------|
| Parse / prove edges | engine |
| Lineage math | engine |
| Load JSON / future DB | server adapters |
| HTTP shapes | server Fastify adapter |
| Drawing / sequence layout | web |

---

## 15. Commands cheat sheet

```powershell
npm install
npm run generate          # write generated/*/codetracr-graph.json
npm run poc               # generate + engine tests
npm run build             # web bundle
npm start                 # API + UI on :8787
npm test                  # generate + engine + server tests
npm run typecheck

# Point at golden only
$env:CODETRACR_GRAPH = "generated/golden/codetracr-graph.json"
$env:CODETRACR_SOURCE_ROOT = "fixtures/golden-poc"
npm start

# Analyze arbitrary tree
npm run analyze -- --source <dir> --out <dir>
```

UI searches that teach the system:

| Search | Fixture idea |
|--------|----------------|
| `OrderService.create` | HTTP → service → SQL |
| `POST /api/v1/orders` | Start from the endpoint |
| `OrderEventPublisher.publish` | Kafka publish → consume |
| `orders.created` | Topic-centric lineage |

---

## 16. Glossary

| Term | Meaning |
|------|---------|
| **Node** | A symbol or surface (method, table, topic, …) |
| **Edge** | A directed relationship (`CALLS`, `HANDLES`, …) |
| **Provenance** | Evidence + rule that justified an edge |
| **Unresolved** | Call/site the analyzer could not prove |
| **Upstream** | Toward callers / entry points |
| **Downstream** | Toward callees / side effects |
| **Hop** | Distance in edges from the selected node |
| **Lineage** | Neighborhood subgraph + hops |
| **Trace** | Ranked human-readable paths for the sidebar |
| **Surface impact** | Endpoints / tables / Kafka buckets |
| **Query model** | Normalized `GraphNode`/`GraphEdge` for algorithms |
| **Port** | Interface (`GraphRepository`) the app depends on |
| **Adapter** | Concrete port impl (JSON file, later SQLite, …) |
| **Fail-closed** | Prefer missing edges over wrong edges |
| **DEFINITE / POSSIBLE** | How sure we are about an edge |
| **Occurrence order** | Source order of calls inside one method |

---

## 17. Suggested learning path

1. Run `npm run poc && npm run build && npm start`.  
2. In the UI, search **`OrderService.create`** — switch Lineage / Flow / Sequence.  
3. Open `generated/golden/codetracr-graph.json` and find that method’s edges by hand.  
4. Read `fixtures/golden-poc/expected-graph.json` — required vs forbidden.  
5. Read `packages/engine/src/graph/codetracr-model.ts` top-to-bottom once (build pipeline).  
6. Read `packages/engine/src/graph/lineage.ts` — hop walk.  
7. Read `packages/server/src/application/graph-service.ts` — how storage + engine meet.  
8. Search **`OrderEventPublisher.publish`** — understand `async` + `CONSUMED_BY`.  
9. Skim `packages/server/src/ports/GraphRepository.ts` — future DB boundary.  

When something in the UI looks “missing,” ask in this order:

1. Is the edge in `codetracr-graph.json`? (generation)  
2. Does search find the node? (repository load / combined graph)  
3. Is depth/filter hiding it? (lineage walk / UI)  
4. Is it async (Kafka) and only labeled on hover / below the divider?  

---

## Related docs

- [Getting started](getting-started.md)  
- [Architecture](architecture.md)  
- [HTTP API](api.md)  
- [Contributing](../CONTRIBUTING.md)  

This guide is the narrative “how it all fits”; those pages stay short and operational.
