import type { PrismaClient } from '@rabst24/db';

export const OUTBOX_JOB_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
} as const;

export type OutboxJobStatus = (typeof OUTBOX_JOB_STATUS)[keyof typeof OUTBOX_JOB_STATUS];

export interface OutboxJobRecord {
  id: string;
  type: string;
  status: OutboxJobStatus;
  payloadJson: string;
  idempotencyKey: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  completedAt: Date | null;
  lastError: string | null;
  resultJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OutboxJobCreateInput {
  type: string;
  payloadJson: string;
  idempotencyKey: string;
  maxAttempts: number;
  nextAttemptAt: Date;
}

export interface OutboxJobClaimInput {
  workerId: string;
  now: Date;
  staleBefore: Date;
}

export interface OutboxJobRepositoryLike {
  create(input: OutboxJobCreateInput): Promise<OutboxJobRecord>;
  findByIdempotencyKey(idempotencyKey: string): Promise<OutboxJobRecord | null>;
  requeue(id: string, nextAttemptAt: Date, now: Date): Promise<OutboxJobRecord>;
  claimNext(input: OutboxJobClaimInput): Promise<OutboxJobRecord | null>;
  complete(id: string, resultJson: string | null, now: Date): Promise<OutboxJobRecord>;
  retryOrFail(id: string, lastError: string, nextAttemptAt: Date, now: Date): Promise<OutboxJobRecord>;
  recoverStuck(staleBefore: Date, now: Date): Promise<number>;
}

export class OutboxRepository implements OutboxJobRepositoryLike {
  constructor(private readonly db: PrismaClient) {}

  create(input: OutboxJobCreateInput): Promise<OutboxJobRecord> {
    return this.client().outboxJob.create({
      data: {
        type: input.type,
        payloadJson: input.payloadJson,
        idempotencyKey: input.idempotencyKey,
        maxAttempts: input.maxAttempts,
        nextAttemptAt: input.nextAttemptAt
      }
    });
  }

  findByIdempotencyKey(idempotencyKey: string): Promise<OutboxJobRecord | null> {
    return this.client().outboxJob.findUnique({
      where: {
        idempotencyKey
      }
    });
  }

  requeue(id: string, nextAttemptAt: Date, now: Date): Promise<OutboxJobRecord> {
    return this.client().outboxJob.update({
      where: {
        id
      },
      data: {
        status: OUTBOX_JOB_STATUS.PENDING,
        attempts: 0,
        nextAttemptAt,
        lockedAt: null,
        lockedBy: null,
        completedAt: null,
        lastError: null,
        resultJson: null,
        updatedAt: now
      }
    });
  }

  async claimNext(input: OutboxJobClaimInput): Promise<OutboxJobRecord | null> {
    const candidate = await this.client().outboxJob.findFirst({
      where: {
        OR: [
          {
            status: OUTBOX_JOB_STATUS.PENDING,
            nextAttemptAt: {
              lte: input.now
            }
          },
          {
            status: OUTBOX_JOB_STATUS.PROCESSING,
            lockedAt: {
              lte: input.staleBefore
            }
          }
        ]
      },
      orderBy: [
        {
          nextAttemptAt: 'asc'
        },
        {
          createdAt: 'asc'
        }
      ]
    });

    if (!candidate) {
      return null;
    }

    const claimed = await this.client().outboxJob.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
        updatedAt: candidate.updatedAt
      },
      data: {
        status: OUTBOX_JOB_STATUS.PROCESSING,
        lockedAt: input.now,
        lockedBy: input.workerId,
        attempts: {
          increment: 1
        },
        lastError: null
      }
    });

    if (claimed.count !== 1) {
      return null;
    }

    return this.client().outboxJob.findUnique({
      where: {
        id: candidate.id
      }
    });
  }

  complete(id: string, resultJson: string | null, now: Date): Promise<OutboxJobRecord> {
    return this.client().outboxJob.update({
      where: {
        id
      },
      data: {
        status: OUTBOX_JOB_STATUS.SUCCEEDED,
        completedAt: now,
        lockedAt: null,
        lockedBy: null,
        resultJson
      }
    });
  }

  async retryOrFail(id: string, lastError: string, nextAttemptAt: Date, now: Date): Promise<OutboxJobRecord> {
    const job = await this.client().outboxJob.findUnique({
      where: {
        id
      }
    });

    if (!job) {
      throw new Error(`Outbox job not found: ${id}`);
    }

    const exhausted = job.attempts >= job.maxAttempts;

    return this.client().outboxJob.update({
      where: {
        id
      },
      data: {
        status: exhausted ? OUTBOX_JOB_STATUS.FAILED : OUTBOX_JOB_STATUS.PENDING,
        nextAttemptAt: exhausted ? job.nextAttemptAt : nextAttemptAt,
        completedAt: exhausted ? now : null,
        lockedAt: null,
        lockedBy: null,
        lastError
      }
    });
  }

  async recoverStuck(staleBefore: Date, now: Date): Promise<number> {
    const result = await this.client().outboxJob.updateMany({
      where: {
        status: OUTBOX_JOB_STATUS.PROCESSING,
        lockedAt: {
          lte: staleBefore
        }
      },
      data: {
        status: OUTBOX_JOB_STATUS.PENDING,
        lockedAt: null,
        lockedBy: null,
        nextAttemptAt: now
      }
    });

    return result.count;
  }

  private client() {
    return this.db as unknown as {
      outboxJob: {
        create: (payload: unknown) => Promise<OutboxJobRecord>;
        findUnique: (payload: unknown) => Promise<OutboxJobRecord | null>;
        findFirst: (payload: unknown) => Promise<OutboxJobRecord | null>;
        update: (payload: unknown) => Promise<OutboxJobRecord>;
        updateMany: (payload: unknown) => Promise<{ count: number }>;
      };
    };
  }
}

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
  );
}
