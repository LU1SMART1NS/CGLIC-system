import { describe, it, expect } from 'vitest';
import { resumirLote, contratosParaSincronizar } from '../useBatchSyncContractEmpenhos';
import type { ContractDashboardRecord } from '../../types';
import type { OrchestrationResult, OrchestrationStatus } from '../../types/empenhoSync';

const contrato = (over: Partial<ContractDashboardRecord>): ContractDashboardRecord =>
  ({ id: '200331-00296-2026', uasg: '200331', numero: '00296/2026', ano: '2026', numeroFormatado: '00296/2026', statusVigencia: 'Vigente', ...over }) as any;

const resultado = (status: OrchestrationStatus, erro?: string, persistidos = 0, pendencias: any[] = []): OrchestrationResult =>
  ({
    status,
    empenhos_persistidos: persistidos,
    erros: erro ? [{ origem: 'CONTRATOSNET', erro }] : [],
    pendencias,
    resumo_sync: { erros: [] }
  }) as any;

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

describe('resumirLote: conferência com o PNCP', () => {
  it('lista os contratos com empenho só no PNCP, sem contar falha de conferência', () => {
    const s = resumirLote(
      [
        {
          contract: contrato({ id: 'a', numeroFormatado: '00205/2026' }),
          contractKey: 'a',
          result: resultado('SUCESSO', undefined, 1, [
            { tipo: 'CONTRATO', motivo: 'Empenho 2026NE000999 consta no PNCP para este contrato, mas não no Contratos.gov.br.', contexto: { fonte: 'PNCP' } }
          ])
        },
        {
          contract: contrato({ id: 'b' }),
          contractKey: 'b',
          result: resultado('SUCESSO', undefined, 1, [
            { tipo: 'CONTRATO', motivo: 'Conferência com o PNCP não feita: PNCP respondeu 503 ao listar os empenhos do contrato.', contexto: { fonte: 'PNCP' } }
          ])
        },
        { contract: contrato({ id: 'c' }), contractKey: 'c', result: resultado('SUCESSO', undefined, 1, [{ tipo: 'ITEM', motivo: 'outro' }]) }
      ],
      3,
      0,
      false
    );
    expect(s.atualizados).toBe(3);
    expect(s.falhas).toEqual([]);
    expect(s.divergentesPncp).toEqual([
      { contractKey: 'a', numero: '00205/2026', uasg: '200331', avisos: ['Empenho 2026NE000999 consta no PNCP para este contrato, mas não no Contratos.gov.br.'] }
    ]);
  });
});

describe('contratosParaSincronizar (UASGs 200330 e 200331)', () => {
  it('junta as duas carteiras com o critério do servidor e não repete a mesma chave', () => {
    const lista = contratosParaSincronizar(
      [
        [
          contrato({ id: '200331-00296-2026', dataVigenciaFim: '2027-10-02' }),
          contrato({ id: '200331-00021-2017', dataVigenciaFim: '2022-12-01' }),
          contrato({ id: '200331-00135-2025', dataVigenciaFim: '2026-09-30' })
        ],
        [contrato({ id: '200330-00065-2021', uasg: '200330', dataVigenciaFim: '2026-11-10' }), contrato({ id: '200331-00296-2026' })],
        undefined
      ],
      { hoje: '2026-10-06', comEmpenhoAPagar: new Set() }
    );
    expect(lista.map((c) => c.id)).toEqual(['200331-00296-2026', '200331-00135-2025', '200330-00065-2021']);
  });
});
