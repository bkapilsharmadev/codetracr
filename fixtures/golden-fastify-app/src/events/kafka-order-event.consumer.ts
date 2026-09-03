import type { Consumer } from 'kafkajs';
import { ORDER_CREATED_TOPIC } from '../config/config.js';
import type { Order } from '../repositories/order.repository.js';
import type { BillingService } from '../services/billing.service.js';
import type { EventConsumer } from './event-consumer.js';

export class KafkaOrderEventConsumer implements EventConsumer {
  constructor(
    private readonly consumer: Consumer,
    private readonly billingService: BillingService,
  ) {}

  async start(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: ORDER_CREATED_TOPIC,
      fromBeginning: false,
    });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (message.value === null) {
          return;
        }
        const order = JSON.parse(message.value.toString()) as Order;
        await this.billingService.handleOrderCreated(order);
      },
    });
  }
}
