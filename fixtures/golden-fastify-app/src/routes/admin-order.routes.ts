import type { FastifyPluginAsync } from 'fastify';
import type { AdminOrderController } from '../controllers/admin-order.controller.js';
import type { UpdateOrderInput } from '../repositories/order.repository.js';
import { BulkArchiveSchema, UpdateOrderSchema } from '../schemas/order.schema.js';

interface AdminOrderRouteOptions {
  controller: AdminOrderController;
}

interface OrderParams {
  id: string;
}

const adminOrderEndpoints: FastifyPluginAsync<AdminOrderRouteOptions> = async (app, options) => {
  const { controller } = options;

  app.post<{ Body: { ids: string[] } }>(
    '/bulk-archive',
    { schema: BulkArchiveSchema },
    (request, reply) => controller.bulkArchive(request, reply),
  );
  app.post<{ Params: OrderParams }>(
    '/:id/force-cancel',
    (request, reply) => controller.forceCancel(request, reply),
  );
  app.patch<{ Params: OrderParams; Body: UpdateOrderInput }>(
    '/:id',
    { schema: UpdateOrderSchema },
    (request, reply) => controller.update(request, reply),
  );
};

export const adminOrderRoutes: FastifyPluginAsync<AdminOrderRouteOptions> = async (app, options) => {
  await app.register(adminOrderEndpoints, {
    prefix: '/orders',
    controller: options.controller,
  });
};
