import type {
  Consumer,
  EachMessageHandler,
  KafkaMessage,
  Producer,
  ProducerRecord,
} from 'kafkajs';
import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ORDER_CREATED_TOPIC,
  ORDER_DELETED_TOPIC,
  ORDER_UPDATED_TOPIC,
  PAYMENT_API_URL,
} from '../src/config/config.js';
import { OrderController } from '../src/controllers/order.controller.js';
import { KafkaOrderEventConsumer } from '../src/events/kafka-order-event.consumer.js';
import { KafkaOrderEventPublisher } from '../src/events/kafka-order-event.publisher.js';
import { PaymentGateway } from '../src/external/payment-gateway.js';
import type {
  Order,
  OrderRepository,
} from '../src/repositories/order.repository.js';
import { PostgresOrderRepository } from '../src/repositories/postgres-order.repository.js';
import { BillingService } from '../src/services/billing.service.js';
import { OrderService } from '../src/services/order.service.js';

const order: Order = {
  id: 'order-1',
  customerId: 'customer-1',
  amount: 12,
  currency: 'USD',
  status: 'created',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('infrastructure adapters', () => {
  it('implements OrderRepository with parameterized SQL against orders', async () => {
    const query = vi.fn(async (text: string, _values?: readonly unknown[]) => {
      if (text.startsWith('DELETE')) {
        return { rows: [] };
      }
      return { rows: [order] };
    });
    const database = { query } as unknown as Pool;
    const repository: OrderRepository = new PostgresOrderRepository(database);

    await repository.save(order);
    await repository.findById(order.id);
    await repository.update(order.id, { status: 'paid' });
    await repository.delete(order.id);

    const statements = query.mock.calls.map(([text]) => text);
    expect(statements[0]).toContain('INSERT INTO orders');
    expect(statements[1]).toContain('FROM orders');
    expect(statements[2]).toContain('UPDATE orders');
    expect(statements[3]).toContain('DELETE FROM orders');
    expect(query.mock.calls.every((call) => call[1] !== undefined)).toBe(true);
  });

  it('publishes each order event through its configured Kafka topic', async () => {
    const send = vi.fn(async (_request: ProducerRecord) => []);
    const publisher = new KafkaOrderEventPublisher({ send } as unknown as Producer);

    await publisher.publishOrderCreated(order);
    await publisher.publishOrderUpdated(order);
    await publisher.publishOrderDeleted({ id: order.id });

    expect(send.mock.calls.map(([request]) => request.topic)).toEqual([
      ORDER_CREATED_TOPIC,
      ORDER_UPDATED_TOPIC,
      ORDER_DELETED_TOPIC,
    ]);
  });

  it('subscribes to order.created and reaches billing through eachMessage', async () => {
    let eachMessage: EachMessageHandler | undefined;
    const consumer = {
      connect: vi.fn(async () => undefined),
      subscribe: vi.fn(async () => undefined),
      run: vi.fn(async (config: { eachMessage?: EachMessageHandler }) => {
        eachMessage = config.eachMessage;
      }),
    } as unknown as Consumer;
    const billingService = new BillingService();
    const handleOrderCreated = vi.spyOn(billingService, 'handleOrderCreated');
    const eventConsumer = new KafkaOrderEventConsumer(consumer, billingService);

    await eventConsumer.start();
    const message: KafkaMessage = {
      key: Buffer.from(order.id),
      value: Buffer.from(JSON.stringify(order)),
      timestamp: '0',
      attributes: 0,
      offset: '1',
      headers: {},
    };
    await eachMessage?.({
      topic: ORDER_CREATED_TOPIC,
      partition: 0,
      message,
      heartbeat: async () => undefined,
      pause: () => () => undefined,
    });

    expect(consumer.subscribe).toHaveBeenCalledWith({
      topic: ORDER_CREATED_TOPIC,
      fromBeginning: false,
    });
    expect(handleOrderCreated).toHaveBeenCalledWith(order);
  });

  it('uses native fetch with the configured payment URL', async () => {
    const response = new Response(null, { status: 202 });
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await new PaymentGateway().charge({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });

    expect(result).toBe(response);
    expect(fetchMock).toHaveBeenCalledWith(
      PAYMENT_API_URL,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('exposes the specified controller, service, publisher, and consumer methods', () => {
    expect(typeof OrderController.prototype.create).toBe('function');
    expect(typeof OrderController.prototype.getById).toBe('function');
    expect(typeof OrderController.prototype.getOrderCount).toBe('function');
    expect(typeof OrderController.prototype.update).toBe('function');
    expect(typeof OrderController.prototype.delete).toBe('function');
    expect(typeof OrderService.prototype.create).toBe('function');
    expect(typeof OrderService.prototype.getById).toBe('function');
    expect(typeof OrderService.prototype.getOrderCount).toBe('function');
    expect(typeof OrderService.prototype.update).toBe('function');
    expect(typeof OrderService.prototype.delete).toBe('function');
    expect(typeof OrderService.prototype.prepareOrder).toBe('function');
    expect(typeof OrderService.prototype.validateOrder).toBe('function');
    expect(typeof KafkaOrderEventPublisher.prototype.publishOrderCreated).toBe('function');
    expect(typeof KafkaOrderEventPublisher.prototype.publishOrderUpdated).toBe('function');
    expect(typeof KafkaOrderEventPublisher.prototype.publishOrderDeleted).toBe('function');
    expect(typeof KafkaOrderEventConsumer.prototype.start).toBe('function');
    expect(PAYMENT_API_URL).toBe('https://payments.example.com/v1/charges');
  });
});
