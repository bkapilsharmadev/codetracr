import type { FastifyPluginAsync } from 'fastify';
import type { OrderController } from '../controllers/order.controller.js';
import type {
  CreateOrderInput,
  UpdateOrderInput,
} from '../repositories/order.repository.js';
import { CreateOrderSchema, UpdateOrderSchema } from '../schemas/order.schema.js';

interface OrderRouteOptions {
  controller: OrderController;
}

interface OrderParams {
  id: string;
}

const orderEndpoints: FastifyPluginAsync<OrderRouteOptions> = async (app, options) => {
  const { controller } = options;

  app.post<{ Body: CreateOrderInput }>(
    '/',
    { schema: CreateOrderSchema },
    (request, reply) => controller.create(request, reply),
  );
  app.get<{ Params: OrderParams }>('/:id', (request, reply) =>
    controller.getById(request, reply),
  );
  app.get('-count', (request, reply) =>
    controller.getOrderCount(request, reply),
  );
  app.patch<{ Params: OrderParams; Body: UpdateOrderInput }>(
    '/:id',
    { schema: UpdateOrderSchema },
    (request, reply) => controller.update(request, reply),
  );
  app.delete<{ Params: OrderParams }>('/:id', (request, reply) =>
    controller.delete(request, reply),
  );
};

export const orderRoutes: FastifyPluginAsync<OrderRouteOptions> = async (app, options) => {
  await app.register(orderEndpoints, {
    prefix: '/orders',
    controller: options.controller,
  });
};
