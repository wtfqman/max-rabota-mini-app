import { ExternalApiError } from '@rabst24/shared';
import { logger } from '@rabst24/config';

export interface YooKassaAmount {
  value: string;
  currency: string;
}

export interface YooKassaPayment {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  paid: boolean;
  amount: YooKassaAmount;
  confirmation?: {
    type?: string;
    confirmation_url?: string;
  };
  metadata?: Record<string, string>;
  test?: boolean;
}

export interface YooKassaRefund {
  id: string;
  payment_id: string;
  status: 'pending' | 'succeeded' | 'canceled';
  amount: YooKassaAmount;
  created_at?: string;
}

export interface YooKassaCreatePaymentRequest {
  amount: YooKassaAmount;
  capture: boolean;
  confirmation: {
    type: 'redirect';
    return_url: string;
  };
  description: string;
  metadata: Record<string, string>;
  receipt?: {
    customer: {
      email: string;
    };
    items: Array<{
      description: string;
      quantity: string;
      amount: YooKassaAmount;
      vat_code: number;
      payment_mode: 'full_prepayment' | 'full_payment';
      payment_subject: 'service';
    }>;
  };
}

export interface YooKassaCreateRefundRequest {
  payment_id: string;
  amount: YooKassaAmount;
  description: string;
}

export class YooKassaClient {
  constructor(
    private readonly options: {
      shopId: string;
      secretKey?: string;
      apiBaseUrl: string;
    }
  ) {}

  async createPayment(payload: YooKassaCreatePaymentRequest, idempotenceKey: string): Promise<YooKassaPayment> {
    return this.request<YooKassaPayment>('/v3/payments', {
      method: 'POST',
      idempotenceKey,
      body: payload
    });
  }

  async getPayment(paymentId: string): Promise<YooKassaPayment> {
    return this.request<YooKassaPayment>(`/v3/payments/${encodeURIComponent(paymentId)}`, {
      method: 'GET'
    });
  }

  async createRefund(payload: YooKassaCreateRefundRequest, idempotenceKey: string): Promise<YooKassaRefund> {
    return this.request<YooKassaRefund>('/v3/refunds', {
      method: 'POST',
      idempotenceKey,
      body: payload
    });
  }

  private async request<T>(
    path: string,
    options: {
      method: 'GET' | 'POST';
      idempotenceKey?: string;
      body?: unknown;
    }
  ): Promise<T> {
    if (!this.options.secretKey) {
      throw new ExternalApiError('YooKassa secret key is not configured', 500);
    }

    const headers = new Headers({
      Authorization: `Basic ${Buffer.from(`${this.options.shopId}:${this.options.secretKey}`).toString('base64')}`,
      'Content-Type': 'application/json'
    });

    if (options.idempotenceKey) {
      headers.set('Idempotence-Key', options.idempotenceKey);
    }

    let response: Response;

    try {
      response = await fetch(`${this.options.apiBaseUrl}${path}`, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    } catch (error) {
      logger.error(
        {
          path,
          method: options.method,
          shopId: this.options.shopId,
          error: error instanceof Error ? error.message : String(error)
        },
        '[PAYMENT_FAILED] YooKassa network request failed'
      );
      throw error;
    }

    const body = await this.parseResponseBody(response);

    if (!response.ok) {
      logger.error(
        {
          path,
          method: options.method,
          shopId: this.options.shopId,
          status: response.status,
          body
        },
        '[PAYMENT_FAILED] YooKassa API rejected request'
      );
      throw new ExternalApiError('YooKassa API request failed', 502, {
        status: response.status,
        body
      });
    }

    return body as T;
  }

  private async parseResponseBody(response: Response): Promise<unknown> {
    const text = await response.text();

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
}
