import type { Bot, Context } from 'grammy';
import { config } from '@rabst24/config';
import { TelegramTargetType, type TelegramTarget } from '@rabst24/db';
import type { TelegramPublicationService, TelegramTargetRepository } from '@rabst24/telegram';
import { requireTelegramAdmin } from './auth.js';

type TestKind = 'text' | 'photo' | 'video' | 'album';

export class TelegramAdminHandler {
  constructor(
    private readonly targetRepository: TelegramTargetRepository,
    private readonly publicationService: TelegramPublicationService
  ) {}

  register(bot: Bot): void {
    bot.command('chat_id', (ctx) => this.handleChatId(ctx));
    bot.command('register_chat', (ctx) => this.handleRegisterChat(ctx));
    bot.command('check_permissions', (ctx) => this.handleCheckPermissions(ctx));
    bot.command('targets_status', (ctx) => this.handleTargetsStatus(ctx));
    bot.command('test_publish', (ctx) => this.handleTestPublish(ctx));
    bot.on('channel_post:text', (ctx) => this.handleChannelCommand(ctx));
  }

  private async handleChatId(ctx: Context): Promise<void> {
    if (!(await requireTelegramAdmin(ctx))) {
      return;
    }

    await ctx.reply(this.formatChatInfo(ctx));
  }

  private async handleRegisterChat(ctx: Context): Promise<void> {
    if (!(await requireTelegramAdmin(ctx))) {
      return;
    }

    await this.registerCurrentChat(ctx);
  }

  private async handleCheckPermissions(ctx: Context): Promise<void> {
    if (!(await requireTelegramAdmin(ctx))) {
      return;
    }

    const target = await this.findCurrentOrRequestedTarget(ctx);

    if (!target) {
      await ctx.reply('Target не найден. Сначала выполните /register_chat в тестовом чате.');
      return;
    }

    const checked = await this.publicationService.checkTargetPermissions(target);
    await ctx.reply(this.formatTarget(checked));
  }

  private async handleTargetsStatus(ctx: Context): Promise<void> {
    if (!(await requireTelegramAdmin(ctx))) {
      return;
    }

    await this.targetRepository.ensureExpectedTargets();
    const targets = await this.targetRepository.list();
    const summary = targets.map((target) => this.formatTargetShort(target)).join('\n');
    await ctx.reply(summary.slice(0, 3900));
  }

  private async handleTestPublish(ctx: Context): Promise<void> {
    if (!(await requireTelegramAdmin(ctx))) {
      return;
    }

    const target = await this.findCurrentOrRequestedTarget(ctx);

    if (!target) {
      await ctx.reply('Target не найден. Сначала выполните /register_chat и /check_permissions.');
      return;
    }

    const kind = this.getTestKind(ctx.message?.text);
    const result = await this.publicationService.sendTestPost(target, kind);
    await ctx.reply(`Test publish sent. message_id=${result.message_id}`);
  }

  private async handleChannelCommand(ctx: Context): Promise<void> {
    const text = ctx.channelPost?.text?.trim();

    if (text !== '/register_chat' && text !== '/check_permissions') {
      return;
    }

    if (!config.features.TELEGRAM_TEST_MODE) {
      return;
    }

    if (text === '/register_chat') {
      await this.registerCurrentChat(ctx);
      return;
    }

    const target = await this.findCurrentOrRequestedTarget(ctx);

    if (target) {
      await this.publicationService.checkTargetPermissions(target);
    }
  }

  private async registerCurrentChat(ctx: Context): Promise<void> {
    const chat = ctx.chat ?? ctx.channelPost?.chat;

    if (!chat || chat.type === 'private') {
      await ctx.reply('Эту команду нужно отправить в тестовой группе или тестовом канале.');
      return;
    }

    const target = await this.targetRepository.registerChat({
      username: 'username' in chat ? chat.username : null,
      chatId: chat.id,
      messageThreadId: this.getMessageThreadId(ctx),
      title: 'title' in chat ? chat.title : null,
      type: this.toTargetType(chat.type),
      testTarget: true
    });
    const checked = await this.publicationService.checkTargetPermissions(target);

    if (ctx.chat?.type !== 'channel') {
      await ctx.reply(`Registered:\n${this.formatTarget(checked)}`);
    }
  }

  private async findCurrentOrRequestedTarget(ctx: Context): Promise<TelegramTarget | null> {
    const text = ctx.message?.text ?? ctx.channelPost?.text ?? '';
    const [, requested] = text.trim().split(/\s+/, 2);

    if (requested) {
      const byUsername = await this.targetRepository.findByUsername(requested);
      if (byUsername) {
        return byUsername;
      }
    }

    const chat = ctx.chat ?? ctx.channelPost?.chat;
    return chat ? this.targetRepository.findByChatId(chat.id) : null;
  }

  private formatChatInfo(ctx: Context): string {
    const chat = ctx.chat ?? ctx.channelPost?.chat;

    if (!chat) {
      return 'Chat не определён.';
    }

    return [
      `chat_id: ${chat.id}`,
      this.getMessageThreadId(ctx) ? `message_thread_id: ${this.getMessageThreadId(ctx)}` : null,
      `type: ${chat.type}`,
      'title' in chat && chat.title ? `title: ${chat.title}` : null,
      'username' in chat && chat.username ? `username: @${chat.username}` : null
    ].filter(Boolean).join('\n');
  }

  private formatTarget(target: TelegramTarget): string {
    return [
      `@${target.username}`,
      `chat_id: ${target.chatId ?? 'unknown'}`,
      target.messageThreadId ? `message_thread_id: ${target.messageThreadId}` : null,
      `type: ${target.type}`,
      `status: ${target.status}`,
      `enabled: ${target.enabled}`,
      `test: ${target.testTarget}`,
      `admin: ${target.botIsAdmin}`,
      `post: ${target.canPostMessages}`,
      `edit: ${target.canEditMessages}`,
      `delete: ${target.canDeleteMessages}`,
      target.lastError ? `lastError: ${target.lastError}` : null
    ].filter(Boolean).join('\n');
  }

  private formatTargetShort(target: TelegramTarget): string {
    const topic = target.messageThreadId ? ` topic:${target.messageThreadId}` : '';
    return `${target.testTarget ? '[TEST] ' : ''}@${target.username} ${target.type} ${target.chatId ?? 'no-id'}${topic} ${target.status}`;
  }

  private getMessageThreadId(ctx: Context): number | undefined {
    return ctx.message?.message_thread_id ?? ctx.channelPost?.message_thread_id;
  }

  private toTargetType(type: string): TelegramTargetType {
    if (type === 'channel') {
      return TelegramTargetType.CHANNEL;
    }

    if (type === 'supergroup') {
      return TelegramTargetType.SUPERGROUP;
    }

    return TelegramTargetType.GROUP;
  }

  private getTestKind(text: string | undefined): TestKind {
    const [, rawKind] = text?.trim().split(/\s+/, 2) ?? [];

    if (rawKind === 'photo' || rawKind === 'video' || rawKind === 'album') {
      return rawKind;
    }

    return 'text';
  }
}
