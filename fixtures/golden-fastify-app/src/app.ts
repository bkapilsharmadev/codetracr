import Fastify, { type FastifyInstance } from 'fastify';
import { Kafka, type Consumer, type Producer } from 'kafkajs';
import type { Pool } from 'pg';
import { KAFKA_BROKERS } from './config/config.js';
import { BillingOrderCreatedConsumer } from './consumers/billing-order-created.consumer.js';
import { AdminOrderController } from './controllers/admin-order.controller.js';
import { BillingController } from './controllers/billing.controller.js';
import { OrderController } from './controllers/order.controller.js';
import { ReportOrderController } from './controllers/report-order.controller.js';
import { postgres } from './db/postgres.js';
import type { EventConsumer } from './events/event-consumer.js';
import type { EventPublisher } from './events/event-publisher.js';
import { KafkaOrderEventPublisher } from './events/kafka-order-event.publisher.js';
import { PostgresOrderRepository } from './repositories/postgres-order.repository.js';
import { PostgresBillingRepository } from './repositories/postgres-billing.repository.js';
import { adminOrderRoutes } from './routes/admin-order.routes.js';
import { billingRoutes } from './routes/billing.routes.js';
import { orderRoutes } from './routes/order.routes.js';
import { reportOrderRoutes } from './routes/report-order.routes.js';
import { BillingService } from './services/billing.service.js';
import { OrderService } from './services/order.service.js';
import { PaymentGateway } from './external/payment-gateway.js';

export interface BuildAppOptions {
  database?: Pool;
  publisher?: EventPublisher;
  consumer?: EventConsumer;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify();
  const database = options.database ?? postgres;
  const kafka = new Kafka({
    clientId: 'golden-fastify-app',
    brokers: KAFKA_BROKERS,
  });

  let producer: Producer | undefined;
  const publisher = options.publisher ?? (() => {
    producer = kafka.producer();
    return new KafkaOrderEventPublisher(producer);
  })();

  let kafkaConsumer: Consumer | undefined;
  const repository = new PostgresOrderRepository(database);
  const billingService = new BillingService(
    new PostgresBillingRepository(database),
    repository,
    new PaymentGateway(),
    database,
  );
  const consumer = options.consumer ?? (() => {
    kafkaConsumer = kafka.consumer({ groupId: 'billing-order-created' });
    return new BillingOrderCreatedConsumer(kafkaConsumer, billingService);
  })();

  const orderService = new OrderService(repository, publisher, database);
  const orderController = new OrderController(orderService);
  const adminOrderController = new AdminOrderController(orderService);
  const reportOrderController = new ReportOrderController(orderService);
  const billingController = new BillingController(billingService);

  app.register(orderRoutes, {
    prefix: '/api/v1',
    controller: orderController,
  });
  app.register(adminOrderRoutes, {
    prefix: '/api/v1/admin',
    controller: adminOrderController,
  });
  app.register(reportOrderRoutes, {
    prefix: '/api/v1/reports',
    controller: reportOrderController,
  });
  app.register(billingRoutes, {
    prefix: '/api/v1/billing',
    controller: billingController,
  });

  app.addHook('onReady', async () => {
    if (producer !== undefined) {
      await producer.connect();
    }
    await consumer.start();
  });

  app.addHook('onClose', async () => {
    if (kafkaConsumer !== undefined) {
      await kafkaConsumer.disconnect();
    }
    if (producer !== undefined) {
      await producer.disconnect();
    }
    if (options.database === undefined) {
      await database.end();
    }
  });

  return app;
}
