import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orchestrateContractEmpenhoSync, orchestrateItemEmpenhoSync, conferirComPncp } from '../empenhoOrchestrationService';
import * as contratosAdapter from '../../adapters/contratosGovEmpenhoAdapter';
import * as pncpAdapter from '../../adapters/pncpEmpenhoAdapter';
import * as comprasAdapter from '../../adapters/comprasGovEmpenhoAdapter';
import * as syncService from '../empenhoSyncService';
import * as govService from '../contratosGovContratoService';
import * as oficiaisService from '../contratosOficiaisService';
import {
  alvoDoContrato,
  pncpParamsDoContrato,
  completarIdContratosGov,
  sincronizarEmpenhosDoRegistro,
  pendenciasPncp,
  mensagemParaRegistro
} from '../contratoEmpenhosSincronizacaoService';
import { normalizeFromContratosGov, normalizeFromPncp } from '../empenhoNormalizationService';
import { chaveDoContrato } from '../../utils/contractKeyUtils';
import type { EmpenhoSyncSummary, NormalizedEmpenho } from '../../types/empenhoSync';
import type { ContractDashboardRecord } from '../../types';

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

// Caso real (06/10/2026): contrato 00205/2026 da UASG 200331, NE 2026NE000256 emitida pela 200330.
const neContratosGov: NormalizedEmpenho = normalizeFromContratosGov(
  { id: 1, numero: '2026NE000256', unidade_gestora: '200330', data_emissao: '2026-06-22', empenhado: '188.190,82' } as any,
  { contractKey: '200331-00205-2026' }
);
const nePncp: NormalizedEmpenho = normalizeFromPncp(
  { numeroEmpenho: '2026NE000256', valorTotal: 188190.82, dataEmissaoEmpenho: '2026-06-22T00:00:00', sequencialEmpenho: 1 } as any,
  { contractKey: '200331-00205-2026', uasg: '200331', ano: 2026 }
);
const pncpParams = { cnpj: '00394494000136', ano: '2026', sequencialContrato: 1828 };
const alvo = { tipo: 'CONTRATO' as const, contractKey: '200331-00205-2026', contratoId: 995846, uasg: '200331', pncpParams };

describe('PNCP só confere, nunca grava', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('a NE do PNCP (sem UASG emitente) não vira um segundo empenho com a chave da UASG do contrato', async () => {
    expect(nePncp.canonical_key).toBe('200331-2026-2026NE256');
    expect(neContratosGov.canonical_key).toBe('200330-2026-2026NE256');
    vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([neContratosGov]);
    vi.spyOn(pncpAdapter, 'fetchAndNormalizePncpEmpenhos').mockResolvedValue([nePncp]);
    const gravar = vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue(resumo({ total_processados: 1, total_salvos: 1 }));

    const r = await orchestrateContractEmpenhoSync(alvo);

    const gravados = gravar.mock.calls[0][0];
    expect(gravados.map((e) => e.canonical_key)).toEqual(['200330-2026-2026NE256']);
    expect(r.fontes_consultadas).toEqual(['CONTRATOSNET', 'PNCP']);
    expect(r.status).toBe('SUCESSO');
    expect(pendenciasPncp(r)).toEqual([]);
  });

  it('empenho que só o PNCP lista vira pendência e não é gravado', async () => {
    const soNoPncp = normalizeFromPncp({ numeroEmpenho: '2026NE000999', valorTotal: 10, dataEmissaoEmpenho: '2026-07-01', sequencialEmpenho: 2 } as any, {
      contractKey: alvo.contractKey,
      uasg: '200331',
      ano: 2026
    });
    vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([neContratosGov]);
    vi.spyOn(pncpAdapter, 'fetchAndNormalizePncpEmpenhos').mockResolvedValue([nePncp, soNoPncp]);
    const gravar = vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue(resumo({ total_processados: 1, total_salvos: 1 }));

    const r = await orchestrateContractEmpenhoSync(alvo);

    expect(gravar.mock.calls[0][0]).toHaveLength(1);
    expect(pendenciasPncp(r)).toEqual(['Empenho 2026NE000999 consta no PNCP para este contrato, mas não no Contratos.gov.br.']);
    expect(r.status).toBe('SUCESSO');
    expect(mensagemParaRegistro(r)).toMatch(/2026NE000999 consta no PNCP/);
  });

  it('sem a lista do Contratos.gov.br o PNCP nem é consultado (não grava sozinho)', async () => {
    vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockRejectedValue(new Error('Contratos.gov.br não respondeu em 30 s.'));
    const pncp = vi.spyOn(pncpAdapter, 'fetchAndNormalizePncpEmpenhos');
    vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue(resumo());

    const r = await orchestrateContractEmpenhoSync(alvo);

    expect(pncp).not.toHaveBeenCalled();
    expect(r.status).toBe('ERRO');
    expect(r.fontes_nao_aplicaveis.some((f) => f.includes('sem a lista do Contratos.gov.br'))).toBe(true);
  });

  it('falha do PNCP não muda o resultado: fica como aviso de conferência não feita', async () => {
    vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([neContratosGov]);
    vi.spyOn(pncpAdapter, 'fetchAndNormalizePncpEmpenhos').mockRejectedValue(new Error('PNCP respondeu 503 ao listar os empenhos do contrato.'));
    vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue(resumo({ total_processados: 1, total_salvos: 1 }));

    const r = await orchestrateContractEmpenhoSync(alvo);

    expect(r.status).toBe('SUCESSO');
    expect(r.erros).toEqual([]);
    expect(pendenciasPncp(r)[0]).toMatch(/^Conferência com o PNCP não feita: PNCP respondeu 503/);
  });

  it('contrato sem id do PNCP: PNCP não aplicável', async () => {
    vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([neContratosGov]);
    const pncp = vi.spyOn(pncpAdapter, 'fetchAndNormalizePncpEmpenhos');
    vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue(resumo({ total_processados: 1, total_salvos: 1 }));

    const r = await orchestrateContractEmpenhoSync({ ...alvo, pncpParams: undefined });
    expect(pncp).not.toHaveBeenCalled();
    expect(r.fontes_nao_aplicaveis).toContain('PNCP (contrato sem o id do PNCP)');
  });

  it('no fluxo do item o PNCP também só confere', async () => {
    vi.spyOn(comprasAdapter, 'fetchAndNormalizeComprasGovEmpenhos').mockResolvedValue([]);
    vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([neContratosGov]);
    vi.spyOn(pncpAdapter, 'fetchAndNormalizePncpEmpenhos').mockResolvedValue([nePncp]);
    const gravar = vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue(resumo({ total_processados: 1, total_salvos: 1 }));

    await orchestrateItemEmpenhoSync({
      tipo: 'ITEM',
      itemKey: '00037/2026-200331-00001',
      contracts: [{ contratoId: 995846, contractKey: alvo.contractKey, cnpj: pncpParams.cnpj, ano: 2026, sequencialContrato: 1828 }]
    });
    expect(gravar.mock.calls[0][0].map((e) => e.canonical_key)).toEqual(['200330-2026-2026NE256']);
  });

  it('conferirComPncp compara por ano e número e não repete o mesmo aviso', () => {
    expect(conferirComPncp([nePncp, nePncp], [])).toHaveLength(1);
    expect(conferirComPncp([nePncp], [neContratosGov])).toEqual([]);
  });
});

const contrato = (over: Partial<ContractDashboardRecord> = {}): ContractDashboardRecord =>
  ({ id: '200331-00071-2025', uasg: '200331', numero: '00071/2025', ano: '2025', numeroFormatado: '00071/2025', ...over }) as any;

describe('alvo da sincronização a partir do registro', () => {
  it('parâmetros do PNCP saem do id do PNCP; sem ele, nenhum', () => {
    expect(pncpParamsDoContrato('00394494000136-2-001828/2026')).toEqual({ cnpj: '00394494000136', ano: '2026', sequencialContrato: 1828 });
    expect(pncpParamsDoContrato(null)).toBeUndefined();
    expect(pncpParamsDoContrato('200331-00205-2026')).toBeUndefined();
  });

  it('nunca usa a chave do contrato como id do Contratos.gov.br e leva a UASG do contrato', () => {
    expect(alvoDoContrato(contrato({ contratoId: 789360 }))).toEqual({
      tipo: 'CONTRATO',
      contractKey: '200331-00071-2025',
      contratoId: 789360,
      uasg: '200331',
      pncpParams: undefined
    });
    expect(alvoDoContrato(contrato({ contratoId: '200331-00071-2025' as any })).contratoId).toBeUndefined();
    expect(alvoDoContrato(contrato(), '00394494000136-2-000500/2025').pncpParams).toEqual({
      cnpj: '00394494000136',
      ano: '2025',
      sequencialContrato: 500
    });
  });
});

describe('completarIdContratosGov', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('com id, não consulta nada', async () => {
    const busca = vi.spyOn(govService, 'fetchContratoContratosGov');
    const c = contrato({ contratoId: 1 });
    expect(await completarIdContratosGov(c)).toBe(c);
    expect(busca).not.toHaveBeenCalled();
  });

  it('sem id, busca o contrato avulso, grava o registro completado e devolve com o id', async () => {
    vi.spyOn(govService, 'fetchContratoContratosGov').mockResolvedValue(contrato({ id: 'x', contratoId: 812345, uasg: '200330' }));
    const grava = vi.spyOn(oficiaisService, 'persistirContratoCompletado').mockResolvedValue();
    const r = await completarIdContratosGov(contrato());
    expect(r.contratoId).toBe(812345);
    expect(r.id).toBe('200331-00071-2025');
    expect(r.uasg).toBe('200331');
    expect(grava).toHaveBeenCalledWith(expect.objectContaining({ contratoId: 812345, id: '200331-00071-2025' }));
  });

  it('contrato não encontrado: devolve como veio e não grava', async () => {
    vi.spyOn(govService, 'fetchContratoContratosGov').mockResolvedValue(null);
    const grava = vi.spyOn(oficiaisService, 'persistirContratoCompletado');
    const c = contrato();
    expect(await completarIdContratosGov(c)).toBe(c);
    expect(grava).not.toHaveBeenCalled();
  });

  it('falha do Contratos.gov.br na busca do id vira ERRO com a mensagem, sem consultar empenhos', async () => {
    vi.spyOn(govService, 'fetchContratoContratosGov').mockRejectedValue(new Error('Contratos.gov.br respondeu 503'));
    const empenhos = vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos');
    const { result } = await sincronizarEmpenhosDoRegistro(contrato());
    expect(result.status).toBe('ERRO');
    expect(result.erros[0]).toEqual({ origem: 'CONTRATOSNET', erro: 'O id do contrato no Contratos.gov.br não pôde ser obtido: Contratos.gov.br respondeu 503' });
    expect(empenhos).not.toHaveBeenCalled();
  });
});

describe('UASG de reserva e chave do contrato', () => {
  it('empenho sem unidade gestora usa a UASG do contrato (200330), não 200331 fixo', () => {
    const e = normalizeFromContratosGov(
      { id: 1, numero: '2026NE000010', data_emissao: '2026-01-10', empenhado: '10,00' } as any,
      { contractKey: '200330-00065-2021', uasgFallback: '200330' }
    );
    expect(e.canonical_key).toBe('200330-2026-2026NE10');
  });

  it('chaveDoContrato: id do registro, senão a chave canônica (com zeros)', () => {
    expect(chaveDoContrato({ id: '200331-00296-2026' })).toBe('200331-00296-2026');
    expect(chaveDoContrato({ id: '', uasg: '200330', numero: '52/2018', ano: '2018' })).toBe('200330-00052-2018');
    expect(chaveDoContrato({ uasg: '200331', numero: '2021NE000171', ano: '2021' })).toBe('200331-NE00171-2021');
    expect(chaveDoContrato({})).toBe('');
  });
});
