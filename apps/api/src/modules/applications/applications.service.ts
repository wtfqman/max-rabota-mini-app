import {
  AdStatus,
  AdType,
  JobApplicationStatus,
  Prisma,
  UserRole,
  UserStatus,
  type JobApplication,
  type PrismaClient
} from '@rabst24/db';
import { serializeAdCard, serializeAdDetail } from '@rabst24/core';
import { AppError } from '@rabst24/shared';
import { adWithDetailsInclude, type PublicAdRecord } from '@rabst24/core';
import type { AdAnalyticsService } from '../ad-analytics/ad-analytics.service.js';
import type { NotificationService } from '../notifications/notifications.service.js';
import type {
  CreateJobApplicationDto,
  JobApplicationListQuery,
  JobApplicationStatusDto,
  UpdateJobApplicationStatusDto
} from './applications.schemas.js';

const ACTIVE_APPLICATION_STATUSES = [
  JobApplicationStatus.NEW,
  JobApplicationStatus.VIEWED,
  JobApplicationStatus.CONTACTED
] as const;

type ViewerRole = 'user' | 'moderator' | 'admin';

type ApplicationWithRelations = JobApplication & {
  vacancyAd: PublicAdRecord;
  resumeAd: PublicAdRecord | null;
  applicant: {
    id: string;
    displayName: string | null;
    maxUsername: string | null;
    firstName: string | null;
    lastName: string | null;
  };
};

export interface JobApplicationDto {
  id: string;
  vacancyAdId: string;
  applicantUserId: string;
  resumeAdId: string | null;
  coverMessage: string | null;
  status: JobApplicationStatusDto;
  viewedAt: string | null;
  contactedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  vacancy: ReturnType<typeof serializeAdCard>;
  applicant: ApplicationWithRelations['applicant'];
  contactSnapshot: ContactSnapshot | null;
  resumeSnapshot: ResumeSnapshot | null;
  resume: ReturnType<typeof serializeAdDetail> | null;
}

interface ContactSnapshot {
  contacts: Array<{
    type: string;
    label: string | null;
    value: string;
    isPreferred: boolean;
  }>;
}

interface ResumeSnapshot {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  shortSalary: string | null;
  locationShort: string | null;
  city: string | null;
  district: string | null;
  chips: ReturnType<typeof serializeAdCard>['chips'];
  resume?: unknown;
  photos: ReturnType<typeof serializeAdDetail>['photos'];
}

export class JobApplicationsService {
  constructor(
    private readonly db: PrismaClient,
    private readonly notificationService?: NotificationService,
    private readonly adAnalyticsService?: AdAnalyticsService
  ) {}

  async create(userId: string, vacancyAdId: string, dto: CreateJobApplicationDto): Promise<JobApplicationDto> {
    const applicant = await this.db.user.findFirst({
      where: {
        id: userId,
        status: UserStatus.ACTIVE,
        deletedAt: null
      },
      select: {
        id: true
      }
    });

    if (!applicant) {
      throw new AppError('Applicant is blocked or deleted', 403, {
        code: 'APPLICANT_NOT_ACTIVE'
      });
    }

    const vacancy = await this.db.ad.findFirst({
      where: {
        id: vacancyAdId,
        type: AdType.VACANCY,
        status: {
          in: [AdStatus.APPROVED, AdStatus.PUBLISHED]
        },
        hiddenAt: null,
        archivedAt: null,
        deletedAt: null,
        isTest: false,
        owner: {
          status: UserStatus.ACTIVE,
          deletedAt: null
        }
      },
      include: adWithDetailsInclude
    });

    if (!vacancy) {
      throw new AppError('Vacancy cannot receive applications', 404, {
        code: 'VACANCY_NOT_AVAILABLE'
      });
    }

    if (vacancy.ownerId === userId) {
      throw new AppError('Cannot apply to your own vacancy', 409, {
        code: 'OWN_VACANCY_APPLICATION_BLOCKED'
      });
    }

    const existing = await this.db.jobApplication.findFirst({
      where: {
        vacancyAdId,
        applicantUserId: userId,
        status: {
          in: [...ACTIVE_APPLICATION_STATUSES]
        }
      },
      select: {
        id: true
      }
    });

    if (existing) {
      throw new AppError('Active application already exists', 409, {
        code: 'JOB_APPLICATION_DUPLICATE',
        applicationId: existing.id
      });
    }

    const resume = dto.resumeAdId ? await this.getOwnedPublishedResume(userId, dto.resumeAdId) : null;
    const contactSnapshot = this.buildContactSnapshot(dto, resume);

    if (contactSnapshot.contacts.length === 0) {
      throw new AppError('Contact is required without a resume contact', 400, {
        code: 'APPLICATION_CONTACT_REQUIRED'
      });
    }

    try {
      const application = await this.db.jobApplication.create({
        data: {
          vacancyAdId,
          applicantUserId: userId,
          resumeAdId: resume?.id ?? null,
          coverMessage: normalizeNullableText(dto.coverMessage),
          contactSnapshotJson: JSON.stringify(contactSnapshot),
          resumeSnapshotJson: resume ? JSON.stringify(this.buildResumeSnapshot(resume)) : null,
          status: JobApplicationStatus.NEW
        },
        include: this.applicationInclude()
      });

      await this.notifyEmployerAboutNewApplication(application);
      await this.adAnalyticsService?.recordSystemEvent(vacancyAdId, 'application_sent');

      return this.toDto(application, true);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError('Active application already exists', 409, {
          code: 'JOB_APPLICATION_DUPLICATE'
        });
      }

      throw error;
    }
  }

  async listMine(userId: string, query: JobApplicationListQuery = {}): Promise<JobApplicationDto[]> {
    const applications = await this.db.jobApplication.findMany({
      where: {
        applicantUserId: userId,
        ...(query.status
          ? {
              status: deserializeStatus(query.status)
            }
          : {})
      },
      include: this.applicationInclude(),
      orderBy: {
        createdAt: 'desc'
      },
      take: 100
    });

    return applications.map((application) => this.toDto(application, true));
  }

  async listForVacancy(
    viewerId: string,
    viewerRole: ViewerRole,
    vacancyAdId: string,
    query: JobApplicationListQuery = {}
  ): Promise<JobApplicationDto[]> {
    const vacancy = await this.db.ad.findFirst({
      where: {
        id: vacancyAdId,
        type: AdType.VACANCY,
        deletedAt: null
      },
      select: {
        id: true,
        ownerId: true
      }
    });

    if (!vacancy) {
      throw new AppError('Vacancy not found', 404, {
        code: 'VACANCY_NOT_FOUND'
      });
    }

    const canInvestigate = isInvestigationRole(viewerRole);
    if (vacancy.ownerId !== viewerId && !canInvestigate) {
      throw new AppError('Forbidden', 403, {
        code: 'JOB_APPLICATIONS_FORBIDDEN'
      });
    }

    if (vacancy.ownerId === viewerId) {
      await this.markVacancyApplicationsViewed(vacancyAdId);
    }

    const applications = await this.db.jobApplication.findMany({
      where: {
        vacancyAdId,
        ...(query.status
          ? {
              status: deserializeStatus(query.status)
            }
          : {})
      },
      include: this.applicationInclude(),
      orderBy: {
        createdAt: 'desc'
      },
      take: 200
    });

    return applications.map((application) => this.toDto(application, true));
  }

  async getById(viewerId: string, viewerRole: ViewerRole, applicationId: string): Promise<JobApplicationDto> {
    const application = await this.getApplicationOrThrow(applicationId);
    const canInvestigate = isInvestigationRole(viewerRole);
    const isEmployer = application.vacancyAd.ownerId === viewerId;
    const isApplicant = application.applicantUserId === viewerId;

    if (!isEmployer && !isApplicant && !canInvestigate) {
      throw new AppError('Application not found', 404, {
        code: 'JOB_APPLICATION_NOT_FOUND'
      });
    }

    if (isEmployer && application.status === JobApplicationStatus.NEW) {
      const viewed = await this.setViewed(application);
      return this.toDto(viewed, true);
    }

    return this.toDto(application, true);
  }

  async updateStatus(
    viewerId: string,
    viewerRole: ViewerRole,
    applicationId: string,
    dto: UpdateJobApplicationStatusDto
  ): Promise<JobApplicationDto> {
    const application = await this.getApplicationOrThrow(applicationId);
    const canInvestigate = isInvestigationRole(viewerRole);

    if (application.vacancyAd.ownerId !== viewerId && !canInvestigate) {
      throw new AppError('Forbidden', 403, {
        code: 'JOB_APPLICATION_STATUS_FORBIDDEN'
      });
    }

    if (application.status === JobApplicationStatus.WITHDRAWN) {
      throw new AppError('Application has been withdrawn', 409, {
        code: 'JOB_APPLICATION_WITHDRAWN'
      });
    }

    const nextStatus = deserializeStatus(dto.status);
    const now = new Date();
    const updated = await this.db.jobApplication.update({
      where: {
        id: applicationId
      },
      data: {
        status: nextStatus,
        viewedAt:
          nextStatus === JobApplicationStatus.VIEWED ||
          nextStatus === JobApplicationStatus.CONTACTED ||
          nextStatus === JobApplicationStatus.SUITABLE ||
          nextStatus === JobApplicationStatus.REJECTED
            ? application.viewedAt ?? now
            : undefined,
        contactedAt: nextStatus === JobApplicationStatus.CONTACTED ? application.contactedAt ?? now : undefined,
        decidedAt:
          nextStatus === JobApplicationStatus.SUITABLE || nextStatus === JobApplicationStatus.REJECTED
            ? application.decidedAt ?? now
            : undefined
      },
      include: this.applicationInclude()
    });

    await this.notifyApplicantAboutStatus(updated, application.status);
    return this.toDto(updated, true);
  }

  async withdraw(userId: string, applicationId: string): Promise<JobApplicationDto> {
    const application = await this.getApplicationOrThrow(applicationId);

    if (application.applicantUserId !== userId) {
      throw new AppError('Application not found', 404, {
        code: 'JOB_APPLICATION_NOT_FOUND'
      });
    }

    if (!ACTIVE_APPLICATION_STATUSES.includes(application.status as (typeof ACTIVE_APPLICATION_STATUSES)[number])) {
      throw new AppError('Application can no longer be withdrawn', 409, {
        code: 'JOB_APPLICATION_WITHDRAW_FORBIDDEN',
        status: application.status.toLowerCase()
      });
    }

    const updated = await this.db.jobApplication.update({
      where: {
        id: applicationId
      },
      data: {
        status: JobApplicationStatus.WITHDRAWN,
        decidedAt: new Date()
      },
      include: this.applicationInclude()
    });

    return this.toDto(updated, true);
  }

  async countForVacancies(ownerId: string, vacancyAdIds: string[]): Promise<Map<string, number>> {
    const uniqueIds = [...new Set(vacancyAdIds.filter(Boolean))];

    if (uniqueIds.length === 0) {
      return new Map();
    }

    const rows = await this.db.jobApplication.groupBy({
      by: ['vacancyAdId'],
      where: {
        vacancyAdId: {
          in: uniqueIds
        },
        vacancyAd: {
          ownerId
        },
        status: {
          not: JobApplicationStatus.WITHDRAWN
        }
      },
      _count: {
        _all: true
      }
    });

    return new Map(rows.map((row) => [row.vacancyAdId, row._count._all]));
  }

  private async getOwnedPublishedResume(userId: string, resumeAdId: string): Promise<PublicAdRecord> {
    const resume = await this.db.ad.findFirst({
      where: {
        id: resumeAdId,
        ownerId: userId,
        type: AdType.RESUME,
        status: {
          in: [AdStatus.APPROVED, AdStatus.PUBLISHED]
        },
        hiddenAt: null,
        archivedAt: null,
        deletedAt: null
      },
      include: adWithDetailsInclude
    });

    if (!resume) {
      throw new AppError('Resume not found or not published', 400, {
        code: 'APPLICATION_RESUME_UNAVAILABLE'
      });
    }

    return resume;
  }

  private async getApplicationOrThrow(applicationId: string): Promise<ApplicationWithRelations> {
    const application = await this.db.jobApplication.findUnique({
      where: {
        id: applicationId
      },
      include: this.applicationInclude()
    });

    if (!application) {
      throw new AppError('Application not found', 404, {
        code: 'JOB_APPLICATION_NOT_FOUND'
      });
    }

    return application;
  }

  private async markVacancyApplicationsViewed(vacancyAdId: string): Promise<void> {
    const fresh = await this.db.jobApplication.findMany({
      where: {
        vacancyAdId,
        status: JobApplicationStatus.NEW
      },
      include: this.applicationInclude()
    });

    if (fresh.length === 0) {
      return;
    }

    const viewedAt = new Date();
    await this.db.jobApplication.updateMany({
      where: {
        id: {
          in: fresh.map((item) => item.id)
        },
        status: JobApplicationStatus.NEW
      },
      data: {
        status: JobApplicationStatus.VIEWED,
        viewedAt
      }
    });

    await Promise.all(
      fresh.map((application) =>
        this.notifyApplicantViewed({
          ...application,
          status: JobApplicationStatus.VIEWED,
          viewedAt,
          updatedAt: viewedAt
        })
      )
    );
  }

  private async setViewed(application: ApplicationWithRelations): Promise<ApplicationWithRelations> {
    const viewedAt = new Date();
    const updated = await this.db.jobApplication.update({
      where: {
        id: application.id
      },
      data: {
        status: JobApplicationStatus.VIEWED,
        viewedAt
      },
      include: this.applicationInclude()
    });

    await this.notifyApplicantViewed(updated);
    return updated;
  }

  private buildContactSnapshot(dto: CreateJobApplicationDto, resume: PublicAdRecord | null): ContactSnapshot {
    const contacts = [];

    if (dto.contact?.value) {
      contacts.push({
        type: dto.contact.type,
        label: normalizeNullableText(dto.contact.label),
        value: dto.contact.value.trim(),
        isPreferred: true
      });
    }

    if (resume) {
      contacts.push(
        ...resume.contacts.map((contact) => ({
          type: contact.type.toLowerCase(),
          label: contact.label,
          value: contact.value,
          isPreferred: contact.isPreferred
        }))
      );
    }

    return {
      contacts: dedupeContacts(contacts).slice(0, 8)
    };
  }

  private buildResumeSnapshot(resume: PublicAdRecord): ResumeSnapshot {
    const detail = serializeAdDetail(resume);

    return {
      id: resume.id,
      title: detail.title,
      subtitle: detail.subtitle,
      description: detail.description,
      shortSalary: detail.shortSalary,
      locationShort: detail.locationShort,
      city: detail.city,
      district: detail.district,
      chips: detail.chips,
      resume: detail.type === 'resume' ? detail.resume : undefined,
      photos: detail.photos
    };
  }

  private applicationInclude() {
    return {
      vacancyAd: {
        include: adWithDetailsInclude
      },
      resumeAd: {
        include: adWithDetailsInclude
      },
      applicant: {
        select: {
          id: true,
          displayName: true,
          maxUsername: true,
          firstName: true,
          lastName: true
        }
      }
    } satisfies Prisma.JobApplicationInclude;
  }

  private toDto(application: ApplicationWithRelations, includeContacts: boolean): JobApplicationDto {
    return {
      id: application.id,
      vacancyAdId: application.vacancyAdId,
      applicantUserId: application.applicantUserId,
      resumeAdId: application.resumeAdId,
      coverMessage: application.coverMessage,
      status: serializeStatus(application.status),
      viewedAt: application.viewedAt?.toISOString() ?? null,
      contactedAt: application.contactedAt?.toISOString() ?? null,
      decidedAt: application.decidedAt?.toISOString() ?? null,
      createdAt: application.createdAt.toISOString(),
      updatedAt: application.updatedAt.toISOString(),
      vacancy: serializeAdCard(application.vacancyAd),
      applicant: application.applicant,
      contactSnapshot: includeContacts ? parseJson<ContactSnapshot | null>(application.contactSnapshotJson, null) : null,
      resumeSnapshot: parseJson<ResumeSnapshot | null>(application.resumeSnapshotJson, null),
      resume: application.resumeAd ? serializeAdDetail(application.resumeAd) : null
    };
  }

  private async notifyEmployerAboutNewApplication(application: ApplicationWithRelations): Promise<void> {
    await this.notificationService?.notify({
      userId: application.vacancyAd.ownerId,
      type: 'JOB_APPLICATION_RECEIVED',
      category: 'applications',
      title: 'Новый отклик',
      body: `${getApplicantName(application)} откликнулся на вакансию «${application.vacancyAd.title}».`,
      idempotencyKey: `job_application:${application.id}:received`,
      payload: {
        applicationId: application.id,
        vacancyAdId: application.vacancyAdId,
        applicantUserId: application.applicantUserId
      },
      deepLink: {
        label: 'Открыть отклики',
        path: `/my-ads?vacancy=${encodeURIComponent(application.vacancyAdId)}&applications=1`,
        startParam: `applications_${application.vacancyAdId}`
      }
    });
  }

  private async notifyApplicantViewed(application: ApplicationWithRelations): Promise<void> {
    await this.notificationService?.notify({
      userId: application.applicantUserId,
      type: 'JOB_APPLICATION_STATUS_CHANGED',
      category: 'applications',
      title: 'Отклик просмотрен',
      body: `Работодатель открыл отклик на вакансию «${application.vacancyAd.title}».`,
      idempotencyKey: `job_application:${application.id}:viewed`,
      payload: {
        applicationId: application.id,
        vacancyAdId: application.vacancyAdId,
        status: 'viewed'
      },
      deepLink: {
        label: 'Мои отклики',
        path: '/applications',
        startParam: 'applications'
      }
    });
  }

  private async notifyApplicantAboutStatus(
    application: ApplicationWithRelations,
    previousStatus: JobApplicationStatus
  ): Promise<void> {
    if (application.status === previousStatus) {
      return;
    }

    const label = statusLabels[application.status];
    await this.notificationService?.notify({
      userId: application.applicantUserId,
      type: 'JOB_APPLICATION_STATUS_CHANGED',
      category: 'applications',
      title:
        application.status === JobApplicationStatus.SUITABLE
          ? 'Вы подходите'
          : application.status === JobApplicationStatus.REJECTED
            ? 'По отклику отказ'
            : 'Статус отклика изменён',
      body: `Вакансия «${application.vacancyAd.title}»: ${label}.`,
      idempotencyKey: `job_application:${application.id}:status:${application.status.toLowerCase()}`,
      payload: {
        applicationId: application.id,
        vacancyAdId: application.vacancyAdId,
        status: application.status.toLowerCase()
      },
      deepLink: {
        label: 'Мои отклики',
        path: '/applications',
        startParam: 'applications'
      }
    });
  }
}

const statusLabels: Record<JobApplicationStatus, string> = {
  [JobApplicationStatus.NEW]: 'новый',
  [JobApplicationStatus.VIEWED]: 'просмотрен',
  [JobApplicationStatus.CONTACTED]: 'работодатель связался',
  [JobApplicationStatus.SUITABLE]: 'подходит',
  [JobApplicationStatus.REJECTED]: 'отказ',
  [JobApplicationStatus.WITHDRAWN]: 'отозван'
};

function serializeStatus(status: JobApplicationStatus): JobApplicationStatusDto {
  return status.toLowerCase() as JobApplicationStatusDto;
}

function deserializeStatus(status: JobApplicationStatusDto): JobApplicationStatus {
  return status.toUpperCase() as JobApplicationStatus;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isInvestigationRole(role: ViewerRole): boolean {
  return role === UserRole.MODERATOR.toLowerCase() || role === UserRole.ADMIN.toLowerCase();
}

function getApplicantName(application: ApplicationWithRelations): string {
  return (
    application.applicant.displayName ??
    application.applicant.firstName ??
    application.applicant.maxUsername ??
    'Кандидат'
  );
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function dedupeContacts(contacts: ContactSnapshot['contacts']): ContactSnapshot['contacts'] {
  const seen = new Set<string>();
  return contacts.filter((contact) => {
    const key = `${contact.type}:${contact.value.trim().toLowerCase()}`;
    if (!contact.value.trim() || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
