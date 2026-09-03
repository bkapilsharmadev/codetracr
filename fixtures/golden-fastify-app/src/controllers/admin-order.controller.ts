import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UpdateOrderInput } from '../repositories/order.repository.js';
import type { OrderService } from '../services/order.service.js';

interface BulkArchiveBody {
  ids: string[];
}

interface OrderParams {
  id: string;
}

export class AdminOrderController {
  constructor(private readonly orderService: OrderService) {}

  async bulkArchive(
    request: FastifyRequest<{ Body: BulkArchiveBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await this.orderService.bulkArchive(request.body.ids);
    await reply.send(result);
  }

  async forceCancel(
    request: FastifyRequest<{ Params: OrderParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const order = await this.orderService.forceCancel(request.params.id);
    if (order === null) {
      await reply.code(404).send({ message: 'Order not found' });
      return;
    }
    await reply.send(order);
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
}
