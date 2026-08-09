import type { Request, Response } from 'express';
import { sendOk } from '../../shared/http/responses.js';
import type { TelegramSyncService } from './telegram-sync.service.js';

export class TelegramSyncController {
  constructor(private readonly service: TelegramSyncService) {}

  status = async (_request: Request, response: Response): Promise<void> => {
    sendOk(response, await this.service.getStatus());
  };

  targets = async (_request: Request, response: Response): Promise<void> => {
    sendOk(response, await this.service.listTargets());
  };

  checkTarget = async (request: Request, response: Response): Promise<void> => {
    sendOk(response, await this.service.checkTarget(request.params.targetId));
  };

  checkAllTargets = async (_request: Request, response: Response): Promise<void> => {
    sendOk(response, await this.service.checkAllTargets());
  };

  enableTarget = async (request: Request, response: Response): Promise<void> => {
    sendOk(response, await this.service.setEnabled(request.params.targetId, true));
  };

  disableTarget = async (request: Request, response: Response): Promise<void> => {
    sendOk(response, await this.service.setEnabled(request.params.targetId, false));
  };

  testPublish = async (request: Request, response: Response): Promise<void> => {
    sendOk(response, await this.service.testPublish(request.params.targetId, request.body.kind));
  };

  consumeLinkCode = async (request: Request, response: Response): Promise<void> => {
    sendOk(response, await this.service.consumeLinkCode(request.auth!.userId, request.body.code));
  };
}

