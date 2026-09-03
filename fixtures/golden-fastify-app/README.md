# Golden Fastify Application

This synthetic order application is a deterministic benchmark fixture for application-impact-analysis tools. It is not intended for production use.

The fixture intentionally combines Fastify route composition, controllers, services, interfaces and implementations, parameterized PostgreSQL queries, Kafka producers and consumers, callbacks, configuration constants, and an external HTTP resource. `benchmark/expected-relationships.json` is the machine-readable ground truth.

The application is designed to test:

- route composition and handler resolution
- interface implementation resolution
- SQL and table detection
- Kafka topic/resource detection and producer/consumer joining
- callback traversal
- external URL detection
- configuration propagation
- shared-function blast radius
- false-positive resistance

## Commands

```sh
npm install
npm run build
npm test
```

PostgreSQL, Kafka, and the payment API are replaced by test doubles in the test suite.
