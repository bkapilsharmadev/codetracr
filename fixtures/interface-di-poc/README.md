# Interface and dependency-injection POC

This second fixture tests deterministic interface dispatch without introducing a
TypeScript compiler or container framework.

## Scenario

`OrderService` depends on the `OrderRepository` interface through a constructor
parameter property. Both `PostgresOrderRepository` and
`InMemoryOrderRepository` implement that interface, but the visible composition
root injects only `PostgresOrderRepository`.

The expected semantic path is:

```text
OrderService.create
  CALLS -> OrderRepository.save
  RESOLVES_TO -> PostgresOrderRepository.save
```

`InMemoryOrderRepository.save` must not be selected merely because its class
implements the same interface.

## Deterministic rules

- The constructor parameter type creates `OrderService DEPENDS_ON OrderRepository`.
- An `implements` clause creates an `IMPLEMENTS` edge.
- `this.repository.save()` statically resolves to `OrderRepository.save`.
- `new OrderService(new PostgresOrderRepository())` proves the
  `INJECTED_WITH` edge.
- Concrete `RESOLVES_TO` dispatch is emitted only when the injected class
  implements the required interface and has the called method.
- Without a visible composition root, resolution stops at the interface method.

The fixture has no unresolved calls and no edge to the uninjected in-memory
implementation.

## Run

From `packages/engine`:

```powershell
npm run build:di
npm test
```

Reports are written to `generated/interface-di/`.
