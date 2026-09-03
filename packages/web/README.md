# `@codetracr/web`

Static lineage explorer (HTML, CSS, Pixi). The server in `@codetracr/server` serves this directory.

```powershell
npm run build -w @codetracr/web
```

That writes `dist/graph-view.js` and `dist/pdf-export.js`. Those files are gitignored; CI and `npm start` expect a build first.

| File | Role |
|------|------|
| `index.html`, `style.css`, `app.js` | Shell, search, sidebar, API client |
| `src/graph-view.js` | Lineage / flow / sequence canvas |
| `src/pdf-export.js` | PDF export |

Views:

- **Lineage** — clustered blast-radius graph
- **Flow** — linear path
- **Sequence** — source-ordered calls; Kafka publish/consume uses an async divider
