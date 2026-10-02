import { describe, expect, it } from 'vitest';
import { shouldAutoSyncEmpenhos } from '../useAutoSyncContractEmpenhos';

const base = { isLoading: false, isError: false, empenhosCount: 0, authorized: true, alreadyTried: false, isSyncing: false };

describe('shouldAutoSyncEmpenhos', () => {
  it('sincroniza quando o contrato abre sem empenho gravado', () => {
    expect(shouldAutoSyncEmpenhos(base)).toBe(true);
  });

  it.each([
    ['ainda carregando', { isLoading: true }],
    ['erro na leitura', { isError: true }],
    ['já tem empenho', { empenhosCount: 2 }],
    ['sem permissão', { authorized: false }],
    ['já tentou nesta sessão', { alreadyTried: true }],
    ['sincronização em andamento', { isSyncing: true }]
  ])('não sincroniza: %s', (_, patch) => {
    expect(shouldAutoSyncEmpenhos({ ...base, ...patch })).toBe(false);
  });
});
