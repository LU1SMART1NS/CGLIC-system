import { describe, it, expect } from 'vitest';
import { contratosParaLer, leituraParaGravar, leiturasConsiderandoDetalhes, temDetalhesACopiar } from '../itensContratosSyncService';
import type { ContractDashboardRecord } from '../../types';

const AGORA = Date.parse('2026-10-06T15:00:00Z');
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const iso = (ms: number) => new Date(ms).toISOString();
const contrato = (id: string, dataVigenciaFim?: string) => ({ id, dataVigenciaFim }) as ContractDashboardRecord;

describe('contratosParaLer', () => {
  const vigente = contrato('200331-00001-2026', '2027-06-30');
  const encerrado = contrato('200331-00002-2020', '2021-01-31');
  const nunca = contrato('200330-00003-2025', '2026-12-31');

  it('lê o contrato nunca lido antes de todos', () => {
    const leituras = new Map([[vigente.id.toUpperCase(), iso(AGORA - 2 * DIA)]]);
    expect(contratosParaLer([vigente, nunca], leituras, { agora: AGORA }).map((c) => c.id)).toEqual([nunca.id, vigente.id]);
  });

  it('vigente: relê só depois de 24 horas', () => {
    expect(contratosParaLer([vigente], new Map([[vigente.id, iso(AGORA - 23 * HORA)]]), { agora: AGORA })).toEqual([]);
    expect(contratosParaLer([vigente], new Map([[vigente.id, iso(AGORA - 25 * HORA)]]), { agora: AGORA })).toEqual([vigente]);
  });

  it('encerrado: relê só depois de 30 dias', () => {
    expect(contratosParaLer([encerrado], new Map([[encerrado.id, iso(AGORA - 29 * DIA)]]), { agora: AGORA })).toEqual([]);
    expect(contratosParaLer([encerrado], new Map([[encerrado.id, iso(AGORA - 31 * DIA)]]), { agora: AGORA })).toEqual([encerrado]);
  });

  it('sem data de fim conta como vigente', () => {
    const semFim = contrato('200331-00004-2026');
    expect(contratosParaLer([semFim], new Map([[semFim.id, iso(AGORA - 25 * HORA)]]), { agora: AGORA })).toEqual([semFim]);
  });

  it('forçar relê todos, mesmo os lidos agora', () => {
    const leituras = new Map([[vigente.id, iso(AGORA)], [encerrado.id, iso(AGORA)]]);
    expect(contratosParaLer([vigente, encerrado], leituras, { agora: AGORA, forcar: true })).toHaveLength(2);
  });

  it('ignora repetidos (mesma chave em maiúsculas/minúsculas) e sem chave', () => {
    const a = contrato('200331-abc-2026', '2027-01-01');
    const b = contrato('200331-ABC-2026', '2027-01-01');
    expect(contratosParaLer([a, b, contrato('')], new Map(), { agora: AGORA })).toEqual([a]);
  });
});

describe('leituraParaGravar', () => {
  it('converte para o formato da função do banco', () => {
    expect(
      leituraParaGravar('200331-00173-2026', {
        fonte: 'CONTRATOS_GOV',
        itens: [{ numeroItem: 4, descricao: 'CARRETA REBOQUE', tipo: 'Material', quantidade: 27, valorUnitario: 21357.95, valorTotal: 576664.65 }]
      })
    ).toEqual({
      contract_key: '200331-00173-2026',
      fonte: 'CONTRATOS_GOV',
      itens: [{ numero_item: 4, descricao: 'CARRETA REBOQUE', tipo: 'Material', quantidade: 27, valor_unitario: 21357.95, valor_total: 576664.65 }]
    });
  });

  it('leitura vazia segue sem fonte e sem itens', () => {
    expect(leituraParaGravar('x', { fonte: null, itens: [] })).toEqual({ contract_key: 'x', fonte: null, itens: [] });
  });
});

describe('leiturasConsiderandoDetalhes', () => {
  const comId = (id: string, fim: string) => ({ id, dataVigenciaFim: fim, contratoId: 999732, fonteDados: 'Contratos.gov.br' }) as ContractDashboardRecord;
  const vigente = comId('200331-00010-2026', '2027-06-30');
  const encerrado = comId('200331-00002-2020', '2021-01-31');
  const semId = { ...vigente, id: '200331-00011-2026', contratoId: undefined } as ContractDashboardRecord;
  const lido = iso(AGORA - HORA);

  it('vigente do Contratos.gov.br sem cópia dos detalhes entra como nunca lido', () => {
    const itens = new Map([[vigente.id, lido], [encerrado.id, lido], [semId.id, lido]]);
    const r = leiturasConsiderandoDetalhes([vigente, encerrado, semId], itens, new Map(), AGORA);
    expect(r.has(vigente.id)).toBe(false);
    expect(r.get(encerrado.id)).toBe(lido);
    expect(r.get(semId.id)).toBe(lido);
  });

  it('com cópia dos detalhes, vale a leitura dos itens', () => {
    const r = leiturasConsiderandoDetalhes([vigente], new Map([[vigente.id, lido]]), new Map([[vigente.id, lido]]), AGORA);
    expect(r.get(vigente.id)).toBe(lido);
  });

  it('temDetalhesACopiar: só vigente e com id do Contratos.gov.br', () => {
    expect(temDetalhesACopiar(vigente, AGORA)).toBe(true);
    expect(temDetalhesACopiar(encerrado, AGORA)).toBe(false);
    expect(temDetalhesACopiar(semId, AGORA)).toBe(false);
  });
});
