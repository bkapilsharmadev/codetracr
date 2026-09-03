import { PAYMENT_API_URL } from '../config/config.js';

export interface ChargeRequest {
  orderId: string;
  amount: number;
  currency: string;
}

export class PaymentGateway {
  async charge(request: ChargeRequest): Promise<Response> {
    return fetch(PAYMENT_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
    });
  }
}
