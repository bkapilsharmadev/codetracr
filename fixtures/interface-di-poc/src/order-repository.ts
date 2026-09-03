export interface OrderRepository {
  save(order: any): Promise<void>;
}
