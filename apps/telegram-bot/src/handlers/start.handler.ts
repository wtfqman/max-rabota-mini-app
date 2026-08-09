import type { Bot, Context } from 'grammy';
import { config } from '@rabst24/config';
import type { TelegramAccountRepository, TelegramLinkingService } from '@rabst24/telegram';
import { createMainKeyboard } from '../keyboards/main.keyboard.js';

export class TelegramStartHandler {
  constructor(
    private readonly accountRepository: TelegramAccountRepository,
    private readonly linkingService: TelegramLinkingService
  ) {}

  register(bot: Bot): void {
    bot.command('start', (ctx) => this.handleStart(ctx));
    bot.command('link_max', (ctx) => this.handleLink(ctx));
    bot.callbackQuery('account:link', (ctx) => this.handleLink(ctx));
    bot.callbackQuery('ad:mine', (ctx) => this.answerPlaceholder(ctx, 'Раздел «Мои объявления» будет открывать существующие статусы RABST24 после привязки MAX.'));
    bot.callbackQuery('profile:mine', (ctx) => this.answerPlaceholder(ctx, 'Профиль управляется в MAX Mini App. Нажмите «Открыть RABST24».'));
  }

  private async handleStart(ctx: Context): Promise<void> {
    if (ctx.from) {
      await this.accountRepository.upsertFromTelegramUser(ctx.from);
    }

    await ctx.reply(
      [
        'RABST24 / Работа Москва Стройка',
        '',
        'Через этого бота можно подготовить объявление и перейти в RABST24 для безопасной оплаты, модерации и публикации.',
        'Обычные сообщения из групп не копируются.'
      ].join('\n'),
      {
        reply_markup: createMainKeyboard()
      }
    );
  }

  private async handleLink(ctx: Context): Promise<void> {
    if (!ctx.from) {
      await ctx.reply('Не удалось определить Telegram пользователя.');
      return;
    }

    if (!config.features.TELEGRAM_ACCOUNT_LINKING_ENABLED) {
      await ctx.reply('Привязка Telegram к MAX пока выключена.');
      return;
    }

    const link = await this.linkingService.createLinkCode(ctx.from);
    await ctx.reply(
      [
        'Код для привязки Telegram к MAX:',
        `<code>${link.code}</code>`,
        '',
        'Откройте RABST24 в MAX, вставьте этот код в разделе привязки Telegram.',
        `Код действует до ${link.expiresAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}.`
      ].join('\n'),
      {
        parse_mode: 'HTML'
      }
    );
  }

  private async answerPlaceholder(ctx: Context, message: string): Promise<void> {
    await ctx.answerCallbackQuery();
    await ctx.reply(message, {
      reply_markup: createMainKeyboard()
    });
  }
}

