import { TelegramTargetType } from '@rabst24/db';

export interface ExpectedTelegramTarget {
  username: string;
  type: TelegramTargetType;
}

export const EXPECTED_TELEGRAM_TARGETS: ExpectedTelegramTarget[] = [
  { username: 'msk_malyar', type: TelegramTargetType.CHANNEL },
  { username: 'MSK_Monolit', type: TelegramTargetType.CHANNEL },
  { username: 'moscowelektrik', type: TelegramTargetType.CHANNEL },
  { username: 'moskvaelektrika', type: TelegramTargetType.CHANNEL },
  { username: 'elektrik_elektrika', type: TelegramTargetType.CHANNEL },
  { username: 'moscow_rabota_moskva', type: TelegramTargetType.CHANNEL },
  { username: 'prorab_moskva', type: TelegramTargetType.CHANNEL },
  { username: 'msk_slabotochnik', type: TelegramTargetType.CHANNEL },
  { username: 'raznorabochie_moscow', type: TelegramTargetType.CHANNEL },
  { username: 'moscow_slabotochnik', type: TelegramTargetType.CHANNEL },
  { username: 'slabotochniki_moscow', type: TelegramTargetType.CHANNEL },
  { username: 'santexniky', type: TelegramTargetType.CHANNEL },
  { username: 'wentilyaciya', type: TelegramTargetType.CHANNEL },
  { username: 'fasadchiky', type: TelegramTargetType.CHANNEL },
  { username: 'swarschiky', type: TelegramTargetType.CHANNEL },
  { username: 'montazhnik_moskva', type: TelegramTargetType.GROUP },
  { username: 'moscow_malyar', type: TelegramTargetType.GROUP },
  { username: 'mskElektrik', type: TelegramTargetType.GROUP },
  { username: 'msk_elektrik', type: TelegramTargetType.GROUP },
  { username: 'Monolitchik_MSK', type: TelegramTargetType.GROUP },
  { username: 'raznorabochie_moskva', type: TelegramTargetType.GROUP },
  { username: 'moskwa_elektrik', type: TelegramTargetType.GROUP },
  { username: 'slabotochka_moskva', type: TelegramTargetType.GROUP },
  { username: 'ventilyaciya_moscow', type: TelegramTargetType.GROUP },
  { username: 'moscow_santexnik', type: TelegramTargetType.GROUP },
  { username: 'fasad_chik', type: TelegramTargetType.GROUP },
  { username: 'svarschik_moscow', type: TelegramTargetType.GROUP }
];

export function normalizeTelegramUsername(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '');
}

