import { describe, it, expect } from 'vitest';
import { soMudaStatus } from '../taskSeiUpdate';

describe('soMudaStatus', () => {
  it('concluir pela linha só troca o status (uma gravação com o número)', () => {
    expect(soMudaStatus({ taskId: 't1', status: 'CONCLUIDA' })).toBe(true);
    expect(soMudaStatus({ taskId: 't1', status: 'CONCLUIDA', prazo: undefined })).toBe(true);
  });

  it('salvar pelo lápis leva os outros campos (status e número em gravações separadas)', () => {
    expect(soMudaStatus({ taskId: 't1', status: 'CONCLUIDA', prazo: null })).toBe(false);
    expect(soMudaStatus({ taskId: 't1', status: 'PENDENTE', observacao: 'x' })).toBe(false);
  });
});
