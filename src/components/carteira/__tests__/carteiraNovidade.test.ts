import { describe, expect, it } from 'vitest';
import { ataEhNova, contratoEhNovo, ehNovidade } from '../carteiraNovidade';
import { subirPrimeiro } from '../useCarteiraSort';

const hoje = new Date(2026, 9, 15);

describe('etiqueta Nova/Novo', () => {
  it('vale até 45 dias depois da data da fonte, inclusive data futura', () => {
    expect(ehNovidade('2026-10-15', hoje)).toBe(true);
    expect(ehNovidade('2026-08-31', hoje)).toBe(true);
    expect(ehNovidade('2026-08-30', hoje)).toBe(false);
    expect(ehNovidade('2026-11-01', hoje)).toBe(true);
    expect(ehNovidade('', hoje)).toBe(false);
    expect(ehNovidade(undefined, hoje)).toBe(false);
  });

  it('ata usa a assinatura e, sem ela, o início da vigência', () => {
    expect(ataEhNova({ dataAssinatura: '', dataVigenciaInicial: '2026-10-01' }, hoje)).toBe(true);
    expect(ataEhNova({ dataAssinatura: '2025-01-10', dataVigenciaInicial: '2026-10-01' }, hoje)).toBe(false);
  });

  it('contrato usa a assinatura e, sem ela, o início da vigência', () => {
    expect(contratoEhNovo({ dataAssinatura: undefined, dataVigenciaInicio: '2026-10-10' }, hoje)).toBe(true);
    expect(contratoEhNovo({ dataAssinatura: '2026-10-10T00:00:00', dataVigenciaInicio: '2024-01-01' }, hoje)).toBe(true);
    expect(contratoEhNovo({ dataAssinatura: undefined, dataVigenciaInicio: undefined }, hoje)).toBe(false);
  });

  it('as novas sobem para o topo sem mudar a ordem dentro de cada grupo', () => {
    const linhas = [1, 2, 3, 4, 5];
    expect(subirPrimeiro(linhas, (n) => n % 2 === 0)).toEqual([2, 4, 1, 3, 5]);
    expect(subirPrimeiro(linhas, () => false)).toBe(linhas);
  });
});
