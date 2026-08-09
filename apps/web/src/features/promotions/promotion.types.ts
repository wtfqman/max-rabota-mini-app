import type { PublicAdType, OwnedAdPayment } from '../ads/ad.types.js';

export type PromotionProductType =
  | 'BUMP_ONCE'
  | 'URGENT_BADGE'
  | 'PIN_CATEGORY'
  | 'HIGHLIGHT_CARD'
  | 'RECOMMENDED'
  | 'AUTO_BUMP';

export interface PromotionProduct {
  id: string | null;
  type: PromotionProductType;
  enabled: boolean;
  price: string | null;
  currency: string;
  durationHours: number | null;
  applicableAdTypes: PublicAdType[];
  configuration: Record<string, unknown>;
  channelBehavior: {
    showBadgesInMax?: boolean;
    showBadgesInTelegram?: boolean;
    autoBumpChannels?: 'NONE' | 'MAX_ONLY' | 'TELEGRAM_ONLY' | 'ALL';
  };
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface PromotionPurchase {
  id: string;
  adId: string;
  productId: string;
  productType: PromotionProductType;
  amount: string;
  currency: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  lastBumpedAt: string | null;
  createdAt: string;
  payment: OwnedAdPayment | null;
}
