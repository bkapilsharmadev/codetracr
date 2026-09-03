import type { Pool } from 'pg';
import { BILLING_CHARGE_TOPIC } from '../config/config.js';
import type { PaymentGateway } from '../external/payment-gateway.js';
import type { OrderRepository } from '../repositories/order.repository.js';
import type { PostgresBillingRepository } from '../repositories/postgres-billing.repository.js';

export interface BillingRecord {
  orderId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'charged';
}

export class BillingService {
  constructor(
    private readonly repository: PostgresBillingRepository,
    private readonly orderRepository: OrderRepository,
    private readonly gateway: PaymentGateway,
    private readonly database: Pool,
  ) {}

  async getSummary(): Promise<{ pending: number }> {
    const result = await this.database.query<{ count: string }>(
      'SELECT COUNT(*) FROM billing_ledger WHERE status = $1',
      ['pending'],
    );
    return { pending: Number(result.rows[0]?.count ?? 0) };
  }

  async chargeOrder(orderId: string): Promise<BillingRecord> {
    const order = await this.orderRepository.findById(orderId);
    if (order === null) {
      throw new Error('Order not found');
    }
    const saved = await this.repository.insertCharge({
      orderId,
      amount: order.amount,
      currency: order.currency,
      status: 'pending',
    });
    await this.gateway.charge({ orderId, amount: saved.amount, currency: saved.currency });
    await this.database.query(
      `UPDATE billing_ledger SET status = 'charged' WHERE order_id = $1`,
      [orderId],
    );
    await this.publishChargeRequested(orderId);
    return { ...saved, status: 'charged' };
  }

  async handleOrderCreated(order: { id: string; amount: number; currency: string }): Promise<BillingRecord> {
    return this.repository.insertCharge({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency.toUpperCase(),
      status: 'pending',
    });
  }

  private async publishChargeRequested(orderId: string): Promise<void> {
    void orderId;
    void BILLING_CHARGE_TOPIC;
  }
}
