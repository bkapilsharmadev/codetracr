import type { Pool } from 'pg';
import type { BillingRecord } from '../services/billing.service.js';

export interface BillingChargeRow {
  orderId: string;
  amount: number;
  currency: string;
  status: BillingRecord['status'];
}

export class PostgresBillingRepository {
  constructor(private readonly database: Pool) {}

  async insertCharge(row: BillingChargeRow): Promise<BillingRecord> {
    const result = await this.database.query<BillingRecord>(
      `INSERT INTO billing_ledger (order_id, amount, currency, status)
       VALUES ($1, $2, $3, $4)
       RETURNING order_id AS "orderId", amount, currency, status`,
      [row.orderId, row.amount, row.currency, row.status],
    );
    return result.rows[0]!;
  }
}
