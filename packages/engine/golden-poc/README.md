# CodeTracr semantic graph POC

This fixture tests one narrow hypothesis: Tree-sitter can supply deterministic
TypeScript syntax facts, and small symbol and semantic passes can produce
application-level CodeTracr relationships.

## Run

Requires Node.js 22.12+.

```powershell
npm install
npm run poc
```

`npm run poc` builds all reports and executes the golden tests.
Generated files are written to `packages/engine/generated/`:

- `treesitter-facts.json`
- `codetracr-graph.json`
- `provenance-report.json`

The same command also runs the separate interface/DI fixture. Its reports are
under `packages/engine/generated/interface-di/`; see `interface-di-poc/README.md`.
It also runs the conditional factory fixture, whose reports are under
`packages/engine/generated/factory/`; see `factory-poc/README.md`.
The Kafka event-flow fixture writes to `packages/engine/generated/kafka/`; see
`kafka-poc/README.md`.

## Results for this fixture

Tree-sitter parsed all seven TypeScript files and normalized imports, exports,
classes, class properties, methods, functions, variables, calls, member
expressions, construction, strings, objects, arguments, and type annotations.
Expressions retain a small recursive representation instead of being reduced to
receiver strings. It exposed the syntax for both business calls, the Fastify
route and registration prefix, and the SQL string passed to `db.query`.

The fixture-only symbol resolver connected:

- `routes` to the exported `routes` function
- `controller` to the `OrderController` instance
- `controller.create` to `OrderController.create`
- `this.service` to `OrderService`
- `this.service.create` to `OrderService.create`
- `this.repository` to `OrderRepository`
- `this.repository.save` to `OrderRepository.save`
- imported `db` through `database.ts` to `pg.Pool`
- `db.query` to the SQL semantic rule only after proving that receiver type

The Fastify rule combined the AST-derived `/api/v1` registration prefix with
`/orders` and created `POST /api/v1/orders HANDLES OrderController.create`.
The isolated SQL rule recognized the literal `INSERT INTO orders` and created
`OrderRepository.save WRITES orders`.

## Golden and negative controls

`expected-graph.json` asserts the four important relationships from the endpoint
through the `orders` table. `LocalUtility.create` deliberately shares the method
name `create`; no edge connects it to the order flow. This demonstrates that the
POC resolves receiver instances and class properties rather than joining methods
by name.

The test suite also checks duplicate class/method names in separate modules,
same-named variables in separate function scopes, an unrelated object named
`app` with a `post` method, an unrelated object named `db` with a `query` method,
and independent provenance fields.

The only unresolved in-method call is `reply.send`: `reply` is typed as `any`, so
its concrete symbol cannot be established deterministically from this fixture.
It is recorded in `codetracr-graph.json` and `provenance-report.json`.

## Limits

This is fixture-specific by design. It uses module-qualified typed symbol IDs,
module/function/method/class-property scopes, recursive member expressions,
relative imports, direct `new` initializers, `this.property.method()` calls, the
shown Fastify registration and route shapes, and one literal `INSERT INTO` form.
It does not implement the TypeScript type system, block scope, inheritance,
dynamic route construction, general SQL, databases, impact analysis, or AI.

Graph provenance stores evidence separately from derivation and confidence.

## Architectural assessment

Tree-sitter plus deterministic symbol resolution recovered the call chain, and
small domain rules added the endpoint and database concepts. The separation
between syntax facts, resolution, semantic rules, and the CodeTracr-owned graph
is worth testing next on gradually harder fixtures.
