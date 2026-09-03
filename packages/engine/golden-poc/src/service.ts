import { OrderRepository } from "./repository";

export class OrderService {
  private repository = new OrderRepository();

  async create(data: any) {
    const order = {
      ...data,
      id: "123"
    };

    await this.repository.save(order);

    return order;
  }
}
