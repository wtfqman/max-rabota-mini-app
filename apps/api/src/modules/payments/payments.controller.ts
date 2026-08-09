import type { Request, Response } from 'express';
import { AppError } from '@rabst24/shared';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendOk } from '../../shared/http/responses.js';
import type { AdPaymentService } from './ad-payment.service.js';
import type { PaymentHistoryService } from './payment-history.service.js';

export class PaymentsController {
  constructor(
    private readonly adPaymentService: AdPaymentService,
    private readonly paymentHistoryService?: PaymentHistoryService
  ) {}

  yookassaWebhook = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.adPaymentService.handleWebhook(request.body);

    sendOk(response, {
      ok: true,
      ...result
    });
  });

  history = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    const result = await this.requirePaymentHistoryService().listUserHistory(userId, request.query as { page?: number; perPage?: number });

    sendOk(response, result.items, result.meta);
  });

  adminDashboard = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const dashboard = await this.requirePaymentHistoryService().getAdminDashboard(request.query as { from?: string; to?: string });

    sendOk(response, dashboard);
  });

  adminCsv = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const csv = await this.requirePaymentHistoryService().exportAdminCsv(request.query as { from?: string; to?: string });

    response
      .status(200)
      .setHeader('content-type', 'text/csv; charset=utf-8')
      .setHeader('content-disposition', 'attachment; filename="rabst24-finance.csv"')
      .send(csv);
  });

  private requirePaymentHistoryService(): PaymentHistoryService {
    if (!this.paymentHistoryService) {
      throw new AppError('Payment history service is not configured', 503);
    }

    return this.paymentHistoryService;
  }

  private requireUserId(request: Request): string {
    if (!request.auth?.userId) {
      throw new AppError('Authentication required', 401);
    }

    return request.auth.userId;
  }
}
