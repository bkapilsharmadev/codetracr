# CodeTracr

Deterministic **code impact analysis** from a semantic graph that CodeTracr builds itself.

CodeTracr parses source with Tree-sitter, resolves symbols, applies fail-closed semantic rules, and produces a CodeTracr-owned graph. That graph drives lineage, flow, sequence, and blast-radius views.

**Status:** public beta **0.1.0**. Static analysis is incomplete by design: if a relationship cannot be proved from source, it is left unresolved rather than guessed.

**Website:** [codetracr.com](https://codetracr.com) (coming soon)

## Architecture

```text
Source code
        ↓
Tree-sitter facts
        ↓
Symbol resolver
        ↓
Semantic analyzers (Fastify, SQL, Kafka, DI, factories)
        ↓
codetracr-graph.json
        ↓
server impact engine → lineage / flow / sequence UI
```

See [docs/](docs/README.md) for architecture, getting started, and the local HTTP API.

## Quick start

Requires **Node.js >= 22.12**.

```powershell
npm install
npm run poc
npm run build
npm start
```

Open **http://127.0.0.1:8787/ui/** and search for `OrderService.create` or `OrderEventPublisher.publish`.

`npm start` serves the combined POC graph when present (`generated/all/codetracr-graph.json`). Point it at another graph with:

```powershell
$env:CODETRACR_GRAPH = "generated/golden/codetracr-graph.json"
$env:CODETRACR_SOURCE_ROOT = "fixtures/golden-poc"
npm start
```

Analyze an arbitrary source tree:

```powershell
npm run analyze -- --source <dir> --out <dir>
```

## Current beta capabilities

CodeTracr can currently prove, from source:

- modules, classes, methods, functions, and imports
- resolved calls when the receiver type is deterministic
- Fastify HTTP endpoints and `HANDLES` edges
- SQL table `READS` / `WRITES` for supported `pg` and Drizzle-style access
- constructor injection and interface `IMPLEMENTS` / `RESOLVES_TO`
- conditional factory `DEFINITE` vs `POSSIBLE` resolution
- KafkaJS `PUBLISHES` / `CONSUMED_BY` for static topic constants
- source-ordered call occurrences for sequence view

It does **not** claim complete coverage of TypeScript, React, ORMs, or job queues.

## Known limitations

- Unresolved calls are expected (builtins, dynamic receivers, `any`, most UI state setters).
- SQL string parsing currently recognizes a narrow `INSERT INTO` form plus structured table-registry/Drizzle patterns.
- Kafka support is KafkaJS + static topic literals only.
- A few files may be skipped if Tree-sitter cannot parse them.
- Sequence numbering is **source order**, not guaranteed runtime order.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `CODETRACR_PORT` / `PORT` | `8787` | HTTP port |
| `CODETRACR_GRAPH` | combined POC graph, then other generated graphs | Canonical CodeTracr semantic graph |
| `CODETRACR_SOURCE_ROOT` | inferred from the selected engine graph | Root used for CodeTracr source navigation |
| `CODETRACR_EDITOR_SCHEME` | `vscode` | Editor URL scheme: `vscode` or `cursor` |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run generate` | Build fixture CodeTracr graphs |
| `npm run poc` | Generate fixture graphs and run engine tests |
| `npm run build` | Build web UI (`packages/web/dist`) |
| `npm start` | Start API + serve static UI |
| `npm test` | Generate fixture graphs, then run engine and server tests |
| `npm run typecheck` | TypeScript check engine + server |
| `npm run analyze -- --source <dir> --out <dir>` | Analyze a source tree |

## Documentation

- [Learning guide](docs/learning-guide.md) — concepts, graph basics, end-to-end examples
- [Getting started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [HTTP API](docs/api.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Changelog](CHANGELOG.md)

## License

MIT — see [LICENSE](LICENSE). Third-party npm packages keep their own licenses; see [NOTICE](NOTICE).
