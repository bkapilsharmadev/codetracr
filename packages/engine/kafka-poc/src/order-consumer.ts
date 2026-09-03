import type { Consumer } from "kafkajs";
import { ORDER_CREATED_TOPIC } from "./topics";

export class OrderCreatedConsumer {
  constructor(private consumer: Consumer) {}

  async start() {
    await this.consumer.subscribe({
      topic: ORDER_CREATED_TOPIC
    });

    await this.consumer.run({
      eachMessage: this.handle
    });
  }

  async handle(event: any) {
    return event;
  }
}
