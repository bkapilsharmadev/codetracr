import { OrderRepository } from "./order-repository";

export class StaticOrderService {
  constructor(private repository: OrderRepository) {}

  async create(data: any) {
    await this.repository.save(data);
  }
}

export class DynamicOrderService {
  constructor(private repository: OrderRepository) {}

  async create(data: any) {
    await this.repository.save(data);
  }
}
