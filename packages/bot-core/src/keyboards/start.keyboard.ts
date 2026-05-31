import type { MaxButton, MaxInlineKeyboardAttachment } from '@rabst24/max-api';

export interface StartKeyboardOptions {
  miniAppUrl: string;
  miniAppWebApp?: string;
  channelUrl?: string;
}

export function createStartKeyboard(options: StartKeyboardOptions): MaxInlineKeyboardAttachment {
  const rows: MaxButton[][] = [];
  const miniAppLaunch = options.miniAppWebApp?.trim();

  if (miniAppLaunch) {
    rows.push([
      {
        type: 'open_app',
        text: 'Открыть mini app',
        web_app: miniAppLaunch
      }
    ]);
  }

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
