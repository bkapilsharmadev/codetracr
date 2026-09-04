# Mini-POC: Tree-sitter → Directed Semantic Graph

A **handwritten** learning lab. Goal: understand the *core engine idea* by building a tiny version yourself — not by reading all of CodeTracr at once.

You will implement (on paper or in a scratch folder) the same mental pipeline CodeTracr uses:

```text
  Source text
      → Tree-sitter AST / facts
      → Symbol index + resolve calls
      → Directed semantic graph (nodes + typed edges)
```

Skip Fastify, Kafka, DI, and the UI. Those are **semantic plugins** on top of this core.

---

## Why this lab exists

CodeTracr looks big because it has many packages. The **core** is small:

| Step | Question it answers |
|------|---------------------|
| 1. Parse | What syntactic facts exist in this file? |
| 2. Index | What symbols exist (classes, methods, variables)? |
| 3. Resolve | For this CALL fact, which symbol is being called? |
| 4. Emit | If we can prove it, add a directed edge `A --CALLS--> B` |

Everything else (HTTP endpoints, SQL tables, Kafka topics) is: *pattern-match extra facts → emit extra node/edge types*.

---

## Lab setup (recommended)

Create a scratch folder outside the monorepo (or `scratch/mini-graph-poc/` if you prefer):

```text
mini-graph-poc/
  sample/
    a.ts
    b.ts
  src/
    01-facts.ts          ← you write
    02-index.ts          ← you write
    03-resolve.ts        ← you write
    04-graph.ts          ← you write
    run.ts
  README.md              ← your notes
```

Use **handwritten fake facts** first (no Tree-sitter). Add Tree-sitter only after the graph logic clicks.

Optional later: call CodeTracr’s real parser to compare your edges with `generated/golden/codetracr-graph.json`.

---

## The sample program (keep it tiny)

Write exactly this (or copy into `sample/`):

**`b.ts`**

```ts
export class Greeter {
  hello(name: string) {
    return `hi ${name}`;
  }
}
```

**`a.ts`**

```ts
import { Greeter } from "./b";

export class App {
  private greeter = new Greeter();

  run() {
    this.greeter.hello("world");
  }
}
```

**Target graph you want to prove:**

```text
  method:a.ts#App.run  ──CALLS──►  method:b.ts#Greeter.hello
```

If you can get that one edge with provenance, you understand the core.

ASCII:

```text
        ┌─────────────────────┐
        │  METHOD             │
        │  App.run            │
        │  id: method:a.ts#…  │
        └──────────┬──────────┘
                   │ CALLS
                   │ (resolved: this.greeter.hello)
                   ▼
        ┌─────────────────────┐
        │  METHOD             │
        │  Greeter.hello      │
        │  id: method:b.ts#…  │
        └─────────────────────┘
```

---

## Mental model: four layers

```text
┌────────────────────────────────────────────────────────────┐
│  Layer 0 — SOURCE                                          │
│  Characters in a.ts / b.ts                                 │
└────────────────────────────┬───────────────────────────────┘
                             │ Tree-sitter (or handmade facts)
                             ▼
┌────────────────────────────────────────────────────────────┐
│  Layer 1 — FACTS (syntax observations)                     │
│  “There is a CLASS Greeter”                                │
│  “There is a CALL this.greeter.hello(...) inside App.run”  │
│  No graph yet. No “who is hello?” yet.                     │
└────────────────────────────┬───────────────────────────────┘
                             │ Index declarations
                             ▼
┌────────────────────────────────────────────────────────────┐
│  Layer 2 — SYMBOL TABLE                                    │
│  Greeter → class:b.ts#Greeter                              │
│  Greeter.hello → method:b.ts#Greeter.hello                 │
│  App.greeter property type ≈ Greeter                       │
└────────────────────────────┬───────────────────────────────┘
                             │ Resolve each CALL
                             ▼
┌────────────────────────────────────────────────────────────┐
│  Layer 3 — DIRECTED SEMANTIC GRAPH                         │
│  Nodes: methods/classes                                    │
│  Edges: App.run --CALLS--> Greeter.hello                   │
│  Unresolved: calls you cannot prove                        │
└────────────────────────────────────────────────────────────┘
```

CodeTracr names:

| Your lab layer | CodeTracr code |
|----------------|----------------|
| Facts | `ParsedFile` + `AstFact` in `packages/engine/src/types.ts` |
| Parser | `packages/engine/src/parser/treesitter.ts` |
| Symbol table | `packages/engine/src/resolution/symbol-resolver.ts` |
| Graph emit | `packages/engine/src/graph/codetracr-model.ts` → `buildCodeTracrGraph` |

---

## Step 0 — Stable IDs (do this first)

Never use only display names like `"hello"` as node ids. Collisions kill graphs.

**Convention (same idea as CodeTracr):**

```text
  method:{file}#{Class}.{method}
  class:{file}#{Class}
  module:{file}
```

Examples:

```text
  method:b.ts#Greeter.hello
  method:a.ts#App.run
  class:b.ts#Greeter
```

Exercise: write ids for every class/method in the sample before coding.

---

## Step 1 — Handwrite FACTS (skip Tree-sitter)

Pretend the parser already ran. Create a JSON-like structure:

```ts
type Fact =
  | { kind: "CLASS"; file: string; name: string; line: number }
  | { kind: "METHOD"; file: string; className: string; name: string; line: number }
  | { kind: "PROPERTY"; file: string; className: string; name: string; typeName?: string; line: number }
  | {
      kind: "CALL";
      file: string;
      ownerClass: string;
      ownerMethod: string;
      // simplified callee expression
      callee: { receiver: "this"; property: string; method: string } | { name: string };
      line: number;
    }
  | { kind: "IMPORT"; file: string; local: string; from: string; line: number };

const facts: Fact[] = [
  // b.ts
  { kind: "CLASS", file: "b.ts", name: "Greeter", line: 1 },
  { kind: "METHOD", file: "b.ts", className: "Greeter", name: "hello", line: 2 },

  // a.ts
  { kind: "IMPORT", file: "a.ts", local: "Greeter", from: "./b", line: 1 },
  { kind: "CLASS", file: "a.ts", name: "App", line: 3 },
  {
    kind: "PROPERTY",
    file: "a.ts",
    className: "App",
    name: "greeter",
    typeName: "Greeter", // from `new Greeter()` or annotation
    line: 4,
  },
  { kind: "METHOD", file: "a.ts", className: "App", name: "run", line: 6 },
  {
    kind: "CALL",
    file: "a.ts",
    ownerClass: "App",
    ownerMethod: "run",
    callee: { receiver: "this", property: "greeter", method: "hello" },
    line: 7,
  },
];
```

**Checkpoint:** print facts. Confirm you have exactly one `CALL`.

What Tree-sitter really does in CodeTracr is richer (`Expression` trees, `SymbolRef` on owners, etc.), but this is enough to learn resolution.

---

## Step 2 — Build a symbol index

Walk facts once and fill maps:

```ts
type SymbolId = string;

const classes = new Map<string, SymbolId>(); // "b.ts\0Greeter" → class id
const methods = new Map<string, SymbolId>(); // "classId\0hello" → method id
const props = new Map<string, { typeName?: string }>(); // "classId\0greeter" → type

function classId(file: string, name: string) {
  return `class:${file}#${name}`;
}
function methodId(file: string, className: string, method: string) {
  return `method:${file}#${className}.${method}`;
}

for (const f of facts) {
  if (f.kind === "CLASS") {
    classes.set(`${f.file}\0${f.name}`, classId(f.file, f.name));
  }
  if (f.kind === "METHOD") {
    const c = classId(f.file, f.className);
    methods.set(`${c}\0${f.name}`, methodId(f.file, f.className, f.name));
  }
  if (f.kind === "PROPERTY") {
    const c = classId(f.file, f.className);
    props.set(`${c}\0${f.name}`, { typeName: f.typeName });
  }
}
```

Also index imports so `Greeter` in `a.ts` can point at `b.ts`:

```ts
const imports = new Map<string, string>(); // "a.ts\0Greeter" → "b.ts"
// from IMPORT facts: resolve "./b" → "b.ts"
```

**Checkpoint:** look up `method:b.ts#Greeter.hello` from the index.

This mirrors `SymbolResolver`’s `indexDeclarations()` / `indexImports()`.

---

## Step 3 — Resolve one CALL (the heart)

For:

```ts
this.greeter.hello("world")
```

Resolution algorithm (handwritten):

```text
1. Owner of the call = App.run
       ownerId = method:a.ts#App.run

2. Callee shape = this . greeter . hello
       a) receiver is `this` → type is owning class App
       b) property `greeter` on App → typeName Greeter
       c) resolve type name Greeter via import → class in b.ts
       d) method `hello` on that class → method:b.ts#Greeter.hello

3. If any step fails → UNRESOLVED (do not invent an edge)
```

Sketch:

```ts
function resolveCall(call: Extract<Fact, { kind: "CALL" }>): SymbolId | null {
  if (call.callee.receiver !== "this") return null;

  const ownerClassId = classId(call.file, call.ownerClass);
  const prop = props.get(`${ownerClassId}\0${call.callee.property}`);
  if (!prop?.typeName) return null;

  // Greeter → which file?
  const importedFile = imports.get(`${call.file}\0${prop.typeName}`) ?? call.file;
  const targetClassId = classes.get(`${importedFile}\0${prop.typeName}`);
  if (!targetClassId) return null;

  return methods.get(`${targetClassId}\0${call.callee.method}`) ?? null;
}
```

**Checkpoint:**

```ts
resolveCall(theCall) === "method:b.ts#Greeter.hello"  // must be true
```

Fail-closed exercise: change the call to `this.unknown.hello()` — resolution must return `null`, and you must **not** emit a CALLS edge.

---

## Step 4 — Emit the directed graph

```ts
type Node = { id: string; kind: string; name: string };
type Edge = {
  from: string;
  to: string;
  type: "CALLS";
  certainty: "DEFINITE";
  evidence: { file: string; line: number };
};

const nodes = new Map<string, Node>();
const edges: Edge[] = [];
const unresolved: Array<{ expr: string; file: string; line: number }> = [];

function addNode(id: string, kind: string, name: string) {
  nodes.set(id, { id, kind, name });
}

// add all METHOD nodes from index…
for (const id of methods.values()) {
  addNode(id, "METHOD", id.split("#")[1]!);
}

for (const f of facts) {
  if (f.kind !== "CALL") continue;
  const from = methodId(f.file, f.ownerClass, f.ownerMethod);
  const to = resolveCall(f);
  if (!to) {
    unresolved.push({ expr: JSON.stringify(f.callee), file: f.file, line: f.line });
    continue;
  }
  edges.push({
    from,
    to,
    type: "CALLS",
    certainty: "DEFINITE",
    evidence: { file: f.file, line: f.line },
  });
}

console.log({ nodes: [...nodes.values()], edges, unresolved });
```

**Success criteria:**

```json
{
  "edges": [
    {
      "from": "method:a.ts#App.run",
      "to": "method:b.ts#Greeter.hello",
      "type": "CALLS",
      "certainty": "DEFINITE"
    }
  ],
  "unresolved": []
}
```

You now have a **directed semantic graph**: direction = caller → callee, semantics = `CALLS` (not just “AST parent/child”).

---

## Step 5 — Draw it / query it by hand

On paper:

```text
  App.run ──CALLS──► Greeter.hello
```

Queries (same ideas as CodeTracr server later):

| Query | How |
|-------|-----|
| Callees of `App.run` | edges where `from === App.run` |
| Callers of `Greeter.hello` | edges where `to === Greeter.hello` |
| Downstream lineage | walk outgoing edges from a start node |
| Upstream lineage | walk incoming edges |

Implement a 5-line walker:

```ts
function outgoing(id: string) {
  return edges.filter((e) => e.from === id).map((e) => e.to);
}
function incoming(id: string) {
  return edges.filter((e) => e.to === id).map((e) => e.from);
}
```

That is the seed of `getOutgoingEdges` / `getIncomingEdges` and lineage.

---

## Step 6 — Add ONE semantic rule (optional stretch)

Core CALLS is not enough for CodeTracr’s “surfaces”. Add a toy rule:

**If** you see a fact like `app.post("/orders", handler)`  
**Then** emit:

```text
  node HTTP_ENDPOINT "POST /orders"
  edge HANDLES → handler method
```

Do **not** put this inside the resolver. Keep the split:

```text
  resolveCall → CALLS edges
  analyzeHttpToy → HANDLES edges
```

That is exactly how `codetracr-model.ts` orchestrates:

```text
  SymbolResolver + CALL loop     → CALLS
  analyzeFastify                 → HTTP + HANDLES
  analyzeSql                     → TABLE + READS/WRITES
  analyzeKafka                   → TOPIC + PUBLISHES/CONSUMED_BY
```

---

## Step 7 — Map your lab onto real CodeTracr

After your mini graph works, open these files in order (read only the listed parts):

### 1) Facts shape — `packages/engine/src/types.ts`

Look for:

- `AstFact` / `FactKind` (`CALL`, `METHOD`, `CLASS`, …)
- `Expression` (`MEMBER`, `CALL`, `IDENTIFIER`, …)
- `CodeTracrNode` / `CodeTracrEdge` / `CodeTracrGraph`

### 2) Parser — `packages/engine/src/parser/treesitter.ts`

Skim how a CALL fact gets:

- `owner` (which method contains this call)
- `expression` (structured callee tree)
- `line` / `column` / `sourceRange`

You handwrote those; Tree-sitter fills them from the AST.

### 3) Resolver — `packages/engine/src/resolution/symbol-resolver.ts`

Focus on:

- constructor → `indexDeclarations` / `indexImports`
- `resolveCall(file, fact)`

Your Step 3 is a baby version of `resolveCall`.

### 4) Graph builder — `packages/engine/src/graph/codetracr-model.ts`

Read `buildCodeTracrGraph` in three passes:

```text
  Pass A: add MODULE/CLASS/METHOD nodes + IMPORTS edges
  Pass B: for each CALL fact → resolve → pending CALLS (+ occurrences order)
  Pass C: semantic analyzers → HANDLES / WRITES / PUBLISHES / …
```

Compare your `edges.push({ type: "CALLS" })` to the real `addEdge(..., type: 'CALLS', provenance: ...)`.

### 5) Compare against golden output

```powershell
npm run generate
# open generated/golden/codetracr-graph.json
# find OrderService.create → OrderRepository.save CALLS edge
```

Same pattern as your `App.run → Greeter.hello`, with more machinery.

---

## How real Tree-sitter fits (when you are ready)

You do **not** need to reimplement the parser for learning. Conceptually:

```text
  source string
      → parser.parse(source) → syntax tree
      → walk nodes (call_expression, method_definition, …)
      → emit AstFact[]

  Example AST fragment for this.greeter.hello("world"):

  call_expression
    ├── member_expression          ← callee
    │     ├── member_expression    ← this.greeter
    │     │     ├── this
    │     │     └── property: greeter
    │     └── property: hello
    └── arguments: "world"
```

CodeTracr turns that into an `Expression` tree (`MEMBER` / `CALL`), then the resolver walks it.

**Lab upgrade path:**

1. Handwritten facts (this doc)  
2. Dump real facts: run engine generate and inspect `generated/golden/treesitter-facts.json`  
3. Pick one CALL fact from that dump and resolve it on paper  
4. Only then try wiring `tree-sitter` yourself if you want  

---

## Exercises (do these in order)

### E1 — Happy path

Produce the single CALLS edge for the sample. Print JSON.

### E2 — Fail-closed

Add `this.missing.hello()` inside `run`. Assert it appears in `unresolved`, not in `edges`.

### E3 — Second hop

Add `Greeter.hello` calling `this.format(name)` on the same class. Emit two CALLS edges. Walk downstream from `App.run` two hops.

### E4 — Incoming query

From `Greeter.hello`, list callers. (Should include `App.run`.)

### E5 — Provenance

Attach `{ file, line }` to every edge. Explain why UI “Open in editor” needs this.

### E6 — Read the real builder

In `codetracr-model.ts`, find where unresolved reasons are pushed. Write one sentence: when does CodeTracr refuse to emit CALLS?

### E7 — Semantic plugin (stretch)

Handwrite one `HTTP_ENDPOINT` + `HANDLES` edge for a fake `app.post("/x", this.run)`. Keep it out of `resolveCall`.

---

## Common confusions

| Confusion | Clarification |
|-----------|----------------|
| “AST is already a graph” | Syntax parent/child ≠ semantic CALLS. We build a **new** graph. |
| “Why not string-match `hello(`?” | Ambiguous; fail-closed needs receiver type + symbol id. |
| “Why IDs with file paths?” | Same method name in two files must not collide. |
| “Where do tables/topics come from?” | Extra semantic passes, same emit pattern as CALLS. |
| “Is lineage part of this?” | No — lineage **walks** the graph you emit. Different phase. |

```text
  THIS LAB                          LATER (already in CodeTracr)
  parse → resolve → emit graph  →   walk graph (lineage/traces) → UI
```

---

## One-page cheat sheet

```text
FACT     = observation from syntax (CALL, METHOD, …)
SYMBOL   = stable id for a declaration
RESOLVE  = CALL fact → target symbol id | null
EDGE     = only if resolve succeeded
GRAPH    = nodes + directed typed edges + unresolved list

resolve(this.greeter.hello) =
  this → App
  .greeter → property type Greeter
  Greeter → class in b.ts (via import)
  .hello → method:b.ts#Greeter.hello

emit:
  App.run --CALLS--> Greeter.hello
```

---

## After the lab: where to go in the big repo

1. Re-read [Learning guide §5](learning-guide.md#5-phase-a--building-the-graph-engine) — it will make more sense.  
2. Trace golden: `fixtures/golden-poc/src/service.ts` → CALLS → `repository.save`.  
3. Leave server/UI alone until the graph file feels obvious.  

When your mini-POC prints the CALLS edge and an unresolved case, you understand the engine’s core. The rest of CodeTracr is scale, more fact kinds, and more semantic plugins.
