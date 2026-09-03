# CodeTracr semantic graph fixtures

This package (`@codetracr/engine`) is the CodeTracr semantic analyzer:
Tree-sitter AST facts + fail-closed symbol resolution and semantic passes.

It can be used without the web UI (`npm run analyze -- --source <dir> --out <dir>` from the repo root).
License: MIT (see the repository `LICENSE`).

## Run

Requires Node.js 22.12+.

```powershell
npm install
npm run poc
```

`npm run poc` builds all fixture graphs and executes golden tests.
Generated files are written to `packages/engine/generated/` (gitignored).

## Fixtures

| Fixture | Focus |
|---------|-------|
| `golden-poc/` | Fastify HTTP + SQL writes |
| `interface-di-poc/` | Interfaces and constructor injection |
| `factory-poc/` | Definite vs possible factory resolution |
| `kafka-poc/` | Publisher → topic → consumer |
