import { ExternalApiError } from '@rabst24/shared';
import type {
  MaxCreateSubscriptionParams,
  MaxId,
  MaxMediaAttachment,
  MaxMessageBody,
  MaxSendMessageParams,
  MaxUpdateList,
  MaxUploadIntent,
  MaxUploadType
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

  async createUploadIntent(type: MaxUploadType): Promise<MaxUploadIntent> {
    const searchParams = new URLSearchParams({
      type
    });

    return this.request<MaxUploadIntent>('/uploads', {
      method: 'POST',
      searchParams
    });
  }

  async uploadMedia(params: {
    uploadUrl: string;
    fileName: string;
    mimeType: string;
    data: Blob | Buffer | ArrayBuffer | Uint8Array;
  }): Promise<Record<string, unknown>> {
    const formData = new FormData();
    const blob = params.data instanceof Blob
      ? params.data
      : new Blob([params.data], { type: params.mimeType });

    formData.set('data', blob, params.fileName);

    const response = await fetch(params.uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: this.token
      },
      body: formData
    });

    const responseText = await response.text();
    const responseBody = responseText ? this.parseJson(responseText) : null;

    if (!response.ok) {
      throw new ExternalApiError('MAX upload request failed', response.status, responseBody);
    }

    return this.asRecord(responseBody);
  }

  async uploadImageFromUrl(params: {
    url: string;
    fileName: string;
    mimeType?: string | null;
  }): Promise<MaxMediaAttachment> {
    return this.uploadMediaFromUrl({
      ...params,
      uploadType: 'image'
    });
  }

  async uploadMediaFromUrl(params: {
    url: string;
    fileName: string;
    mimeType?: string | null;
    uploadType: Extract<MaxUploadType, 'image' | 'video' | 'file'>;
  }): Promise<MaxMediaAttachment> {
    const fileResponse = await fetch(params.url);

    if (!fileResponse.ok) {
      throw new ExternalApiError('Unable to fetch media source for MAX upload', fileResponse.status, {
        url: params.url
      });
    }

    const mimeType = params.mimeType ?? fileResponse.headers.get('content-type') ?? this.getDefaultMimeType(params.uploadType);
    const intent = await this.createUploadIntent(params.uploadType);
    const payload = await this.uploadMedia({
      uploadUrl: intent.url,
      fileName: params.fileName,
      mimeType,
      data: await fileResponse.arrayBuffer()
    });

    const token = this.extractToken(payload) ?? intent.token;

    if (!token) {
      throw new ExternalApiError('MAX upload did not return reusable media token', 502, payload);
    }

    return {
      type: params.uploadType,
      payload: {
        ...payload,
        token
      }
    };
  }

  private getDefaultMimeType(uploadType: Extract<MaxUploadType, 'image' | 'video' | 'file'>): string {
    if (uploadType === 'video') {
      return 'video/mp4';
    }

    if (uploadType === 'file') {
      return 'application/octet-stream';
    }

    return 'image/jpeg';
  }

  async deleteMessage(messageId: string): Promise<unknown> {
    const searchParams = new URLSearchParams({
      message_id: messageId
    });

    return this.request('/messages', {
      method: 'DELETE',
      searchParams
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

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private extractToken(value: Record<string, unknown>): string | null {
    return this.findToken(value, new Set<unknown>());
  }

  private findToken(value: unknown, seen: Set<unknown>): string | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    if (seen.has(value)) {
      return null;
    }

    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const token = this.findToken(item, seen);
        if (token) {
          return token;
        }
      }

      return null;
    }

    const record = value as Record<string, unknown>;
    const directToken = record.token;

    if (typeof directToken === 'string' && directToken.trim()) {
      return directToken;
    }

    for (const nestedValue of Object.values(record)) {
      const token = this.findToken(nestedValue, seen);
      if (token) {
        return token;
      }
    }

    return null;
  }

  private idToString(id: MaxId): string {
    return typeof id === 'bigint' ? id.toString() : String(id);
  }
}
