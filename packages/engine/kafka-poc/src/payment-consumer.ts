import type { Consumer } from "kafkajs";
import { PAYMENT_CREATED_TOPIC } from "./topics";

export class PaymentCreatedConsumer {
  constructor(private consumer: Consumer) {}

  async start() {
    await this.consumer.subscribe({
      topic: PAYMENT_CREATED_TOPIC
    });

    await this.consumer.run({
      eachMessage: this.handle
    });
  }

  async handle(event: any) {
    return event;
  }
}
