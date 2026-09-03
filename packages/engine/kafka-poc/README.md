# Kafka event-flow POC

This fixture tests the first non-code hop in the CodeTracr graph:

```text
OrderEventPublisher.publish
  PUBLISHES -> orders.created
  CONSUMED_BY -> OrderCreatedConsumer.handle
```

No broker is started. Tree-sitter, symbol resolution, and deterministic Kafka
rules inspect the source only.

## Deterministic evidence

- `this.producer` must resolve to `Producer` imported from `kafkajs`.
- `this.consumer` must resolve to `Consumer` imported from `kafkajs`.
- Topic identifiers must resolve to exported static string constants.
- A `subscribe({ topic })` and `run({ eachMessage })` pair must use the same
  resolved consumer property.
- The handler expression must resolve to a concrete method.

## Negative controls

- `UnrelatedPublisher.publish` calls a local class method also named `send` and
  passes the order topic, but it does not create a `PUBLISHES` edge.
- `PaymentCreatedConsumer` subscribes to `payments.created` and is never
  connected to `orders.created`.
- The tests also verify that an environment-derived topic does not produce a
  definite topic edge.

## Results

CodeTracr produced 26 nodes and 8 edges, including two `EVENT_TOPIC` nodes and
three event-flow edges:

- `OrderEventPublisher.publish PUBLISHES orders.created`
- `orders.created CONSUMED_BY OrderCreatedConsumer.handle`
- `payments.created CONSUMED_BY PaymentCreatedConsumer.handle`

The unrelated local `send()` remains an ordinary code `CALLS` edge and never
becomes Kafka semantics.

## Scope

This POC supports imported literal topic constants and the shown KafkaJS
`send`, `subscribe`, and `run` forms. It does not handle patterns, regex
subscriptions, dynamic topic expressions, consumer groups, broker configuration,
or runtime tracing.

## Run

From `packages/engine`:

```powershell
npm run build:kafka
npm test
```

Reports are written to `generated/kafka/`.
