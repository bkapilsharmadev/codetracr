import { OrderRepository } from "./order-repository";

export class PostgresOrderRepository implements OrderRepository {
  async save(order: any): Promise<void> {
    void order;
  }
}

export class InMemoryOrderRepository implements OrderRepository {
  async save(order: any): Promise<void> {
    void order;
  }
}

export class UnusedOrderRepository implements OrderRepository {
  async save(order: any): Promise<void> {
    void order;
  }
}
