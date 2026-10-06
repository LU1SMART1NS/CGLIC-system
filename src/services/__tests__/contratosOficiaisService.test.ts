import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContractDashboardRecord } from '../../types';

// Supabase simulado: tabela contratos_oficiais em memória (com paginação) e RPCs observáveis.
const banco = vi.hoisted(() => ({
  linhas: [] as Array<{ uasg: string; contract_key: string; registro: Record<string, unknown> }>,
  erroLeitura: null as null | { message: string },
  paginasLidas: 0,
  rpc: null as unknown as ReturnType<typeof vi.fn<(...args: any[]) => Promise<any>>>
}));

vi.mock('../supabaseClient', () => {
  banco.rpc = vi.fn<(...args: any[]) => Promise<any>>();
  const from = (tabela: string) => {
    const filtros: Record<string, string> = {};
    const consulta: any = {
      select: () => consulta,
      eq: (coluna: string, valor: string) => {
        filtros[coluna] = valor;
        return consulta;
      },
      order: () => consulta,
      range: async (de: number, ate: number) => {
        banco.paginasLidas++;
        if (banco.erroLeitura) return { data: null, error: banco.erroLeitura };
        const todas = banco.linhas
          .filter((l) => tabela === 'contratos_oficiais' && l.uasg === filtros.uasg)
          .sort((a, b) => a.contract_key.localeCompare(b.contract_key));
        return { data: todas.slice(de, ate + 1).map((l) => ({ registro: l.registro })), error: null };
      }
    };
    return consulta;
  };
  return {
    isSupabaseConfigured: true,
    supabase: { from, rpc: (...args: unknown[]) => banco.rpc(...args) }
  };
});

vi.mock('../contractService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../contractService')>()),
  buscarContratosNasFontes: vi.fn(),
  fetchContractsForDashboard: vi.fn()
}));

import * as contractService from '../contractService';
import {
  fetchContratosOficiaisDoBanco,
  fetchContratosParaTela,
  sincronizarContratos,
  uasgsSincronizandoAgora,
  registroParaContrato
} from '../contratosOficiaisService';

const UASG = '200331';

function contrato(n: number, extra: Partial<ContractDashboardRecord> = {}): ContractDashboardRecord {
  return {
    id: `${UASG}-${String(n).padStart(5, '0')}/2025`,
    numero: `${String(n).padStart(5, '0')}/2025`,
    ano: '2025',
    numeroFormatado: `${n}/2025`,
    uasg: UASG,
    dataVigenciaFim: '2099-12-31',
    statusVigencia: 'Vigente',
    fonteDados: 'Contratos.gov.br',
    ...extra
  };
}

function gravarNoBanco(qtd: number) {
  banco.linhas = Array.from({ length: qtd }, (_, i) => {
    const { statusVigencia: _s, ...registro } = contrato(i + 1);
    return { uasg: UASG, contract_key: registro.id, registro };
  });
}

/** RPCs: reserva conforme `reservou`; gravação devolve o tamanho do lote; conclusão devolve true. */
function rpcsPadrao(opts: { reservou?: boolean; erroGravacao?: string } = {}) {
  banco.rpc.mockImplementation(async (nome: string, args: any) => {
    if (nome === 'reservar_sincronizacao') return { data: opts.reservou ?? true, error: null };
    if (nome === 'gravar_contratos_oficiais') {
      if (opts.erroGravacao) return { data: null, error: { message: opts.erroGravacao } };
      return { data: args.p_registros.length, error: null };
    }
    if (nome === 'concluir_sincronizacao') return { data: true, error: null };
    return { data: null, error: { message: `rpc inesperada ${nome}` } };
  });
}

const chamadas = (nome: string) => banco.rpc.mock.calls.filter(([n]) => n === nome).map(([, args]) => args);

beforeEach(() => {
  vi.clearAllMocks();
  banco.linhas = [];
  banco.erroLeitura = null;
  banco.paginasLidas = 0;
});

describe('leitura dos contratos pelo banco', () => {
  it('lê em páginas de 1000 (o Supabase corta o resto sem avisar) e devolve todos', async () => {
    gravarNoBanco(2300);
    const lista = await fetchContratosOficiaisDoBanco(UASG);
    expect(lista).toHaveLength(2300);
    expect(banco.paginasLidas).toBe(3);
  });

  it('recalcula o status de vigência pela data de hoje (não é gravado)', () => {
    expect(registroParaContrato({ id: 'a', dataVigenciaFim: '2001-01-01' }).statusVigencia).toBe('Expirado');
    expect(registroParaContrato({ id: 'b', dataVigenciaFim: '2099-01-01' }).statusVigencia).toBe('Vigente');
    expect(registroParaContrato({ id: 'c' }).statusVigencia).toBe('Não Informado');
  });

  it('com a carteira no banco, as telas não consultam as APIs do governo', async () => {
    gravarNoBanco(3);
    const lista = await fetchContratosParaTela(` ${UASG} `);
    expect(lista).toHaveLength(3);
    expect(contractService.fetchContractsForDashboard).not.toHaveBeenCalled();
  });

  it('banco ainda vazio (antes da primeira sincronização): consulta as fontes oficiais', async () => {
    vi.mocked(contractService.fetchContractsForDashboard).mockResolvedValueOnce([contrato(9)]);
    const lista = await fetchContratosParaTela(UASG);
    expect(contractService.fetchContractsForDashboard).toHaveBeenCalledWith(UASG, false);
    expect(lista.map((c) => c.id)).toEqual([contrato(9).id]);
  });

  it('banco fora do ar: consulta as fontes oficiais em vez de mostrar a carteira vazia', async () => {
    banco.erroLeitura = { message: 'timeout' };
    vi.mocked(contractService.fetchContractsForDashboard).mockResolvedValueOnce([contrato(1)]);
    const lista = await fetchContratosParaTela(UASG);
    expect(lista).toHaveLength(1);
    expect(contractService.fetchContractsForDashboard).toHaveBeenCalledTimes(1);
  });
});

describe('sincronização com as fontes oficiais', () => {
  it('sem a reserva (outro navegador sincronizando ou dados na validade), não consulta as fontes', async () => {
    rpcsPadrao({ reservou: false });
    const r = await sincronizarContratos(UASG);
    expect(r.status).toBe('NAO_RESERVADO');
    expect(contractService.buscarContratosNasFontes).not.toHaveBeenCalled();
    expect(chamadas('concluir_sincronizacao')).toHaveLength(0);
  });

  it('passa o pedido de forçar para a reserva (o banco só aceita do coordenador)', async () => {
    rpcsPadrao({ reservou: false });
    await sincronizarContratos(UASG, { forcar: true });
    expect(chamadas('reservar_sincronizacao')[0]).toMatchObject({ p_recurso: 'contratos', p_uasg: UASG, p_forcar: true });
  });

  it('grava em lotes de 100, sem o status de vigência, partindo do que já está no banco', async () => {
    rpcsPadrao();
    gravarNoBanco(2);
    const fontes = Array.from({ length: 250 }, (_, i) => contrato(i + 1));
    vi.mocked(contractService.buscarContratosNasFontes).mockResolvedValueOnce({ contracts: fontes, fontesComFalha: [] });

    const r = await sincronizarContratos(UASG);

    expect(r).toEqual({ status: 'SUCESSO', total: 250, fontesComFalha: [] });
    const base = vi.mocked(contractService.buscarContratosNasFontes).mock.calls[0][1] ?? [];
    expect(base.map((c) => c.id)).toEqual([contrato(2).id, contrato(1).id]);
    const lotes = chamadas('gravar_contratos_oficiais');
    expect(lotes.map((l) => l.p_registros.length)).toEqual([100, 100, 50]);
    expect(lotes[0].p_registros[0]).not.toHaveProperty('statusVigencia');
    expect(chamadas('concluir_sincronizacao')[0]).toMatchObject({ p_status: 'SUCESSO', p_total: 250, p_fontes_com_falha: [] });
    expect(uasgsSincronizandoAgora()).toEqual([]);
  });

  it('fonte fora do ar: grava o que veio e registra PARCIAL com a fonte que falhou', async () => {
    rpcsPadrao();
    vi.mocked(contractService.buscarContratosNasFontes).mockResolvedValueOnce({
      contracts: [contrato(1)],
      fontesComFalha: ['Contratos.gov.br']
    });
    const r = await sincronizarContratos(UASG);
    expect(r).toEqual({ status: 'PARCIAL', total: 1, fontesComFalha: ['Contratos.gov.br'] });
    expect(chamadas('concluir_sincronizacao')[0]).toMatchObject({ p_status: 'PARCIAL', p_fontes_com_falha: ['Contratos.gov.br'] });
  });

  it('erro na gravação: registra ERRO e libera a trava mesmo assim', async () => {
    rpcsPadrao({ erroGravacao: 'SYNC_NOT_RESERVED' });
    vi.mocked(contractService.buscarContratosNasFontes).mockResolvedValueOnce({ contracts: [contrato(1)], fontesComFalha: [] });
    const r = await sincronizarContratos(UASG);
    expect(r).toEqual({ status: 'ERRO', erro: 'SYNC_NOT_RESERVED' });
    expect(chamadas('concluir_sincronizacao')[0]).toMatchObject({ p_status: 'ERRO', p_mensagem: 'SYNC_NOT_RESERVED' });
    expect(uasgsSincronizandoAgora()).toEqual([]);
  });

  it('fontes sem nenhum contrato: não grava e registra ERRO (não apaga nada do banco)', async () => {
    rpcsPadrao();
    vi.mocked(contractService.buscarContratosNasFontes).mockResolvedValueOnce({
      contracts: [],
      fontesComFalha: ['Contratos.gov.br', 'Compras.gov.br']
    });
    const r = await sincronizarContratos(UASG);
    expect(r.status).toBe('ERRO');
    expect(chamadas('gravar_contratos_oficiais')).toHaveLength(0);
    expect(chamadas('concluir_sincronizacao')[0]).toMatchObject({ p_status: 'ERRO' });
  });

  it('falha ao reservar: devolve ERRO sem consultar as fontes', async () => {
    banco.rpc.mockResolvedValueOnce({ data: null, error: { message: 'UNAUTHORIZED' } });
    const r = await sincronizarContratos(UASG);
    expect(r).toEqual({ status: 'ERRO', erro: 'UNAUTHORIZED' });
    expect(contractService.buscarContratosNasFontes).not.toHaveBeenCalled();
  });
});
