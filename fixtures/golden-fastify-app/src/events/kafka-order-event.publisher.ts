import type { Producer } from 'kafkajs';
import {
  ORDER_CREATED_TOPIC,
  ORDER_DELETED_TOPIC,
  ORDER_UPDATED_TOPIC,
} from '../config/config.js';
import type { Order } from '../repositories/order.repository.js';
import type { EventPublisher } from './event-publisher.js';

export class KafkaOrderEventPublisher implements EventPublisher {
  constructor(private readonly producer: Producer) {}

  async publishOrderCreated(order: Order): Promise<void> {
    await this.producer.send({
      topic: ORDER_CREATED_TOPIC,
      messages: [{ key: order.id, value: JSON.stringify(order) }],
    });
  }

  async publishOrderUpdated(order: Order): Promise<void> {
    await this.producer.send({
      topic: ORDER_UPDATED_TOPIC,
      messages: [{ key: order.id, value: JSON.stringify(order) }],
    });
  }

  async publishOrderDeleted(order: Pick<Order, 'id'>): Promise<void> {
    await this.producer.send({
      topic: ORDER_DELETED_TOPIC,
      messages: [{ key: order.id, value: JSON.stringify(order) }],
    });
  }
}
