import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ContractDashboardRecord } from '../../types';

// Supabase simulado: tabela contratos_oficiais em memória (com paginação) e RPCs observáveis.
const banco = vi.hoisted(() => ({
  linhas: [] as Array<{ uasg: string; contract_key: string; registro: Record<string, unknown> }>,
  erroLeitura: null as null | { message: string },
  /** Só esta página (1, 2, ...) falha; as outras respondem. */
  erroNaPagina: null as null | number,
  paginasLidas: 0,
  faixas: [] as Array<[number, number]>,
  ordens: [] as Array<{ coluna: string; ascending?: boolean }>,
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
      order: (coluna: string, opcoes?: { ascending?: boolean }) => {
        banco.ordens.push({ coluna, ascending: opcoes?.ascending });
        return consulta;
      },
      range: async (de: number, ate: number) => {
        banco.paginasLidas++;
        banco.faixas.push([de, ate]);
        if (banco.erroLeitura) return { data: null, error: banco.erroLeitura };
        if (banco.erroNaPagina === banco.paginasLidas) return { data: null, error: { message: 'canceling statement due to statement timeout' } };
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
  buscarContratosNasFontes: vi.fn()
}));

import * as contractService from '../contractService';
import {
  fetchContratosOficiaisDoBanco,
  fetchContratosParaTela,
  PAGINA_LEITURA,
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
  banco.erroNaPagina = null;
  banco.paginasLidas = 0;
  banco.faixas = [];
  banco.ordens = [];
});

describe('leitura dos contratos pelo banco', () => {
  it('lê em páginas de 250 (a de 1000 estourou o tempo limite de 8 s) e devolve todos', async () => {
    gravarNoBanco(1081);
    const lista = await fetchContratosOficiaisDoBanco(UASG);
    expect(PAGINA_LEITURA).toBe(250);
    expect(lista).toHaveLength(1081);
    expect(new Set(lista.map((c) => c.id)).size).toBe(1081);
    expect(banco.faixas).toEqual([
      [0, 249],
      [250, 499],
      [500, 749],
      [750, 999],
      [1000, 1249]
    ]);
  });

  it('toda página pede a mesma ordem fixa (contract_key crescente, único na UASG)', async () => {
    gravarNoBanco(600);
    await fetchContratosOficiaisDoBanco(UASG);
    expect(banco.ordens).toHaveLength(3);
    expect(banco.ordens.every((o) => o.coluna === 'contract_key' && o.ascending === true)).toBe(true);
  });

  it('falha em qualquer página vira erro: nunca devolve a carteira pela metade', async () => {
    for (const pagina of [1, 3, 5]) {
      gravarNoBanco(1081);
      banco.paginasLidas = 0;
      banco.erroNaPagina = pagina;
      await expect(fetchContratosOficiaisDoBanco(UASG)).rejects.toThrow(
        `Não foi possível ler os contratos da UASG ${UASG} no banco (página ${pagina}): canceling statement due to statement timeout`
      );
      // Parou na página que falhou.
      expect(banco.paginasLidas).toBe(pagina);
    }
  });

  it('recalcula o status de vigência pela data de hoje (não é gravado)', () => {
    expect(registroParaContrato({ id: 'a', dataVigenciaFim: '2001-01-01' }).statusVigencia).toBe('Expirado');
    expect(registroParaContrato({ id: 'b', dataVigenciaFim: '2099-01-01' }).statusVigencia).toBe('Vigente');
    expect(registroParaContrato({ id: 'c' }).statusVigencia).toBe('Não Informado');
  });
});

describe('as telas só leem o banco (a sincronização com as fontes oficiais é do servidor)', () => {
  const fetchDoNavegador = vi.fn();
  beforeEach(() => {
    fetchDoNavegador.mockReset();
    vi.stubGlobal('fetch', fetchDoNavegador);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const naoConsultouAsFontes = () => {
    expect(contractService.buscarContratosNasFontes).not.toHaveBeenCalled();
    expect(fetchDoNavegador).not.toHaveBeenCalled();
  };

  it('com a carteira no banco, devolve a lista do banco', async () => {
    gravarNoBanco(3);
    const lista = await fetchContratosParaTela(` ${UASG} `);
    expect(lista).toHaveLength(3);
    naoConsultouAsFontes();
  });

  it('falha do banco vira erro, sem chamar as fontes oficiais no navegador', async () => {
    gravarNoBanco(3);
    banco.erroLeitura = { message: 'canceling statement due to statement timeout' };
    await expect(fetchContratosParaTela(UASG)).rejects.toThrow('canceling statement due to statement timeout');
    naoConsultouAsFontes();
  });

  it('falha na segunda página também vira erro (sem lista parcial e sem as fontes oficiais)', async () => {
    gravarNoBanco(1081);
    banco.erroNaPagina = 2;
    await expect(fetchContratosParaTela(UASG)).rejects.toThrow('(página 2)');
    naoConsultouAsFontes();
  });

  it('banco ainda sem a carteira (UASG nunca sincronizada): lista vazia, sem as fontes oficiais', async () => {
    expect(await fetchContratosParaTela(UASG)).toEqual([]);
    naoConsultouAsFontes();
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
