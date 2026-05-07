import fs from 'node:fs';
import path from 'node:path';
import { config } from './env.js';

interface RuntimeChannelState {
  chatId: string;
  chatType?: string;
  detectedAt: string;
}

const runtimeStateFile = path.resolve(process.cwd(), '.codex-runtime', 'max-channel.json');

export function getResolvedMaxChannelChatId(): string | null {
  return config.max.channelChatId ?? readRuntimeChannelState()?.chatId ?? null;
}

export function saveDetectedMaxChannelChatId(
  chatId: string | number | bigint,
  options?: { chatType?: string }
): RuntimeChannelState {
  const state: RuntimeChannelState = {
    chatId: String(chatId),
    chatType: options?.chatType,
    detectedAt: new Date().toISOString()
  };

  fs.mkdirSync(path.dirname(runtimeStateFile), { recursive: true });
  fs.writeFileSync(runtimeStateFile, JSON.stringify(state, null, 2), 'utf8');

  return state;
}

export function readRuntimeChannelState(): RuntimeChannelState | null {
  try {
    if (!fs.existsSync(runtimeStateFile)) {
      return null;
    }

    const raw = fs.readFileSync(runtimeStateFile, 'utf8');
    if (!raw.trim()) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<RuntimeChannelState>;

    if (!parsed.chatId || typeof parsed.chatId !== 'string') {
      return null;
    }

    return {
      chatId: parsed.chatId,
      chatType: typeof parsed.chatType === 'string' ? parsed.chatType : undefined,
      detectedAt: typeof parsed.detectedAt === 'string' ? parsed.detectedAt : new Date(0).toISOString()
    };
  } catch {
    return null;
  }
}
