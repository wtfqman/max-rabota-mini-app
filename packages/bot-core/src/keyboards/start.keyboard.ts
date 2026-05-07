import type { MaxButton, MaxInlineKeyboardAttachment } from '@rabst24/max-api';

export interface StartKeyboardOptions {
  miniAppUrl: string;
  channelUrl?: string;
}

export function createStartKeyboard(options: StartKeyboardOptions): MaxInlineKeyboardAttachment {
  const rows: MaxButton[][] = [
    [
      {
        type: 'open_app',
        text: 'Открыть приложение',
        web_app: options.miniAppUrl
      }
    ]
  ];

  if (options.channelUrl) {
    rows.push([
      {
        type: 'link',
        text: 'Открыть канал',
        url: options.channelUrl
      }
    ]);
  }

  return {
    type: 'inline_keyboard',
    payload: {
      buttons: rows
    }
  };
}
