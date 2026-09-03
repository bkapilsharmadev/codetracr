# Conditional factory POC

This fixture introduces one semantic difficulty: an interface implementation is
selected by a conditional factory.

## Cases

The same factory is called by two independent service compositions:

- Static: `{ db: "postgres" }` proves that only
  `PostgresOrderRepository` is selected.
- Dynamic: `{ db: process.env.DB_KIND }` leaves both returned implementations
  possible.

`UnusedOrderRepository` implements the interface but is never returned by the
factory. It is the negative control.

## Graph semantics

The static call produces:

```text
StaticOrderService.create
  CALLS -> OrderRepository.save
  RESOLVES_TO -> PostgresOrderRepository.save
```

The environment-driven call produces:

```text
DynamicOrderService.create
  CALLS -> OrderRepository.save
  POSSIBLE_RESOLUTION -> PostgresOrderRepository.save
  POSSIBLE_RESOLUTION -> InMemoryOrderRepository.save
```

Possible edges retain `confidence: 1.0` because CodeTracr is fully confident
that each branch is possible. Their `certainty` is `POSSIBLE`; confidence is not
misused as branch probability.

## Results

CodeTracr produced 24 normalized nodes and 19 edges.

Tree-sitter supplied the factory return type, return expressions, binary
condition, literal static argument, and environment-derived dynamic argument.
The conditional factory rule added one definite resolution and two possible
resolutions. No resolution points to `UnusedOrderRepository`.

## Scope

This is deliberately limited constant evaluation. It understands the shown
equality condition, object-literal factory argument, ordered conditional return,
and fallback return. Unknown expressions remain dynamic. It does not attempt
general control-flow analysis or assign probabilities to branches.

## Run

From `packages/engine`:

```powershell
npm run build:factory
npm test
```

Reports are written to `generated/factory/`.
