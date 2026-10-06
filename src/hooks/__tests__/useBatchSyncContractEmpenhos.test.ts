import { describe, it, expect } from 'vitest';
import { buildContractTarget, resumirLote, contratosParaSincronizar } from '../useBatchSyncContractEmpenhos';
import type { ContractDashboardRecord } from '../../types';
import type { OrchestrationResult, OrchestrationStatus } from '../../types/empenhoSync';

const contrato = (over: Partial<ContractDashboardRecord>): ContractDashboardRecord =>
  ({ id: '200331-00296-2026', uasg: '200331', numero: '00296/2026', ano: '2026', numeroFormatado: '00296/2026', statusVigencia: 'Vigente', ...over }) as any;

const resultado = (status: OrchestrationStatus, erro?: string, persistidos = 0): OrchestrationResult =>
  ({
    status,
    empenhos_persistidos: persistidos,
    erros: erro ? [{ origem: 'CONTRATOSNET', erro }] : [],
    resumo_sync: { erros: [] }
  }) as any;

describe('buildContractTarget', () => {
  it('manda só o id do Contratos.gov.br, nunca a chave do contrato no lugar dele', () => {
    expect(buildContractTarget(contrato({ contratoId: 1027808 })).contratoId).toBe(1027808);
    expect(buildContractTarget(contrato({ contratoId: undefined })).contratoId).toBeUndefined();
  });

  it('sem id de registro usa a chave canônica do contrato', () => {
    expect(buildContractTarget(contrato({ id: '', numero: '00052/2018', ano: '2018', uasg: '200330' })).contractKey).toBe('200330-00052-2018');
  });
});

describe('resumirLote', () => {
  it('conta cada situação e lista só PARCIAL e ERRO como falhas', () => {
    const s = resumirLote(
      [
        { contract: contrato({ id: 'a' }), contractKey: 'a', result: resultado('SUCESSO', undefined, 3) },
        { contract: contrato({ id: 'b' }), contractKey: 'b', result: resultado('COM_DIVERGENCIAS', undefined, 1) },
        { contract: contrato({ id: 'c' }), contractKey: 'c', result: resultado('SEM_DADOS') },
        { contract: contrato({ id: 'd', numeroFormatado: '00021/2017' }), contractKey: 'd', result: resultado('ERRO', 'Contratos.gov.br não respondeu em 30 s.') },
        { contract: contrato({ id: 'e', uasg: '200330' }), contractKey: 'e', result: resultado('SUCESSO_PARCIAL', 'não vinculado', 2) }
      ],
      6,
      1,
      false
    );
    expect(s).toMatchObject({ totalContratos: 6, atualizados: 2, semEmpenhos: 1, parciais: 1, comErro: 1, empenhosPersistidos: 6, novasTentativas: 1 });
    expect(s.falhas).toEqual([
      { contractKey: 'd', numero: '00021/2017', uasg: '200331', situacao: 'ERRO', erro: 'Contratos.gov.br não respondeu em 30 s.' },
      { contractKey: 'e', numero: '00296/2026', uasg: '200330', situacao: 'PARCIAL', erro: 'não vinculado' }
    ]);
  });
});

describe('contratosParaSincronizar (UASGs 200330 e 200331)', () => {
  it('junta as duas carteiras, tira os expirados e não repete a mesma chave', () => {
    const lista = contratosParaSincronizar(
      [contrato({ id: '200331-00296-2026' }), contrato({ id: '200331-00021-2017', statusVigencia: 'Expirado' })],
      [contrato({ id: '200330-00065-2021', uasg: '200330' }), contrato({ id: '200331-00296-2026' })],
      undefined
    );
    expect(lista.map((c) => c.id)).toEqual(['200331-00296-2026', '200330-00065-2021']);
  });
});
