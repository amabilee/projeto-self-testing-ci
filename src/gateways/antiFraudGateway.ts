export interface TransferNotification {
  transferId: string;
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  occurredAt: string;
}

export interface AntiFraudGateway {
  notifyTransfer(event: TransferNotification): Promise<void>;
}

export type FetchFn = typeof fetch;

export class HttpAntiFraudGateway implements AntiFraudGateway {
  constructor(
    private readonly webhookUrl: string,
    private readonly timeoutMs: number,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async notifyTransfer(event: TransferNotification): Promise<void> {
    const response = await this.fetchFn(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'transfer.completed', data: event }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Webhook anti-fraude respondeu com status ${response.status}`);
    }
  }
}
