import { ORDER_CREATED_TOPIC } from "./topics";

class LocalProducer {
  async send(value: any) {
    return value;
  }
}

export class UnrelatedPublisher {
  private producer = new LocalProducer();

  async publish(order: any) {
    await this.producer.send({
      topic: ORDER_CREATED_TOPIC,
      messages: [order]
    });
  }
}
