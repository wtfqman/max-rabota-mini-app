import assert from 'node:assert/strict';
import { TelegramLinkingService, escapeTelegramHtml, normalizeTelegramUsername } from '@rabst24/telegram';

assert.equal(normalizeTelegramUsername('https://t.me/msk_malyar'), 'msk_malyar');
assert.equal(normalizeTelegramUsername('@MSK_Monolit'), 'MSK_Monolit');
assert.equal(normalizeTelegramUsername('moscowelektrik/'), 'moscowelektrik');

assert.equal(
  escapeTelegramHtml('<b>job & "pay"</b>'),
  '&lt;b&gt;job &amp; &quot;pay&quot;&lt;/b&gt;'
);

const account = {
  id: 'tg-account-1',
  userId: null,
  telegramUserId: '1001',
  username: 'builder',
  firstName: 'Test',
  lastName: null,
  languageCode: 'ru',
  status: 'ACTIVE',
  linkedAt: null,
  createdAt: new Date(),
  updatedAt: new Date()
};
let storedHash = '';
let consumed = false;
let linkedUserId: string | null = null;

const linkingService = new TelegramLinkingService(
  {
    async upsertFromTelegramUser() {
      return account as never;
    },
    async linkToUser(_telegramAccountId: string, userId: string) {
      linkedUserId = userId;
      return {
        ...account,
        userId,
        linkedAt: new Date()
      } as never;
    }
  } as never,
  {
    async create(input: { codeHash: string }) {
      storedHash = input.codeHash;
      return {} as never;
    },
    async findPendingByCodeHash(codeHash: string) {
      if (codeHash !== storedHash || consumed) {
        return null;
      }

      return {
        id: 'token-1',
        telegramAccountId: account.id,
        telegramAccount: account
      };
    },
    async consume() {
      consumed = true;
      return {} as never;
    }
  } as never,
  {
    ttlMinutes: 15,
    hashPepper: 'test-pepper'
  }
);

const link = await linkingService.createLinkCode({
  id: 1001,
  username: 'builder',
  first_name: 'Test',
  language_code: 'ru'
});

assert.ok(link.code.length >= 8, 'link code is opaque and non-empty');
assert.notEqual(storedHash, link.code, 'stored value is a hash, not the raw code');

const consumedResult = await linkingService.consumeLinkCode('rabst-user-1', link.code);
assert.equal(consumedResult.linked, true);
assert.equal(linkedUserId, 'rabst-user-1');

await assert.rejects(
  () => linkingService.consumeLinkCode('rabst-user-1', link.code),
  /expired or invalid/
);

console.log('Telegram sync tests passed');
