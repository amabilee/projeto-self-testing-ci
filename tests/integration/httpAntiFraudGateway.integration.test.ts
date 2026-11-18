import { FetchFn, HttpAntiFraudGateway, TransferNotification } from '../../src/gateways/antiFraudGateway';

const event: TransferNotification = {
  transferId: 't-1',
  fromAccountId: 'a',
  toAccountId: 'b',
  amountCents: 1234,
  occurredAt: '2026-01-15T12:00:00.000Z',
};

describe('HttpAntiFraudGateway (Mock do cliente HTTP)', () => {
  it('envia POST JSON para a URL do webhook com o evento', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 202 });
    const gateway = new HttpAntiFraudGateway('http://antifraud.test/hook', 1000, fetchMock as unknown as FetchFn);

    await gateway.notifyTransfer(event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://antifraud.test/hook');
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual({ type: 'transfer.completed', data: event });
  });

  it('lança erro quando o webhook responde com status de falha', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    const gateway = new HttpAntiFraudGateway('http://antifraud.test/hook', 1000, fetchMock as unknown as FetchFn);

    await expect(gateway.notifyTransfer(event)).rejects.toThrow('status 503');
  });
});
