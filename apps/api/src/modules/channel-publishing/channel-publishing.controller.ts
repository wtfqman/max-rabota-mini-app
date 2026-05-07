import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendOk } from '../../shared/http/responses.js';
import { FoundationController } from '../../shared/modules/foundation.controller.js';
import type { ChannelPublishingModuleService } from './channel-publishing.service.js';
import type { PublishAdDto, PublishLogsQuery } from './channel-publishing.schemas.js';

export class ChannelPublishingController extends FoundationController {
  constructor(private readonly channelPublishingService: ChannelPublishingModuleService) {
    super(channelPublishingService);
  }

  publish = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.channelPublishingService.publish(
      request.params.adId,
      request.body as PublishAdDto
    );

    sendOk(response, result);
  });

  logs = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.channelPublishingService.listLogs(request.query as unknown as PublishLogsQuery);

    sendOk(response, result.items, {
      page: result.page,
      perPage: result.perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / result.perPage)
    });
  });
}
