import { OrderRepository } from "./order-repository";

export class InMemoryOrderRepository implements OrderRepository {
  async save(order: any): Promise<void> {
    void order;
  }
}
