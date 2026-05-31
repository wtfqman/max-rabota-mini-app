import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendCreated } from '../../shared/http/responses.js';
import { FoundationController } from '../../shared/modules/foundation.controller.js';
import type { UploadsService } from './uploads.service.js';
import type { UploadMediaDto } from './uploads.schemas.js';

export class UploadsController extends FoundationController {
  constructor(private readonly uploadsService: UploadsService) {
    super(uploadsService);
  }

  uploadMedia = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const payload = await this.uploadsService.uploadMedia(request.body as UploadMediaDto);
    sendCreated(response, payload);
  });

  uploadPhoto = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const payload = await this.uploadsService.uploadPhoto(request.body as UploadMediaDto);
    sendCreated(response, payload);
  });
}
