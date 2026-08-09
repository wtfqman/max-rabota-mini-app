export type AdReportReason =
  | 'FRAUD'
  | 'FALSE_INFORMATION'
  | 'NOT_ACTUAL'
  | 'WRONG_PRICE'
  | 'SPAM'
  | 'PROHIBITED_CONTENT'
  | 'OTHER';

export type AdReportStatus =
  | 'OPEN'
  | 'IN_REVIEW'
  | 'RESOLVED_ACTION_TAKEN'
  | 'RESOLVED_NO_VIOLATION'
  | 'CANCELLED';

export type AdReportAction =
  | 'no_violation'
  | 'hide_ad'
  | 'send_to_moderation'
  | 'delete_ad'
  | 'warn_user'
  | 'temp_block_user'
  | 'block_user';

export interface CreateAdReportPayload {
  adId: string;
  reason: AdReportReason;
  comment?: string;
  evidence?: Record<string, unknown>;
}

export interface CreateAdReportResponse {
  report: {
    id: string;
    status: AdReportStatus;
    duplicate: boolean;
  };
}

export interface ModerationAdReport {
  id: string;
  adId: string;
  reportedUserId: string;
  reason: AdReportReason;
  comment: string | null;
  evidence: unknown;
  status: AdReportStatus;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  ad: {
    id: string;
    title: string;
    type: string;
    status: string;
    ownerId: string;
  };
  reportedUser: {
    id: string;
    displayName: string | null;
    maxUsername: string | null;
    status: string;
    blockedUntil: string | null;
  };
  otherReportsCount: number;
  rejectedAdsCount: number;
  moderationLogs: Array<{
    id: string;
    action: string;
    statusFrom: string | null;
    statusTo: string | null;
    reason: string | null;
    moderatorId: string | null;
    createdAt: string;
  }>;
  history: Array<{
    id: string;
    action: string;
    statusFrom: AdReportStatus | null;
    statusTo: AdReportStatus;
    adStatusFrom: string | null;
    adStatusTo: string | null;
    userStatusFrom: string | null;
    userStatusTo: string | null;
    reason: string | null;
    moderatorId: string | null;
    createdAt: string;
  }>;
}
