import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { EventPublisher } from '../events/event-publisher.js';
import type {
  CreateOrderInput,
  Order,
  OrderRepository,
  UpdateOrderInput,
} from '../repositories/order.repository.js';
import { OrderQueryHelper } from '../repositories/order-query.helper.js';

export class OrderService {
  private readonly queryHelper: OrderQueryHelper;

  constructor(
    private readonly repository: OrderRepository,
    private readonly publisher: EventPublisher,
    database: Pool,
  ) {
    this.queryHelper = new OrderQueryHelper(database);
  }

  async create(input: CreateOrderInput): Promise<Order> {
    const prepared = this.prepareOrder({
      ...input,
      id: randomUUID(),
      status: 'created',
    });
    this.validateOrder(prepared);

    const order: Order = {
      id: prepared.id!,
      customerId: prepared.customerId!,
      amount: prepared.amount!,
      currency: prepared.currency!,
      status: prepared.status!,
    };
    const saved = await this.repository.save(order);
    await this.publisher.publishOrderCreated(saved);
    return saved;
  }

  async getById(id: string): Promise<Order | null> {
    const prepared = this.prepareOrder({ id });
    return this.repository.findById(prepared.id!);
  }

  async getOrderCount(): Promise<number> {
    const operation = this.prepareOrder({ status: 'count' });
    void operation;
    return this.queryHelper.countAll();
  }

  async update(id: string, input: UpdateOrderInput): Promise<Order | null> {
    const prepared = this.prepareOrder({ ...input, id });
    this.validateOrder(prepared);
    const updated = await this.repository.update(id, prepared);
    if (updated !== null) {
      await this.publisher.publishOrderUpdated(updated);
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    const prepared = this.prepareOrder({ id });
    this.validateOrder(prepared);
    await this.repository.delete(prepared.id!);
    await this.publisher.publishOrderDeleted({ id: prepared.id! });
  }

  async bulkArchive(ids: string[]): Promise<{ archived: number }> {
    const normalized = ids.map((id) => this.prepareOrder({ id }).id!);
    for (const id of normalized) {
      this.validateOrder({ id });
    }
    const archived = await this.repository.bulkSetStatus(normalized, 'archived');
    return { archived };
  }

  async forceCancel(id: string): Promise<Order | null> {
    const prepared = this.prepareOrder({ id, status: 'cancelled' });
    this.validateOrder(prepared);
    const updated = await this.repository.update(id, { status: 'cancelled' });
    if (updated !== null) {
      await this.publisher.publishOrderUpdated(updated);
    }
    return updated;
  }

  async getStatusReport(): Promise<{ byStatus: Awaited<ReturnType<OrderQueryHelper['summarizeByStatus']>> }> {
    return { byStatus: await this.queryHelper.summarizeByStatus() };
  }

  async getRevenueReport(): Promise<Awaited<ReturnType<OrderQueryHelper['revenueSummary']>>> {
    return this.queryHelper.revenueSummary();
  }

  prepareOrder(order: Partial<Order>): Partial<Order> {
    return {
      ...order,
      ...(order.customerId === undefined ? {} : { customerId: order.customerId.trim() }),
      ...(order.currency === undefined ? {} : { currency: order.currency.trim().toUpperCase() }),
      ...(order.status === undefined ? {} : { status: order.status.trim().toLowerCase() }),
    };
  }

  validateOrder(order: Partial<Order>): void {
    if (order.id !== undefined && order.id.trim() === '') {
      throw new Error('Order id is required');
    }
    if (order.customerId !== undefined && order.customerId === '') {
      throw new Error('Customer id is required');
    }
    if (order.amount !== undefined && (!Number.isFinite(order.amount) || order.amount < 0)) {
      throw new Error('Order amount must be a non-negative number');
    }
    if (order.currency !== undefined && order.currency === '') {
      throw new Error('Order currency is required');
    }
  }
}
