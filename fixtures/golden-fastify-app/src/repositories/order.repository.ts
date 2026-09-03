export interface Order {
  id: string;
  customerId: string;
  amount: number;
  currency: string;
  status: string;
}

export type CreateOrderInput = Pick<Order, 'customerId' | 'amount' | 'currency'>;
export type UpdateOrderInput = Partial<Pick<Order, 'customerId' | 'amount' | 'currency' | 'status'>>;

export interface OrderRepository {
  save(order: Order): Promise<Order>;
  findById(id: string): Promise<Order | null>;
  update(id: string, order: UpdateOrderInput): Promise<Order | null>;
  delete(id: string): Promise<void>;
  bulkSetStatus(ids: string[], status: string): Promise<number>;
}
