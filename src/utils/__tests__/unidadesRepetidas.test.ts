import { describe, it, expect } from 'vitest';
import { chaveDaUnidade, juntarUnidadesRepetidas } from '../unidadesRepetidas';

const orgao = (codigoUnidade: string, quantidadeRegistrada: number, extra: Record<string, unknown> = {}) => ({
  numeroAta: '00071/2024', numeroItem: '00027', codigoUnidade, nomeUnidade: `Órgão ${codigoUnidade}`, tipoUnidade: 'PARTICIPANTE',
  fornecedor: '11222333000144 - FORNECEDOR', codigoPdm: '13722', quantidadeRegistrada, dataHoraAtualizacao: '2025-11-05T14:46:19',
  dataHoraExclusao: null, ...extra
});

describe('juntarUnidadesRepetidas', () => {
  it('tira a cópia que só muda o codigoPdm (fonte repetindo cada órgão, desde 09/10/2026)', () => {
    const linhas = [orgao('200331', 30), orgao('450955', 2), orgao('200331', 30, { codigoPdm: '485337' }), orgao('450955', 2, { codigoPdm: '485337' })];
    const r = juntarUnidadesRepetidas(linhas);
    expect(r.unidades).toEqual([linhas[0], linhas[1]]);
    expect(r.repetidas).toBe(2);
    expect(r.divergentes).toEqual([]);
  });

  it('mantém as linhas de fornecedores diferentes do mesmo órgão (elas se somam)', () => {
    const linhas = [orgao('200331', 0, { fornecedor: 'A' }), orgao('200331', 539, { fornecedor: 'B' })];
    expect(juntarUnidadesRepetidas(linhas)).toEqual({ unidades: linhas, repetidas: 0, divergentes: [] });
  });

  it('acusa cópias com quantidade ou datas diferentes', () => {
    const r = juntarUnidadesRepetidas([orgao('200331', 30), orgao('200331', 31), orgao('450955', 2), orgao('450955', 2, { dataHoraExclusao: '2026-01-01T00:00:00' })]);
    expect(r.divergentes).toEqual([chaveDaUnidade(orgao('200331', 30)), chaveDaUnidade(orgao('450955', 2))]);
  });

  it('a chave ignora zeros e máscara do código e espaços no fornecedor', () => {
    expect(chaveDaUnidade({ codigoUnidade: '200.331', numeroItem: '27', numeroAta: '00071/2024', fornecedor: ' X ' }))
      .toBe('200331|27|00071/2024|X');
  });
});
