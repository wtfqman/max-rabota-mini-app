import type { Context } from 'grammy';
import { config } from '@rabst24/config';
import { prisma, UserRole, UserStatus } from '@rabst24/db';

export async function isTelegramAdmin(ctx: Context): Promise<boolean> {
  const fromId = ctx.from?.id;

  if (!fromId) {
    return false;
  }

  if (config.telegram.adminIds.includes(String(fromId))) {
    return true;
  }

  const account = await prisma.telegramAccount.findUnique({
    where: {
      telegramUserId: String(fromId)
    },
    include: {
      user: true
    }
  });

  return Boolean(
    account?.user &&
      account.user.status === UserStatus.ACTIVE &&
      (account.user.role === UserRole.ADMIN || account.user.role === UserRole.MODERATOR)
  );
}

export async function requireTelegramAdmin(ctx: Context): Promise<boolean> {
  if (await isTelegramAdmin(ctx)) {
    return true;
  }

  await ctx.reply('Команда доступна только администратору RABST24.');
  return false;
}

