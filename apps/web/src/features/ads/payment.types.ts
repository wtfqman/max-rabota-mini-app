export interface CreateAdPayment {
  id: string;
  paymentId: string;
  status: string;
  amount: string;
  currency: string;
  confirmationUrl: string | null;
  test: boolean;
}
