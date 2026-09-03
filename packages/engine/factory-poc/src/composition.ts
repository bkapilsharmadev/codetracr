import { createRepository } from "./repository-factory";
import {
  DynamicOrderService,
  StaticOrderService
} from "./services";

export function buildStaticService() {
  return new StaticOrderService(
    createRepository({ db: "postgres" })
  );
}

export function buildDynamicService() {
  return new DynamicOrderService(
    createRepository({ db: process.env.DB_KIND })
  );
}
