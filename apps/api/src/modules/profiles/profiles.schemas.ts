import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalUrl = z.string().trim().url().max(500).nullable().optional();

export const updateProfileSchema = z.object({
  profileType: z.enum(['person', 'company']).optional(),
  companyName: optionalText(160),
  city: optionalText(120),
  districtText: optionalText(120),
  about: optionalText(2000),
  avatarUrl: optionalUrl,
  phone: optionalText(80),
  email: z.string().trim().email().max(160).nullable().optional(),
  website: optionalUrl,
  maxContact: optionalText(120),
  specialization: optionalText(160),
  experience: optionalText(160),
  companyInfo: optionalText(2000),
  registrationDetails: optionalText(1000),
  privacy: z
    .object({
      showPhone: z.boolean().optional(),
      showEmail: z.boolean().optional(),
      showWebsite: z.boolean().optional(),
      showMaxContact: z.boolean().optional(),
      allowResumePublicProfile: z.boolean().optional()
    })
    .optional()
});

export const trustBadgeParamSchema = z.object({
  userId: z.string().trim().min(1),
  badge: z.enum(['phone_confirmed', 'company_verified', 'reliable_employer', 'long_time_member'])
});

export const updateTrustBadgeSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().max(1000).nullable().optional()
});
