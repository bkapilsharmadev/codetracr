export const PAYMENT_API_URL = 'https://payments.example.com/v1/charges';
export const ORDER_CREATED_TOPIC = 'order.created';
export const ORDER_UPDATED_TOPIC = 'order.updated';
export const ORDER_DELETED_TOPIC = 'order.deleted';
export const BILLING_CHARGE_TOPIC = 'billing.charge.requested';

export const PORT = Number(process.env.PORT ?? 3000);
export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/orders';
export const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
