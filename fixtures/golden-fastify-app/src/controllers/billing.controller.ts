import type { FastifyReply, FastifyRequest } from 'fastify';
import type { BillingService } from '../services/billing.service.js';

interface BillingParams {
  orderId: string;
}

export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  async getSummary(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const summary = await this.billingService.getSummary();
    await reply.send(summary);
  }

  async charge(
    request: FastifyRequest<{ Params: BillingParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const record = await this.billingService.chargeOrder(request.params.orderId);
    await reply.code(201).send(record);
  }
}
