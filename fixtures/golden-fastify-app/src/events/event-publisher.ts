import type { Order } from '../repositories/order.repository.js';

export interface EventPublisher {
  publishOrderCreated(order: Order): Promise<void>;
  publishOrderUpdated(order: Order): Promise<void>;
  publishOrderDeleted(order: Pick<Order, 'id'>): Promise<void>;
}
