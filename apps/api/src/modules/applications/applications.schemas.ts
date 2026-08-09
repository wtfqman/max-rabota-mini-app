import { z } from 'zod';

export const jobApplicationStatusSchema = z.enum([
  'new',
  'viewed',
  'contacted',
  'suitable',
  'rejected',
  'withdrawn'
]);

export const employerJobApplicationStatusSchema = z.enum(['viewed', 'contacted', 'suitable', 'rejected']);

const contactTypeSchema = z.enum(['max', 'phone', 'email', 'website', 'other']);

export const createJobApplicationSchema = z
  .object({
    resumeAdId: z.string().trim().min(1).max(191).nullable().optional(),
    coverMessage: z.string().trim().max(1200).nullable().optional(),
    contact: z
      .object({
        type: contactTypeSchema.default('phone'),
        label: z.string().trim().max(80).nullable().optional(),
        value: z.string().trim().min(3).max(255)
      })
      .strict()
      .nullable()
      .optional()
  })
  .strict();

export const updateJobApplicationStatusSchema = z
  .object({
    status: employerJobApplicationStatusSchema
  })
  .strict();

export const jobApplicationListQuerySchema = z
  .object({
    status: jobApplicationStatusSchema.optional()
  })
  .strict();

export const jobApplicationIdParamSchema = z.object({
  applicationId: z.string().trim().min(1).max(191)
});

export const vacancyApplicationParamSchema = z.object({
  vacancyAdId: z.string().trim().min(1).max(191)
});

export type CreateJobApplicationDto = z.infer<typeof createJobApplicationSchema>;
export type JobApplicationListQuery = z.infer<typeof jobApplicationListQuerySchema>;
export type UpdateJobApplicationStatusDto = z.infer<typeof updateJobApplicationStatusSchema>;
export type JobApplicationStatusDto = z.infer<typeof jobApplicationStatusSchema>;
