import { describe, it, expect } from 'vitest';
import { deduplicarItensPorNumero } from '../api';
import { cnpjCpfParaGravar } from '../dbCacheService';
import type { ArpItemRecord } from '../../types';

const item = (numeroItem: string, dataHoraInclusao: string, extra: Partial<ArpItemRecord> = {}) =>
  ({ numeroItem, dataHoraInclusao, descricaoItem: 'X', ...extra }) as ArpItemRecord;

describe('itens da ata antes de gravar', () => {
  it('item publicado duas vezes pela fonte: fica só a publicação mais recente', () => {
    const itens = [
      item('00011', '2024-12-27T17:33:40', { quantidadeHomologadaItem: 1 }),
      item('00012', '2024-12-27T17:33:40'),
      item('00011', '2025-06-03T17:07:04', { quantidadeHomologadaItem: 2 }),
      item('00012', '2025-06-03T17:07:04')
    ];
    const r = deduplicarItensPorNumero(itens);
    expect(r).toHaveLength(2);
    expect(r.find((i) => i.numeroItem === '00011')?.quantidadeHomologadaItem).toBe(2);
  });

  it('itens sem repetição passam como vieram', () => {
    expect(deduplicarItensPorNumero([item('00001', 'a'), item('00002', 'a')])).toHaveLength(2);
  });

  it('CNPJ, CPF e identificador de fornecedor estrangeiro são gravados inteiros (coluna de 255, migration 73)', () => {
    expect(cnpjCpfParaGravar('11031398000140')).toBe('11031398000140');
    expect(cnpjCpfParaGravar('11.031.398/0001-40')).toBe('11.031.398/0001-40');
    const estrangeiro = 'ESTRANGEIRO_HAIX__SCHUHE__PRODUKTIONS_UND_VERTRIEBS_GMBH';
    expect(estrangeiro.length).toBeGreaterThan(20);
    expect(cnpjCpfParaGravar(`  ${estrangeiro} `)).toBe(estrangeiro);
  });

  it('vazio vira nulo e só o que passa do tamanho da coluna é cortado', () => {
    expect(cnpjCpfParaGravar('')).toBeNull();
    expect(cnpjCpfParaGravar('   ')).toBeNull();
    expect(cnpjCpfParaGravar(undefined)).toBeNull();
    expect(cnpjCpfParaGravar('A'.repeat(300))).toHaveLength(255);
  });
});
