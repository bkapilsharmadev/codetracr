import { OrderService } from "./service";

export class OrderController {
  private service = new OrderService();

  async create(request: any, reply: any) {
    const order = await this.service.create(request.body);
    return reply.send(order);
  }
}
