# `@codetracr/server`

Fastify adapter around `@codetracr/engine` graph analysis. It does not parse source.

Graph JSON is loaded through `JsonGraphRepository`. Routes depend on `GraphService` and the `GraphRepository` port, not files.

```powershell
npm run generate
npm run build
npm start
```

See [docs/getting-started.md](../../docs/getting-started.md) and [docs/api.md](../../docs/api.md).
