import { describe, it, expect } from 'vitest';
import { itensParaLer, unidadeParaGravar, type ItemDaCarteira, type LeituraDaCopia } from '../unidadesItensSyncService';
import type { UnidadeItemRecord } from '../../types';

const AGORA = Date.parse('2026-10-07T15:00:00Z');
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const iso = (ms: number) => new Date(ms).toISOString();
const item = (itemKey: string, vigenciaFinal: string | null): ItemDaCarteira => ({
  itemKey,
  numeroAta: itemKey.split('-')[0],
  uasg: '200331',
  numeroItem: itemKey.split('-')[2],
  vigenciaFinal
});
const lido = (ms: number, temCopia = true): LeituraDaCopia => ({ lidoEm: iso(ms), temCopia });

describe('itensParaLer', () => {
  const vigente = item('00036/2024-200331-00002', '2026-10-22');
  const encerrado = item('00111/2024-200331-00001', '2025-05-14');
  const nunca = item('00041/2025-200331-00001', '2027-01-01');

  it('lê o item nunca lido antes de todos', () => {
    const leituras = new Map([[vigente.itemKey, lido(AGORA - 2 * DIA)]]);
    expect(itensParaLer([vigente, nunca], leituras, { agora: AGORA }).map((i) => i.itemKey)).toEqual([nunca.itemKey, vigente.itemKey]);
  });

  it('ata vigente com cópia: relê só depois de 24 horas', () => {
    expect(itensParaLer([vigente], new Map([[vigente.itemKey, lido(AGORA - 23 * HORA)]]), { agora: AGORA })).toEqual([]);
    expect(itensParaLer([vigente], new Map([[vigente.itemKey, lido(AGORA - 25 * HORA)]]), { agora: AGORA })).toEqual([vigente]);
  });

  it('ata encerrada com cópia: relê só depois de 30 dias', () => {
    expect(itensParaLer([encerrado], new Map([[encerrado.itemKey, lido(AGORA - 29 * DIA)]]), { agora: AGORA })).toEqual([]);
    expect(itensParaLer([encerrado], new Map([[encerrado.itemKey, lido(AGORA - 31 * DIA)]]), { agora: AGORA })).toEqual([encerrado]);
  });

  it('item ainda sem cópia (API vazia): tenta de novo depois de 6 horas, vigente ou não', () => {
    expect(itensParaLer([encerrado], new Map([[encerrado.itemKey, lido(AGORA - 5 * HORA, false)]]), { agora: AGORA })).toEqual([]);
    expect(itensParaLer([encerrado], new Map([[encerrado.itemKey, lido(AGORA - 7 * HORA, false)]]), { agora: AGORA })).toEqual([encerrado]);
  });

  it('sem data de fim conta como vigente', () => {
    const semFim = item('00050/2025-200331-00003', null);
    expect(itensParaLer([semFim], new Map([[semFim.itemKey, lido(AGORA - 25 * HORA)]]), { agora: AGORA })).toEqual([semFim]);
  });

  it('forçar relê todos, mesmo os lidos agora', () => {
    const leituras = new Map([[vigente.itemKey, lido(AGORA)], [encerrado.itemKey, lido(AGORA)]]);
    expect(itensParaLer([vigente, encerrado], leituras, { agora: AGORA, forcar: true })).toHaveLength(2);
  });

  it('ignora repetidos e sem chave', () => {
    expect(itensParaLer([vigente, { ...vigente }, item('', null)], new Map(), { agora: AGORA })).toEqual([vigente]);
  });
});

describe('unidadeParaGravar', () => {
  it('guarda só os campos que a tela usa', () => {
    const daApi = {
      codigoUnidade: '200331',
      nomeUnidade: 'SENASP',
      tipoUnidade: 'GERENCIADORA',
      quantidadeRegistrada: 30,
      saldoRemanejamentoEmpenho: 15,
      aceitaAdesao: false,
      dataHoraExclusao: null,
      campoNovoDaApi: 'x'
    } as unknown as UnidadeItemRecord;
    expect(unidadeParaGravar(daApi)).toEqual({
      codigoUnidade: '200331',
      nomeUnidade: 'SENASP',
      tipoUnidade: 'GERENCIADORA',
      quantidadeRegistrada: 30,
      saldoRemanejamentoEmpenho: 15,
      aceitaAdesao: false,
      dataHoraExclusao: null
    });
  });
});
