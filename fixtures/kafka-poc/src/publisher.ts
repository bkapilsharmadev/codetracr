import type { Producer } from "kafkajs";
import { ORDER_CREATED_TOPIC } from "./topics";

export class OrderEventPublisher {
  constructor(private producer: Producer) {}

  async publish(order: any) {
    await this.producer.send({
      topic: ORDER_CREATED_TOPIC,
      messages: [{ value: order }]
    });
  }
}
