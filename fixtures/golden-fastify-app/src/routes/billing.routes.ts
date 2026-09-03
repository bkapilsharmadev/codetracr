import type { FastifyPluginAsync } from 'fastify';
import type { BillingController } from '../controllers/billing.controller.js';

interface BillingRouteOptions {
  controller: BillingController;
}

export const billingRoutes: FastifyPluginAsync<BillingRouteOptions> = async (app, options) => {
  const { controller } = options;

  app.get('/summary', (request, reply) => controller.getSummary(request, reply));
  app.post('/charge/:orderId', (request, reply) => controller.charge(request, reply));
};
