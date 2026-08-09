import { logger } from '@rabst24/config';
import { AppError } from '@rabst24/shared';
import {
  isPrismaUniqueConstraintError,
  type OutboxJobRecord,
  type OutboxJobRepositoryLike
} from './outbox.repository.js';
import { validateOutboxPayload, type OutboxJobType } from './outbox.schemas.js';

export interface EnqueueOutboxJobInput {
  type: OutboxJobType;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  maxAttempts?: number;
  nextAttemptAt?: Date;
}

export interface ClaimedOutboxJob {
  id: string;
  type: OutboxJobType;
  payload: Record<string, unknown>;
  attempts: number;
}

export type OutboxJobHandler = (job: ClaimedOutboxJob) => Promise<Record<string, unknown> | void>;

export class OutboxService {
  constructor(
    private readonly repository: OutboxJobRepositoryLike,
    private readonly options: {
      lockTimeoutMs: number;
    }
  ) {}

  async enqueue(input: EnqueueOutboxJobInput): Promise<OutboxJobRecord> {
    const payload = validateOutboxPayload(input.type, input.payload);
    const idempotencyKey = input.idempotencyKey.trim();

    if (!idempotencyKey) {
      throw new AppError('Outbox idempotency key is required', 400, {
        code: 'OUTBOX_IDEMPOTENCY_KEY_REQUIRED'
      });
    }

    const existing = await this.repository.findByIdempotencyKey(idempotencyKey);

    if (existing) {
      return existing;
    }

    try {
      return await this.repository.create({
        type: input.type,
        payloadJson: JSON.stringify(payload),
        idempotencyKey,
        maxAttempts: input.maxAttempts ?? 5,
        nextAttemptAt: input.nextAttemptAt ?? new Date()
      });
    } catch (error) {
      if (!isPrismaUniqueConstraintError(error)) {
        throw error;
      }

      const raced = await this.repository.findByIdempotencyKey(idempotencyKey);

      if (!raced) {
        throw error;
      }

      return raced;
    }
  }

  async recoverStuck(now = new Date()): Promise<number> {
    return this.repository.recoverStuck(this.getStaleBefore(now), now);
  }

  async claimNext(workerId: string, now = new Date()): Promise<ClaimedOutboxJob | null> {
    const job = await this.repository.claimNext({
      workerId,
      now,
      staleBefore: this.getStaleBefore(now)
    });

    if (!job) {
      return null;
    }

    try {
      return {
        id: job.id,
        type: job.type as OutboxJobType,
        payload: validateOutboxPayload(job.type, JSON.parse(job.payloadJson)),
        attempts: job.attempts
      };
    } catch (error) {
      await this.repository.retryOrFail(
        job.id,
        this.sanitizeError(error),
        this.getNextAttemptAt(job.attempts, now),
        now
      );
      return null;
    }
  }

  async runOnce(
    workerId: string,
    handlers: Partial<Record<OutboxJobType, OutboxJobHandler>>,
    now = new Date()
  ): Promise<'idle' | 'processed' | 'failed'> {
    const job = await this.claimNext(workerId, now);

    if (!job) {
      return 'idle';
    }

    const handler = handlers[job.type];

    if (!handler) {
      await this.repository.retryOrFail(
        job.id,
        `No handler registered for outbox job type ${job.type}`,
        this.getNextAttemptAt(job.attempts, now),
        now
      );
      return 'failed';
    }

    try {
      const result = await handler(job);
      await this.repository.complete(job.id, result ? JSON.stringify(result) : null, new Date());
      return 'processed';
    } catch (error) {
      const lastError = this.sanitizeError(error);
      await this.repository.retryOrFail(job.id, lastError, this.getNextAttemptAt(job.attempts, new Date()), new Date());
      logger.warn(
        {
          jobId: job.id,
          type: job.type,
          attempts: job.attempts,
          error: lastError
        },
        'Outbox job failed'
      );
      return 'failed';
    }
  }

  private getStaleBefore(now: Date): Date {
    return new Date(now.getTime() - this.options.lockTimeoutMs);
  }

  private getNextAttemptAt(attempts: number, now: Date): Date {
    const delayMs = Math.min(15 * 60 * 1000, 1000 * 2 ** Math.max(0, attempts - 1));
    return new Date(now.getTime() + delayMs);
  }

  private sanitizeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]').slice(0, 1000);
  }
}
