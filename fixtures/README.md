# Fixtures

POC source trees used to generate CodeTracr graphs and run golden tests.

| Directory | Focus |
|-----------|-------|
| `golden-poc/` | Fastify HTTP + SQL writes |
| `factory-poc/` | Definite vs possible factory resolution |
| `interface-di-poc/` | Interfaces and constructor injection |
| `kafka-poc/` | Publisher → topic → consumer |
| `golden-fastify-app/` | Larger Fastify corpus (not part of the default combined graph) |

`npm run generate` builds per-POC graphs under `generated/` and a combined graph at `generated/all/codetracr-graph.json`. Combined display paths are namespaced (`golden-poc/src/...`, `kafka-poc/src/...`) so overlapping file names do not collide. `golden-fastify-app` is excluded from that combine.

`npm start` loads the combined graph by default when it exists.
