import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabase } from '../../src/repositories/database';

describe('createDatabase', () => {
  it('cria o diretório e o arquivo do banco quando um caminho é informado', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-'));
    const file = path.join(dir, 'nested', 'wallet.db');
    const db = createDatabase(file);
    try {
      expect(fs.existsSync(file)).toBe(true);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
      expect(tables).toEqual(
        expect.arrayContaining([{ name: 'accounts' }, { name: 'transactions' }, { name: 'transfers' }]),
      );
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('usa banco em memória por padrão', () => {
    const db = createDatabase();
    expect(db.memory).toBe(true);
    db.close();
  });
});
