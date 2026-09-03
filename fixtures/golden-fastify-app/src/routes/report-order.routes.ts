import type { FastifyPluginAsync } from 'fastify';
import type { ReportOrderController } from '../controllers/report-order.controller.js';

interface ReportOrderRouteOptions {
  controller: ReportOrderController;
}

const reportOrderEndpoints: FastifyPluginAsync<ReportOrderRouteOptions> = async (app, options) => {
  const { controller } = options;

  app.get('/summary', (request, reply) => controller.getSummary(request, reply));
  app.get('/revenue', (request, reply) => controller.getRevenue(request, reply));
};

export const reportOrderRoutes: FastifyPluginAsync<ReportOrderRouteOptions> = async (app, options) => {
  await app.register(reportOrderEndpoints, {
    prefix: '/orders',
    controller: options.controller,
  });
};
