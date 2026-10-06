import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orchestrateContractEmpenhoSync } from '../empenhoOrchestrationService';
import * as contratosAdapter from '../../adapters/contratosGovEmpenhoAdapter';
import * as syncService from '../empenhoSyncService';
import { rpcInexistente } from '../empenhoSyncService';
import { mensagemParaRegistro, avisoVinculosRemovidos } from '../contratoEmpenhosSincronizacaoService';
import { numeroDaChave } from '../../utils/contractKeyUtils';
import { resumirLote } from '../../hooks/useBatchSyncContractEmpenhos';
import type { EmpenhoSyncSummary, NormalizedEmpenho } from '../../types/empenhoSync';

const ne = (n: string, valor: number): NormalizedEmpenho => ({
  canonical_key: `200331-2024-2024NE${n}`,
  uasg: '200331',
  ano: 2024,
  numero_oficial: `2024NE0000${n}`,
  numero_normalizado: `2024NE${n}`,
  data_emissao: '2024-01-10',
  valor_empenhado: valor,
  fonte_origem: 'CONTRATOSNET',
  contract_links: [{ contract_key: '200331-00004-2017', valor_vinculado: valor > 0 ? valor : undefined }]
});

const resumo = (over: Partial<EmpenhoSyncSummary> = {}): EmpenhoSyncSummary => ({
  total_processados: 0,
  total_salvos: 0,
  total_itens_vinculados: 0,
  total_contratos_vinculados: 0,
  total_conflitos: 0,
  erros: [],
  reconciliados: [],
  ...over
});

const alvo = { tipo: 'CONTRATO' as const, contractKey: '200331-00004-2017', contratoId: 136954, uasg: '200331' };
const rpcOk = { inseridos: 0, atualizados: 0, removidos: 0, removidos_numeros: [], remocao_bloqueada: 0 };

describe('fluxo do contrato: conjunto de vínculos', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('manda o conjunto inteiro, com valor 0 para NE zerada, e remove ausentes quando tudo foi gravado', async () => {
    vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([ne('28', 300000), ne('67', 0)]);
    vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue(
      resumo({ total_processados: 2, total_salvos: 2, ids_por_chave: { '200331-2024-2024NE28': 'id-28', '200331-2024-2024NE67': 'id-67' } })
    );
    const conjunto = vi.spyOn(syncService, 'syncContractEmpenhosM17').mockResolvedValue({ ...rpcOk, inseridos: 1, removidos: 1, removidos_numeros: ['2024NE000029'] });

    const r = await orchestrateContractEmpenhoSync(alvo);

    expect(conjunto).toHaveBeenCalledWith(
      '200331-00004-2017',
      expect.arrayContaining([
        { empenho_id: 'id-28', valor_vinculado: 300000 },
        { empenho_id: 'id-67', valor_vinculado: 0 }
      ]),
      true
    );
    expect(r.status).toBe('SUCESSO');
    expect(r.vinculos_contrato_removidos).toBe(1);
    expect(avisoVinculosRemovidos(r)).toBe('1 empenho(s) desvinculado(s) porque o Contratos.gov.br não os lista mais neste contrato: 2024NE000029.');
    expect(mensagemParaRegistro(r)).toMatch(/desvinculado/);
  });

  it('se algum empenho não foi gravado, não remove ausentes (ele seria desvinculado por engano)', async () => {
    vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([ne('28', 300000), ne('29', 13500)]);
    vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue(
      resumo({ total_processados: 2, total_salvos: 1, ids_por_chave: { '200331-2024-2024NE28': 'id-28' }, erros: [{ canonical_key: '200331-2024-2024NE29', erro: 'falhou' }] })
    );
    const conjunto = vi.spyOn(syncService, 'syncContractEmpenhosM17').mockResolvedValue(rpcOk);

    const r = await orchestrateContractEmpenhoSync(alvo);
    expect(conjunto).toHaveBeenCalledWith('200331-00004-2017', [{ empenho_id: 'id-28', valor_vinculado: 300000 }], false);
    expect(r.status).toBe('SUCESSO_PARCIAL');
  });

  it('lista vazia com vínculos existentes: nada removido e ERRO com aviso para conferir', async () => {
    vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([]);
    vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue(resumo({ ids_por_chave: {} }));
    vi.spyOn(syncService, 'syncContractEmpenhosM17').mockResolvedValue({ ...rpcOk, remocao_bloqueada: 9 });

    const r = await orchestrateContractEmpenhoSync(alvo);
    expect(r.status).toBe('ERRO');
    expect(mensagemParaRegistro(r)).toMatch(/não listou nenhum empenho.*9 vinculado\(s\).*nenhum foi removido/);
  });

  it('falha da RPC do conjunto deixa a sincronização PARCIAL com o motivo', async () => {
    vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([ne('28', 300000)]);
    vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue(resumo({ total_processados: 1, total_salvos: 1, ids_por_chave: { '200331-2024-2024NE28': 'id-28' } }));
    vi.spyOn(syncService, 'syncContractEmpenhosM17').mockRejectedValue(new Error('CONTRATO_DESCONHECIDO: O contrato "x" não está na carteira'));

    const r = await orchestrateContractEmpenhoSync(alvo);
    expect(r.status).toBe('SUCESSO_PARCIAL');
    expect(mensagemParaRegistro(r)).toMatch(/^Vínculos do contrato não gravados: CONTRATO_DESCONHECIDO/);
  });

  it('sem a migration 81 (RPC inexistente) vincula um por vez, como antes, sem remover', async () => {
    vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([ne('28', 300000)]);
    vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue(resumo({ total_processados: 1, total_salvos: 1, ids_por_chave: { '200331-2024-2024NE28': 'id-28' } }));
    vi.spyOn(syncService, 'syncContractEmpenhosM17').mockRejectedValue({ code: 'UNKNOWN', message: 'x', details: { code: 'PGRST202', message: 'Could not find the function public.sync_contract_empenhos_atomic' } });
    const umAUm = vi.spyOn(syncService, 'vincularEmpenhosAoContratoUmAUm').mockResolvedValue({ vinculados: 1, falhas: [] });

    const r = await orchestrateContractEmpenhoSync(alvo);
    expect(umAUm).toHaveBeenCalledWith('200331-00004-2017', [{ empenho_id: 'id-28', numero: '2024NE000028', valor_vinculado: 300000 }]);
    expect(r.status).toBe('SUCESSO');
    expect(r.vinculos_contrato_criados).toBe(1);
  });

  it('Contratos.gov.br falhou: não mexe nos vínculos', async () => {
    vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockRejectedValue(new Error('Contratos.gov.br não respondeu em 30 s.'));
    vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue(resumo());
    const conjunto = vi.spyOn(syncService, 'syncContractEmpenhosM17');
    await orchestrateContractEmpenhoSync(alvo);
    expect(conjunto).not.toHaveBeenCalled();
  });
});

describe('auxiliares', () => {
  it('rpcInexistente reconhece o PGRST202 do PostgREST', () => {
    expect(rpcInexistente({ details: { code: 'PGRST202' } })).toBe(true);
    expect(rpcInexistente({ message: 'Could not find the function public.x(a) in the schema cache' })).toBe(true);
    expect(rpcInexistente({ details: { code: '42501', message: 'UNAUTHORIZED' } })).toBe(false);
  });

  it('numeroDaChave mostra o número do contrato', () => {
    expect(numeroDaChave('200331-00005-2017')).toBe('00005/2017');
    expect(numeroDaChave('200331-NE00171-2021')).toBe('2021NE00171');
    expect(numeroDaChave('12/2026')).toBe('12/2026');
  });

  it('resumirLote soma os vínculos removidos', () => {
    const c = { id: 'a', uasg: '200331', numero: '00004/2017' } as any;
    const s = resumirLote(
      [
        { contract: c, contractKey: 'a', result: { status: 'SUCESSO', empenhos_persistidos: 1, vinculos_contrato_removidos: 2, erros: [], pendencias: [], resumo_sync: { erros: [] } } as any },
        { contract: { ...c, id: 'b' }, contractKey: 'b', result: { status: 'SUCESSO', empenhos_persistidos: 1, vinculos_contrato_removidos: 1, erros: [], pendencias: [], resumo_sync: { erros: [] } } as any }
      ],
      2,
      0,
      false
    );
    expect(s.vinculosRemovidos).toBe(3);
  });
});
