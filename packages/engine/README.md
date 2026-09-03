# CodeTracr semantic graph engine

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

`npm run poc` builds fixture graphs (including the combined POC graph) and executes tests.
Generated files are written to `generated/` at the repository root (gitignored).

POC source lives in [`fixtures/`](../../fixtures/README.md).
