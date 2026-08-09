import { ExternalApiError } from '@rabst24/shared';

export interface TelegramApiClientOptions {
  token: string;
  baseUrl?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChatMember {
  status: string;
  can_post_messages?: boolean;
  can_edit_messages?: boolean;
  can_delete_messages?: boolean;
  can_send_messages?: boolean;
  can_send_media_messages?: boolean;
  can_manage_topics?: boolean;
}

export interface TelegramMessageResult {
  message_id: number;
  media_group_id?: string;
  chat: TelegramChat;
}

export interface TelegramInlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export class TelegramApiClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(options: TelegramApiClientOptions) {
    this.token = options.token;
    this.baseUrl = `${options.baseUrl ?? 'https://api.telegram.org'}/bot${options.token}`;
  }

  async getMe(): Promise<TelegramUser> {
    return this.request<TelegramUser>('getMe');
  }

  async deleteWebhook(dropPendingUpdates = false): Promise<boolean> {
    return this.request<boolean>('deleteWebhook', { drop_pending_updates: dropPendingUpdates });
  }

  async getChat(chatId: string | number): Promise<TelegramChat> {
    return this.request<TelegramChat>('getChat', { chat_id: chatId });
  }

  async getChatMember(chatId: string | number, userId: string | number): Promise<TelegramChatMember> {
    return this.request<TelegramChatMember>('getChatMember', {
      chat_id: chatId,
      user_id: userId
    });
  }

  async sendMessage(params: {
    chatId: string | number;
    messageThreadId?: string | number | null;
    text: string;
    parseMode?: 'HTML' | 'MarkdownV2';
    replyMarkup?: { inline_keyboard: TelegramInlineKeyboardButton[][] };
    disableWebPagePreview?: boolean;
  }): Promise<TelegramMessageResult> {
    return this.request<TelegramMessageResult>('sendMessage', {
      chat_id: params.chatId,
      message_thread_id: params.messageThreadId ?? undefined,
      text: params.text,
      parse_mode: params.parseMode,
      reply_markup: params.replyMarkup,
      disable_web_page_preview: params.disableWebPagePreview
    });
  }

  async sendPhoto(params: {
    chatId: string | number;
    messageThreadId?: string | number | null;
    photoUrl: string;
    caption?: string;
    parseMode?: 'HTML' | 'MarkdownV2';
    replyMarkup?: { inline_keyboard: TelegramInlineKeyboardButton[][] };
  }): Promise<TelegramMessageResult> {
    return this.request<TelegramMessageResult>('sendPhoto', {
      chat_id: params.chatId,
      message_thread_id: params.messageThreadId ?? undefined,
      photo: params.photoUrl,
      caption: params.caption,
      parse_mode: params.parseMode,
      reply_markup: params.replyMarkup
    });
  }

  async sendVideo(params: {
    chatId: string | number;
    messageThreadId?: string | number | null;
    videoUrl: string;
    caption?: string;
    parseMode?: 'HTML' | 'MarkdownV2';
    replyMarkup?: { inline_keyboard: TelegramInlineKeyboardButton[][] };
  }): Promise<TelegramMessageResult> {
    return this.request<TelegramMessageResult>('sendVideo', {
      chat_id: params.chatId,
      message_thread_id: params.messageThreadId ?? undefined,
      video: params.videoUrl,
      caption: params.caption,
      parse_mode: params.parseMode,
      reply_markup: params.replyMarkup
    });
  }

  async sendMediaGroup(params: {
    chatId: string | number;
    messageThreadId?: string | number | null;
    media: Array<{ type: 'photo' | 'video'; media: string; caption?: string; parse_mode?: 'HTML' | 'MarkdownV2' }>;
  }): Promise<TelegramMessageResult[]> {
    return this.request<TelegramMessageResult[]>('sendMediaGroup', {
      chat_id: params.chatId,
      message_thread_id: params.messageThreadId ?? undefined,
      media: params.media
    });
  }

  async editMessageText(params: {
    chatId: string | number;
    messageId: string | number;
    text: string;
    parseMode?: 'HTML' | 'MarkdownV2';
    replyMarkup?: { inline_keyboard: TelegramInlineKeyboardButton[][] };
  }): Promise<TelegramMessageResult | boolean> {
    return this.request<TelegramMessageResult | boolean>('editMessageText', {
      chat_id: params.chatId,
      message_id: params.messageId,
      text: params.text,
      parse_mode: params.parseMode,
      reply_markup: params.replyMarkup
    });
  }

  async deleteMessage(chatId: string | number, messageId: string | number): Promise<boolean> {
    return this.request<boolean>('deleteMessage', {
      chat_id: chatId,
      message_id: messageId
    });
  }

  private async request<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(stripUndefined(body ?? {}))
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; result?: T; description?: string; parameters?: unknown } | null;

    if (!response.ok || !payload?.ok) {
      throw new ExternalApiError(`Telegram API request failed: ${method}`, response.status, sanitizeTelegramPayload(payload));
    }

    return payload.result as T;
  }
}

function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function sanitizeTelegramPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  return {
    ...record,
    result: undefined
  };
}

export function escapeTelegramHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
