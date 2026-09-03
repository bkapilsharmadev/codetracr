import { OrderController } from "./controller";

const controller = new OrderController();

export async function routes(app: any) {
  app.post(
    "/orders",
    controller.create
  );
}
