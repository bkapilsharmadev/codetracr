import { OrderRepository } from "./order-repository";

export class PostgresOrderRepository implements OrderRepository {
  async save(order: any): Promise<void> {
    void order;
  }
}
