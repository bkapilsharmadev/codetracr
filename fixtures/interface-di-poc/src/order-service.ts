import { OrderRepository } from "./order-repository";

export class OrderService {
  constructor(private repository: OrderRepository) {}

  async create(data: any) {
    await this.repository.save(data);
  }
}
