import { ExternalApiError } from '@rabst24/shared';
import type {
  MaxCreateSubscriptionParams,
  MaxId,
  MaxMessageBody,
  MaxSendMessageParams,
  MaxUpdateList
} from './max.types.js';

export interface MaxApiClientOptions {
  baseUrl: string;
  token: string;
}

export class MaxApiClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(options: MaxApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.token = options.token;
  }

  async sendMessage(params: MaxSendMessageParams): Promise<unknown> {
    const searchParams = new URLSearchParams();

    if (params.userId !== undefined) {
      searchParams.set('user_id', this.idToString(params.userId));
    }

    if (params.chatId !== undefined) {
      searchParams.set('chat_id', this.idToString(params.chatId));
    }

    if (params.disableLinkPreview !== undefined) {
      searchParams.set('disable_link_preview', String(params.disableLinkPreview));
    }

    return this.request('/messages', {
      method: 'POST',
      searchParams,
      body: params.body
    });
  }

  async getUpdates(params: {
    marker?: MaxId | null;
    limit: number;
    timeoutSeconds: number;
    types?: string[];
  }): Promise<MaxUpdateList> {
    const searchParams = new URLSearchParams({
      limit: String(params.limit),
      timeout: String(params.timeoutSeconds)
    });

    if (params.marker !== undefined && params.marker !== null) {
      searchParams.set('marker', this.idToString(params.marker));
    }

    if (params.types?.length) {
      searchParams.set('types', params.types.join(','));
    }

    return this.request<MaxUpdateList>('/updates', {
      method: 'GET',
      searchParams
    });
  }

  async createSubscription(params: MaxCreateSubscriptionParams): Promise<unknown> {
    return this.request('/subscriptions', {
      method: 'POST',
      body: {
        url: params.url,
        update_types: params.updateTypes,
        secret: params.secret
      }
    });
  }

  async answerCallback(params: {
    callbackId: string;
    message?: MaxMessageBody;
    notification?: string;
  }): Promise<unknown> {
    const searchParams = new URLSearchParams({
      callback_id: params.callbackId
    });

    return this.request('/answers', {
      method: 'POST',
      searchParams,
      body: {
        message: params.message,
        notification: params.notification
      }
    });
  }

  private async request<T = unknown>(
    path: string,
    options: {
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      searchParams?: URLSearchParams;
      body?: unknown;
    }
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (options.searchParams) {
      for (const [key, value] of options.searchParams.entries()) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url, {
      method: options.method,
      headers: {
        Authorization: this.token,
        'Content-Type': 'application/json'
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    const responseText = await response.text();
    const responseBody = responseText ? this.parseJson(responseText) : null;

    if (!response.ok) {
      throw new ExternalApiError('MAX API request failed', response.status, responseBody);
    }

    return responseBody as T;
  }

  private parseJson(value: string): unknown {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }

  private idToString(id: MaxId): string {
    return typeof id === 'bigint' ? id.toString() : String(id);
  }
}
