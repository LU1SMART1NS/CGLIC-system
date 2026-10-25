/**
 * Leituras de um instrumento só (passo 3 da auditoria das telas, 6c e 6d): os filtros que vão ao banco e o formato
 * da resposta, igual ao da leitura da lista.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Chamada = { tabela: string; metodo: string; args: unknown[] };
const { banco } = vi.hoisted(() => ({
  banco: {
    chamadas: [] as Chamada[],
    /** Resposta por tabela (uma por pedido, em ordem; a última se repete). */
    respostas: {} as Record<string, Array<{ data: unknown; error: unknown }>>
  }
}));

vi.mock('../supabaseClient', () => {
  const from = (tabela: string) => {
    const consulta: any = {};
    for (const metodo of ['select', 'eq', 'neq', 'in', 'or', 'order', 'range', 'like', 'maybeSingle']) {
      consulta[metodo] = (...args: unknown[]) => {
        banco.chamadas.push({ tabela, metodo, args });
        return consulta;
      };
    }
    consulta.then = (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) => {
      const fila = banco.respostas[tabela] ?? [{ data: [], error: null }];
      const resposta = fila.length > 1 ? fila.shift()! : fila[0];
      return Promise.resolve(resposta).then(ok, erro);
    };
    return consulta;
  };
  return { supabase: { from }, isSupabaseConfigured: true, ehServidor: false };
});

import { fetchContratoParaTela, fetchContratosParaTelaPorChaves } from '../contratosOficiaisService';
import { fetchArpsWithItemsFromDb, fetchAtaWithItemsFromDb } from '../dbCacheService';
import { fetchFatiasGti } from '../gruposGtiService';
import { fetchEmpenhosDoContratoParaPagamento } from '../cicloPagamentoApoioService';

const filtros = (tabela: string, metodo: string) => banco.chamadas.filter((c) => c.tabela === tabela && c.metodo === metodo).map((c) => c.args);

beforeEach(() => {
  banco.chamadas = [];
  banco.respostas = {};
});

describe('fetchContratoParaTela', () => {
  it('lê só o contrato da chave (ou do número do PNCP), na UASG, com o registro da tela', async () => {
    banco.respostas.contratos_oficiais = [{ data: [{ registro: { id: '200331-00015-2026', dataVigenciaFim: '2099-01-01' } }], error: null }];
    const r = await fetchContratoParaTela(' 200331 ', '200331-00015-2026');
    expect(r.map((c) => c.id)).toEqual(['200331-00015-2026']);
    expect(r[0].statusVigencia).toBeDefined();
    expect(filtros('contratos_oficiais', 'select')).toEqual([['registro:registro_tela']]);
    expect(filtros('contratos_oficiais', 'eq')).toEqual([['uasg', '200331']]);
    expect(filtros('contratos_oficiais', 'or')).toEqual([['contract_key.eq."200331-00015-2026",numero_controle_pncp.eq."200331-00015-2026"']]);
    expect(filtros('contratos_oficiais', 'range')).toEqual([]);
  });

  it('falha de leitura vira erro', async () => {
    banco.respostas.contratos_oficiais = [{ data: null, error: { message: 'timeout' } }];
    await expect(fetchContratoParaTela('200331', 'X')).rejects.toThrow('timeout');
  });
});

describe('fetchContratosParaTelaPorChaves', () => {
  it('em lotes de 100 chaves, pela UASG', async () => {
    const chaves = Array.from({ length: 150 }, (_, i) => `200331-${String(i).padStart(5, '0')}-2025`);
    await fetchContratosParaTelaPorChaves('200331', chaves);
    const lotes = filtros('contratos_oficiais', 'in');
    expect(lotes.map(([coluna, valores]) => [coluna, (valores as string[]).length])).toEqual([
      ['contract_key', 100],
      ['contract_key', 50]
    ]);
    expect(filtros('contratos_oficiais', 'eq')).toEqual([
      ['uasg', '200331'],
      ['uasg', '200331']
    ]);
  });

  it('sem chaves, não lê nada', async () => {
    expect(await fetchContratosParaTelaPorChaves('200331', [])).toEqual([]);
    expect(banco.chamadas).toEqual([]);
  });
});

describe('fetchAtaWithItemsFromDb', () => {
  const linha = {
    id: 7,
    numero_ata: '00043/2026',
    codigo_uasg: '200331',
    uasg_carteira: '200331',
    nome_uasg: 'SENASP',
    numero_compra: '00090',
    ano_compra: '2025',
    valor_total: '1500.5',
    status_ata: 'Vigente',
    data_vigencia_inicial: '2026-01-10',
    data_vigencia_final: '2027-01-10',
    ultimo_sync_em: '2026-10-17T10:00:00Z',
    itens_ata: [{ numero_item: '00001', descricao_item: 'Capacete', quantidade_homologada: '10', valor_unitario: '150.05', fornecedor_cnpj_cpf: '1', ultimo_sync_em: '2026-10-17T10:00:00Z' }]
  };

  it('pelo número e pela UASG gerenciadora, sem páginas', async () => {
    banco.respostas.atas_registro_preco = [{ data: [linha], error: null }];
    await fetchAtaWithItemsFromDb('00043/2026', '200331');
    expect(filtros('atas_registro_preco', 'select')).toEqual([['*, itens_ata(*)']]);
    expect(filtros('atas_registro_preco', 'eq')).toEqual([
      ['numero_ata', '00043/2026'],
      ['codigo_uasg', '200331']
    ]);
    expect(filtros('atas_registro_preco', 'range')).toEqual([]);
  });

  it('a ata e os itens saem iguais aos da leitura da UASG inteira', async () => {
    banco.respostas.atas_registro_preco = [{ data: [linha], error: null }];
    const uma = await fetchAtaWithItemsFromDb('00043/2026', '200331');
    banco.respostas.atas_registro_preco = [{ data: [linha], error: null }];
    const todas = await fetchArpsWithItemsFromDb('200331');
    const semHora = (x: typeof uma) => ({
      ...x,
      arps: x.arps.map(({ dataHoraAtualizacao: _a, dataHoraInclusao: _b, ...resto }) => resto),
      syncInfo: { ...x.syncInfo, ultimoSyncEm: undefined }
    });
    expect(semHora(uma)).toEqual(semHora(todas));
    expect(uma.itemsByAta['00043/2026-200331']).toHaveLength(1);
  });

  it('ata ausente: lista vazia; falha de leitura: erro', async () => {
    banco.respostas.atas_registro_preco = [{ data: [], error: null }];
    expect((await fetchAtaWithItemsFromDb('00099/2026', '200331')).arps).toEqual([]);
    banco.respostas.atas_registro_preco = [{ data: null, error: { message: 'timeout' } }];
    await expect(fetchAtaWithItemsFromDb('00099/2026', '200331')).rejects.toThrow('timeout');
  });
});

describe('fetchFatiasGti', () => {
  it('com filtro: só a ata (número e UASG gerenciadora); sem filtro: todas', async () => {
    await fetchFatiasGti({ numeroAta: '00043/2026', uasg: '200331' });
    expect(filtros('v_ata_gti_fatias', 'eq')).toEqual([
      ['numero_ata', '00043/2026'],
      ['uasg_gerenciadora', '200331']
    ]);
    banco.chamadas = [];
    await fetchFatiasGti();
    expect(filtros('v_ata_gti_fatias', 'eq')).toEqual([]);
  });
});

describe('fetchEmpenhosDoContratoParaPagamento', () => {
  it('com as notas já lidas pela tela, não relê contrato_empenhos; sem elas, lê', async () => {
    banco.respostas.empenhos = [{ data: [{ id: 'e1', canonical_key: 'NE1', numero_oficial: '2026NE000001', valor_empenhado: 100, identificador_fonte: null }], error: null }];
    const comIds = await fetchEmpenhosDoContratoParaPagamento('200331-00015-2026', { idsDoContrato: ['e1'] });
    expect(banco.chamadas.some((c) => c.tabela === 'contrato_empenhos')).toBe(false);
    expect(filtros('empenhos', 'in')).toEqual([['id', ['e1']]]);

    banco.chamadas = [];
    banco.respostas.contrato_empenhos = [{ data: [{ empenho_id: 'e1' }], error: null }];
    const semIds = await fetchEmpenhosDoContratoParaPagamento('200331-00015-2026');
    expect(filtros('contrato_empenhos', 'eq')).toEqual([['contract_key', '200331-00015-2026']]);
    expect(semIds).toEqual(comIds);
  });
});
