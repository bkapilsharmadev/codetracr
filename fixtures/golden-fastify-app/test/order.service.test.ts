import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { EventPublisher } from '../src/events/event-publisher.js';
import type {
  Order,
  OrderRepository,
} from '../src/repositories/order.repository.js';
import { OrderService } from '../src/services/order.service.js';

const order: Order = {
  id: 'order-1',
  customerId: 'customer-1',
  amount: 10,
  currency: 'USD',
  status: 'created',
};

describe('OrderService', () => {
  it('routes all endpoint methods through prepareOrder and only writes through validateOrder', async () => {
    const repository: OrderRepository = {
      save: vi.fn(async (saved) => saved),
      findById: vi.fn(async () => order),
      update: vi.fn(async () => order),
      delete: vi.fn(async () => undefined),
    };
    const publisher: EventPublisher = {
      publishOrderCreated: vi.fn(async () => undefined),
      publishOrderUpdated: vi.fn(async () => undefined),
      publishOrderDeleted: vi.fn(async () => undefined),
    };
    const database = {
      query: vi.fn(async () => ({ rows: [{ count: '3' }] })),
    } as unknown as Pool;
    const service = new OrderService(repository, publisher, database);
    const prepareOrder = vi.spyOn(service, 'prepareOrder');
    const validateOrder = vi.spyOn(service, 'validateOrder');

    await service.create({ customerId: ' customer-1 ', amount: 10, currency: 'usd' });
    await service.getById('order-1');
    await service.getOrderCount();
    await service.update('order-1', { status: 'paid' });
    await service.delete('order-1');

    expect(prepareOrder).toHaveBeenCalledTimes(5);
    expect(validateOrder).toHaveBeenCalledTimes(3);
    expect(repository.save).toHaveBeenCalledOnce();
    expect(repository.findById).toHaveBeenCalledWith('order-1');
    expect(repository.update).toHaveBeenCalledOnce();
    expect(repository.delete).toHaveBeenCalledWith('order-1');
    expect(database.query).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'SELECT COUNT(*) FROM orders' }),
    );
    expect(publisher.publishOrderCreated).toHaveBeenCalledOnce();
    expect(publisher.publishOrderUpdated).toHaveBeenCalledOnce();
    expect(publisher.publishOrderDeleted).toHaveBeenCalledOnce();
  });

  it('normalizes order data and rejects invalid write data', () => {
    const service = new OrderService(
      {} as OrderRepository,
      {} as EventPublisher,
      {} as Pool,
    );

    expect(
      service.prepareOrder({
        customerId: ' customer-1 ',
        currency: ' usd ',
        status: ' CREATED ',
      }),
    ).toEqual({
      customerId: 'customer-1',
      currency: 'USD',
      status: 'created',
    });
    expect(() => service.validateOrder({ amount: -1 })).toThrow(
      'Order amount must be a non-negative number',
    );
  });
});
