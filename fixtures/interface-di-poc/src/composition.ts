import { OrderService } from "./order-service";
import { PostgresOrderRepository } from "./postgres-order-repository";

export function buildOrderService() {
  return new OrderService(
    new PostgresOrderRepository()
  );
}
