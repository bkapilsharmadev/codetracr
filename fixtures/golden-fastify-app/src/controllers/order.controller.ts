import type { FastifyReply, FastifyRequest } from 'fastify';
import type {
  CreateOrderInput,
  UpdateOrderInput,
} from '../repositories/order.repository.js';
import type { OrderService } from '../services/order.service.js';

interface OrderParams {
  id: string;
}

export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  async create(
    request: FastifyRequest<{ Body: CreateOrderInput }>,
    reply: FastifyReply,
  ): Promise<void> {
    const order = await this.orderService.create(request.body);
    await reply.code(201).send(order);
  }

  async getById(
    request: FastifyRequest<{ Params: OrderParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const order = await this.orderService.getById(request.params.id);
    if (order === null) {
      await reply.code(404).send({ message: 'Order not found' });
      return;
    }
    await reply.send(order);
  }

  async getOrderCount(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const count = await this.orderService.getOrderCount();
    await reply.send({ count });
  }

  async update(
    request: FastifyRequest<{ Params: OrderParams; Body: UpdateOrderInput }>,
    reply: FastifyReply,
  ): Promise<void> {
    const order = await this.orderService.update(request.params.id, request.body);
    if (order === null) {
      await reply.code(404).send({ message: 'Order not found' });
      return;
    }
    await reply.send(order);
  }

  async delete(
    request: FastifyRequest<{ Params: OrderParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    await this.orderService.delete(request.params.id);
    await reply.code(204).send();
  }
}
