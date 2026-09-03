import type { FastifyReply, FastifyRequest } from 'fastify';
import type { OrderService } from '../services/order.service.js';

export class ReportOrderController {
  constructor(private readonly orderService: OrderService) {}

  async getSummary(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const report = await this.orderService.getStatusReport();
    await reply.send(report);
  }

  async getRevenue(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const report = await this.orderService.getRevenueReport();
    await reply.send(report);
  }
}
