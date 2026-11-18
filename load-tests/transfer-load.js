import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
const vus = Number(__ENV.VUS || 50);
const duration = __ENV.DURATION || '30s';

const unexpectedErrors = new Rate('transfer_unexpected_errors');
const transferLatency = new Trend('transfer_latency', true);

export const options = {
  scenarios: {
    concurrent_transfers: {
      executor: 'constant-vus',
      vus,
      duration,
    },
  },
  thresholds: {
    transfer_unexpected_errors: ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

http.setResponseCallback(http.expectedStatuses(200, 201, 422));

function createAccount(name, document, initialBalance) {
  const res = http.post(`${baseUrl}/accounts`, JSON.stringify({ ownerName: name, document, initialBalance }), {
    headers: { 'Content-Type': 'application/json' },
  });
  if (res.status !== 201) throw new Error(`Falha ao criar conta: ${res.status} ${res.body}`);
  return res.json('id');
}

export function setup() {
  const suffix = String(Date.now()).slice(-9);
  const from = createAccount('Carga Origem', `10${suffix}`, 1000000);
  const to = createAccount('Carga Destino', `20${suffix}`, 0);
  return { from, to };
}

export default function (data) {
  const res = http.post(
    `${baseUrl}/transfers`,
    JSON.stringify({ fromAccountId: data.from, toAccountId: data.to, amount: 1 }),
    {
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `vu${__VU}-it${__ITER}-${Date.now()}` },
      tags: { endpoint: 'transfers' },
    },
  );
  transferLatency.add(res.timings.duration);
  unexpectedErrors.add(res.status !== 201 && res.status !== 422);
  check(res, { 'status 201 ou 422': (r) => r.status === 201 || r.status === 422 });
}

export function teardown(data) {
  const a = http.get(`${baseUrl}/accounts/${data.from}`).json('balance');
  const b = http.get(`${baseUrl}/accounts/${data.to}`).json('balance');
  const total = Math.round((a + b) * 100) / 100;
  console.info(`Saldo origem=${a} destino=${b} total=${total} (esperado 1000000)`);
  if (total !== 1000000) throw new Error('Inconsistência de saldo detectada!');
}

export function handleSummary(data) {
  const m = data.metrics;
  const summary = {
    vus,
    duration,
    totalRequests: m.http_reqs.values.count,
    throughputRps: Number(m.http_reqs.values.rate.toFixed(2)),
    errorRate: m.transfer_unexpected_errors.values.rate,
    latencyAvgMs: Number(m.transfer_latency.values.avg.toFixed(2)),
    latencyP95Ms: Number(m.transfer_latency.values['p(95)'].toFixed(2)),
    latencyMaxMs: Number(m.transfer_latency.values.max.toFixed(2)),
  };
  return {
    stdout: `\n=== RESUMO DO TESTE DE CARGA ===\n${JSON.stringify(summary, null, 2)}\n`,
    'reports/load-test-summary.json': JSON.stringify(summary, null, 2),
  };
}
