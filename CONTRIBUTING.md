# Contributing to CodeTracr

Please read the [code of conduct](CODE_OF_CONDUCT.md) first.

## Setup

Requires Node.js >= 22.12.

```powershell
npm install
npm run poc
npm run build
npm test
npm run typecheck
```

There is no ESLint/Prettier config in this repository yet.

## Project layout

- `packages/engine` — Tree-sitter parse, symbol resolution, semantic analyzers, CodeTracr graph
- `packages/server` — HTTP API, lineage/traces, blast radius
- `packages/web` — HTML/CSS/JS UI (Pixi lineage / flow / sequence)

The engine can be run without the UI:

```powershell
npm run analyze -- --source <dir> --out <dir>
```

More detail: [docs/getting-started.md](docs/getting-started.md), [docs/architecture.md](docs/architecture.md).

## Bugs and security

- Use a GitHub issue for analyzer or UI bugs. Include steps to reproduce. Do not paste secrets or private source.
- Unresolved relationships are expected when the analyzer cannot prove a fact from source. That is not automatically a bug.
- Vulnerabilities: [SECURITY.md](SECURITY.md).

## Pull requests

- Keep changes focused
- Do not reintroduce Graphify or other external graph backends
- Prefer fail-closed unresolved relationships over guessed edges
- Run `npm test` and `npm run typecheck` before opening a PR
- Update docs when setup or behavior changes

By contributing, you agree that your contribution is licensed under the same MIT License as the rest of this repository (`LICENSE`).
