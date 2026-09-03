import type { Pool } from 'pg';
import type {
  Order,
  OrderRepository,
  UpdateOrderInput,
} from './order.repository.js';

export class PostgresOrderRepository implements OrderRepository {
  constructor(private readonly database: Pool) {}

  async save(order: Order): Promise<Order> {
    const result = await this.database.query<Order>(
      `INSERT INTO orders (id, customer_id, amount, currency, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, customer_id AS "customerId", amount, currency, status`,
      [order.id, order.customerId, order.amount, order.currency, order.status],
    );
    return result.rows[0] as Order;
  }

  async findById(id: string): Promise<Order | null> {
    const result = await this.database.query<Order>(
      `SELECT id, customer_id AS "customerId", amount, currency, status
       FROM orders
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async update(id: string, order: UpdateOrderInput): Promise<Order | null> {
    const result = await this.database.query<Order>(
      `UPDATE orders
       SET customer_id = COALESCE($2, customer_id),
           amount = COALESCE($3, amount),
           currency = COALESCE($4, currency),
           status = COALESCE($5, status)
       WHERE id = $1
       RETURNING id, customer_id AS "customerId", amount, currency, status`,
      [id, order.customerId, order.amount, order.currency, order.status],
    );
    return result.rows[0] ?? null;
  }

  async delete(id: string): Promise<void> {
    await this.database.query('DELETE FROM orders WHERE id = $1', [id]);
  }

  async bulkSetStatus(ids: string[], status: string): Promise<number> {
    const result = await this.database.query(
      `UPDATE orders SET status = $1 WHERE id = ANY($2::text[])`,
      [status, ids],
    );
    return result.rowCount ?? 0;
  }
}
