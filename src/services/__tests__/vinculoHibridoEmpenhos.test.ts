import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const fromResp: { data: any; error: any } = { data: [], error: null };
const builder: any = {
  select: () => builder,
  eq: () => builder,
  order: () => Promise.resolve(fromResp)
};
vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { rpc: (...a: any[]) => rpc(...a), from: () => builder } }));

import {
  fetchDescartesEmpenhoContrato,
  desvincularEmpenhoManual,
  mensagemDoErroDeVinculo,
  numeroDeEmpenhoValido,
  numeroOficialDoEmpenho,
  payloadDaNovaNota,
  vincularEmpenhoManual
} from '../contratoEmpenhoVinculoService';
import { avisoEmpenhosDescartados, mensagemParaRegistro } from '../contratoEmpenhosSincronizacaoService';
import { orchestrateContractEmpenhoSync } from '../empenhoOrchestrationService';
import * as contratosAdapter from '../../adapters/contratosGovEmpenhoAdapter';
import * as syncService from '../empenhoSyncService';
import { lerValorEmReais } from '../../components/contracts/EmpenhoVinculoModals';

describe('número e dados da NE informada à mão', () => {
  it('aceita o formato ano + NE + número e completa com zeros', () => {
    expect(numeroDeEmpenhoValido('2025NE000123')).toBe(true);
    expect(numeroDeEmpenhoValido(' 2025ne123 ')).toBe(true);
    expect(numeroDeEmpenhoValido('NE123')).toBe(false);
    expect(numeroDeEmpenhoValido('2025NE1234567')).toBe(false);
    expect(numeroOficialDoEmpenho('2025ne123')).toBe('2025NE000123');
  });

  it('monta o payload com a mesma normalização da sincronização', () => {
    expect(payloadDaNovaNota({ numero: '2025ne999', uasgEmitente: '200331', dataEmissao: '2025-11-20', valorEmpenhado: 27200, credorNome: ' EQUILIBRIO ', credorCnpjCpf: '' })).toEqual({
      uasg_emitente: '200331',
      ano_exercicio: 2025,
      numero_oficial: '2025NE000999',
      numero_normalizado: '2025NE999',
      data_emissao: '2025-11-20',
      valor_empenhado: 27200,
      credor_nome: 'EQUILIBRIO',
      credor_cnpj_cpf: undefined
    });
  });

  it('lê valor em reais com ou sem separador de milhar', () => {
    expect(lerValorEmReais('27.200,00')).toBe(27200);
    expect(lerValorEmReais('R$ 1.523.200,5')).toBe(1523200.5);
    expect(lerValorEmReais('27200.50')).toBe(27200.5);
    expect(lerValorEmReais('')).toBeNull();
    expect(lerValorEmReais('27,200,00')).toBeNull();
    expect(lerValorEmReais('-5')).toBeNull();
  });
});

describe('chamadas ao banco', () => {
  beforeEach(() => {
    rpc.mockReset();
    fromResp.data = [];
    fromResp.error = null;
  });

  it('vincular NE já gravada manda só o id; NE nova manda os dados', async () => {
    rpc.mockResolvedValue({ data: { numero_oficial: '2024NE000765', empenho_criado: false }, error: null });
    const r = await vincularEmpenhoManual({ contractKey: '200331-00059-2025', motivo: 'Nota da HPE', empenhoId: 'e1' });
    expect(rpc).toHaveBeenLastCalledWith('vincular_empenho_manual_ao_contrato', { p_contract_key: '200331-00059-2025', p_empenho: { empenho_id: 'e1' }, p_motivo: 'Nota da HPE' });
    expect(r).toEqual({ numeroOficial: '2024NE000765', empenhoCriado: false });

    await vincularEmpenhoManual({ contractKey: '200331-00059-2025', motivo: 'Nota nova', novaNota: { numero: '2025NE1', uasgEmitente: '200331', dataEmissao: '2025-01-02', valorEmpenhado: 10 } });
    expect(rpc.mock.lastCall?.[1].p_empenho).toMatchObject({ numero_oficial: '2025NE000001', uasg_emitente: '200331' });
  });

  it('erro do banco vira frase legível; RPC ausente avisa da migration 85', async () => {
    expect(mensagemDoErroDeVinculo({ message: 'JA_VINCULADO: Este empenho já está vinculado ao contrato 200331-00145-2025.' })).toBe('Este empenho já está vinculado ao contrato 200331-00145-2025.');
    expect(mensagemDoErroDeVinculo({ code: 'PGRST202', message: 'Could not find the function public.descartar_empenho_do_contrato' })).toMatch(/migration 85/);
    expect(mensagemDoErroDeVinculo({ code: '42501', message: 'UNAUTHORIZED: x' })).toMatch(/gestor ou coordenador/);
    rpc.mockResolvedValue({ data: null, error: { message: 'VINCULO_DA_FONTE: Este vínculo veio do Contratos.gov.br.' } });
    await expect(desvincularEmpenhoManual({ contractKey: 'k', empenhoId: 'e' })).rejects.toThrow('Este vínculo veio do Contratos.gov.br.');
  });

  it('descartes: junta os dados da NE; sem a tabela, devolve vazio', async () => {
    fromResp.data = [{ contract_key: 'k', empenho_id: 'e1', motivo: 'Credor é a HPE', descartado_por_nome: 'Maria', created_at: '2026-10-06', empenhos: { numero_oficial: '2024NE000765', uasg_emitente: '200331', credor_nome: 'HPE', valor_empenhado: '567513.93' } }];
    expect(await fetchDescartesEmpenhoContrato('k')).toEqual([
      { contractKey: 'k', empenhoId: 'e1', motivo: 'Credor é a HPE', descartadoPorNome: 'Maria', descartadoEm: '2026-10-06', numeroOficial: '2024NE000765', uasgEmitente: '200331', credorNome: 'HPE', valorEmpenhado: 567513.93 }
    ]);
    fromResp.data = null;
    fromResp.error = { code: 'PGRST205', message: "Could not find the table 'public.contrato_empenho_descartes'" };
    expect(await fetchDescartesEmpenhoContrato('k')).toEqual([]);
    fromResp.error = { code: '57014', message: 'timeout' };
    await expect(fetchDescartesEmpenhoContrato('k')).rejects.toMatchObject({ code: '57014' });
  });
});

describe('sincronização com empenho descartado', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('o resultado e a mensagem gravada dizem que a NE descartada continua fora', async () => {
    vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([
      { canonical_key: '200331-2024-2024NE765', uasg: '200331', ano: 2024, numero_oficial: '2024NE000765', numero_normalizado: '2024NE765', data_emissao: '2024-12-30', valor_empenhado: 567513.93, fonte_origem: 'CONTRATOSNET', contract_links: [{ contract_key: '200331-00145-2025', valor_vinculado: 567513.93 }] }
    ] as any);
    vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue({
      total_processados: 1, total_salvos: 1, total_itens_vinculados: 0, total_contratos_vinculados: 0, total_conflitos: 0, erros: [], reconciliados: [], ids_por_chave: { '200331-2024-2024NE765': 'hpe' }
    } as any);
    vi.spyOn(syncService, 'syncContractEmpenhosM17').mockResolvedValue({
      inseridos: 0, atualizados: 0, removidos: 0, removidos_numeros: [], remocao_bloqueada: 0, ignorados_descartados: 1, ignorados_numeros: ['2024NE000765'], promovidos: 0
    });

    const r = await orchestrateContractEmpenhoSync({ tipo: 'CONTRATO', contractKey: '200331-00145-2025', contratoId: 748175, uasg: '200331' } as any);

    expect(r.vinculos_ignorados_numeros).toEqual(['2024NE000765']);
    expect(avisoEmpenhosDescartados(r)).toBe('O Contratos.gov.br lista 2024NE000765 neste contrato, mas a equipe a descartou; ela continua fora do contrato.');
    expect(mensagemParaRegistro(r)).toMatch(/a equipe a descartou/);
  });

  it('vários descartados: um aviso só, com a lista', () => {
    expect(avisoEmpenhosDescartados({ vinculos_ignorados_numeros: ['2024NE000765', '2024NE000766'] })).toMatch(/2 empenhos .*2024NE000765, 2024NE000766/);
    expect(avisoEmpenhosDescartados({ vinculos_ignorados_numeros: [] })).toBeUndefined();
  });
});
