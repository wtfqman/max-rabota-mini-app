import type { Request, Response } from 'express';
import { AppError } from '@rabst24/shared';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendCreated, sendOk } from '../../shared/http/responses.js';
import type { JobApplicationsService } from './applications.service.js';
import type { CreateJobApplicationDto, JobApplicationListQuery, UpdateJobApplicationStatusDto } from './applications.schemas.js';

export class JobApplicationsController {
  constructor(private readonly service: JobApplicationsService) {}

  createForVacancy = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const application = await this.service.create(
      this.requireUserId(request),
      request.params.vacancyAdId,
      request.body as CreateJobApplicationDto
    );
    sendCreated(response, application);
  });

  mine = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const applications = await this.service.listMine(
      this.requireUserId(request),
      request.query as unknown as JobApplicationListQuery
    );
    sendOk(response, applications);
  });

  forVacancy = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const applications = await this.service.listForVacancy(
      this.requireUserId(request),
      this.requireRole(request),
      request.params.vacancyAdId,
      request.query as unknown as JobApplicationListQuery
    );
    sendOk(response, applications);
  });

  details = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const application = await this.service.getById(
      this.requireUserId(request),
      this.requireRole(request),
      request.params.applicationId
    );
    sendOk(response, application);
  });

  updateStatus = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const application = await this.service.updateStatus(
      this.requireUserId(request),
      this.requireRole(request),
      request.params.applicationId,
      request.body as UpdateJobApplicationStatusDto
    );
    sendOk(response, application);
  });

  withdraw = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const application = await this.service.withdraw(this.requireUserId(request), request.params.applicationId);
    sendOk(response, application);
  });

  private requireUserId(request: Request): string {
    if (!request.auth?.userId) {
      throw new AppError('Authentication required', 401);
    }

    return request.auth.userId;
  }

  private requireRole(request: Request): 'user' | 'moderator' | 'admin' {
    if (!request.auth?.role) {
      throw new AppError('Authentication required', 401);
    }

    return request.auth.role as 'user' | 'moderator' | 'admin';
  }
}
