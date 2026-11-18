import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({ supabase: null, isSupabaseConfigured: false }));

import { aplicarRelatorio, compararItem, type OrgaoDoRelatorioImportado } from '../relatorioAtaContratosService';
import type { UnidadeItemRecord } from '../../types';

const unidade = (codigo: string, qtd: number, atualizacao: string, extra: Partial<UnidadeItemRecord> = {}): UnidadeItemRecord => ({
  numeroAta: '00027/2026', unidadeGerenciadora: '200331', numeroItem: '00015', codigoPdm: '14534', descricaoItem: 'MICROFONE',
  fornecedor: '26786305000164 - M&B', quantidadeRegistrada: qtd, saldoAdesoes: 910, saldoRemanejamentoEmpenho: qtd,
  qtdLimiteAdesao: 910, qtdLimiteInformadoCompra: 910, aceitaAdesao: true, dataHoraInclusao: '2026-04-29T16:20:00',
  dataHoraAtualizacao: atualizacao, dataHoraExclusao: null, codigoUnidade: codigo, nomeUnidade: `ORGAO ${codigo}`,
  tipoUnidade: codigo === '200331' ? 'GERENCIADORA' : 'PARTICIPANTE', ...extra
});

const rel = (uasg: string, quantidade: number, saldo: number, geradoEm = '2026-11-17T11:35:58'): OrgaoDoRelatorioImportado => ({
  uasg, nomeOrgao: uasg === '452386' ? 'SDS/PE' : null, tipoUnidade: 'Participante', quantidade, saldo, geradoEm,
  importadoEm: '2026-11-17T15:00:00Z', importadoPorNome: 'Gestor'
});

describe('aplicarRelatorio', () => {
  // Ata 00027/2026 item 15: a consulta 3 parou em SENASP 1 e PM-ES 46, sem a SDS/PE; o relatório tem 15, 32 e 6.
  const compras = [unidade('200331', 1, '2026-08-04T17:35:52'), unidade('925794', 46, '2026-04-29T16:20:14'), unidade('160148', 1, '2026-04-29T16:20:09')];
  const relatorio = [rel('200331', 15, 14), rel('925794', 32, 32), rel('452386', 6, 6), rel('160148', 1, 1)];

  it('troca o órgão em que o relatório é mais novo e inclui o que só está no relatório', () => {
    const r = aplicarRelatorio(compras, relatorio);
    const por = new Map(r.unidades.map((u) => [u.codigoUnidade, u]));
    expect(por.get('200331')).toMatchObject({ quantidadeRegistrada: 15, saldoRemanejamentoEmpenho: 14, dataHoraAtualizacao: '2026-11-17T11:35:58', doRelatorio: true });
    expect(por.get('925794')?.quantidadeRegistrada).toBe(32);
    expect(por.get('452386')).toMatchObject({ quantidadeRegistrada: 6, nomeUnidade: 'SDS/PE', tipoUnidade: 'PARTICIPANTE', doRelatorio: true });
    expect(por.get('160148')?.quantidadeRegistrada).toBe(1);
    expect(r.trocados).toBe(3);
    expect(r.unidades.reduce((s, u) => s + u.quantidadeRegistrada, 0)).toBe(54);
  });

  it('o Compras.gov.br volta a valer quando publica atualização mais nova que o relatório', () => {
    const depois = [unidade('200331', 20, '2026-11-20T08:00:00'), ...compras.slice(1)];
    const r = aplicarRelatorio(depois, relatorio);
    expect(r.unidades.find((u) => u.codigoUnidade === '200331')).toMatchObject({ quantidadeRegistrada: 20 });
    expect(r.unidades.find((u) => u.codigoUnidade === '200331')?.doRelatorio).toBeUndefined();
  });

  it('órgão com dois fornecedores recebe o total do relatório numa linha só', () => {
    const dois = [unidade('925794', 30, '2026-04-29T16:20:14', { fornecedor: 'A' }), unidade('925794', 16, '2026-04-29T16:20:14', { fornecedor: 'B' })];
    const r = aplicarRelatorio(dois, [rel('925794', 32, 32)]);
    expect(r.unidades).toHaveLength(1);
    expect(r.unidades[0].quantidadeRegistrada).toBe(32);
  });

  it('sem relatório, devolve a lista como está', () => {
    expect(aplicarRelatorio(compras, []).unidades).toBe(compras);
  });
});

describe('compararItem', () => {
  it('mostra o que muda, o órgão novo e o que o relatório não traz', () => {
    const agora = new Map([['200331', { quantidade: 1, nome: 'SENASP' }], ['925794', { quantidade: 46, nome: 'PM-ES' }], ['160148', { quantidade: 1, nome: 'CMP' }], ['999999', { quantidade: 3, nome: 'OUTRO' }]]);
    const doRelatorio = [
      { uasg: '200331', nome: 'SENASP', quantidade: 15, saldo: 14 },
      { uasg: '925794', nome: 'POLÍCIA MILITAR', quantidade: 32, saldo: 32 },
      { uasg: '452386', nome: 'SDS/PE', quantidade: 6, saldo: 6 },
      { uasg: '160148', nome: 'B ADM', quantidade: 1, saldo: 1 }
    ];
    const l = compararItem(doRelatorio, agora, (u) => (u === '925794' ? 'POLÍCIA MILITAR DO ESPÍRITO SANTO' : null));
    expect(l.filter((x) => x.muda).map((x) => x.uasg)).toEqual(['200331', '925794', '452386']);
    expect(l.find((x) => x.uasg === '925794')?.nome).toBe('POLÍCIA MILITAR DO ESPÍRITO SANTO');
    expect(l.find((x) => x.uasg === '452386')).toMatchObject({ agora: null, relatorio: 6, nome: 'SDS/PE' });
    expect(l.find((x) => x.uasg === '999999')).toMatchObject({ agora: 3, relatorio: null, muda: false });
  });
});
