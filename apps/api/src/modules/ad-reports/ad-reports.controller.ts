import type { Request, Response } from 'express';
import { AppError } from '@rabst24/shared';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendOk } from '../../shared/http/responses.js';
import type { AdReportsService } from './ad-reports.service.js';
import type { CreateAdReportDto, AdReportModerationQuery, ResolveAdReportDto } from './ad-reports.schemas.js';

export class AdReportsController {
  constructor(private readonly service: AdReportsService) {}

  create = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.service.createReport(this.requireUserId(request), request.body as CreateAdReportDto);
    sendOk(response, result);
  });

  moderationList = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.service.listForModeration(request.query as unknown as AdReportModerationQuery);
    sendOk(response, result.items, {
      page: result.page,
      perPage: result.perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / result.perPage)
    });
  });

  resolve = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.service.resolveReport(
      this.requireUserId(request),
      request.params.reportId,
      request.body as ResolveAdReportDto
    );

    sendOk(response, result);
  });

  private requireUserId(request: Request): string {
    if (!request.auth?.userId) {
      throw new AppError('Authentication required', 401);
    }

    return request.auth.userId;
  }
}
