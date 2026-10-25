/**
 * Passo 3 da auditoria das telas (6b): leituras sem uso na execução dos itens.
 * - `semEmpenhado` (Alocação, gaveta Alocação do Início, número do menu): não lê v_arp_item_contrato_empenhado nem
 *   espera por ela; alocado, quantitativo SENASP e situação da alocação saem iguais.
 * - `apenasUnidadesDeContratos` (Carteira de Contratos): não lê o saldo das duas UASGs; as unidades saem iguais.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const { estado } = vi.hoisted(() => ({
  estado: {
    /** Opções de cada useQuery do hook, pela chave. */
    opcoes: {} as Record<string, { enabled?: boolean }>,
    /** Respostas pela chave (o que estiver no cache, mesmo de consulta desligada). */
    respostas: {} as Record<string, any>,
    saldos: [] as Array<{ uasg: string; enabled: boolean }>
  }
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: vi.fn((opcoes: { queryKey: unknown[]; enabled?: boolean }) => {
    const chave = JSON.stringify(opcoes.queryKey);
    estado.opcoes[chave] = opcoes;
    return estado.respostas[chave] ?? { data: [], isPending: false, isError: false, isFetching: false, refetch: vi.fn() };
  })
}));
vi.mock('../useAta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../useAta')>()),
  useAllAtaItemSaldos: (uasg: string, opts: { enabled?: boolean } = {}) => {
    estado.saldos.push({ uasg, enabled: opts.enabled ?? true });
    return {
      data: uasg === '200331' ? [{ numero_ata: '00010/2024', codigo_uasg: '200331', numero_item: 1, quantidade_base_senasp: 100 }] : [],
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn()
    };
  }
}));

import { useCarteiraItens, CARTEIRA_ALOCACOES_KEY, CARTEIRA_EMPENHOS_KEY, CARTEIRA_VINCULOS_KEY, ROTULOS_CARTEIRA_ITENS } from '../useCarteiraItens';
import type { ArpItemRecord, ArpRecord } from '../../types';

const ok = (data: unknown) => ({ data, isPending: false, isError: false, isFetching: false, refetch: vi.fn() });
const arp = { numeroAtaRegistroPreco: '00010/2024', codigoUnidadeGerenciadora: '200331', dataVigenciaFinal: '2030-01-01' } as unknown as ArpRecord;
const itemsByAta = { '00010/2024-200331': [{ numeroItem: '1', quantidadeHomologadaItem: 100 } as unknown as ArpItemRecord] };

function rodar(params: Parameters<typeof useCarteiraItens>[0]) {
  let r: ReturnType<typeof useCarteiraItens> | undefined;
  const Sonda = () => {
    r = useCarteiraItens(params);
    return null;
  };
  renderToStaticMarkup(<Sonda />);
  return r!;
}

describe('useCarteiraItens — leituras sem uso', () => {
  beforeEach(() => {
    estado.opcoes = {};
    estado.saldos = [];
    estado.respostas = {
      [JSON.stringify(CARTEIRA_ALOCACOES_KEY)]: ok([{ itemKey: '00010/2024-200331-1', unitName: 'DPRF', allocatedQty: 40 }]),
      [JSON.stringify(CARTEIRA_VINCULOS_KEY)]: ok([{ itemKey: '00010/2024-200331-1', contractKey: '200331-00002-2025', quantidadeContratada: 30 }]),
      // O empenhado já no cache (outra tela leu): mesmo assim a tela sem empenhado não o usa.
      [JSON.stringify(CARTEIRA_EMPENHOS_KEY)]: ok([{ itemKey: '00010/2024-200331-1', quantidade: 25 }])
    };
  });

  it('semEmpenhado: a consulta do empenhado fica desligada e sai da faixa "não carregou"', () => {
    const r = rodar({ arps: [arp], itemsByAta, gestorByAta: {}, semEmpenhado: true });
    expect(estado.opcoes[JSON.stringify(CARTEIRA_EMPENHOS_KEY)].enabled).toBe(false);
    expect(r.leituras.map((l) => l.rotulo)).not.toContain(ROTULOS_CARTEIRA_ITENS.empenhos);
    expect(r.leituras.map((l) => l.rotulo)).toContain(ROTULOS_CARTEIRA_ITENS.saldos);
  });

  it('semEmpenhado: não espera o empenhado para sair do "Carregando"', () => {
    estado.respostas[JSON.stringify(CARTEIRA_EMPENHOS_KEY)] = { data: undefined, isPending: true, isError: false, isFetching: false, refetch: vi.fn() };
    expect(rodar({ arps: [arp], itemsByAta, gestorByAta: {}, semEmpenhado: true }).isLoading).toBe(false);
    expect(rodar({ arps: [arp], itemsByAta, gestorByAta: {} }).isLoading).toBe(true);
  });

  it('semEmpenhado: alocado, quantitativo SENASP, contratado e situação da alocação saem iguais aos da carteira completa', () => {
    const completa = rodar({ arps: [arp], itemsByAta, gestorByAta: {} });
    const leve = rodar({ arps: [arp], itemsByAta, gestorByAta: {}, semEmpenhado: true });
    const semEmpenho = (rows: typeof completa.rows) => rows.map(({ empenhado: _e, nivelEmpenho: _n, ...resto }) => resto);
    expect(semEmpenho(leve.rows)).toEqual(semEmpenho(completa.rows));
    expect(leve.rows[0]).toMatchObject({ quantitativoSenasp: 100, alocado: 40, nivelAlocacao: 'PARCIAL', contratada: 30 });
    expect(completa.rows[0].empenhado).toBe(25);
    expect(leve.unidades).toEqual(completa.unidades);
  });

  it('a carteira completa (Itens, Atas) continua lendo o empenhado e o saldo', () => {
    rodar({ arps: [arp], itemsByAta, gestorByAta: {} });
    expect(estado.opcoes[JSON.stringify(CARTEIRA_EMPENHOS_KEY)].enabled).toBe(true);
    expect(estado.saldos).toEqual([
      { uasg: '200330', enabled: true },
      { uasg: '200331', enabled: true }
    ]);
  });

  it('apenasUnidadesDeContratos: não lê o saldo das duas UASGs nem o empenhado; as unidades dos contratos saem iguais', () => {
    const contratos = rodar({ apenasUnidadesDeContratos: true });
    expect(estado.saldos).toEqual([
      { uasg: '200330', enabled: false },
      { uasg: '200331', enabled: false }
    ]);
    expect(estado.opcoes[JSON.stringify(CARTEIRA_EMPENHOS_KEY)].enabled).toBe(false);
    const completa = rodar({ arps: [arp], itemsByAta, gestorByAta: {} });
    expect(contratos.unidadesDoContrato).toEqual(completa.unidadesDoContrato);
    expect([...(contratos.unidadesDoContrato.get('200331-00002-2025') ?? [])]).toHaveLength(1);
    expect(contratos.unidades).toEqual(completa.unidades);
    expect(contratos.saldosComErro).toBe(false);
  });
});
