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
    rows.push([createMiniAppButton(miniAppLaunch)]);
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

function createMiniAppButton(miniAppLaunch: string): MaxButton {
  if (isMaxStartAppLink(miniAppLaunch)) {
    return {
      type: 'link',
      text: 'Открыть mini app',
      url: miniAppLaunch
    };
  }

  return {
    type: 'open_app',
    text: 'Открыть mini app',
    web_app: miniAppLaunch
  };
}

function isMaxStartAppLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === 'max.ru' || url.hostname.endsWith('.max.ru');
  } catch {
    return false;
  }
}
