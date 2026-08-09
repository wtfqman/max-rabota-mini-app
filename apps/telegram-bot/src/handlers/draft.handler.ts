import type { Bot, Context } from 'grammy';
import type { TelegramAccountRepository, TelegramLinkingService } from '@rabst24/telegram';
import { createCategoryKeyboard, createMainKeyboard } from '../keyboards/main.keyboard.js';

interface DraftState {
  type?: string;
  step: 'title' | 'description' | 'contacts' | 'preview';
  title?: string;
  description?: string;
  contacts?: string;
}

export class TelegramDraftHandler {
  private readonly drafts = new Map<number, DraftState>();
  private readonly callbackAllowList = new Set([
    'ad:create',
    'ad:cancel',
    'ad:type:vacancy',
    'ad:type:resume',
    'ad:type:equipment',
    'ad:type:material',
    'ad:type:tool'
  ]);

  constructor(
    private readonly accountRepository: TelegramAccountRepository,
    private readonly linkingService: TelegramLinkingService
  ) {}

  register(bot: Bot): void {
    bot.callbackQuery(/^ad:/, (ctx) => this.handleAdCallback(ctx));
    bot.on('message:text', (ctx) => this.handleText(ctx));
    bot.on(['message:photo', 'message:video', 'message:document'], (ctx) => this.handleMedia(ctx));
    bot.command('cancel', (ctx) => this.cancel(ctx));
  }

  private async handleAdCallback(ctx: Context): Promise<void> {
    const data = ctx.callbackQuery?.data;

    if (!data || !this.callbackAllowList.has(data)) {
      await ctx.answerCallbackQuery({ text: 'Недействительная кнопка.' });
      return;
    }

    await ctx.answerCallbackQuery();

    if (!ctx.from) {
      return;
    }

    if (data === 'ad:create') {
      await ctx.reply('Выберите категорию объявления:', {
        reply_markup: createCategoryKeyboard()
      });
      return;
    }

    if (data === 'ad:cancel') {
      this.drafts.delete(ctx.from.id);
      await ctx.reply('Черновик отменён.', {
        reply_markup: createMainKeyboard()
      });
      return;
    }

    const type = data.replace('ad:type:', '');
    this.drafts.set(ctx.from.id, {
      type,
      step: 'title'
    });
    await ctx.reply('Введите заголовок объявления.');
  }

  private async handleText(ctx: Context): Promise<void> {
    if (!ctx.from || ctx.chat?.type !== 'private' || ctx.message?.text?.startsWith('/')) {
      return;
    }

    await this.accountRepository.upsertFromTelegramUser(ctx.from);
    const draft = this.drafts.get(ctx.from.id);

    if (!draft) {
      return;
    }

    const text = ctx.message?.text?.trim();

    if (!text) {
      return;
    }

    if (draft.step === 'title') {
      draft.title = text;
      draft.step = 'description';
      await ctx.reply('Теперь отправьте описание.');
      return;
    }

    if (draft.step === 'description') {
      draft.description = text;
      draft.step = 'contacts';
      await ctx.reply('Укажите контакты для объявления.');
      return;
    }

    if (draft.step === 'contacts') {
      draft.contacts = text;
      draft.step = 'preview';
      await ctx.reply(this.formatPreview(draft), {
        reply_markup: createMainKeyboard()
      });
      await this.requireLink(ctx);
    }
  }

  private async handleMedia(ctx: Context): Promise<void> {
    if (!ctx.from || ctx.chat?.type !== 'private') {
      return;
    }

    await ctx.reply(
      'Медиа принято для будущего flow. В test mode реальные объявления с оплатой и модерацией создаются после привязки MAX, чтобы не обойти правила RABST24.'
    );
  }

  private async cancel(ctx: Context): Promise<void> {
    if (ctx.from) {
      this.drafts.delete(ctx.from.id);
    }

    await ctx.reply('Действие отменено.', {
      reply_markup: createMainKeyboard()
    });
  }

  private async requireLink(ctx: Context): Promise<void> {
    if (!ctx.from) {
      return;
    }

    const link = await this.linkingService.createLinkCode(ctx.from);
    await ctx.reply(
      [
        'Для оплаты, модерации и публикации нужно связать Telegram с MAX.',
        `Код: <code>${link.code}</code>`,
        'Откройте RABST24 в MAX и введите код привязки.'
      ].join('\n'),
      {
        parse_mode: 'HTML'
      }
    );
  }

  private formatPreview(draft: DraftState): string {
    return [
      'Предпросмотр черновика:',
      `Категория: ${draft.type ?? '-'}`,
      `Заголовок: ${draft.title ?? '-'}`,
      `Описание: ${draft.description ?? '-'}`,
      `Контакты: ${draft.contacts ?? '-'}`,
      '',
      'Публикация не отправлена. Следующий этап: создание объявления через backend RABST24 после привязки MAX.'
    ].join('\n');
  }
}
