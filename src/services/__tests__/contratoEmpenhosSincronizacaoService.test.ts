import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orchestrateContractEmpenhoSync, contratoIdValido, pncpParamsValidos } from '../empenhoOrchestrationService';
import * as contratosAdapter from '../../adapters/contratosGovEmpenhoAdapter';
import * as pncpAdapter from '../../adapters/pncpEmpenhoAdapter';
import * as syncService from '../empenhoSyncService';
import {
  situacaoDoResultado,
  mensagemDoResultado,
  falhaTransitoria,
  sincronizarEmpenhosDoContrato
} from '../contratoEmpenhosSincronizacaoService';
import type { EmpenhoSyncSummary, NormalizedEmpenho } from '../../types/empenhoSync';

const resumoVazio: EmpenhoSyncSummary = {
  total_processados: 0,
  total_salvos: 0,
  total_itens_vinculados: 0,
  total_contratos_vinculados: 0,
  total_conflitos: 0,
  erros: [],
  reconciliados: []
};

const ne: NormalizedEmpenho = {
  canonical_key: '200331-2026-2026NE629',
  uasg: '200331',
  ano: 2026,
  numero_oficial: '2026NE000629',
  numero_normalizado: '2026NE629',
  data_emissao: '2026-09-30',
  valor_empenhado: 323730,
  fonte_origem: 'CONTRATOSNET',
  contract_links: [{ contract_key: '200331-00296-2026', valor_vinculado: 323730 }]
};

const alvo = { tipo: 'CONTRATO' as const, contractKey: '200331-00296-2026', contratoId: 1027808 };

describe('orchestrateContractEmpenhoSync: falha visível', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('contrato sem o id do Contratos.gov.br é ERRO, não "sem dados"', async () => {
    const adapter = vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos');
    vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue(resumoVazio);

    const r = await orchestrateContractEmpenhoSync({ ...alvo, contratoId: undefined });
    expect(r.status).toBe('ERRO');
    expect(r.erros[0].erro).toMatch(/identificador do Contratos\.gov\.br/);
    expect(adapter).not.toHaveBeenCalled();
  });

  it('a chave do contrato no lugar do id também é ERRO e não chega à API', async () => {
    const adapter = vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos');
    vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue(resumoVazio);

    const r = await orchestrateContractEmpenhoSync({ ...alvo, contratoId: '200331-00296-2026' });
    expect(r.status).toBe('ERRO');
    expect(adapter).not.toHaveBeenCalled();
  });

  it('fonte que falha é ERRO com a mensagem dela, e a fonte não conta como consultada', async () => {
    vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockRejectedValue(new Error('Contratos.gov.br não respondeu em 30 s.'));
    vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue(resumoVazio);

    const r = await orchestrateContractEmpenhoSync(alvo);
    expect(r.status).toBe('ERRO');
    expect(r.fontes_consultadas).not.toContain('CONTRATOSNET');
    expect(mensagemDoResultado(r)).toBe('Contratos.gov.br não respondeu em 30 s.');
    expect(falhaTransitoria(r)).toBe(true);
  });

  it('fonte que responde lista vazia é SEM_DADOS', async () => {
    vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([]);
    vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue(resumoVazio);

    const r = await orchestrateContractEmpenhoSync(alvo);
    expect(r.status).toBe('SEM_DADOS');
    expect(situacaoDoResultado(r)).toBe('SEM_EMPENHOS');
  });

  it('vínculo recusado pela RPC deixa a sincronização PARCIAL com o motivo', async () => {
    vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([ne]);
    vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue({
      ...resumoVazio,
      total_processados: 1,
      total_salvos: 1,
      erros: [{ canonical_key: ne.canonical_key, erro: 'Empenho 2026NE000629 gravado, mas não vinculado ao contrato 200331-00296-2026: Acesso negado' }]
    });

    const r = await orchestrateContractEmpenhoSync(alvo);
    expect(r.status).toBe('SUCESSO_PARCIAL');
    expect(situacaoDoResultado(r)).toBe('PARCIAL');
    expect(mensagemDoResultado(r)).toMatch(/não vinculado ao contrato/);
    expect(falhaTransitoria(r)).toBe(false);
  });

  it('PNCP com código de órgão no lugar do CNPJ fica "não aplicável" e não é consultado', async () => {
    vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([ne]);
    const pncp = vi.spyOn(pncpAdapter, 'fetchAndNormalizePncpEmpenhos');
    vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue({ ...resumoVazio, total_processados: 1, total_salvos: 1, total_contratos_vinculados: 1 });

    const r = await orchestrateContractEmpenhoSync({
      ...alvo,
      pncpParams: { cnpj: '30911', ano: '2026', sequencialContrato: '00296/2026' }
    });
    expect(pncp).not.toHaveBeenCalled();
    expect(r.fontes_nao_aplicaveis.some((f) => f.startsWith('PNCP'))).toBe(true);
    expect(r.status).toBe('SUCESSO');
  });

  it('falha inesperada da orquestração vira ERRO no serviço que registra', async () => {
    vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([ne]);
    vi.spyOn(syncService, 'syncReconciledBatch').mockRejectedValue(new Error('boom'));

    const r = await sincronizarEmpenhosDoContrato(alvo);
    expect(r.status).toBe('ERRO');
    expect(mensagemDoResultado(r)).toBe('boom');
  });
});

describe('validações de parâmetros', () => {
  it('id do Contratos.gov.br só com dígitos', () => {
    expect(contratoIdValido(745812)).toBe(true);
    expect(contratoIdValido('745812')).toBe(true);
    expect(contratoIdValido('200331-00052-2018')).toBe(false);
    expect(contratoIdValido(undefined)).toBe(false);
    expect(contratoIdValido('')).toBe(false);
  });

  it('PNCP exige CNPJ de 14 dígitos e sequencial numérico', () => {
    expect(pncpParamsValidos({ cnpj: '00394494000136', ano: 2026, sequencialContrato: 15 })).toBe(true);
    expect(pncpParamsValidos({ cnpj: '30911', ano: 2026, sequencialContrato: 15 })).toBe(false);
    expect(pncpParamsValidos({ cnpj: '00394494000136', ano: '2026', sequencialContrato: '00015/2026' })).toBe(false);
  });
});

describe('situacaoDoResultado e falhaTransitoria', () => {
  it('traduz cada status', () => {
    expect(situacaoDoResultado({ status: 'SUCESSO' })).toBe('OK');
    expect(situacaoDoResultado({ status: 'COM_DIVERGENCIAS' })).toBe('OK');
    expect(situacaoDoResultado({ status: 'SEM_DADOS' })).toBe('SEM_EMPENHOS');
    expect(situacaoDoResultado({ status: 'SUCESSO_PARCIAL' })).toBe('PARCIAL');
    expect(situacaoDoResultado({ status: 'ERRO' })).toBe('ERRO');
  });

  it('só tempo esgotado, rede, 429 e 5xx da fonte valem nova tentativa', () => {
    const r = (erro: string, origem = 'CONTRATOSNET') => ({ erros: [{ origem, erro }] });
    expect(falhaTransitoria(r('Contratos.gov.br não respondeu em 30 s.'))).toBe(true);
    expect(falhaTransitoria(r('Falha de rede ao consultar o Contratos.gov.br: x'))).toBe(true);
    expect(falhaTransitoria(r('Contratos.gov.br respondeu 503 ao listar os empenhos do contrato (id 1).'))).toBe(true);
    expect(falhaTransitoria(r('PNCP respondeu 429 ao listar os empenhos do contrato.', 'PNCP'))).toBe(true);
    expect(falhaTransitoria(r('Contrato sem o identificador do Contratos.gov.br: os empenhos não puderam ser consultados.'))).toBe(false);
    expect(falhaTransitoria(r('Contratos.gov.br respondeu 404 ao listar'))).toBe(false);
    expect(falhaTransitoria({ erros: [] })).toBe(false);
  });
});
