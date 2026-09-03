import type { Consumer } from 'kafkajs';
import { KafkaOrderEventConsumer } from '../events/kafka-order-event.consumer.js';
import type { BillingService } from '../services/billing.service.js';

export class BillingOrderCreatedConsumer extends KafkaOrderEventConsumer {
  constructor(consumer: Consumer, billingService: BillingService) {
    super(consumer, billingService);
  }
}
