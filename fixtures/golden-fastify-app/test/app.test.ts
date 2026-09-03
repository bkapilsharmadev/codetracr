import type { Consumer } from 'kafkajs';
import type { Pool, QueryConfig } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { EventConsumer } from '../src/events/event-consumer.js';
import type { EventPublisher } from '../src/events/event-publisher.js';
import type { Order } from '../src/repositories/order.repository.js';

const order: Order = {
  id: 'order-1',
  customerId: 'customer-1',
  amount: 25,
  currency: 'USD',
  status: 'created',
};

function queryText(query: string | QueryConfig): string {
  return typeof query === 'string' ? query : query.text;
}

describe('Fastify application', () => {
  const apps: ReturnType<typeof buildApp>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('registers exactly the five specified public routes with composed prefixes', async () => {
    const query = vi.fn(async (statement: string | QueryConfig) => {
      const text = queryText(statement);
      if (text.includes('COUNT(*)')) {
        return { rows: [{ count: '1' }] };
      }
      if (text.startsWith('DELETE')) {
        return { rows: [] };
      }
      return { rows: [order] };
    });
    const database = { query } as unknown as Pool;
    const publisher: EventPublisher = {
      publishOrderCreated: vi.fn(async () => undefined),
      publishOrderUpdated: vi.fn(async () => undefined),
      publishOrderDeleted: vi.fn(async () => undefined),
    };
    const consumer: EventConsumer = {
      start: vi.fn(async () => undefined),
    };
    const app = buildApp({ database, publisher, consumer });
    apps.push(app);

    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: { customerId: 'customer-1', amount: 25, currency: 'usd' },
    });
    const get = await app.inject({ method: 'GET', url: '/api/v1/orders/order-1' });
    const count = await app.inject({ method: 'GET', url: '/api/v1/orders-count' });
    const update = await app.inject({
      method: 'PATCH',
      url: '/api/v1/orders/order-1',
      payload: { status: 'paid' },
    });
    const remove = await app.inject({
      method: 'DELETE',
      url: '/api/v1/orders/order-1',
    });

    expect(create.statusCode).toBe(201);
    expect(get.statusCode).toBe(200);
    expect(count.json()).toEqual({ count: 1 });
    expect(update.statusCode).toBe(200);
    expect(remove.statusCode).toBe(204);
    expect((consumer.start as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();

  });

  it('applies CreateOrderSchema to the POST route', async () => {
    const database = { query: vi.fn() } as unknown as Pool;
    const publisher = {
      publishOrderCreated: vi.fn(),
      publishOrderUpdated: vi.fn(),
      publishOrderDeleted: vi.fn(),
    } as unknown as EventPublisher;
    const consumer = {
      start: vi.fn(async () => undefined),
    } as EventConsumer;
    const app = buildApp({ database, publisher, consumer });
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: { customerId: 'customer-1' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('registers admin, report, and billing routes that share order data paths', async () => {
    const query = vi.fn(async (statement: string | QueryConfig) => {
      const text = queryText(statement);
      if (text.includes('GROUP BY status')) {
        return { rows: [{ status: 'created', count: 2 }] };
      }
      if (text.includes('SUM(amount)')) {
        return { rows: [{ orderCount: '2', totalAmount: '50' }] };
      }
      if (text.includes('ANY($2')) {
        return { rowCount: 2, rows: [] };
      }
      if (text.includes('COUNT(*)')) {
        return { rows: [{ count: '2' }] };
      }
      return { rows: [order] };
    });
    const database = { query } as unknown as Pool;
    const publisher = {
      publishOrderCreated: vi.fn(),
      publishOrderUpdated: vi.fn(),
      publishOrderDeleted: vi.fn(),
    } as unknown as EventPublisher;
    const consumer = { start: vi.fn(async () => undefined) } as EventConsumer;
    const app = buildApp({ database, publisher, consumer });
    apps.push(app);

    const archive = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/orders/bulk-archive',
      payload: { ids: ['order-1', 'order-2'] },
    });
    const cancel = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/orders/order-1/force-cancel',
    });
    const adminPatch = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/orders/order-1',
      payload: { status: 'review' },
    });
    const report = await app.inject({ method: 'GET', url: '/api/v1/reports/orders/summary' });
    const revenue = await app.inject({ method: 'GET', url: '/api/v1/reports/orders/revenue' });
    const charge = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/charge/order-1',
    });

    expect(archive.statusCode).toBe(200);
    expect(cancel.statusCode).toBe(200);
    expect(adminPatch.statusCode).toBe(200);
    expect(report.statusCode).toBe(200);
    expect(revenue.statusCode).toBe(200);
    expect(charge.statusCode).toBe(201);
  });
});
