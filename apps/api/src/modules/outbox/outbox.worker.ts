import { logger } from '@rabst24/config';
import type { OutboxJobHandler } from './outbox.service.js';
import { OutboxService } from './outbox.service.js';
import type { OutboxJobType } from './outbox.schemas.js';

export class OutboxWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly workerId = `api-${process.pid}-${Date.now()}`;

  constructor(
    private readonly outboxService: OutboxService,
    private readonly options: {
      enabled: boolean;
      intervalMs: number;
      handlers?: Partial<Record<OutboxJobType, OutboxJobHandler>>;
    }
  ) {}

  start(): void {
    if (!this.options.enabled || this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      this.tick();
    }, this.options.intervalMs);
    this.timer.unref?.();
    this.tick();
    logger.info({ workerId: this.workerId }, 'Outbox worker started');
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
    logger.info({ workerId: this.workerId }, 'Outbox worker stopped');
  }

  private tick(): void {
    if (this.running) {
      return;
    }

    this.running = true;

    void this.outboxService
      .recoverStuck()
      .then(() => this.outboxService.runOnce(this.workerId, this.options.handlers ?? createDefaultOutboxHandlers()))
      .catch((error) => {
        logger.warn({ err: error }, 'Outbox worker tick failed');
      })
      .finally(() => {
        this.running = false;
      });
  }
}

function createDefaultOutboxHandlers(): Partial<Record<OutboxJobType, OutboxJobHandler>> {
  return {
    NOOP: async () => ({
      ok: true
    })
  };
}
