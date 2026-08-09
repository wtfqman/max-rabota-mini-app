import { z } from 'zod';

export const verifyMiniAppContactSchema = z.object({
  phone: z.string().trim().min(7).max(32),
  authDate: z.union([z.string(), z.number()]),
  hash: z.string().trim().regex(/^[a-f0-9]{32,128}$/i),
  userId: z.union([z.string(), z.number()])
});

export const attachResumeContactSchema = z.object({
  resumeAdId: z.string().trim().min(1),
  verifiedContactId: z.string().trim().min(1),
  consentId: z.string().trim().min(1)
});

export const createDisputeSchema = z.object({
  reason: z.enum([
    'NUMBER_DOES_NOT_EXIST',
    'WRONG_PERSON',
    'UNABLE_TO_CONNECT',
    'CONTACT_DIFFERS',
    'SUSPICIOUS_BEHAVIOR',
    'OTHER'
  ]),
  comment: z.string().trim().max(1500).optional()
});
