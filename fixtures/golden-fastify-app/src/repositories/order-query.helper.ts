import type { Pool } from 'pg';

export interface OrderStatusSummary {
  status: string;
  count: number;
}

export interface OrderRevenueSummary {
  orderCount: number;
  totalAmount: number;
}

/** Shared read helpers used by reports, admin, and order count paths. */
export class OrderQueryHelper {
  constructor(private readonly database: Pool) {}

  async countAll(): Promise<number> {
    const result = await this.database.query<{ count: string }>(
      'SELECT COUNT(*) FROM orders',
      [],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async countByStatus(status: string): Promise<number> {
    const result = await this.database.query<{ count: string }>(
      'SELECT COUNT(*) FROM orders WHERE status = $1',
      [status],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async summarizeByStatus(): Promise<OrderStatusSummary[]> {
    const result = await this.database.query<OrderStatusSummary>(
      `SELECT status, COUNT(*)::int AS count
       FROM orders
       GROUP BY status
       ORDER BY status`,
      [],
    );
    return result.rows;
  }

  async revenueSummary(): Promise<OrderRevenueSummary> {
    const result = await this.database.query<{ orderCount: string; totalAmount: string }>(
      `SELECT COUNT(*)::int AS "orderCount", COALESCE(SUM(amount), 0)::float AS "totalAmount"
       FROM orders`,
      [],
    );
    const row = result.rows[0];
    return {
      orderCount: Number(row?.orderCount ?? 0),
      totalAmount: Number(row?.totalAmount ?? 0),
    };
  }
}
