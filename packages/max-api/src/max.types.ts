export type MaxId = string | number | bigint;

export type MaxTextFormat = 'markdown' | 'html';

export interface MaxUser {
  user_id: MaxId;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  is_bot?: boolean;
  last_activity_time?: number | null;
  name?: string | null;
}

export interface MaxRecipient {
  user_id?: MaxId;
  chat_id?: MaxId;
  type?: 'user' | 'chat' | 'dialog' | 'channel' | string;
  chat_type?: 'user' | 'chat' | 'dialog' | 'channel' | string;
}

export interface MaxMessageBody {
  text?: string | null;
  attachments?: MaxAttachment[] | null;
  link?: unknown;
  notify?: boolean;
  format?: MaxTextFormat | null;
}

export interface MaxMessage {
  sender?: MaxUser;
  recipient?: MaxRecipient;
  timestamp?: number;
  body?: {
    text?: string | null;
    attachments?: MaxAttachment[] | null;
  } | null;
  url?: string | null;
}

export type MaxButton =
  | {
      type: 'open_app';
      text: string;
      web_app: string;
      payload?: string;
    }
  | {
      type: 'link';
      text: string;
      url: string;
    }
  | {
      type: 'callback';
      text: string;
      payload: string;
    }
  | {
      type: 'message';
      text: string;
      payload?: string;
    };

export interface MaxInlineKeyboardAttachment {
  type: 'inline_keyboard';
  payload: {
    buttons: MaxButton[][];
  };
}

export type MaxAttachment = MaxInlineKeyboardAttachment | Record<string, unknown>;

export interface MaxBaseUpdate {
  update_type: string;
  timestamp: number;
}

export interface MaxBotStartedUpdate extends MaxBaseUpdate {
  update_type: 'bot_started';
  chat_id: MaxId;
  user: MaxUser;
  payload?: string | null;
  user_locale?: string | null;
}

export interface MaxMessageCreatedUpdate extends MaxBaseUpdate {
  update_type: 'message_created';
  message: MaxMessage;
  user_locale?: string | null;
}

export interface MaxMessageCallbackUpdate extends MaxBaseUpdate {
  update_type: 'message_callback';
  callback: {
    callback_id: string;
    payload?: string | null;
    user?: MaxUser;
  };
  message?: MaxMessage | null;
  user_locale?: string | null;
}

export type MaxUpdate =
  | MaxBotStartedUpdate
  | MaxMessageCreatedUpdate
  | MaxMessageCallbackUpdate
  | (MaxBaseUpdate & Record<string, unknown>);

export interface MaxUpdateList {
  updates: MaxUpdate[];
  marker: MaxId | null;
}

export interface MaxSendMessageParams {
  userId?: MaxId;
  chatId?: MaxId;
  body: MaxMessageBody;
  disableLinkPreview?: boolean;
}

export interface MaxCreateSubscriptionParams {
  url: string;
  updateTypes?: string[];
  secret?: string;
}
