export interface AppConfig {
  port: number;
  databasePath: string;
  antiFraudWebhookUrl: string;
  antiFraudTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3000),
    databasePath: env.DATABASE_PATH ?? ':memory:',
    antiFraudWebhookUrl: env.ANTIFRAUD_WEBHOOK_URL ?? 'http://localhost:4000/webhooks/antifraud',
    antiFraudTimeoutMs: Number(env.ANTIFRAUD_TIMEOUT_MS ?? 2000),
  };
}
