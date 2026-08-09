import { z } from 'zod';

export const adAnalyticsEventTypes = [
  'card_open',
  'favorite_add',
  'favorite_remove',
  'contact_open',
  'phone_click',
  'email_click',
  'max_click',
  'website_click',
  'application_sent',
  'resume_contact_unlock_purchased',
  'promotion_purchased'
] as const;

export const adAnalyticsEventSchema = z.object({
  adId: z.string().trim().min(1),
  eventType: z.enum(adAnalyticsEventTypes),
  sessionId: z.string().trim().min(8).max(120).optional(),
  internal: z.boolean().optional()
});

export const adAnalyticsAdParamSchema = z.object({
  adId: z.string().trim().min(1)
});

export const adAnalyticsRangeQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30)
});

export type AdAnalyticsEventDto = z.infer<typeof adAnalyticsEventSchema>;
export type AdAnalyticsRangeQuery = z.infer<typeof adAnalyticsRangeQuerySchema>;
export type AdAnalyticsEventType = z.infer<typeof adAnalyticsEventSchema>['eventType'];
