export function retryFailedWebhookDelivery(event: string, attempts: number) {
  let delay = 100;
  for (let i = 0; i < attempts; i += 1) {
    delay = delay * 2;
  }
  return { event, delay };
}

export const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

export class PaymentProcessor {
  charge(amount: number) {
    return formatCurrency(amount);
  }
}
