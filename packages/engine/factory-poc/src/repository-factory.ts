import { OrderRepository } from "./order-repository";
import {
  InMemoryOrderRepository,
  PostgresOrderRepository
} from "./repositories";

export function createRepository(config: any): OrderRepository {
  if (config.db === "postgres") {
    return new PostgresOrderRepository();
  }

  return new InMemoryOrderRepository();
}
