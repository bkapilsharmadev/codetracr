import { db } from "./database";

export class OrderRepository {
  async save(order: any) {
    await db.query(
      "INSERT INTO orders (id) VALUES ($1)",
      [order.id]
    );
  }
}
