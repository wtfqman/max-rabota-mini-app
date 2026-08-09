export interface NotificationDeepLink {
  label: string;
  path: string;
  startParam?: string;
}

export interface NotificationPayload {
  category: 'ad_status' | 'applications' | 'saved_searches' | 'payments' | 'marketing';
  critical: boolean;
  deepLink?: NotificationDeepLink;
  data?: Record<string, unknown>;
}

export interface UserNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: NotificationPayload | null;
  readAt: string | null;
  createdAt: string;
  deliveries: Array<{
    channel: 'MAX' | 'IN_APP';
    status: string;
    attempts: number;
    sentAt: string | null;
    lastError: string | null;
  }>;
}

export interface NotificationPreferences {
  adStatusEnabled: boolean;
  applicationsEnabled: boolean;
  savedSearchesEnabled: boolean;
  paymentsEnabled: boolean;
  marketingEnabled: boolean;
}

export interface NotificationListMeta {
  unreadTotal?: number;
  nextCursor?: string | null;
}
